"""Reproducible original 3D tournament venue. Run in a fresh background Blender.

/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python tools/render-courts.py -- --all

Only the six optimized WebP plates are deployed. The model and raw renders are
authoring sources. No third-party photographs, textures or official logos used.
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/courts"
RAW = ROOT / "artifacts"
OUT.mkdir(parents=True, exist_ok=True)
RAW.mkdir(parents=True, exist_ok=True)
args = argparse.ArgumentParser()
args.add_argument("--all", action="store_true")
args.add_argument("--theme", choices=["coral", "sunset", "moonlight"], default="coral")
args.add_argument("--preview", action="store_true")
args.add_argument("--samples", type=int, default=40)
options = args.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 16 if options.preview else options.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 5
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 2
scene.cycles.transparent_max_bounces = 4
scene.render.resolution_x = 960
scene.render.resolution_y = 1440
scene.render.resolution_percentage = 50 if options.preview else 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("Island atmosphere")
scene.world.use_nodes = True
world_nodes = scene.world.node_tree.nodes
world_nodes.clear()
world_out = world_nodes.new("ShaderNodeOutputWorld")
world_bg = world_nodes.new("ShaderNodeBackground")
sky = world_nodes.new("ShaderNodeTexSky")
available_sky_types={item.identifier for item in sky.bl_rna.properties["sky_type"].enum_items}
sky.sky_type = "MULTIPLE_SCATTERING" if "MULTIPLE_SCATTERING" in available_sky_types else "NISHITA"
sky.sun_disc = True
sky.sun_size = math.radians(1.4)
sky.altitude = .3
sky.air_density = 1.05
def dust(value):
    if hasattr(sky, "dust_density"): sky.dust_density=value
    elif hasattr(sky, "aerosol_density"): sky.aerosol_density=value
dust(.8)
scene.world.node_tree.links.new(sky.outputs[0], world_bg.inputs[0])
scene.world.node_tree.links.new(world_bg.outputs[0], world_out.inputs[0])

def material(name, color, roughness=.65, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Roughness"].default_value = roughness
    bs.inputs["Metallic"].default_value = metallic
    if emission:
        bs.inputs["Emission Color"].default_value = (*color, 1)
        bs.inputs["Emission Strength"].default_value = emission
    return mat

sand = material("Fine pale tournament sand", (.72, .59, .40), .92)
nodes = sand.node_tree.nodes
links = sand.node_tree.links
tex = nodes.new("ShaderNodeTexCoord")
coarse = nodes.new("ShaderNodeTexNoise")
coarse.inputs["Scale"].default_value = 3.7
coarse.inputs["Detail"].default_value = 4.5
coarse.inputs["Roughness"].default_value = .72
fine = nodes.new("ShaderNodeTexNoise")
fine.inputs["Scale"].default_value = 680
fine.inputs["Detail"].default_value = 2
links.new(tex.outputs["Object"], coarse.inputs["Vector"])
links.new(tex.outputs["Object"], fine.inputs["Vector"])
ramp = nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = .15
ramp.color_ramp.elements[0].color = (.61, .46, .29, 1)
ramp.color_ramp.elements[1].position = .82
ramp.color_ramp.elements[1].color = (.90, .77, .55, 1)
links.new(coarse.outputs["Fac"], ramp.inputs[0])
links.new(ramp.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = .28
bump.inputs["Distance"].default_value = .018
links.new(fine.outputs["Fac"], bump.inputs["Height"])
links.new(bump.outputs["Normal"], nodes.get("Principled BSDF").inputs["Normal"])
teal = material("SLAY teal enamel", (.035, .30, .27), .4, .1)
mint = material("Mint court rope", (.045, .52, .40), .58)
white = material("Warm chalk white", (.86, .85, .77), .62)
cream = material("Cream canvas", (.83, .78, .61), .93)
coral = material("Coral seats", (.66, .21, .12), .52)
deep = material("Deep teal seats", (.026, .13, .16), .45)
wood = material("Warm bleacher timber", (.34, .23, .13), .8)
steel = material("Brushed structural aluminum", (.39, .45, .43), .32, .7)
dark = material("Net charcoal weave", (.035, .048, .05), .85)
skin = [material("Crowd skin %d" % i, c) for i, c in enumerate([(.49,.25,.13),(.68,.40,.22),(.87,.62,.42),(.29,.13,.085)])]
shirts = [material("Spectator jersey %d" % i,c) for i,c in enumerate([(.08,.36,.37),(.82,.75,.60),(.61,.18,.13),(.09,.13,.18),(.43,.58,.46),(.55,.36,.24)])]
hair = material("Crowd dark hair", (.048,.032,.024), .95)
palmleaf = material("Palm leaf satin", (.095,.27,.11), .65)
palmtrunk = material("Palm trunk", (.26,.16,.085), .95)
lamp = material("Floodlight luminous glass", (.78,.91,1), .3, 0, 3)
ocean = material("Turquoise water", (.045,.33,.34), .16, .3)
water_bs = ocean.node_tree.nodes.get("Principled BSDF")
water_bs.inputs["Coat Weight"].default_value = .8
water_noise = ocean.node_tree.nodes.new("ShaderNodeTexNoise")
water_noise.inputs["Scale"].default_value = 2.8
water_noise.inputs["Detail"].default_value = 3
water_bump = ocean.node_tree.nodes.new("ShaderNodeBump")
water_bump.inputs["Strength"].default_value = .25
water_bump.inputs["Distance"].default_value = .10
ocean.node_tree.links.new(water_noise.outputs["Fac"], water_bump.inputs["Height"])
ocean.node_tree.links.new(water_bump.outputs["Normal"], water_bs.inputs["Normal"])

net_objects = []
def finish(obj, name, mat, is_net=False, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Manufactured rounded edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("Weighted shading", "WEIGHTED_NORMAL")
    if is_net:
        net_objects.append(obj)
    return obj

def box(name, loc, scale, mat, is_net=False, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj,name,mat,is_net,bevel)

def rod(name,a,b,r,mat,is_net=False,vertices=10):
    a,b = Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=(b-a).length,location=(a+b)/2)
    obj=bpy.context.object
    obj.rotation_euler=(b-a).to_track_quat("Z","Y").to_euler()
    return finish(obj,name,mat,is_net)

def text(name,words,loc,size,mat,rotation=(math.pi/2,0,0),is_net=False):
    curve=bpy.data.curves.new(name,"FONT")
    curve.body=words
    curve.align_x="CENTER"
    curve.align_y="CENTER"
    curve.size=size
    curve.extrude=.001
    obj=bpy.data.objects.new(name,curve)
    scene.collection.objects.link(obj)
    obj.location=loc
    obj.rotation_euler=rotation
    finish(obj,name,mat,is_net)
    return obj

# Minimal batches keep hundreds of seats and spectators inexpensive to draw.
class Batch:
    def __init__(self,mat): self.mat,self.v,self.f=mat,[],[]
    def cube(self,loc,dims):
        x,y,z=loc;a,b,c=[v/2 for v in dims];n=len(self.v)
        self.v.extend([(x+sx*a,y+sy*b,z+sz*c) for sx,sy,sz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]])
        self.f.extend([tuple(n+i for i in face) for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])
    def ellipsoid(self,loc,scale):
        x,y,z=loc;a,b,c=scale;n=len(self.v);segments=10;rings=6
        for j in range(rings+1):
            theta=math.pi*j/rings
            for i in range(segments):
                phi=2*math.pi*i/segments
                self.v.append((x+a*math.sin(theta)*math.cos(phi),y+b*math.sin(theta)*math.sin(phi),z+c*math.cos(theta)))
        for j in range(rings):
            for i in range(segments):
                ii=(i+1)%segments
                self.f.append((n+j*segments+i,n+j*segments+ii,n+(j+1)*segments+ii,n+(j+1)*segments+i))
    def emit(self):
        if not self.v:return
        mesh=bpy.data.meshes.new(self.mat.name+" batch");mesh.from_pydata(self.v,[],self.f);mesh.update()
        obj=bpy.data.objects.new(self.mat.name+" instanced seating",mesh);scene.collection.objects.link(obj);obj.data.materials.append(self.mat)
        for poly in mesh.polygons:poly.use_smooth=True

batches={m.name:Batch(m) for m in [teal,mint,white,cream,coral,deep,wood,steel,hair]+skin+shirts}
def batch(mat):return batches[mat.name]

box("Sand basin, free zone",(0,0,-.24),(28,34,.45),sand)
box("Coastal sand beyond venue",(0,18.5,-.28),(180,5,.42),sand)
box("Pacific beyond shore",(0,70,-.35),(250,98,.08),ocean)
for yy in [21.2,22.1,23.6]:
    rod("White surf wash",(-65,yy,-.28),(65,yy,-.28),.035,white,vertices=8)

# Precisely 8 x 16 metres. The center line is deliberately absent in beach play.
for a,b in [((-4,-8,.026),(4,-8,.026)),((-4,8,.026),(4,8,.026)),((-4,-8,.026),(-4,8,.026)),((4,-8,.026),(4,8,.026))]:
    rod("Teal boundary rope",a,b,.032,mint,vertices=12)
for x in [-4,4]:
    for y in [-8,8]:box("Corner boundary peg",(x,y,.026),(.12,.12,.035),teal,bevel=.012)
# Fine parallel rake furrows follow the same calm playfield texture.
for i in range(12):
    y=-10.8+i*.16
    rod("Shallow perimeter rake furrow",(-6.1,y,-.045),(6.1,y,-.045),.01,wood,vertices=6)

# Tournament advertising boards remain outside the free movement envelope.
for x in [-6.1,6.1]:
    for j in range(6):
        y=-6.2+j*2.5
        board=box("Sideline SLAY board",(x,y,.34),(.08,2.2,.65),teal,bevel=.035)
        # Facing the elevated camera makes the brand visible without paid logos.
        text("Sideline brand","SLAY",(x,y,.70),.35,cream,rotation=(0,0,math.pi/2))
for x in [-4.5,-1.5,1.5,4.5]:
    box("Far baseline sponsor board",(x,10.3,.43),(2.7,.10,.8),teal,bevel=.05)
    text("Far brand","SLAY  /  BEACH CLUB",(x,10.23,.43),.24,cream)
text("Sand club emboss","SLAY BEACH CLUB",(0,-10.4,.012),.47,wood,rotation=(0,0,0))

random.seed(71)
def spectator(x,y,z,seed):
    r=random.Random(seed)
    jersey=shirts[r.randrange(len(shirts))];tone=skin[r.randrange(len(skin))]
    batch(jersey).ellipsoid((x,y,z+.36),(.15,.105,.25))
    batch(tone).ellipsoid((x,y,z+.68),(.113,.10,.135))
    batch(hair).ellipsoid((x,y+.013,z+.755),(.115,.097,.062))
    batch(tone).ellipsoid((x-.185,y-.025,z+.38),(.045,.048,.18))
    batch(tone).ellipsoid((x+.185,y-.025,z+.38),(.045,.048,.18))
    batch(deep).cube((x-.085,y-.10,z+.11),(.105,.25,.20))
    batch(deep).cube((x+.085,y-.10,z+.11),(.105,.25,.20))

# Grandstands surround three sides; generous entry lanes keep court edges clean.
for row in range(6):
    height=.30+row*.39
    for sign in [-1,1]:
        xx=sign*(7.1+row*.72)
        batch(wood).cube((xx,3.15,height/2),(.76,20.3,height))
        batch(steel).cube((xx,3.15,height-.025),(.72,20.2,.075))
        for col in range(29):
            yy=-6.4+col*.68
            if col in [8,9,20,21]:continue
            seatmat=[deep,teal,cream,coral][(row*3+col//4)%4]
            batch(seatmat).cube((xx,yy,height+.075),(.48,.48,.13))
            batch(seatmat).cube((xx+sign*.20,yy,height+.30),(.08,.48,.46))
            if random.random()<.71:spectator(xx,yy,height+.13,10000+row*100+col+(1000 if sign>0 else 0))
    if row<4:
        yy=11.7+row*.75
        batch(wood).cube((0,yy,height/2),(20.9,.78,height))
        batch(steel).cube((0,yy,height-.025),(20.9,.73,.07))
        for col in range(29):
            xx=-9.85+col*.70
            if col in [8,9,20,21]:continue
            seatmat=[teal,deep,cream,coral][(col//5+row)%4]
            batch(seatmat).cube((xx,yy,height+.075),(.49,.49,.13))
            batch(seatmat).cube((xx,yy+.20,height+.30),(.49,.08,.46))
            if random.random()<.82:spectator(xx,yy,height+.13,20000+row*100+col)

for sign in [-1,1]:
    # Two cloth canopy bays over each sideline grandstand. Curved tension fabric.
    for center in [1.2,9.8]:
        x=sign*10
        verts=[];faces=[];cols=20
        for j in range(3):
            yy=center-3.9+j*3.9
            for i in range(cols+1):
                u=i/cols;xx=sign*(7.15+u*5.65)
                zz=4.9-.38*math.sin(u*math.pi)+.09*(j-1)**2
                verts.append((xx,yy,zz))
        for j in range(2):
            for i in range(cols):faces.append((j*(cols+1)+i,j*(cols+1)+i+1,(j+1)*(cols+1)+i+1,(j+1)*(cols+1)+i))
        mesh=bpy.data.meshes.new("Tensioned canopy");mesh.from_pydata(verts,[],faces)
        obj=bpy.data.objects.new("Cream grandstand sail",mesh);scene.collection.objects.link(obj);obj.data.materials.append(cream)
        solid=obj.modifiers.new("Canvas thickness","SOLIDIFY");solid.thickness=.035
        for yy in [center-3.9,center+3.9]:
            rod("Canopy steel outer column",(sign*12.7,yy,0),(sign*12.7,yy,4.98),.055,steel)
            rod("Canopy inner column",(sign*7.2,yy,0),(sign*7.2,yy,4.98),.045,teal)
            rod("Canopy top spar",(sign*7.2,yy,4.98),(sign*12.7,yy,4.98),.043,steel)
    rod("Outer grandstand railing",(sign*12,-6.6,3.55),(sign*12,14.4,3.55),.04,steel)
    for y in [-6.6,-3,0,3,6,9,12,14.4]:rod("Rail upright",(sign*12,y,2.3),(sign*12,y,3.55),.035,steel)
rod("Rear crowd rail",(-10.4,14.8,2.75),(10.4,14.8,2.75),.04,steel)
for x in [-10,-6,-2,2,6,10]:rod("Rear rail post",(x,14.8,1.5),(x,14.8,2.75),.035,steel)

# Official raised referee chair sits outside the court; no baked player sprites.
for x in [-5.35,-4.85]:
    for y in [-.4,.4]:rod("Referee stand leg",(x,y,0),(x,y,2.0),.035,steel)
for z in [.3,.65,1,1.35,1.7]:rod("Referee ladder rung",(-5.35,-.4,z),(-4.85,-.4,z),.032,steel)
box("Referee chair platform",(-5.10,0,1.8),(.7,1,.12),teal)
box("Referee chair seat",(-5.1,.18,2.0),(.45,.50,.12),cream,bevel=.03)
box("Referee chair back",(-5.1,.40,2.29),(.45,.08,.5),teal,bevel=.03)

# Actual competition net: top at 2.43m, bottom at 1.43m, 8.5m stretched mesh.
for x in [-4.6,4.6]:
    rod("Padded net upright",(x,0,.03),(x,0,2.68),.105,teal,True,vertices=20)
    rod("Post enamel cap",(x,0,2.59),(x,0,2.73),.075,steel,True,vertices=16)
    box("Post protective cream collar",(x,-.018,1.02),(.22,.20,.10),cream,True,bevel=.018)
    text("Post brand","SLAY",(x,-.113,1.70),.12,cream,is_net=True)
for i in range(86):
    x=-4.25+i*.10
    rod("Vertical net weave",(x,0,1.43),(x,0,2.39),.008,dark,True,vertices=6)
for j in range(11):
    z=1.43+j*.096
    rod("Horizontal net weave",(-4.25,0,z),(4.25,0,z),.008,dark,True,vertices=6)
rod("White top cable",(-4.58,0,2.43),(4.58,0,2.43),.018,white,True)
box("Competition top binding",(0,-.006,2.395),(8.5,.035,.075),white,True,bevel=.007)
box("Bottom binding",(0,0,1.425),(8.5,.025,.036),cream,True)
for x in [-4.25,4.25]:box("White side net tape",(x,0,1.92),(.055,.035,1.0),white,True)
for x in [-4,4]:
    for j in range(8):rod("Red-white antenna",(x,-.04,2.35+j*.10),(x,-.04,2.45+j*.10),.014,coral if j%2 else white,True,vertices=10)
text("Net center brand","SLAY BEACH CLUB",(0,-.025,2.396),.056,teal,is_net=True)

def palm(x,y,height,angle):
    crown=Vector((x+.65*math.cos(angle),y+.65*math.sin(angle),height))
    for j in range(11):
        u=j/11;v=(j+1)/11
        rod("Ringed palm trunk",(x+.65*math.cos(angle)*u*u,y+.65*math.sin(angle)*u*u,height*u),
            (x+.65*math.cos(angle)*v*v,y+.65*math.sin(angle)*v*v,height*v),.11*(1-.30*u),palmtrunk,vertices=10)
    for j in range(8):
        a=j*math.pi/4+angle;verts=[];faces=[]
        for k in range(9):
            u=k/8;r=2.9*u;z=.45*math.sin(math.pi*u)-.7*u*u
            mid=crown+Vector((math.cos(a)*r,math.sin(a)*r,z))
            width=.38*math.sin(math.pi*u)+.015
            side=Vector((-math.sin(a)*width,math.cos(a)*width,0))
            verts.extend([tuple(mid-side),tuple(mid+side)])
        for k in range(8):faces.append((2*k,2*k+1,2*k+3,2*k+2))
        mesh=bpy.data.meshes.new("Palm curved frond");mesh.from_pydata(verts,[],faces)
        obj=bpy.data.objects.new("Island palm frond",mesh);scene.collection.objects.link(obj);obj.data.materials.append(palmleaf)
        rod("Frond center spine",tuple(crown),tuple(crown+Vector((math.cos(a)*2.9,math.sin(a)*2.9,-.7))),.012,palmleaf,vertices=6)
for x,y,h,a in [(-14,-6,5.5,.5),(14,-4.8,6.2,2.4),(-15,19,7,.2),(14,22,6.5,2.6),(-6.5,18,3.3,.8),(6.5,18,3.6,2)]:palm(x,y,h,a)

floodlights=[]
for x,y,height in [(-13,-8.5,8.5),(13,-8.5,8.5),(-13,16.8,8.5),(13,16.8,8.5),(-6.8,9.7,5.8),(6.8,9.7,5.8)]:
    rod("Stadium mast",(x,y,0),(x,y,height),.095,steel,vertices=14)
    rod("Floodlight crossbeam",(x-.8,y,height-.3),(x+.8,y,height-.3),.07,steel)
    for dx in [-.52,0,.52]:
        box("Floodlight housing",(x+dx,y,height-.17),(.39,.3,.27),deep,bevel=.04)
        box("Floodlight lens",(x+dx,y-.16,height-.19),(.31,.02,.17),lamp,bevel=.02)
    data=bpy.data.lights.new("Tournament floodlight","AREA");data.shape="DISK";data.size=5
    obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=(x,y,height-.3)
    obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat("-Z","Y").to_euler()
    floodlights.append(data)

for item in batches.values():item.emit()

bpy.ops.object.camera_add(location=(0,-20,22))
camera=bpy.context.object
camera.name="Calibrated elevated end-court game camera"
camera.rotation_euler=(Vector((0,.8,0))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="PERSP"
camera.data.lens=74
camera.data.sensor_width=36
camera.data.sensor_fit="HORIZONTAL"
camera.data.clip_end=350
scene.camera=camera
bpy.context.view_layer.update()

# Export a 3x4 homogeneous PIXEL projection directly from the exact render camera.
# x' = row0·[engineX,engineY,engineZ,1] / row2·[...], similarly y'.
engine_to_meters=Matrix(((.008,0,0,-4),(0,-16/1200,0,8),(0,0,2.43/230,0),(0,0,0,1)))
view=camera.matrix_world.inverted()
camera_projection=camera.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(),x=960,y=1440,scale_x=1,scale_y=1)
clip=camera_projection @ view @ engine_to_meters
pixel_rows=[[(clip[0][j]+clip[3][j])*480 for j in range(4)],[(clip[3][j]-clip[1][j])*720 for j in range(4)],list(clip[3])]
def projected(x,y,z=0):
    p=[x,y,z,1];q=[sum(row[i]*p[i] for i in range(4)) for row in pixel_rows]
    return [round(q[0]/q[2],4),round(q[1]/q[2],4)]
reference=sum(pixel_rows[2][i]*[500,600,0,1][i] for i in range(4))
metadata={"id":"slay-stadium-v1","width":960,"height":1440,"projection":pixel_rows,"referenceDepth":reference,
    "netHeight":230,"corners":[projected(0,0),projected(1000,0),projected(1000,1200),projected(0,1200)],
    "netTop":[projected(0,600,230),projected(1000,600,230)],
    "courts":[{"background":"../assets/courts/%s.webp" % name,"net":"../assets/courts/%s-net.webp" % name} for name in ["coral","sunset","moonlight"]]}
(ROOT/"src/court-scene.js").write_text("// Generated from the exact Blender camera; homogeneous engine-coordinate pixel projection.\n// Divide rows 0 and 1 by row 2; then scale pixels by canvasWidth/960, canvasHeight/1440.\nexport const COURT_SCENE = "+json.dumps(metadata,indent=2)+";\n")
(RAW/"court-camera.json").write_text(json.dumps(metadata,indent=2))
calibration=[]
for x,y,z in [(0,0,0),(1000,0,0),(1000,1200,0),(0,1200,0),(0,600,230),(1000,600,230),(500,600,0),(375,850,480)]:
    meters=engine_to_meters @ Vector((x,y,z,1))
    point=world_to_camera_view(scene,camera,Vector(meters[:3]))
    calibration.append({"engine":[x,y,z],"pixel":[point.x*960,(1-point.y)*1440],"cameraDepth":point.z})
(RAW/"court-calibration.json").write_text(json.dumps({"method":"Blender bpy_extras.object_utils.world_to_camera_view, independent of exported matrix", "points":calibration},indent=2))
print("COURT CAMERA "+json.dumps({"corners":metadata["corners"],"netTop":metadata["netTop"],"referenceDepth":reference}),flush=True)

def lighting(theme):
    if theme=="coral":
        sky.sun_elevation=math.radians(47);sky.sun_rotation=math.radians(125);dust(.7)
        world_bg.inputs["Strength"].default_value=.6;scene.view_settings.exposure=-2.5
        for data in floodlights:data.energy=0
    elif theme=="sunset":
        sky.sun_elevation=math.radians(12);sky.sun_rotation=math.radians(138);dust(2.2)
        world_bg.inputs["Strength"].default_value=.65;scene.view_settings.exposure=-2
        for data in floodlights:data.energy=350;data.color=(1,.75,.53)
    else:
        sky.sun_elevation=math.radians(-9);sky.sun_rotation=math.radians(136);dust(.8)
        world_bg.inputs["Strength"].default_value=.12;scene.view_settings.exposure=-.8
        for data in floodlights:data.energy=2200;data.color=(.70,.82,1)

themes=["coral","sunset","moonlight"] if options.all else [options.theme]
geometries=[obj for obj in scene.objects if obj.type in {"MESH","CURVE","FONT"}]
for theme in themes:
    lighting(theme)
    scene.render.film_transparent=False
    for obj in geometries:obj.visible_camera=obj not in net_objects
    suffix="-preview" if options.preview else ""
    scene.render.filepath=str(RAW/("court-%s%s.png"%(theme,suffix)))
    print("RENDER BACKGROUND "+theme,flush=True)
    bpy.ops.render.render(write_still=True)
    if not options.preview:
        scene.render.film_transparent=True
        for obj in geometries:obj.visible_camera=obj in net_objects
        scene.render.filepath=str(RAW/("court-%s-net.png"%theme))
        print("RENDER NET PLATE "+theme,flush=True)
        bpy.ops.render.render(write_still=True)

# Save the actual editable stadium with a full visible net and original day light.
for obj in geometries:obj.visible_camera=True
lighting("coral")
scene.render.film_transparent=False
scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"tools/court-stadium.blend"),compress=True)
print("COMPLETE: reproducible .blend and calibrated plates",flush=True)
