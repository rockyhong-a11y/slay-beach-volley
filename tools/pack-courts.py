"""Convert Blender's original PNGs to compact WebP; preserve net-plate alpha."""
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
for theme in ["coral","sunset","moonlight"]:
    for suffix in ["","-net"]:
        source=root/"artifacts"/("court-"+theme+suffix+".png")
        if not source.exists():continue
        im=Image.open(source).convert("RGBA" if suffix else "RGB")
        destination=root/"assets/courts"/(theme+suffix+".webp")
        im.save(destination,"WEBP",quality=85 if not suffix else 90,method=6,exact=True)
        print(f"{destination.relative_to(root)}: {destination.stat().st_size:,} bytes")

# Compact authoring contact sheet for visual review, never deployed.
sheet=Image.new("RGB",(960,480),(22,33,32))
for index,theme in enumerate(["coral","sunset","moonlight"]):
    source=root/"assets/courts"/(theme+".webp")
    plate=root/"assets/courts"/(theme+"-net.webp")
    if not source.exists() or not plate.exists():continue
    im=Image.open(source).convert("RGBA")
    im.alpha_composite(Image.open(plate).convert("RGBA"))
    im=im.convert("RGB").resize((320,480),Image.Resampling.LANCZOS)
    sheet.paste(im,(index*320,0))
sheet.save(root/"artifacts/court-contact-sheet.webp",quality=90)
