"""Convert the original iPhone resources into browser-readable data."""
import base64
import gzip
import json
import plistlib
import struct
import zlib
from pathlib import Path
from xml.etree import ElementTree

WEB = Path(__file__).resolve().parent
SOURCE = WEB.parent / "Stop Knights.app"
ASSETS = WEB / "assets"


def write_data(filename, global_name, data):
    (ASSETS / filename).write_text(
        "globalThis." + global_name + " = " + json.dumps(data, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )


def write_web_images(atlases, first_level):
    from PIL import Image

    first_frames = {
        "units": lambda key: key.startswith(("knight_", "skeleton_", "crystalball")),
        "ui": lambda key: key.startswith(("mana_", "countdown_", "notification_", "endlevel_"))
            or key in ("icon_skeleton.png", "icon_lock.png", "dragicon_skeleton.png", "drag_cross.png"),
        "environment": lambda key: key in ("environment_sky.jpg", "environment_moon.png",
                                           "environment_cloud.png", "environment_cloud2.png"),
    }
    for name in ("castle_tiles", "environment", "units", "ui"):
        source = Image.open(ASSETS / f"{name}.png").convert("RGBA")
        if name != "environment":
            source.save(ASSETS / f"{name}.webp", lossless=True, method=6)
        initial = Image.new("RGBA", source.size)
        if name == "castle_tiles":
            columns = source.width // 20
            used = {115}
            for layer in first_level["layers"].values():
                used.update((gid & 0x0fffffff) for gid in layer if gid)
            boxes = [((gid - 1) % columns * 20, (gid - 1) // columns * 20, 20, 20) for gid in used]
        else:
            boxes = [
                tuple(frame[k] for k in ("x", "y", "width", "height"))
                for key, frame in atlases[name].items() if first_frames[name](key)
            ]
        for x, y, w, h in boxes:
            initial.paste(source.crop((x, y, x + w, y + h)), (x, y))
        initial.save(ASSETS / f"{name}-first.webp", lossless=True, method=6)


def png_chunk(kind, data):
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data)))


def paeth(left, up, corner):
    prediction = left + up - corner
    a, b, c = (abs(prediction - n) for n in (left, up, corner))
    if a <= b and a <= c:
        return left
    return up if b <= c else corner


def convert_png(source):
    data = source.read_bytes()
    if data[12:16] != b"CgBI":
        return data
    offset, compressed = 8, bytearray()
    while offset < len(data):
        size, kind = struct.unpack_from(">I4s", data, offset)
        payload = data[offset + 8:offset + 8 + size]
        if kind == b"IHDR":
            header = payload
        if kind == b"IDAT":
            compressed.extend(payload)
        offset += size + 12

    width, height = struct.unpack_from(">II", header)
    if header[8:] != bytes([8, 6, 0, 0, 0]):
        raise ValueError(f"Unexpected PNG format: {source}")
    raw = zlib.decompress(compressed, -15)
    stride = width * 4
    previous = bytearray(stride)
    rgba = bytearray()
    for offset in range(0, height * (stride + 1), stride + 1):
        mode = raw[offset]
        row = bytearray(raw[offset + 1:offset + 1 + stride])
        for i in range(stride):
            left = row[i - 4] if i >= 4 else 0
            up = previous[i]
            corner = previous[i - 4] if i >= 4 else 0
            if mode:
                predictor = paeth(left, up, corner) if mode == 4 else (left, up, (left + up) // 2)[mode - 1]
                row[i] = (row[i] + predictor) & 255
        rgba.append(0)
        for i in range(0, stride, 4):
            blue, green, red, alpha = row[i:i + 4]
            if 0 < alpha < 255:
                red, green, blue = (min(255, (v * 255 + alpha // 2) // alpha)
                                    for v in (red, green, blue))
            rgba.extend((red, green, blue, alpha))
        previous = row
    return (data[:8] + png_chunk(b"IHDR", header)
            + png_chunk(b"IDAT", zlib.compress(rgba)) + png_chunk(b"IEND", b""))


def read_level(number):
    map_data = ElementTree.parse(SOURCE / f"level{number}.tmx").getroot()
    scenario = ElementTree.parse(SOURCE / f"level{number}.xml").getroot()
    width, height = (int(map_data.get(k)) for k in ("width", "height"))
    layers = {}
    for layer in map_data.findall("layer"):
        raw = gzip.decompress(base64.b64decode(layer.findtext("data")))
        layers[layer.get("name")] = [gid for (gid,) in struct.iter_unpack("<I", raw)]
        if len(layers[layer.get("name")]) != width * height:
            raise ValueError(f"Unexpected layer size in level {number}")
    spawners = {}
    for spawner in scenario.findall("spawners/spawner"):
        key = spawner.get("id")
        if number in (9, 11) and key == "1" and key in spawners:
            key = "2"
        if key in spawners:
            raise ValueError(f"Duplicate spawner {key} in level {number}")
        spawners[key] = {"type": spawner.get("type"),
                         **{k: int(v) for k, v in spawner.find("position").attrib.items()}}
    return {
        "width": width, "height": height, "layers": layers,
        "minions": [e.get("type") for e in scenario.findall("minions/minion")],
        "dracula": int(scenario.find("dracula").get("roomid")),
        "rooms": {r.get("id"): [m.attrib for m in r.findall("minion")]
                  for r in scenario.findall("rooms/room")},
        "spawners": spawners,
        "waves": [{"delay": float(w.get("delay")), "events": [
            {"spawner": e.get("spawner_id"), "hunters": [
                h.get("type").lower() for h in e.findall("hunter")]}
            for e in w.findall("event")]} for w in scenario.findall("waves/wave")],
    }


def main():
    ASSETS.mkdir(exist_ok=True)
    for name in ("castle_tiles", "environment", "units", "ui"):
        target = ASSETS / f"{name}.png"
        target.write_bytes(convert_png(SOURCE / target.name))
    data = {
        "atlases": {name: plistlib.loads((SOURCE / f"{name}.plist").read_bytes())["frames"]
                    for name in ("units", "ui", "environment")},
        "levels": [read_level(number) for number in range(1, 21)],
    }
    write_web_images(data["atlases"], data["levels"][0])
    later_maps = [level.pop("layers") for level in data["levels"][1:]]
    write_data("campaign-maps.js", "STOP_KNIGHTS_CAMPAIGN_MAPS", later_maps)
    write_data("game-data.js", "STOP_KNIGHTS_DATA", data)


if __name__ == "__main__":
    main()
