import {
  Bone,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TubeGeometry,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from 'three';
import { SdfModel, sdfWeights, type Vec3 } from '../../procedural/sdf';
import { surfaceNets } from '../../procedural/surfaceNets';
import { buildFurShells, furMaterial, type FurOptions } from '../../procedural/furShells';
import { boneSpecs, FUR, furClass, LANDMARK, pandaPrimitives } from './pandaAnatomy';
import { blackness, furColor } from './pandaPattern';
import { smoothstep } from '../../procedural/profile';

export interface FubaoModelOptions {
  /** 거리장 격자 간격 (m). 작을수록 촘촘 */
  cell?: number;
  /** 털 껍질 장수 (0 = 털 없음) */
  shells?: number;
  /** 검은 실루엣 재질 (형태 비교용) */
  silhouette?: boolean;
}

export const FUR_DEFAULT: FurOptions = { shells: 28, droop: 0.55, strand: 0.0028 };

/**
 * 푸바오 모델: 거리장 부위 → Surface Nets 피부 메시 → 뼈 가중치·무늬·털 길이 → 털 껍질 + 눈·코·발톱.
 * 반환 Group 의 userData: { skeleton, bones: Map<이름, Bone>, sdf }
 */
export function createFubaoModel(options: FubaoModelOptions = {}): Group {
  const sdf = new SdfModel(pandaPrimitives());
  const surf = surfaceNets(sdf, options.cell ?? 0.009);
  const n = surf.positions.length / 3;

  // 뼈
  const specs = boneSpecs();
  const bones = new Map<string, Bone>();
  for (const s of specs) {
    const b = new Bone();
    b.name = s.name;
    const parent = s.parent ? specs.find((p) => p.name === s.parent)!.at : [0, 0, 0];
    b.position.set(s.at[0] - parent[0], s.at[1] - parent[1], s.at[2] - parent[2]);
    bones.set(s.name, b);
    if (s.parent) bones.get(s.parent)!.add(b);
  }
  const boneList = specs.map((s) => bones.get(s.name)!);
  const boneIndex = new Map(specs.map((s, i) => [s.name, i]));

  // 정점 속성: 뼈 가중치, 무늬 색, 털 길이
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const color = new Float32Array(n * 3);
  const furLen = new Float32Array(n);
  const scratch = new Float64Array(sdf.prims.length);
  const c = new Color();
  const eyes = ([1, -1] as const).map((s) => faceSurface(sdf, s * LANDMARK.eye.x, LANDMARK.eye.y));
  const mouth = mouthCurves(sdf);
  const mouthPts = mouth.flatMap((c) => c.getSpacedPoints(24));
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [surf.positions[i * 3], surf.positions[i * 3 + 1], surf.positions[i * 3 + 2]];
    const w = sdfWeights(sdf, p[0], p[1], p[2], 0.035, scratch);
    const byName = new Map<string, number>();
    w.bones.forEach((b, k) => {
      const name = sdf.bones[b];
      skinIndex[i * 4 + k] = boneIndex.get(name)!;
      skinWeight[i * 4 + k] = w.weights[k];
      byName.set(name, w.weights[k]);
    });
    const black = blackness(p, byName);
    const rgb = furColor(p, black);
    c.setRGB(rgb[0], rgb[1], rgb[2], 'srgb');
    color.set([c.r, c.g, c.b], i * 3);
    // 털 길이: 가장 큰 가중치 뼈의 부위. 주둥이 앞은 짧게, 눈 둘레는 눈이 덮이지 않게, 발바닥은 없음
    let L = 0;
    w.bones.forEach((b, k) => (L += FUR[furClass(sdf.bones[b])] * w.weights[k]));
    if (p[2] > 0.3 && p[1] > 1.36 && p[1] < 1.52) L = Math.min(L, FUR.head + (FUR.muzzle - FUR.head) * smoothstep(0.3, 0.4, p[2]));
    for (const e of eyes) L *= smoothstep(0.012, 0.032, Math.hypot(p[0] - e.x, p[1] - e.y, p[2] - e.z));
    // 입 선 위는 털을 눕혀 선이 보이게
    if (p[2] > 0.35 && p[1] < 1.44 && p[1] > 1.38) {
      let dm = Infinity;
      for (const q of mouthPts) dm = Math.min(dm, Math.hypot(p[0] - q.x, p[1] - q.y, p[2] - q.z));
      L *= 0.25 + 0.75 * smoothstep(0.004, 0.014, dm);
    }
    const ny = surf.normals[i * 3 + 1];
    if (p[1] < 0.012 && ny < -0.5) L = 0; // 발바닥 (옆은 털이 덮는다)
    furLen[i] = L;
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(surf.positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(surf.normals, 3));
  geo.setAttribute('color', new Float32BufferAttribute(color, 3));
  geo.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
  geo.setAttribute('furLen', new Float32BufferAttribute(furLen, 1));
  geo.setIndex(new Uint32BufferAttribute(surf.indices, 1));

  const group = new Group();
  group.name = 'fubao';
  const skeleton = new Skeleton(boneList);
  const root = bones.get('root')!;
  group.add(root);
  root.updateMatrixWorld(true);

  // 피부 (털 뿌리 색: 털 색보다 어둡게 — 털 사이로 보이는 그늘)
  const skinMat = options.silhouette
    ? new MeshStandardMaterial({ color: 0x000000 })
    : new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, color: new Color(0.55, 0.55, 0.55) });
  const skin = new SkinnedMesh(geo, skinMat);
  skin.name = 'skin';
  skin.bind(skeleton);
  group.add(skin);

  const shells = options.shells ?? FUR_DEFAULT.shells;
  if (shells > 0) {
    const opts = { ...FUR_DEFAULT, shells };
    const fur = new SkinnedMesh(buildFurShells(geo, opts), furMaterial(opts, options.silhouette));
    fur.name = 'fur';
    fur.bind(skeleton);
    fur.castShadow = false;
    fur.frustumCulled = false;
    group.add(fur);
  }

  // 눈: 얼굴 표면에서 반지름의 40% 만큼 묻는다
  const eyeMat = options.silhouette
    ? new MeshStandardMaterial({ color: 0x000000 })
    : new MeshPhysicalMaterial({ color: 0x1a0f0a, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const head = bones.get('head')!;
  const headAt = specs.find((s) => s.name === 'head')!.at;
  for (const e of eyes) {
    // 기준 그림 확대: 보이는 눈알 지름 약 10 px (1.9 cm)
    const r = 0.0105;
    const eye = new Mesh(new SphereGeometry(r, 24, 16), eyeMat);
    eye.name = 'eye';
    eye.position.set(e.x - headAt[0], e.y - headAt[1], e.z - r * 0.45 - headAt[2]);
    head.add(eye);
  }

  // 코: 털 없는 검은 가죽, 살짝 윤기
  const noseMat = options.silhouette
    ? new MeshStandardMaterial({ color: 0x000000 })
    : new MeshPhysicalMaterial({ color: 0x1c1c1c, vertexColors: true, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.5 });
  const nose = new Mesh(noseGeometry(), noseMat);
  nose.name = 'nose';
  const nc = LANDMARK.nose.center;
  nose.scale.set(...LANDMARK.nose.radii);
  nose.position.set(nc[0] - headAt[0], nc[1] - headAt[1], nc[2] - headAt[2]);
  nose.rotation.x = 0.25;
  head.add(nose);
  // 입: 코 아래 세로 홈(인중)과 짧은 입 선 — 메시 간격(9 mm)보다 가늘어 무늬가 아니라 가는 관으로
  const lipMat = options.silhouette ? noseMat : new MeshStandardMaterial({ color: 0x3a332f, roughness: 0.8 });
  for (const curve of mouth) {
    const tube = new Mesh(new TubeGeometry(curve, 24, 0.0016, 6, false), lipMat);
    tube.name = 'mouth';
    tube.position.set(-headAt[0], -headAt[1], -headAt[2]);
    head.add(tube);
  }

  // 발톱: 앞발 끝·뒷발 발가락 끝에 다섯 개씩, 아래·앞으로 휜 상아색 원뿔
  const clawMat = options.silhouette ? new MeshStandardMaterial({ color: 0x000000 }) : new MeshStandardMaterial({ color: 0xa69a83, roughness: 0.38 });
  const clawGeo = clawGeometry();
  for (const [s, k] of [[1, 'L'], [-1, 'R']] as const) {
    addClaws(bones.get(`hand_${k}`)!, specs, `hand_${k}`, sdf, LANDMARK.pawTip(s), new Vector3(0, -1, 0.45), 0.032, clawGeo, clawMat);
    addClaws(bones.get(`foot_${k}`)!, specs, `foot_${k}`, sdf, LANDMARK.toeTip(s), new Vector3(0, -0.35, 1), 0.036, clawGeo, clawMat);
  }

  group.traverse((o) => {
    if (o instanceof Mesh && o.name !== 'fur') o.castShadow = true;
  });
  group.userData = { skeleton, bones, sdf };
  return group;
}

/** 코: 위가 넓고 아래 가운데로 뾰족해지는 둥근 역삼각형, 아래 절반에 세로 홈 (기준 그림 확대). 단위 크기 — 반지름으로 늘려 쓴다 */
function noseGeometry(): BufferGeometry {
  const g = new SphereGeometry(1, 64, 40);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    const below = Math.max(0, -y);
    x *= (1 + 0.1 * y) * (1 - 0.5 * below ** 1.4);
    z *= 1 - 0.12 * below * Math.exp(-((x / 0.18) ** 2));
    // 콧구멍: 아래 앞쪽 양옆의 쉼표 모양 오목 (기준 그림) — 안으로 밀고 더 검게
    const nost = Math.exp(-(((Math.abs(x) - 0.5) / 0.17) ** 2) - ((y + 0.28) / 0.17) ** 2) * Math.max(0, z);
    x *= 1 - 0.1 * nost;
    z *= 1 - 0.28 * nost;
    if (z < 0) z *= 0.6; // 얼굴에 묻히는 뒤쪽은 납작하게
    p.setXYZ(i, x, y, z);
    const c = 1 - 0.85 * Math.min(1, nost * 1.6);
    col.set([c, c, c], i * 3);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** 인중(코 밑 → 입)과 입 선. 얼굴 표면 위 2 mm */
function mouthCurves(sdf: SdfModel): CatmullRomCurve3[] {
  const on = (x: number, y: number) => faceSurface(sdf, x, y).add(new Vector3(0, 0, 0.002));
  const philtrum = new CatmullRomCurve3([on(0, 1.424), on(0, 1.416), on(0, 1.408)]);
  // 인중 끝에서 양옆 아래로 짧게 갈라지는 입 (곰 입 모양, 기준 그림 폭 약 ±2.4 cm)
  const lip = new CatmullRomCurve3([on(-0.022, 1.404), on(-0.011, 1.406), on(0, 1.408), on(0.011, 1.406), on(0.022, 1.404)]);
  return [philtrum, lip];
}

/** x, y 에서 앞(+z)으로부터 얼굴 표면을 찾는다 */
function faceSurface(sdf: SdfModel, x: number, y: number): Vector3 {
  let z = 0.7;
  while (z > 0 && sdf.distance(x, y, z) > 0) z -= 0.001;
  return new Vector3(x, y, z);
}

/**
 * 발톱 다섯 개: 발끝 둘레에 좌우로 늘어놓고, 각 자리에서 발톱 방향 반대로 표면을 찾아 뿌리를 털 속(피부 안 4 mm)에 박는다.
 * 가운데 발톱이 가장 앞으로 나오도록 바깥쪽은 조금 뒤로.
 */
function addClaws(bone: Bone, specs: ReturnType<typeof boneSpecs>, name: string, sdf: SdfModel, tip: Vec3, dir: Vector3, spread: number, geo: BufferGeometry, mat: MeshStandardMaterial): void {
  const at = specs.find((b) => b.name === name)!.at;
  const d = dir.clone().normalize();
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2; // −1 … 1
    const start = new Vector3(tip[0] + t * spread, tip[1], tip[2] - Math.abs(t) * 0.012).addScaledVector(d, 0.08);
    // 표면까지 발톱 방향 반대로 걸어 들어간다
    let k = 0;
    while (k < 300 && sdf.distance(start.x, start.y, start.z) > 0) {
      start.addScaledVector(d, -0.001);
      k++;
    }
    start.addScaledVector(d, -0.004);
    const claw = new Mesh(geo, mat);
    claw.name = 'claw';
    claw.position.set(start.x - at[0], start.y - at[1], start.z - at[2]);
    claw.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), d);
    bone.add(claw);
  }
}

/** 휜 발톱: 뿌리(원점)에서 −Y 로 뻗고 끝이 +Z(발바닥 쪽)로 휜다. 길이 4.2 cm (털 밖으로 약 2 cm) */
function clawGeometry(): BufferGeometry {
  const g = new ConeGeometry(0.0036, 0.042, 10, 8);
  g.translate(0, -0.021, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = -p.getY(i) / 0.042; // 0 뿌리 → 1 끝
    p.setZ(i, p.getZ(i) * 0.8 + 0.018 * t * t); // 옆으로 조금 납작하고 끝이 휜다
  }
  g.computeVertexNormals();
  return g;
}
