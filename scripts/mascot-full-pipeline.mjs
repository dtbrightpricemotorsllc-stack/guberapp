/**
 * GUBER Mascot — Fixed VRM Pipeline
 *
 * Bug fixes vs v1:
 *  1. Bone translations now stored as LOCAL (parent-relative) not world-space.
 *     Old code set world positions directly on every node — in a hierarchy
 *     each child node's translation is additive on top of the parent, producing
 *     wildly wrong world positions.
 *  2. Inverse Bind Matrices (IBMs) are now computed and added.
 *     Without IBMs, glTF defaults to identity for every joint, so the skin
 *     math interprets every vertex as if it starts at the bone's local origin →
 *     spike explosion in VSeeFace.
 *  3. Skin joint order is recorded at creation time so IBMs align correctly.
 */

import { NodeIO, Document, Accessor } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import fs from "fs";

const OUT_DIR  = "client/public/mascot-spec";
const GLB_IN   = `${OUT_DIR}/GUBER_mascot_raw.glb`;
const GLB_OUT  = `${OUT_DIR}/GUBER_mascot_rigged.glb`;
const VRM_OUT  = `${OUT_DIR}/GUBER_mascot.vrm`;

fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── helpers ──────────────────────────────────────────────────────────────────
function computeNormals(positions, indices) {
  const n = positions.length / 3;
  const normals = new Float32Array(n * 3);
  const nFaces = indices.length / 3;
  for (let f = 0; f < nFaces; f++) {
    const a=indices[f*3], b=indices[f*3+1], c=indices[f*3+2];
    const ax=positions[a*3],ay=positions[a*3+1],az=positions[a*3+2];
    const bx=positions[b*3],by=positions[b*3+1],bz=positions[b*3+2];
    const cx=positions[c*3],cy=positions[c*3+1],cz=positions[c*3+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az, vx=cx-ax,vy=cy-ay,vz=cz-az;
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    for (const i of [a,b,c]) { normals[i*3]+=nx; normals[i*3+1]+=ny; normals[i*3+2]+=nz; }
  }
  for (let i = 0; i < n; i++) {
    const x=normals[i*3],y=normals[i*3+1],z=normals[i*3+2];
    const len=Math.sqrt(x*x+y*y+z*z)||1;
    normals[i*3]/=len; normals[i*3+1]/=len; normals[i*3+2]/=len;
  }
  return normals;
}

function dist3(ax,ay,az,bx,by,bz) {
  const dx=ax-bx,dy=ay-by,dz=az-bz;
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

// Column-major 4×4 inverse-translation matrix:  T(-bx,-by,-bz)
function ibmForTranslation(bx, by, bz, out, offset) {
  out.fill(0, offset, offset+16);
  out[offset+0]=1; out[offset+5]=1; out[offset+10]=1; out[offset+15]=1;
  out[offset+12]=-bx; out[offset+13]=-by; out[offset+14]=-bz;
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== GUBER Mascot VRM Pipeline (v2 — IBM fix) ===\n");

  // ── 1. Load ─────────────────────────────────────────────────────────────────
  console.log("[1/7] Loading raw GLB...");
  const io = new NodeIO(); io.registerExtensions(ALL_EXTENSIONS);
  const doc  = await io.read(GLB_IN);
  const root = doc.getRoot();
  const meshNode = root.listNodes().find(n => n.getMesh());
  if (!meshNode) throw new Error("No mesh node found");
  const mesh = meshNode.getMesh();
  const prim = mesh.listPrimitives()[0];

  const posAcc = prim.getAttribute("POSITION");
  const idxAcc = prim.getIndices();
  const positions = posAcc.getArray();
  const indices   = idxAcc.getArray();
  const nVerts = posAcc.getCount();
  console.log(`   Vertices: ${nVerts}, Faces: ${idxAcc.getCount()/3|0}`);

  // ── 2. Bounding box + normals ────────────────────────────────────────────────
  console.log("[2/7] Bounding box + normals...");
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9,minZ=1e9,maxZ=-1e9;
  for (let i=0;i<nVerts;i++) {
    const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
    if(x<minX)minX=x;if(x>maxX)maxX=x;
    if(y<minY)minY=y;if(y>maxY)maxY=y;
    if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
  }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
  const h=maxY-minY, w=maxX-minX, d=maxZ-minZ;
  console.log(`   ${w.toFixed(3)} × ${h.toFixed(3)} × ${d.toFixed(3)}`);

  const buf = root.listBuffers()[0];
  const normAcc = doc.createAccessor().setArray(computeNormals(positions,indices))
    .setType("VEC3").setBuffer(buf);
  prim.setAttribute("NORMAL", normAcc);

  // ── 3. World-space bone positions ────────────────────────────────────────────
  console.log("[3/7] Placing skeleton...");
  // All positions in the SAME coordinate space as mesh vertices (world/model space)
  const BW = {  // BW = world positions
    hips:         [cx, minY+h*0.48, cz],
    spine:        [cx, minY+h*0.55, cz],
    chest:        [cx, minY+h*0.63, cz],
    upperChest:   [cx, minY+h*0.70, cz],
    neck:         [cx, minY+h*0.79, cz],
    head:         [cx, minY+h*0.86, cz],
    leftEye:      [cx-w*0.09, minY+h*0.925, minZ+d*0.12],
    rightEye:     [cx+w*0.09, minY+h*0.925, minZ+d*0.12],
    leftShoulder: [cx-w*0.18, minY+h*0.72, cz],
    rightShoulder:[cx+w*0.18, minY+h*0.72, cz],
    leftUpperArm: [cx-w*0.30, minY+h*0.68, cz],
    rightUpperArm:[cx+w*0.30, minY+h*0.68, cz],
    leftLowerArm: [cx-w*0.40, minY+h*0.55, cz],
    rightLowerArm:[cx+w*0.40, minY+h*0.55, cz],
    leftHand:     [cx-w*0.46, minY+h*0.43, cz],
    rightHand:    [cx+w*0.46, minY+h*0.43, cz],
    leftUpperLeg: [cx-w*0.14, minY+h*0.45, cz],
    rightUpperLeg:[cx+w*0.14, minY+h*0.45, cz],
    leftLowerLeg: [cx-w*0.14, minY+h*0.24, cz],
    rightLowerLeg:[cx+w*0.14, minY+h*0.24, cz],
    leftFoot:     [cx-w*0.14, minY+h*0.06, cz+d*0.08],
    rightFoot:    [cx+w*0.14, minY+h*0.06, cz+d*0.08],
  };
  const boneNames = Object.keys(BW);
  const nBones = boneNames.length;

  // Hierarchy: [parent, child]
  const HIERARCHY = [
    ["hips","spine"],["spine","chest"],["chest","upperChest"],
    ["upperChest","neck"],["neck","head"],
    ["head","leftEye"],["head","rightEye"],
    ["upperChest","leftShoulder"],["leftShoulder","leftUpperArm"],
    ["leftUpperArm","leftLowerArm"],["leftLowerArm","leftHand"],
    ["upperChest","rightShoulder"],["rightShoulder","rightUpperArm"],
    ["rightUpperArm","rightLowerArm"],["rightLowerArm","rightHand"],
    ["hips","leftUpperLeg"],["leftUpperLeg","leftLowerLeg"],["leftLowerLeg","leftFoot"],
    ["hips","rightUpperLeg"],["rightUpperLeg","rightLowerLeg"],["rightLowerLeg","rightFoot"],
  ];

  // Build parent map
  const parentOf = {};
  for (const [p,c] of HIERARCHY) parentOf[c] = p;

  // Create nodes with CORRECT LOCAL translations (world_pos - parent_world_pos)
  const boneNodes = {};
  for (const name of boneNames) {
    const [wx,wy,wz] = BW[name];
    let localPos;
    const pName = parentOf[name];
    if (pName) {
      const [px,py,pz] = BW[pName];
      localPos = [wx-px, wy-py, wz-pz];
    } else {
      localPos = [wx,wy,wz]; // root = world position
    }
    boneNodes[name] = doc.createNode(name).setTranslation(localPos);
  }

  // Wire hierarchy
  for (const [p,c] of HIERARCHY) boneNodes[p].addChild(boneNodes[c]);
  doc.getRoot().listScenes()[0].addChild(boneNodes["hips"]);

  // ── 4. Skin + CORRECT IBMs ───────────────────────────────────────────────────
  console.log("[4/7] Skin weights + Inverse Bind Matrices...");

  // IBM: inverse of world transform for each bone.
  // Since bones have no rotation/scale, IBM = T(-wx,-wy,-wz) in column-major.
  const ibmData = new Float32Array(nBones * 16);
  for (let i = 0; i < nBones; i++) {
    const [wx,wy,wz] = BW[boneNames[i]];
    ibmForTranslation(wx, wy, wz, ibmData, i*16);
  }
  const ibmAcc = doc.createAccessor().setArray(ibmData).setType("MAT4").setBuffer(buf);

  // Skin weights: nearest-2-bone inverse-distance blending
  const jointData  = new Uint8Array(nVerts * 4);
  const weightData = new Float32Array(nVerts * 4);
  const bonePositions = boneNames.map(n => BW[n]);

  for (let i = 0; i < nVerts; i++) {
    const vx=positions[i*3], vy=positions[i*3+1], vz=positions[i*3+2];
    const dists = bonePositions.map(([bx,by,bz]) => dist3(vx,vy,vz,bx,by,bz));
    const sorted = dists.map((d,j)=>({d,j})).sort((a,b)=>a.d-b.d).slice(0,2);
    const s = sorted[0].d + sorted[1].d;
    const w0 = s===0 ? 1 : 1 - sorted[0].d/s;
    const w1 = s===0 ? 0 : 1 - sorted[1].d/s;
    const wt = w0+w1||1;
    jointData[i*4] = sorted[0].j;  jointData[i*4+1] = sorted[1].j;
    weightData[i*4] = w0/wt;       weightData[i*4+1] = w1/wt;
  }

  const jointAcc  = doc.createAccessor().setArray(jointData).setType("VEC4").setBuffer(buf);
  const weightAcc = doc.createAccessor().setArray(weightData).setType("VEC4").setBuffer(buf);
  prim.setAttribute("JOINTS_0",  jointAcc);
  prim.setAttribute("WEIGHTS_0", weightAcc);

  const skin = doc.createSkin("HumanoidSkeleton");
  skin.setSkeleton(boneNodes["hips"]);
  skin.setInverseBindMatrices(ibmAcc);          // ← THE FIX
  for (const name of boneNames) skin.addJoint(boneNodes[name]);
  meshNode.setSkin(skin);

  // ── 5. Morph targets ─────────────────────────────────────────────────────────
  console.log("[5/7] Morph targets...");

  const headBottom = minY + h * 0.75;
  const frontZ     = minZ + d * 0.40;
  const eyeY       = minY + h * 0.91;
  const mouthY     = minY + h * 0.80;
  const headH      = maxY - headBottom;

  function addMorph(name, fn) {
    const delta = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
      const x=positions[i*3], y=positions[i*3+1], z=positions[i*3+2];
      const isHead = y >= headBottom;
      const nFX = (x-cx)/(w*0.5);
      const nFY = isHead ? (y-headBottom)/headH : 0;
      const inFront = z >= frontZ;
      const [dx,dy,dz] = fn(x,y,z,isHead,nFX,nFY,inFront);
      delta[i*3]=dx; delta[i*3+1]=dy; delta[i*3+2]=dz;
    }
    const acc = doc.createAccessor().setArray(delta).setType("VEC3").setBuffer(buf);
    const tgt = doc.createPrimitiveTarget(name);
    tgt.setAttribute("POSITION", acc);
    prim.addTarget(tgt);
    console.log(`   + ${name}`);
  }

  addMorph("Blink_L", (x,y,z,isH,nFX,nFY,inF) => {
    if (!isH||!inF||x>=cx) return [0,0,0];
    const s=Math.max(0,1-Math.abs(y-eyeY)/(headH*0.10));
    return [0, s*(nFY>0.6?-h*0.012:h*0.008), 0];
  });
  addMorph("Blink_R", (x,y,z,isH,nFX,nFY,inF) => {
    if (!isH||!inF||x<=cx) return [0,0,0];
    const s=Math.max(0,1-Math.abs(y-eyeY)/(headH*0.10));
    return [0, s*(nFY>0.6?-h*0.012:h*0.008), 0];
  });
  addMorph("Joy", (x,y,z,isH,nFX,nFY,inF) => {
    if (!isH||!inF) return [0,0,0];
    const s=Math.max(0,1-Math.abs(y-mouthY)/(headH*0.18));
    return [nFX*Math.max(0,Math.abs(nFX)-0.3)*w*0.04, s*h*0.015, s*d*0.02];
  });
  addMorph("Surprised", (x,y,z,isH,nFX,nFY,inF) => {
    if (!isH||!inF) return [0,0,0];
    if (nFY<0.35) return [0, -(0.35-nFY)/0.35*h*0.022, 0];
    if (nFY>0.80) return [0, (nFY-0.80)/0.20*h*0.018, 0];
    return [0,0,0];
  });
  addMorph("A", (x,y,z,isH,nFX,nFY,inF) => {
    if (!isH||!inF) return [0,0,0];
    const s=Math.max(0,1-Math.abs(y-mouthY)/(headH*0.18));
    return [0, s*(y<mouthY?-1:0.4)*h*0.025, 0];
  });
  addMorph("O", (x,y,z,isH,nFX,nFY,inF) => {
    if (!isH||!inF) return [0,0,0];
    const s=Math.max(0,1-Math.abs(y-mouthY)/(headH*0.16));
    return [-nFX*s*w*0.025, s*(y<mouthY?-0.6:0.3)*h*0.018, s*Math.max(0,1-Math.abs(nFX)*1.5)*d*0.015];
  });

  // ── 6. Export rigged GLB ─────────────────────────────────────────────────────
  console.log("[6/7] Exporting rigged GLB...");
  await io.write(GLB_OUT, doc);
  console.log(`   ${GLB_OUT} (${(fs.statSync(GLB_OUT).size/1024).toFixed(0)} KB)`);

  // ── 7. Inject VRM 0.x ────────────────────────────────────────────────────────
  console.log("[7/7] Injecting VRM extension...");
  const glbBuf = fs.readFileSync(GLB_OUT);
  const jsonLen = glbBuf.readUInt32LE(12);
  const j = JSON.parse(glbBuf.toString("utf8", 20, 20+jsonLen));

  const nodeNames = j.nodes.map(n => n.name);
  const bIdx = name => nodeNames.indexOf(name);

  const humanBones = [
    ["hips","hips"],["spine","spine"],["chest","chest"],["upperChest","upperChest"],
    ["neck","neck"],["head","head"],["leftEye","leftEye"],["rightEye","rightEye"],
    ["leftShoulder","leftShoulder"],["rightShoulder","rightShoulder"],
    ["leftUpperArm","leftUpperArm"],["rightUpperArm","rightUpperArm"],
    ["leftLowerArm","leftLowerArm"],["rightLowerArm","rightLowerArm"],
    ["leftHand","leftHand"],["rightHand","rightHand"],
    ["leftUpperLeg","leftUpperLeg"],["rightUpperLeg","rightUpperLeg"],
    ["leftLowerLeg","leftLowerLeg"],["rightLowerLeg","rightLowerLeg"],
    ["leftFoot","leftFoot"],["rightFoot","rightFoot"],
  ].filter(([,n])=>bIdx(n)!==-1)
   .map(([bone,n])=>({ bone, node: bIdx(n), useDefaultValues:true }));

  const blendShapeGroups = [
    { name:"Blink_L",   presetName:"blink_l",   idx:0 },
    { name:"Blink_R",   presetName:"blink_r",   idx:1 },
    { name:"Joy",       presetName:"joy",        idx:2 },
    { name:"Surprised", presetName:"surprised",  idx:3 },
    { name:"A",         presetName:"aa",         idx:4 },
    { name:"O",         presetName:"oh",         idx:5 },
  ].map(({ name, presetName, idx }) => ({
    name, presetName,
    binds:[{ mesh:0, index:idx, weight:100 }],
    materialValues:[], isBinary:false,
  }));

  j.extensions = j.extensions || {};
  j.extensions["VRM"] = {
    exporterVersion:"GUBER-pipeline/2.0", specVersion:"0.0",
    meta:{
      title:"GUBER Mascot", version:"1.0",
      author:"GUBER / guberapp.app",
      contactInformation:"https://guberapp.app",
      allowedUserName:"OnlyAuthor",
      violentUssageName:"Disallow", sexualUssageName:"Disallow",
      commercialUssageName:"Allow", licenseName:"CC_BY_NC",
    },
    humanoid:{
      humanBones, armStretch:0.05, legStretch:0.05,
      upperArmTwist:0.5, lowerArmTwist:0.5, upperLegTwist:0.5, lowerLegTwist:0.5,
      feetSpacing:0, hasTranslationDoF:false,
    },
    firstPerson:{
      firstPersonBone: bIdx("head"),
      firstPersonBoneOffset:{x:0,y:0.06,z:0},
      meshAnnotations:[],
      lookAtTypeName:"Bone",
      lookAtHorizontalInner:{curve:[0,0,0,1,1,1,1,0],xRange:90,yRange:10},
      lookAtHorizontalOuter:{curve:[0,0,0,1,1,1,1,0],xRange:90,yRange:10},
      lookAtVerticalDown:   {curve:[0,0,0,1,1,1,1,0],xRange:90,yRange:10},
      lookAtVerticalUp:     {curve:[0,0,0,1,1,1,1,0],xRange:90,yRange:10},
    },
    blendShapeMaster:{ blendShapeGroups },
    secondaryAnimation:{ boneGroups:[], colliderGroups:[] },
    materialProperties:(j.materials||[]).map(m=>({
      name:m.name||"Material", renderQueue:2000, shader:"VRM/MToon",
      floatProperties:{_Cutoff:0.5,_BumpScale:1,_ReceiveShadowRate:1,
        _ShadingGradeRate:1,_ShadeShift:0,_ShadeToony:0.9,
        _LightColorAttenuation:0,_IndirectLightIntensity:0.1,
        _OutlineWidth:0.5,_OutlineScaledMaxDistance:1,_OutlineLightingMix:1,
        _UvAnimScrollX:0,_UvAnimScrollY:0,_UvAnimRotation:0,
        _DebugMode:0,_BlendMode:0,_OutlineWidthMode:1,_OutlineColorMode:0,
        _CullMode:2,_OutlineCullMode:1,_SrcBlend:1,_DstBlend:0,_ZWrite:1,_IsFirstSetup:1},
      vectorProperties:{_Color:[1,1,1,1],_ShadeColor:[0.97,0.81,0.86,1],
        _MainTex:[0,0,1,1],_ShadeTexture:[0,0,1,1],_BumpMap:[0,0,1,1],
        _EmissionColor:[0,0,0,1],_OutlineColor:[0,0,0,1]},
      textureProperties:{_MainTex:0},
      keywordMap:{MTOON_OUTLINE_WIDTH_WORLD:true},
      tagMap:{RenderType:"Opaque"},
    })),
  };
  j.extensionsUsed = [...new Set([...(j.extensionsUsed||[]), "VRM"])];

  // Rebuild GLB binary
  const newJson  = Buffer.from(JSON.stringify(j), "utf8");
  const pad      = (4 - (newJson.length % 4)) % 4;
  const paddedJ  = Buffer.concat([newJson, Buffer.alloc(pad, 0x20)]);
  const binData  = glbBuf.slice(20 + jsonLen);
  const total    = 12 + 8 + paddedJ.length + binData.length;
  const out      = Buffer.allocUnsafe(total);
  out.write("glTF",0,"ascii"); out.writeUInt32LE(2,4); out.writeUInt32LE(total,8);
  out.writeUInt32LE(paddedJ.length,12); out.writeUInt32LE(0x4E4F534A,16);
  paddedJ.copy(out, 20);
  binData.copy(out, 20 + paddedJ.length);
  fs.writeFileSync(VRM_OUT, out);
  console.log(`   ${VRM_OUT} (${(fs.statSync(VRM_OUT).size/1024).toFixed(0)} KB)`);

  // Verify IBM was included
  const check = JSON.parse(out.toString("utf8", 20, 20+paddedJ.length));
  const ibmCheck = check.skins?.[0]?.inverseBindMatrices;
  const mat4Count = check.accessors?.filter(a=>a.type==="MAT4").length;
  console.log(`\n   ✓ inverseBindMatrices accessor: ${ibmCheck ?? "STILL MISSING!"}`);
  console.log(`   ✓ MAT4 accessors: ${mat4Count}`);

  console.log("\n✓ Pipeline v2 complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
