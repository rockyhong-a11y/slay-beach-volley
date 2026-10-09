"""Verify exact camera calibration and mobile plates; draw independent markers."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
metadata=json.loads((root/"artifacts/court-camera.json").read_text())
goldens=json.loads((root/"artifacts/court-calibration.json").read_text())
projection=metadata["projection"]
errors=[]
for point in goldens["points"]:
    p=point["engine"]+[1]
    q=[sum(row[i]*p[i] for i in range(4)) for row in projection]
    assert q[2]>0
    error=max(abs(q[i]/q[2]-point["pixel"][i]) for i in [0,1])
    assert error<.002, f"Camera mismatch at {point}: {error}px"
    errors.append(error)
assets=[]
for theme in ["coral","sunset","moonlight"]:
    for suffix in ["","-net"]:
        p=root/"assets/courts"/(theme+suffix+".webp")
        im=Image.open(p)
        assert im.size==(960,1440)
        assert im.mode==("RGBA" if suffix else "RGB")
        item={"name":p.name,"bytes":p.stat().st_size,"dimensions":list(im.size),"mode":im.mode}
        if suffix:
            alpha=im.getchannel("A")
            bbox=alpha.getbbox()
            assert bbox and bbox[0]>0 and bbox[1]>0 and bbox[2]<960 and bbox[3]<1440
            assert alpha.getpixel((0,0))==0
            item["alphaBounds"]=list(bbox)
            item["visiblePixels"]=sum(1 for v in alpha.getdata() if v>0)
        assets.append(item)
total=sum(a["bytes"] for a in assets)
assert total<2_000_000
result={"method":"Projection compared with independent Blender world_to_camera_view goldens; WebP dimensions/alpha inspected using Pillow", "maxProjectionErrorPixels":max(errors),"calibrationPoints":len(errors),"mobileAssetsTotalBytes":total,"assets":assets}
(root/"artifacts/court-verified.json").write_text(json.dumps(result,indent=2))
im=Image.open(root/"assets/courts/coral.webp").convert("RGBA")
im.alpha_composite(Image.open(root/"assets/courts/coral-net.webp").convert("RGBA"))
draw=ImageDraw.Draw(im)
for index,point in enumerate(goldens["points"]):
    x,y=point["pixel"]
    color="#ec3557" if index<4 else "#0f6df7"
    draw.ellipse((x-8,y-8,x+8,y+8),fill=color,outline="white",width=2)
    draw.text((x+12,y-8),"%s"%point["engine"],fill=color,stroke_width=1,stroke_fill="white")
im.convert("RGB").save(root/"artifacts/court-projection-check.webp",quality=92)
print(json.dumps({"totalBytes":total,"maxProjectionErrorPixels":max(errors),"points":len(errors)}))
