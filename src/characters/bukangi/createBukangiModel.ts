import {
  Bone,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
  SkinnedMesh,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { fitCageToTargets, subdivideLevels, toBufferGeometry } from '../../procedural/catmullClark';
import { smoothstep } from '../../procedural/profile';
import { CAUDAL, EYE_H, EYE_RADIUS, EYE_U, LANDMARKS, bodyBottom, bodyTop, eyeSocket, sectionAt, thetaOf } from './sharkAnatomy';
import { createSneaker } from './sneaker';
import { TOTAL_LENGTH, U0, bodyColor, buildSharkCage, mix, toModel } from './sharkCage';
import { buildSkinMaps } from './skinMaps';
import { SPINE_STATIONS, applyStandingPose, applySwimPose, bindWeights, buildSharkRig, solveStandingTilt, type SharkRig } from './sharkRig';

/**
 * 부캉이 — 흉상어 몸을 지느러미로 세운 격투 캐릭터.
 * 좌표: 미터, +Y 위, +Z 정면(주둥이), +X 오른쪽.
 *
 * 제어 케이지 → 지느러미 한계면 맞춤 → Catmull-Clark 로 나눈 한 장의 메시 (몸 + 지느러미 8개).
 * 바인드 포즈는 헤엄치는 자세이고, 서 있는 자세는 뼈로 구부린다 (형상을 다시 짜지 않는다).
 */
export { TOTAL_LENGTH };
const TL = TOTAL_LENGTH;

export interface BukangiModelOptions {
  /** 서브디비전 단계 (4 ≈ 24만 사각형, 게임용은 3) */
  levels?: number;
  /** 'stand' = 격투 자세, 'swim' = 바인드 포즈 (사진 비교·곡률 검사용) */
  pose?: 'stand' | 'swim';
  /** 꼬리 아래 엽에 운동화를 신긴다 (기본 true) */
  shoe?: boolean;
}

/**
 * 눈알: 극점이 바깥을 향하는 구에 동공·홍채를 그린다.
 * 사진의 눈은 검은 동공을 흐린 은회색 홍채가 얇게 두르고, 나머지는 거의 검다.
 */
function eyeTexture(): CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const a = y / h; // 극점에서의 각도 / π
    for (let x = 0; x < w; x++) {
      const fiber = 0.9 + 0.1 * Math.sin((x / w) * Math.PI * 2 * 53 + Math.sin((x / w) * 40) * 2);
      const iris = smoothstep(0.11, 0.14, a) * (1 - smoothstep(0.19, 0.225, a));
      const limbus = smoothstep(0.17, 0.235, a) * (1 - smoothstep(0.235, 0.27, a));
      const v = 12 + iris * (88 * fiber - 12) - limbus * 30 * iris;
      img.data.set([v, v * 1.03, v * 0.95, 255], (y * w + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** 배 정중선 UV 이음매를 가로지르는 삼각형의 정점을 복제해 b 를 1 넘어로 잇는다 */
function splitSeam(g: BufferGeometry): BufferGeometry {
  const index = g.getIndex()!.array as Uint32Array | Uint16Array;
  const uv = g.getAttribute('uv');
  const names = Object.keys(g.attributes);
  const data = Object.fromEntries(names.map((n) => [n, Array.from(g.getAttribute(n).array as Float32Array)]));
  const sizes = Object.fromEntries(names.map((n) => [n, g.getAttribute(n).itemSize]));
  const dup = new Map<number, number>();
  const newIndex = Array.from(index);
  let count = uv.count;
  for (let t = 0; t < newIndex.length; t += 3) {
    const bs = [0, 1, 2].map((k) => uv.getX(newIndex[t + k]));
    if (Math.max(...bs) - Math.min(...bs) < 0.5) continue;
    for (let k = 0; k < 3; k++) {
      const v = newIndex[t + k];
      if (bs[k] >= 0.5) continue;
      let d = dup.get(v);
      if (d === undefined) {
        d = count++;
        dup.set(v, d);
        for (const n of names) for (let c = 0; c < sizes[n]; c++) data[n].push(data[n][v * sizes[n] + c]);
        data.uv[d * 2] += 1;
      }
      newIndex[t + k] = d;
    }
  }
  const out = new BufferGeometry();
  for (const n of names) out.setAttribute(n, new Float32BufferAttribute(data[n], sizes[n]));
  out.setIndex(newIndex);
  return out;
}

export function createBukangiModel(options: BukangiModelOptions = {}): Group {
  const levels = options.levels ?? 4;
  const root = new Group();
  root.name = 'bukangi';

  // ── 케이지 → 한계면 맞춤 → 서브디비전 ────────────────────────────────────
  const cage = buildSharkCage();
  // 몸은 조절점 그대로(근사), 지느러미만 끝이 줄어들지 않게 한계면을 목표에 맞춘다
  const fitMask = Uint8Array.from(cage.mesh.attributes.finSpan.data, (s) => (s > 0 ? 1 : 0));
  const fitted = fitCageToTargets(cage.mesh, cage.targets, 3, 10, fitMask);
  const fine = subdivideLevels(fitted, levels);

  const p = fine.positions;
  const nv = p.length / 3;
  const span = fine.attributes.finSpan.data;
  const tint = fine.attributes.tint.data;

  // 눈자리: 몸 정점을 단면 바깥 방향으로 실제로 민다 (눈알이 앉을 오목)
  for (let i = 0; i < nv; i++) {
    if (span[i] > 0.02) continue;
    const x = p[i * 3] / TL;
    const h = p[i * 3 + 1] / TL;
    const u = U0 - p[i * 3 + 2] / TL;
    const d = eyeSocket(u, x, h);
    if (d === 0) continue;
    const sec = sectionAt(u);
    const n = new Vector3(x / sec.halfWidth ** 2, (h - sec.center) / sec.halfHeight ** 2, 0).normalize();
    p[i * 3] += n.x * d * TL;
    p[i * 3 + 1] += n.y * d * TL;
  }

  const geometry = toBufferGeometry({ positions: p, faces: fine.faces, attributes: { finSpan: fine.attributes.finSpan } });
  const colors = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const mask = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const x = p[i * 3] / TL;
    const h = p[i * 3 + 1] / TL;
    const u = Math.min(1, Math.max(0, U0 - p[i * 3 + 2] / TL));
    const theta = thetaOf(u, x, h);
    // 몸은 위치에서 바로 계산한 또렷한 체색, 지느러미는 케이지에서 함께 나뉜 색으로 넘어간다
    const w = smoothstep(0, 0.25, span[i]);
    const c = mix(bodyColor(u, Math.sin(theta)), [tint[i * 3], tint[i * 3 + 1], tint[i * 3 + 2]], w);
    colors.set(c, i * 3);
    uvs[i * 2] = (((theta + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
    uvs[i * 2 + 1] = u;
    mask[i] = 1 - smoothstep(0.02, 0.12, span[i]);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('detailMask', new Float32BufferAttribute(mask, 1));
  const bodyGeometry = splitSeam(geometry);

  // ── 재질: 거칠기 고르게, 클리어코트 약하게. 노멀·그늘 맵은 몸에만 (지느러미 쪽은 detailMask 로 끈다) ──
  const maps = buildSkinMaps(TL);
  const skin = new MeshPhysicalMaterial({
    vertexColors: true,
    map: maps.cavity,
    normalMap: maps.normal,
    roughness: 0.4,
    clearcoat: 0.15,
    clearcoatRoughness: 0.25,
  });
  skin.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float detailMask;\nvarying float vDetailMask;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetailMask = detailMask;');
    const fragment = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vDetailMask;')
      .replace('diffuseColor *= sampledDiffuseColor;', 'diffuseColor.rgb *= mix( vec3( 1.0 ), sampledDiffuseColor.rgb, vDetailMask );')
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vDetailMask;');
    if (fragment === shader.fragmentShader) console.warn('[bukangi] detailMask 셰이더 패치가 적용되지 않았습니다');
    shader.fragmentShader = fragment;
  };

  // ── 뼈대 · 스키닝 (바인드 = 헤엄치는 자세) ───────────────────────────────
  const rig = buildSharkRig(cage);
  bindWeights(bodyGeometry, rig, cage);
  const body = new SkinnedMesh(bodyGeometry, skin);
  body.name = 'body';
  body.add(rig.root);
  root.add(body);
  root.updateMatrixWorld(true);
  body.bind(rig.skeleton);

  // ── 눈 ───────────────────────────────────────────────────────────────────
  const eyeMaterial = new MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
  const r = EYE_RADIUS * TL;
  for (const side of [1, -1] as const) {
    const sec = sectionAt(EYE_U);
    const theta = Math.asin(Math.max(-1, Math.min(1, (EYE_H - sec.center) / sec.halfHeight)));
    const target = toModel(side * sec.halfWidth * Math.cos(theta), EYE_H, EYE_U);
    // 실제 메시 위에서 가장 가까운 몸 정점 (눈자리 오목이 파이기 전 위치 기준)
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < nv; i++) {
      if (span[i] > 0.02) continue;
      const d = (p[i * 3] - target.x) ** 2 + (p[i * 3 + 1] - target.y) ** 2 + (p[i * 3 + 2] - target.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const normal = new Vector3(side * Math.cos(theta) / sec.halfWidth, Math.sin(theta) / sec.halfHeight, 0).normalize();
    const surface = new Vector3(p[best * 3], p[best * 3 + 1], p[best * 3 + 2]).addScaledVector(normal, -eyeSocket(EYE_U, side * sec.halfWidth, EYE_H) * TL);
    const eye = new Mesh(new SphereGeometry(r, 32, 24), eyeMaterial);
    eye.name = `eye-${side > 0 ? 'R' : 'L'}`;
    // 각막만 살짝 드러나도록 깊이 묻는다 (구의 35% 노출, 가장자리는 눈꺼풀이 덮는다)
    eye.position.copy(surface).addScaledVector(normal, -0.65 * r);
    eye.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal));
    root.add(eye);
    root.updateMatrixWorld(true);
    spineBoneAt(rig, EYE_U).attach(eye);
  }

  /** 바인드 포즈의 점을 그 점이 따르는 뼈로 옮긴 현재 위치 */
  const posed = (bind: Vector3, bone: Bone) => {
    const i = rig.skeleton.bones.indexOf(bone);
    return bind.clone().applyMatrix4(rig.skeleton.boneInverses[i]).applyMatrix4(bone.matrixWorld).toArray();
  };

  // ── 서 있는 자세: 꼬리 위 엽 끝 + 아래 엽에 신긴 운동화, 두 점으로 선다 ──────────
  const upperTip = toModel(0, sectionAt(CAUDAL.end).center, CAUDAL.end);
  const lobeRows = cage.finRows['caudal-fin-lower'];
  const lobeTip = new Vector3(...lobeRows[lobeRows.length - 1].center);
  const withShoe = options.shoe ?? true;
  // 밈 원본처럼 신발이 눈에 띄도록 실제 크기의 1.8배 (약 58 cm)
  const sneaker = withShoe ? createSneaker(1.8) : null;
  const tilt = solveStandingTilt(rig, upperTip, lobeTip, sneaker ? sneaker.collar.y : 0);
  applyStandingPose(rig, tilt);
  root.updateMatrixWorld(true);
  if (sneaker) {
    const tailBone = spineBoneAt(rig, 0.83);
    const tip = new Vector3(...posed(lobeTip, tailBone));
    const groundY = posed(upperTip, spineBoneAt(rig, CAUDAL.end))[1];
    // 앞코는 정면(+z), 바닥은 위 엽 끝과 같은 높이, 칼라가 아래 엽 끝을 감싼다
    sneaker.group.position.set(tip.x - sneaker.collar.x, groundY, tip.z - sneaker.collar.z);
    root.add(sneaker.group);
    root.updateMatrixWorld(true);
    tailBone.attach(sneaker.group);
  }
  if ((options.pose ?? 'stand') === 'swim') applySwimPose(rig);
  root.updateMatrixWorld(true);
  body.computeBoundingBox();
  // 바닥(y=0)에 세운다
  root.position.y = -new Box3().setFromObject(root).min.y;
  root.updateMatrixWorld(true);

  const landmark = (u: number, h: number) => posed(toModel(0, h, u), spineBoneAt(rig, u));
  const limbLandmark = (name: string) => posed(new Vector3(...cage.finCenters[name]), rig.limbs[name][1]);
  root.userData.sculptRuntime = {
    character: 'bukangi',
    pose: options.pose ?? 'stand',
    standingTilt: tilt,
    rig: { spine: SPINE_STATIONS, limbs: Object.keys(rig.limbs), bones: rig.skeleton.bones.map((b) => b.name) },
    totalLength: TL,
    cage: { vertices: cage.targets.length / 3, faces: cage.mesh.faces.length, levels, quads: fine.faces.length },
    parts: root.children.map((c) => c.name),
    finLeadingEdges: cage.finLeadingEdges,
    landmarks: {
      snout: landmark(0, (bodyTop(0) + bodyBottom(0)) / 2),
      eye: posed(toModel(sectionAt(EYE_U).halfWidth, EYE_H, EYE_U), spineBoneAt(rig, EYE_U)),
      gills: posed(toModel(0.06, 0, 0.285), spineBoneAt(rig, 0.285)),
      mouth: landmark(0.11, bodyBottom(0.11)),
      pectoral: limbLandmark('pectoral-fin-L'),
      dorsal: landmark(0.42, bodyTop(0.42) + 0.03),
      pelvic: limbLandmark('pelvic-fin-L'),
      caudal: posed(new Vector3(...cage.finCenters['caudal-fin-lower']), spineBoneAt(rig, 0.82)),
      caudalOrigin: landmark(LANDMARKS.caudalOrigin, 0),
      ...(sneaker ? { shoe: new Box3().setFromObject(sneaker.group).getCenter(new Vector3()).toArray() } : {}),
    },
  };
  // 랜드마크는 모델 로컬 좌표로 내보낸다 (뷰어가 모델 위치를 더해 쓴다)
  const lm = root.userData.sculptRuntime.landmarks as Record<string, number[]>;
  for (const key of Object.keys(lm)) lm[key] = root.worldToLocal(new Vector3(...lm[key])).toArray();
  return root;
}

function spineBoneAt(rig: SharkRig, u: number): Bone {
  let best = rig.spine[0];
  for (const b of rig.spine) if (Math.abs((b.userData.u as number) - u) < Math.abs((best.userData.u as number) - u)) best = b;
  return best;
}
