import type { SdfPrimitive, Vec3 } from '../../procedural/sdf';

/**
 * 푸바오(자이언트판다) 해부: 뼈 관절 위치와 몸 부위(거리장 덩어리).
 *
 * 기준 그림: assets/concept/fubao/reference-v1.png (뒷발로 선 판다, 왼쪽 측면 | 오른쪽 정면, 같은 축척·같은 바닥선).
 * 이미지 → 미터: 1 px = REF.scale m, 바닥 = 이미지 y REF.ground, 측면 z = 0 은 이미지 x REF.sideZ0 (두 발 가운데),
 * 정면 x = 0 은 REF.frontX0 (몸 윤곽 좌우 가운데의 중앙값. 얼굴(눈·코) 가운데는 1137 로 6 px 오른쪽 — 고개를 조금 돌렸다).
 * 축척은 정수리 1.70 m (귀 끝 1.75 m) 로 정했다 — 실제 판다가 서면 약 1.5~1.6 m, 격투게임 상대(부캉이 2.56 m)와 맞추려고 조금 키웠다 (사용자 결정 대기).
 *
 * 좌표: m, +Y 위, +Z 앞(얼굴 쪽), **+X = 캐릭터의 왼쪽** (앞을 보고 선 캐릭터에서 위 × 앞 = 왼쪽). 뼈 이름의 _L 이 +X.
 * 바인드 포즈 = 기준 그림의 자세 (뒷발로 서서 앞발을 가슴 앞에 늘어뜨림). 그림과 실루엣을 바로 비교하려고 (D-09 와 같은 이유).
 *
 * 측정값은 털 끝 윤곽이다. 부위는 피부 크기 = 윤곽 − 털 길이(FUR) 로 적는다.
 * 측면 윤곽(높이별 뒤·앞 끝, 털 끝)과 정면 폭은 tools/reference/panda_silhouette.py 로 뽑았다.
 */
export const REF = { scale: 0.00188, ground: 955, sideZ0: 377, frontX0: 1131 } as const;

/** 털 길이 (m) — 부위별. 껍질 털이 이만큼 바깥으로 나간다 */
export const FUR = { body: 0.04, limb: 0.035, head: 0.026, ear: 0.02, muzzle: 0.012, paw: 0.022 } as const;

/** 뼈: 이름, 부모, 관절 위치 (바인드 포즈 모델 좌표) */
export interface BoneSpec {
  name: string;
  parent: string | null;
  at: Vec3;
}

const side = (x: number, s: 1 | -1) => x * s;

/** 관절 위치. 팔: 기준 그림에서 위팔은 몸 옆으로 내려오고(팔꿈치가 가장 낮다), 아래팔은 앞 위로, 손목을 꺾어 앞발이 아래로 늘어진다 */
export function boneSpecs(): BoneSpec[] {
  const bones: BoneSpec[] = [
    { name: 'root', parent: null, at: [0, 0, 0] },
    { name: 'pelvis', parent: 'root', at: [0, 0.5, -0.03] },
    { name: 'spine', parent: 'pelvis', at: [0, 0.74, -0.01] },
    { name: 'chest', parent: 'spine', at: [0, 1.04, 0.02] },
    { name: 'neck', parent: 'chest', at: [0, 1.27, 0.02] },
    { name: 'head', parent: 'neck', at: [0, 1.45, 0.08] },
    // 턱 관절: 귀 아래 볼 안쪽 (입을 벌리면 아래턱이 이 축으로 돈다)
    { name: 'jaw', parent: 'head', at: [0, 1.44, 0.17] },
    { name: 'tail', parent: 'pelvis', at: [0, 0.56, -0.25] },
  ];
  for (const [s, k] of [[1, 'L'], [-1, 'R']] as const) {
    bones.push(
      { name: `ear_${k}`, parent: 'head', at: [side(0.14, s), 1.66, 0.15] },
      { name: `upperarm_${k}`, parent: 'chest', at: [side(0.24, s), 1.2, -0.01] },
      { name: `forearm_${k}`, parent: `upperarm_${k}`, at: [side(0.3, s), 0.92, 0.1] },
      { name: `hand_${k}`, parent: `forearm_${k}`, at: [side(0.22, s), 1.02, 0.33] },
      { name: `thigh_${k}`, parent: 'pelvis', at: [side(0.16, s), 0.5, -0.03] },
      { name: `shin_${k}`, parent: `thigh_${k}`, at: [side(0.23, s), 0.27, 0.06] },
      { name: `foot_${k}`, parent: `shin_${k}`, at: [side(0.27, s), 0.1, -0.07] },
    );
  }
  return bones;
}

/** 랜드마크 (피부 위치). 눈은 얼굴 표면을 앞에서 찾아 박는다 */
export const LANDMARK = {
  /** 눈: 정면 이미지 (1103, 137)·(1171, 139), 측면 이미지 x 567 */
  eye: { x: 0.064, y: 1.538 },
  /** 코: 정면 폭 47 px (0.088 m), 이미지 y 173–197, 측면 코끝 이미지 x 638 */
  nose: { center: [0, 1.452, 0.462] as Vec3, radii: [0.044, 0.024, 0.03] as Vec3 },
  /** 앞발 끝 (발톱 자리) */
  pawTip: (s: 1 | -1): Vec3 => [side(0.19, s), 0.85, 0.425],
  /** 뒷발 발가락 끝 */
  toeTip: (s: 1 | -1): Vec3 => [side(0.275, s), 0.035, 0.185],
} as const;

/**
 * 몸 부위. 순서가 이어 붙이는 순서다 (몸통 → 머리 → 팔다리 → 작은 부위).
 * 각 줄 끝 주석은 맞춘 측정값 (털 끝 윤곽, m).
 */
export function pandaPrimitives(): SdfPrimitive[] {
  const P: SdfPrimitive[] = [
    // 몸통: 허리 폭 ±0.32 · 앞뒤 −0.29~+0.27 (높이 0.7), 엉덩이 뒤끝 −0.34 (0.52), 가슴 뒤끝 −0.21 (1.1)
    { name: 'belly', kind: 'ellipsoid', bone: 'spine', blend: 0, center: [0, 0.74, -0.01], radii: [0.29, 0.3, 0.255] },
    { name: 'rump', kind: 'ellipsoid', bone: 'pelvis', blend: 0.1, center: [0, 0.5, -0.03], radii: [0.3, 0.2, 0.245] },
    { name: 'chest', kind: 'ellipsoid', bone: 'chest', blend: 0.12, center: [0, 1.13, 0.05], radii: [0.27, 0.24, 0.205] },
    // 목: 판다는 목이 굵어 머리와 어깨 사이가 거의 끊기지 않는다
    { name: 'neck', kind: 'cone', bone: 'neck', blend: 0.08, a: [0, 1.22, 0.0], b: [0, 1.44, 0.08], ra: 0.185, rb: 0.15 },
    // 턱 밑 가슴: 측면에서 턱 아래 앞끝 +0.26~0.28 (1.27~1.32)
    { name: 'throat', kind: 'ellipsoid', bone: 'neck', blend: 0.07, center: [0, 1.29, 0.1], radii: [0.17, 0.11, 0.13] },
    // 머리: 정수리 1.70 (가장 높은 곳은 귀 앞 z 0.27 — 뒤로 갈수록 낮아서 앞을 10° 들었다), 뒤통수 −0.04 (1.55), 폭 ±0.19 (1.55)
    { name: 'cranium', kind: 'ellipsoid', bone: 'head', blend: 0.06, center: [0, 1.535, 0.165], radii: [0.165, 0.135, 0.195], rotation: [-10, 0, 0] },
    // 볼(턱 근육): 정면 폭 ±0.25 (1.36) — 판다 얼굴이 둥글고 넓은 이유
    // 볼은 뒤로 넣고 주둥이와 크게 이어 붙인다 — z 0.14 에 두면 옆얼굴에서 볼이 공처럼 따로 불룩했다
    { name: 'cheek_L', kind: 'ellipsoid', bone: 'head', blend: 0.09, center: [0.1, 1.405, 0.11], radii: [0.12, 0.095, 0.13] },
    { name: 'cheek_R', kind: 'ellipsoid', bone: 'head', blend: 0.09, center: [-0.1, 1.405, 0.11], radii: [0.12, 0.095, 0.13] },
    // 주둥이: 코끝 +0.49 (1.46) 까지. 짧고 넓다
    { name: 'muzzle', kind: 'ellipsoid', bone: 'head', blend: 0.08, center: [0, 1.455, 0.36], radii: [0.075, 0.065, 0.11], rotation: [8, 0, 0] },
    // 아래턱
    { name: 'chin', kind: 'ellipsoid', bone: 'jaw', blend: 0.04, center: [0, 1.385, 0.33], radii: [0.072, 0.05, 0.11] },
    // 꼬리: 엉덩이 뒤 0.57 높이의 짧은 털 뭉치
    { name: 'tail', kind: 'ellipsoid', bone: 'tail', blend: 0.04, center: [0, 0.57, -0.29], radii: [0.055, 0.065, 0.045] },
  ];
  for (const [s, k] of [[1, 'L'], [-1, 'R']] as const) {
    const b = Object.fromEntries(boneSpecs().map((x) => [x.name, x.at]));
    const S = b[`upperarm_${k}`];
    const E = b[`forearm_${k}`];
    const W = b[`hand_${k}`];
    const K = b[`shin_${k}`];
    const A = b[`foot_${k}`];
    P.push(
      // 귀: 정면 지름 0.126 (털 포함), 중심 ±0.155 · 1.70. 앞을 보며 바깥으로 기울었다
      { name: `ear_${k}`, kind: 'ellipsoid', bone: `ear_${k}`, blend: 0.04, center: [side(0.15, s), 1.685, 0.165], radii: [0.048, 0.05, 0.03], rotation: [0, side(20, s), side(-15, s)] },
      // 어깨: 둥근 어깨 덩어리 (검은 띠가 덮는 곳)
      { name: `shoulder_${k}`, kind: 'ellipsoid', bone: `upperarm_${k}`, blend: 0.08, center: [side(0.2, s), 1.13, -0.01], radii: [0.125, 0.15, 0.15] },
      // 팔: 바깥 끝 ±0.41 (1.0), 앞발 끝 +0.49 (0.9)
      { name: `upperarm_${k}`, kind: 'cone', bone: `upperarm_${k}`, blend: 0.05, a: S, b: E, ra: 0.12, rb: 0.085 },
      { name: `forearm_${k}`, kind: 'cone', bone: `forearm_${k}`, blend: 0.03, a: E, b: W, ra: 0.095, rb: 0.08 },
      { name: `paw_${k}`, kind: 'ellipsoid', bone: `hand_${k}`, blend: 0.03, center: [side(0.205, s), 0.935, 0.395], radii: [0.075, 0.095, 0.062], rotation: [-20, 0, 0] },
      // 다리: 허벅지 바깥 ±0.37 (0.3~0.5), 정강이 ±0.13~0.39 (0.19), 발 ±0.175~0.40
      { name: `thigh_${k}`, kind: 'ellipsoid', bone: `thigh_${k}`, blend: 0.08, center: [side(0.21, s), 0.39, -0.04], radii: [0.15, 0.2, 0.2] },
      // 정강이는 털 때문에 앞뒤가 좌우보다 두툼하다 (정면 폭 0.26, 측면은 두 다리가 겹쳐 0.5 — 한 다리는 약 0.3 으로 봄)
      { name: `shin_${k}`, kind: 'cone', bone: `shin_${k}`, blend: 0.04, a: K, b: A, ra: 0.12, rb: 0.09 },
      { name: `calf_${k}`, kind: 'ellipsoid', bone: `shin_${k}`, blend: 0.05, center: [side(0.245, s), 0.2, -0.02], radii: [0.095, 0.13, 0.14] },
      { name: `foot_${k}`, kind: 'ellipsoid', bone: `foot_${k}`, blend: 0.04, center: [side(0.28, s), 0.048, 0.03], radii: [0.088, 0.05, 0.15] },
    );
  }
  return P;
}

/** 털 길이 부위 분류: 뼈 이름 → FUR 키 */
export function furClass(bone: string): keyof typeof FUR {
  if (bone.startsWith('ear')) return 'ear';
  if (bone === 'head' || bone === 'jaw') return 'head';
  if (bone.startsWith('hand') || bone.startsWith('foot')) return 'paw';
  if (/arm|thigh|shin/.test(bone)) return 'limb';
  return 'body';
}
