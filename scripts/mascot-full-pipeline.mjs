/**
 * GUBER Mascot — Full VRM Pipeline
 * Stages:
 *  1. Load raw GLB, read geometry
 *  2. Compute vertex normals
 *  3. Estimate humanoid bone positions from bounding box
 *  4. Build skeleton + skin weights (nearest-bone envelope)
 *  5. Build morph targets: Blink, Joy/Smile, Surprised, A, O (lip sync)
 *  6. Export rigged GLB
 *  7. Inject VRM 0.x extension → export .vrm
 */

import { NodeIO, Document, Accessor, MathUtils } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import fs from "fs";
import https from "https";
import path from "path";

const OUT_DIR = "client/public/mascot-spec";
const GLB_IN  = `${OUT_DIR}/GUBER_mascot_raw.glb`;
const GLB_OUT = `${OUT_DIR}/GUBER_mascot_rigged.glb`;
const VRM_OUT = `${OUT_DIR}/GUBER_mascot.vrm`;

fs.mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function computeNormals(positions, indices) {
  const nVerts = positions.length / 3;
  const normals = new Float32Array(nVerts * 3);
  const nFaces = indices.length / 3;
  for (let f = 0; f < nFaces; f++) {
    const a = indices[f*3], b = indices[f*3+1], c = indices[f*3+2];
    const ax=positions[a*3], ay=positions[a*3+1], az=positions[a*3+2];
    const bx=positions[b*3], by=positions[b*3+1], bz=positions[b*3+2];
    const cx=positions[c*3], cy=positions[c*3+1], cz=positions[c*3+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az;
    const vx=cx-ax,vy=cy-ay,vz=cz-az;
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    for (const i of [a,b,c]) { normals[i*3]+=nx; normals[i*3+1]+=ny; normals[i*3+2]+=nz; }
  }
  for (let i = 0; i < nVerts; i++) {
    const x=normals[i*3], y=normals[i*3+1], z=normals[i*3+2];
    const len = Math.sqrt(x*x+y*y+z*z)||1;
    normals[i*3]/=len; normals[i*3+1]/=len; normals[i*3+2]/=len;
  }
  return normals;
}

function dist3(ax,ay,az,bx,by,bz) {
  const dx=ax-bx,dy=ay-by,dz=az-bz;
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main pipeline
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== GUBER Mascot Full Pipeline ===\n");

  // ── Stage 1: Load ──────────────────────────────────────────────────────────
  console.log("[1/7] Loading raw GLB...");
  const io = new NodeIO();
  io.registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(GLB_IN);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  // TRELLIS nests the mesh under a "world" parent — find the node that actually has the mesh
  const meshNode = root.listNodes().find(n => n.getMesh());
  if (!meshNode) throw new Error("No mesh node found in GLB");
  const mesh = meshNode.getMesh();
  const prim = mesh.listPrimitives()[0];

  const posAcc = prim.getAttribute("POSITION");
  const idxAcc = prim.getIndices();
  const positions = posAcc.getArray();   // Float32Array
  const indices   = idxAcc.getArray();   // Uint16Array / Uint32Array
  const nVerts = posAcc.getCount();
  const nFaces = idxAcc.getCount() / 3;
  console.log(`   Vertices: ${nVerts}, Faces: ${nFaces}`);

  // ── Stage 2: Bounding box + normals ────────────────────────────────────────
  console.log("[2/7] Computing normals + bounding box...");
  let minX=1e9,maxX=-1e9, minY=1e9,maxY=-1e9, minZ=1e9,maxZ=-1e9;
  for (let i=0;i<nVerts;i++) {
    const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
    if(x<minX)minX=x; if(x>maxX)maxX=x;
    if(y<minY)minY=y; if(y>maxY)maxY=y;
    if(z<minZ)minZ=z; if(z>maxZ)maxZ=z;
  }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
  const h=maxY-minY, w=maxX-minX, d=maxZ-minZ;
  console.log(`   Bounds: X[${minX.toFixed(3)},${maxX.toFixed(3)}] Y[${minY.toFixed(3)},${maxY.toFixed(3)}] Z[${minZ.toFixed(3)},${maxZ.toFixed(3)}]`);
  console.log(`   Size: ${w.toFixed(3)} × ${h.toFixed(3)} × ${d.toFixed(3)}`);

  const normals = computeNormals(positions, indices);
  const normAcc = doc.createAccessor()
    .setArray(normals).setType("VEC3")
    .setBuffer(doc.getRoot().listBuffers()[0]);
  prim.setAttribute("NORMAL", normAcc);

  // ── Stage 3: Skeleton positions (proportional to bounding box) ─────────────
  // GUBER mascot = short stocky badger. Head is ~top 40% of figure.
  // Proportions tuned for a 0.55-head-ratio character.
  console.log("[3/7] Placing humanoid skeleton...");

  // glTF is Y-up. We define absolute world positions for each bone root.
  const B = {
    hips:        [cx,       minY+h*0.48, cz],
    spine:       [cx,       minY+h*0.55, cz],
    chest:       [cx,       minY+h*0.63, cz],
    upperChest:  [cx,       minY+h*0.70, cz],
    neck:        [cx,       minY+h*0.79, cz],
    head:        [cx,       minY+h*0.86, cz],
    leftEye:     [cx-w*0.09,minY+h*0.925, minZ+d*0.12],
    rightEye:    [cx+w*0.09,minY+h*0.925, minZ+d*0.12],
    leftShoulder:[cx-w*0.18,minY+h*0.72, cz],
    rightShoulder:[cx+w*0.18,minY+h*0.72, cz],
    leftUpperArm:[cx-w*0.30,minY+h*0.68, cz],
    rightUpperArm:[cx+w*0.30,minY+h*0.68, cz],
    leftLowerArm:[cx-w*0.40,minY+h*0.55, cz],
    rightLowerArm:[cx+w*0.40,minY+h*0.55, cz],
    leftHand:   [cx-w*0.46,minY+h*0.43, cz],
    rightHand:  [cx+w*0.46,minY+h*0.43, cz],
    leftUpperLeg:[cx-w*0.14,minY+h*0.45, cz],
    rightUpperLeg:[cx+w*0.14,minY+h*0.45, cz],
    leftLowerLeg:[cx-w*0.14,minY+h*0.24, cz],
    rightLowerLeg:[cx+w*0.14,minY+h*0.24, cz],
    leftFoot:   [cx-w*0.14,minY+h*0.06, cz+d*0.08],
    rightFoot:  [cx+w*0.14,minY+h*0.06, cz+d*0.08],
  };

  // Create glTF nodes for each bone
  const boneNodes = {};
  for (const [name, pos] of Object.entries(B)) {
    const node = doc.createNode(name).setTranslation(pos);
    boneNodes[name] = node;
  }

  // Parent hierarchy
  const hierarchy = [
    ["hips", "spine"], ["spine", "chest"], ["chest", "upperChest"],
    ["upperChest", "neck"], ["neck", "head"],
    ["head", "leftEye"], ["head", "rightEye"],
    ["upperChest", "leftShoulder"], ["leftShoulder", "leftUpperArm"],
    ["leftUpperArm", "leftLowerArm"], ["leftLowerArm", "leftHand"],
    ["upperChest", "rightShoulder"], ["rightShoulder", "rightUpperArm"],
    ["rightUpperArm", "rightLowerArm"], ["rightLowerArm", "rightHand"],
    ["hips", "leftUpperLeg"], ["leftUpperLeg", "leftLowerLeg"], ["leftLowerLeg", "leftFoot"],
    ["hips", "rightUpperLeg"], ["rightUpperLeg", "rightLowerLeg"], ["rightLowerLeg", "rightFoot"],
  ];
  for (const [parent, child] of hierarchy) {
    boneNodes[parent].addChild(boneNodes[child]);
  }

  // Attach root bone to scene
  scene.addChild(boneNodes["hips"]);

  // ── Stage 4: Skin weights (nearest-bone, envelope) ─────────────────────────
  console.log("[4/7] Computing skin weights (nearest-bone envelope)...");
  const boneNames = Object.keys(B);
  const bonePositions = Object.values(B);
  const nBones = boneNames.length;

  // For each vertex, find the 2 nearest bones and blend weights
  const jointData    = new Uint8Array(nVerts * 4);
  const weightData   = new Float32Array(nVerts * 4);

  for (let i = 0; i < nVerts; i++) {
    const vx=positions[i*3], vy=positions[i*3+1], vz=positions[i*3+2];
    // compute distance to each bone
    const dists = bonePositions.map(([bx,by,bz]) => dist3(vx,vy,vz,bx,by,bz));
    // pick 2 nearest
    const sorted = dists.map((d,j)=>({d,j})).sort((a,b)=>a.d-b.d).slice(0,2);
    const sum = sorted[0].d + sorted[1].d;
    // inverse distance weighting
    const w0 = sum===0 ? 1 : 1 - sorted[0].d/sum;
    const w1 = sum===0 ? 0 : 1 - sorted[1].d/sum;
    const wSum = w0+w1 || 1;
    jointData[i*4+0] = sorted[0].j;
    jointData[i*4+1] = sorted[1].j;
    jointData[i*4+2] = 0;
    jointData[i*4+3] = 0;
    weightData[i*4+0] = w0/wSum;
    weightData[i*4+1] = w1/wSum;
    weightData[i*4+2] = 0;
    weightData[i*4+3] = 0;
  }

  const buf = doc.getRoot().listBuffers()[0];
  const jointAcc = doc.createAccessor().setArray(jointData).setType("VEC4")
    .setBuffer(buf);
  const weightAcc = doc.createAccessor().setArray(weightData).setType("VEC4")
    .setBuffer(buf);
  prim.setAttribute("JOINTS_0", jointAcc);
  prim.setAttribute("WEIGHTS_0", weightAcc);

  // Create Skin
  const skin = doc.createSkin("HumanoidSkeleton");
  skin.setSkeleton(boneNodes["hips"]);
  for (const boneName of boneNames) {
    skin.addJoint(boneNodes[boneName]);
  }
  meshNode.setSkin(skin);

  // ── Stage 5: Morph targets (blendshapes) ────────────────────────────────────
  console.log("[5/7] Building morph targets...");

  // We identify vertex regions by their normalized Y and Z position
  // relative to the head area (top 40% of character height = head)
  const headBottom = minY + h * 0.75;  // Y below this is not head
  const frontZ     = minZ + d * 0.40;  // Z in front of this is "face front"

  // normalized face coords: within head bounding box
  const headH   = maxY - headBottom;
  const eyeY    = minY + h * 0.91;
  const mouthY  = minY + h * 0.80;
  const browY   = minY + h * 0.95;

  function createMorphTarget(name, deformFn) {
    // deformFn(x,y,z, isHead, normFaceX, normFaceY) → [dx,dy,dz] or null (no change)
    const delta = new Float32Array(nVerts * 3);
    for (let i = 0; i < nVerts; i++) {
      const x=positions[i*3], y=positions[i*3+1], z=positions[i*3+2];
      const isHead = y >= headBottom;
      const normFX = (x - cx) / (w * 0.5);  // -1..+1 left-right
      const normFY = isHead ? (y - headBottom) / headH : 0; // 0..1 bottom-top of face
      const inFront = z >= frontZ;
      const [dx,dy,dz] = deformFn(x,y,z,isHead,normFX,normFY,inFront);
      delta[i*3]=dx; delta[i*3+1]=dy; delta[i*3+2]=dz;
    }
    const acc = doc.createAccessor()
      .setArray(delta).setType("VEC3").setBuffer(buf);
    const tgt = doc.createPrimitiveTarget(name);
    tgt.setAttribute("POSITION", acc);
    prim.addTarget(tgt);
    console.log(`   + Morph: ${name}`);
  }

  // Blink_L — close left eye (x < center)
  createMorphTarget("Blink_L", (x,y,z,isHead,nFX,nFY,inFront) => {
    if (!isHead || !inFront || x >= cx) return [0,0,0];
    const eyeDist = Math.abs(y - eyeY) / (headH * 0.10);
    if (eyeDist > 1) return [0,0,0];
    const str = Math.max(0, 1 - eyeDist);
    const closeDir = nFY > 0.6 ? -1 : 1; // upper lid down, lower lid up
    return [0, str * (nFY>0.6 ? -h*0.012 : h*0.008), 0];
  });

  // Blink_R — close right eye (x > center)
  createMorphTarget("Blink_R", (x,y,z,isHead,nFX,nFY,inFront) => {
    if (!isHead || !inFront || x <= cx) return [0,0,0];
    const eyeDist = Math.abs(y - eyeY) / (headH * 0.10);
    if (eyeDist > 1) return [0,0,0];
    const str = Math.max(0, 1 - eyeDist);
    return [0, str * (nFY>0.6 ? -h*0.012 : h*0.008), 0];
  });

  // Joy / Smile — mouth corners up + cheek puff
  createMorphTarget("Joy", (x,y,z,isHead,nFX,nFY,inFront) => {
    if (!isHead || !inFront) return [0,0,0];
    const mouthDist = Math.abs(y - mouthY) / (headH * 0.18);
    if (mouthDist > 1) return [0,0,0];
    const str = Math.max(0, 1 - mouthDist);
    const sideStr = Math.max(0, Math.abs(nFX) - 0.3); // stronger at corners
    return [nFX * sideStr * w * 0.04, str * h * 0.015, str * d * 0.02];
  });

  // Surprised — open mouth (jaw down) + wide eyes + raised brows
  createMorphTarget("Surprised", (x,y,z,isHead,nFX,nFY,inFront) => {
    if (!isHead || !inFront) return [0,0,0];
    // Jaw (lower face, nFY < 0.35)
    if (nFY < 0.35) {
      const jawStr = (0.35 - nFY) / 0.35;
      return [0, -jawStr * h * 0.022, 0];
    }
    // Brow raise (nFY > 0.80)
    if (nFY > 0.80) {
      const browStr = (nFY - 0.80) / 0.20;
      return [0, browStr * h * 0.018, 0];
    }
    // Eye widen (nFY 0.55..0.75)
    if (nFY > 0.55 && nFY < 0.75) {
      const eyeStr = 1 - Math.abs((nFY - 0.65)/0.10);
      return [nFX * eyeStr * w * 0.02, 0, 0];
    }
    return [0,0,0];
  });

  // A (mouth open — "Ah" for lip sync)
  createMorphTarget("A", (x,y,z,isHead,nFX,nFY,inFront) => {
    if (!isHead || !inFront) return [0,0,0];
    const mouthDist = Math.abs(y - mouthY) / (headH * 0.18);
    if (mouthDist > 1) return [0,0,0];
    const str = Math.max(0, 1 - mouthDist);
    // Lower lip drops more than upper lip
    const dir = (y < mouthY) ? -1 : 0.4;
    return [0, str * dir * h * 0.025, 0];
  });

  // O (mouth round — "Oh" for lip sync)
  createMorphTarget("O", (x,y,z,isHead,nFX,nFY,inFront) => {
    if (!isHead || !inFront) return [0,0,0];
    const mouthDist = Math.abs(y - mouthY) / (headH * 0.16);
    if (mouthDist > 1) return [0,0,0];
    const str = Math.max(0, 1 - mouthDist);
    // Pucker inward on sides
    const sideStr = Math.max(0, 1 - Math.abs(nFX)*1.5);
    const dir = (y < mouthY) ? -0.6 : 0.3;
    return [-nFX * str * w * 0.025, str * dir * h * 0.018, str * sideStr * d * 0.015];
  });

  // ── Stage 6: Export rigged GLB ──────────────────────────────────────────────
  console.log("[6/7] Exporting rigged GLB...");
  await io.write(GLB_OUT, doc);
  const glbSize = (fs.statSync(GLB_OUT).size / 1024).toFixed(1);
  console.log(`   Saved: ${GLB_OUT} (${glbSize} KB)`);

  // ── Stage 7: Inject VRM 0.x extension ──────────────────────────────────────
  console.log("[7/7] Injecting VRM 0.x extension...");

  const glbBuf = fs.readFileSync(GLB_OUT);
  const jsonLen = glbBuf.readUInt32LE(12);
  const jsonChunk = JSON.parse(glbBuf.toString("utf8", 20, 20 + jsonLen));

  // Build bone index lookup
  const nodeNames = jsonChunk.nodes.map(n => n.name);
  const boneIdx = name => nodeNames.indexOf(name);

  // VRM 0.x humanoid bone mapping
  const humanBones = [
    { bone: "hips",         node: boneIdx("hips"),         useDefaultValues: true },
    { bone: "spine",        node: boneIdx("spine"),        useDefaultValues: true },
    { bone: "chest",        node: boneIdx("chest"),        useDefaultValues: true },
    { bone: "upperChest",   node: boneIdx("upperChest"),   useDefaultValues: true },
    { bone: "neck",         node: boneIdx("neck"),         useDefaultValues: true },
    { bone: "head",         node: boneIdx("head"),         useDefaultValues: true },
    { bone: "leftEye",      node: boneIdx("leftEye"),      useDefaultValues: true },
    { bone: "rightEye",     node: boneIdx("rightEye"),     useDefaultValues: true },
    { bone: "leftShoulder", node: boneIdx("leftShoulder"), useDefaultValues: true },
    { bone: "rightShoulder",node: boneIdx("rightShoulder"),useDefaultValues: true },
    { bone: "leftUpperArm", node: boneIdx("leftUpperArm"), useDefaultValues: true },
    { bone: "rightUpperArm",node: boneIdx("rightUpperArm"),useDefaultValues: true },
    { bone: "leftLowerArm", node: boneIdx("leftLowerArm"), useDefaultValues: true },
    { bone: "rightLowerArm",node: boneIdx("rightLowerArm"),useDefaultValues: true },
    { bone: "leftHand",     node: boneIdx("leftHand"),     useDefaultValues: true },
    { bone: "rightHand",    node: boneIdx("rightHand"),    useDefaultValues: true },
    { bone: "leftUpperLeg", node: boneIdx("leftUpperLeg"), useDefaultValues: true },
    { bone: "rightUpperLeg",node: boneIdx("rightUpperLeg"),useDefaultValues: true },
    { bone: "leftLowerLeg", node: boneIdx("leftLowerLeg"), useDefaultValues: true },
    { bone: "rightLowerLeg",node: boneIdx("rightLowerLeg"),useDefaultValues: true },
    { bone: "leftFoot",     node: boneIdx("leftFoot"),     useDefaultValues: true },
    { bone: "rightFoot",    node: boneIdx("rightFoot"),    useDefaultValues: true },
  ].filter(b => b.node !== -1);

  // Build morph target index mapping
  const meshIdx = 0;
  const morphNames = ["Blink_L", "Blink_R", "Joy", "Surprised", "A", "O"];
  const blendShapeGroups = morphNames.map((name, i) => ({
    name,
    presetName: name === "Joy" ? "joy" : name === "Surprised" ? "surprised" : name === "A" ? "aa" : name === "O" ? "oh" : "blink",
    binds: [{ mesh: meshIdx, index: i, weight: 100 }],
    materialValues: [],
    isBinary: false,
  }));
  // Fix preset names per VRM spec
  blendShapeGroups[0].presetName = "blink_l";
  blendShapeGroups[1].presetName = "blink_r";

  const vrmExtension = {
    exporterVersion: "GUBER-pipeline/1.0",
    specVersion: "0.0",
    meta: {
      title: "GUBER Mascot",
      version: "1.0",
      author: "GUBER / guberapp.app",
      contactInformation: "https://guberapp.app",
      reference: "",
      texture: 0,
      allowedUserName: "OnlyAuthor",
      violentUssageName: "Disallow",
      sexualUssageName: "Disallow",
      commercialUssageName: "Allow",
      otherPermissionUrl: "",
      licenseName: "CC_BY_NC",
      otherLicenseUrl: "",
    },
    humanoid: {
      humanBones,
      armStretch: 0.05,
      legStretch: 0.05,
      upperArmTwist: 0.5,
      lowerArmTwist: 0.5,
      upperLegTwist: 0.5,
      lowerLegTwist: 0.5,
      feetSpacing: 0,
      hasTranslationDoF: false,
    },
    firstPerson: {
      firstPersonBone: boneIdx("head"),
      firstPersonBoneOffset: { x: 0, y: 0.06, z: 0 },
      meshAnnotations: [],
      lookAtTypeName: "Bone",
      lookAtHorizontalInner: { curve: [0,0,0,1,1,1,1,0], xRange: 90, yRange: 10 },
      lookAtHorizontalOuter: { curve: [0,0,0,1,1,1,1,0], xRange: 90, yRange: 10 },
      lookAtVerticalDown:    { curve: [0,0,0,1,1,1,1,0], xRange: 90, yRange: 10 },
      lookAtVerticalUp:      { curve: [0,0,0,1,1,1,1,0], xRange: 90, yRange: 10 },
    },
    blendShapeMaster: { blendShapeGroups },
    secondaryAnimation: {
      boneGroups: [],
      colliderGroups: [],
    },
    materialProperties: (jsonChunk.materials || []).map(m => ({
      name: m.name || "Material",
      renderQueue: 2000,
      shader: "VRM/MToon",
      floatProperties: { _Cutoff: 0.5, _BumpScale: 1, _ReceiveShadowRate: 1, _ShadingGradeRate: 1, _ShadeShift: 0, _ShadeToony: 0.9, _LightColorAttenuation: 0, _IndirectLightIntensity: 0.1, _OutlineWidth: 0.5, _OutlineScaledMaxDistance: 1, _OutlineLightingMix: 1, _UvAnimScrollX: 0, _UvAnimScrollY: 0, _UvAnimRotation: 0, _DebugMode: 0, _BlendMode: 0, _OutlineWidthMode: 1, _OutlineColorMode: 0, _CullMode: 2, _OutlineCullMode: 1, _SrcBlend: 1, _DstBlend: 0, _ZWrite: 1, _IsFirstSetup: 1 },
      vectorProperties: { _Color: [1,1,1,1], _ShadeColor: [0.97,0.81,0.86,1], _MainTex: [0,0,1,1], _ShadeTexture: [0,0,1,1], _BumpMap: [0,0,1,1], _EmissionColor: [0,0,0,1], _OutlineColor: [0,0,0,1] },
      textureProperties: { _MainTex: 0 },
      keywordMap: { MTOON_OUTLINE_WIDTH_WORLD: true },
      tagMap: { RenderType: "Opaque" },
    })),
  };

  if (!jsonChunk.extensions) jsonChunk.extensions = {};
  jsonChunk.extensions["VRM"] = vrmExtension;
  if (!jsonChunk.extensionsUsed) jsonChunk.extensionsUsed = [];
  if (!jsonChunk.extensionsUsed.includes("VRM")) jsonChunk.extensionsUsed.push("VRM");

  // Rebuild GLB with patched JSON
  const newJson = Buffer.from(JSON.stringify(jsonChunk), "utf8");
  const padding = (4 - (newJson.length % 4)) % 4;
  const paddedJson = Buffer.concat([newJson, Buffer.alloc(padding, 0x20)]);

  const binStart = 20 + jsonLen;
  const binData  = glbBuf.slice(binStart); // existing BIN chunk

  const newTotal = 12 + 8 + paddedJson.length + binData.length;
  const out = Buffer.allocUnsafe(newTotal);
  // Header
  out.write("glTF", 0, "ascii");
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(newTotal, 8);
  // JSON chunk
  out.writeUInt32LE(paddedJson.length, 12);
  out.writeUInt32LE(0x4E4F534A, 16); // "JSON"
  paddedJson.copy(out, 20);
  // BIN chunk (unchanged)
  binData.copy(out, 20 + paddedJson.length);

  fs.writeFileSync(VRM_OUT, out);
  const vrmSize = (fs.statSync(VRM_OUT).size / 1024).toFixed(1);
  console.log(`   Saved: ${VRM_OUT} (${vrmSize} KB)`);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log("\n✓ Pipeline complete!");
  console.log("  Files:");
  for (const f of [GLB_IN, GLB_OUT, VRM_OUT]) {
    const size = (fs.statSync(f).size / 1024).toFixed(1);
    console.log(`    ${f.replace("client/public/mascot-spec/","")}: ${size} KB`);
  }
  console.log("\nVRM is VRM 0.x compatible — drag into VSeeFace to test.");
}

main().catch(err => { console.error("Pipeline failed:", err); process.exit(1); });
