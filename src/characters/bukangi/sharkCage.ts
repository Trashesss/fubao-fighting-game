import { Vector3 } from 'three';
import { orientFaces, type PolyMesh } from '../../procedural/catmullClark';
import { smoothstep } from '../../procedural/profile';
import { CAUDAL, LANDMARKS, bodyBottom, bodyTop, sectionAt, sectionPoint } from './sharkAnatomy';
import { MOUTH, headRingU, phiOf, rawCornerPhi } from './sharkMouth';

/**
 * 부캉이 제어 케이지. 몸 링 22개 × 둘레 32점 + 주둥이·꼬리 끝 8×8 격자 덮개.
 * 지느러미 8개는 같은 케이지의 면 하나를 밀어내 뽑는다 — 몸과 처음부터 한 메시라
 * 필렛·법선 섞기·뿌리 턱이 필요 없다.
 *
 * 케이지 정점마다 "한계면이 지나야 할 목표점"을 함께 만들고, fitCageToTargets 로 케이지를 보정한다.
 */
export const TOTAL_LENGTH = 2.8; // 구리상어/흑기흉상어 성체 전장 2.5~3 m
export const U0 = 0.4; // z=0 이 되는 몸 위치
const TL = TOTAL_LENGTH;

export const toModel = (x: number, h: number, u: number, out = new Vector3()) => out.set(x * TL, h * TL, (U0 - u) * TL);

/**
 * 둘레 점 수. 지느러미 뿌리 면 폭 = 360°/COLS — 16 이면 가슴지느러미 뿌리가 약 7 cm 로 지느러미보다 두꺼워
 * 소매·혹처럼 보였다. 32 로 그 절반.
 */
export const COLS = 32;
/** 둘레 정점 각도. 면 중심이 등(90°)·배(270°)·옆구리 아래(±22.5°, ±67.5°)에 오도록 반 칸 어긋나게 둔다 */
const colTheta = (j: number) => Math.PI / 2 + (j + 0.5) * ((2 * Math.PI) / COLS);

/**
 * 링 위치 (u, 등 쪽 값). 지느러미 뿌리 면의 앞뒤 경계가 링에 오도록 고른다:
 * 가슴 0.315–0.37, 첫 등 0.37–0.49, 배 0.53–0.59, 둘째 등·뒷 0.675–0.725, 꼬리 아래 엽 0.785–0.845.
 * 머리 링 2~6 은 배 쪽에서 입 선을 따라 휜다 (MOUTH_RING 이 입 선 자체, sharkMouth.ts).
 */
export const RINGS = [0.012, 0.035, 0.06, 0.085, 0.11, 0.13, 0.15, 0.17, 0.23, 0.315, 0.37, 0.49, 0.53, 0.59, 0.64, 0.675, 0.725, 0.76, 0.785, 0.845, 0.89, 0.935, 0.975];
export const MOUTH_RING = 4;
const ringOf = (u: number) => {
  const r = RINGS.indexOf(u);
  if (r < 0) throw new Error(`링 ${u} 없음`);
  return r;
};
/** 면 중심 각도(도) → 그 면의 시작 열 */
const colOfFaceCenter = (deg: number) => ((Math.round((deg - 90) / (360 / COLS)) - 1 + COLS) % COLS);

// ── 체색 (선형) ───────────────────────────────────────────────────────────
export type RGB = readonly [number, number, number];
const lin = (c: number) => c ** 2.2;
const rgb = (r: number, g: number, b: number): RGB => [lin(r), lin(g), lin(b)];
// 사진 색에서 물속 푸른 기를 뺀 값. 등 꼭대기는 진한 구릿빛 회색, 옆면은 밝은 은회색, 배는 흰색
export const DORSAL_TOP = rgb(0.33, 0.325, 0.29);
export const DORSAL = rgb(0.45, 0.445, 0.41);
export const FLANK = rgb(0.6, 0.6, 0.575);
export const VENTRAL = rgb(0.93, 0.925, 0.9);
export const DUSKY = rgb(0.2, 0.2, 0.19);
// 입 안: 잇몸은 분홍, 입천장·바닥은 조금 어둡게, 목구멍은 검붉게
const GUM = rgb(0.8, 0.55, 0.53);
const PALATE = rgb(0.66, 0.45, 0.44);
const THROAT = rgb(0.2, 0.08, 0.08);
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * 등 꼭대기 → 옆면 → 배 그라데이션. 흰 배와의 경계는 또렷하다 (사진: S ≈ -0.5).
 * 경계 바로 위 옆면이 가장 밝은 은회색이고 위로 갈수록 어두워진다.
 * 주둥이 아래는 흰색. 옆구리 흰 띠는 가슴지느러미 뒤에서 앞으로 뾰족한 쐐기로 경계를 파고들어
 * 배지느러미 위에서 가장 높고(S≈0) 꼬리 쪽으로 빠르게 내려간다. 꼬리 위 엽은 전부 등색.
 */
export function bodyColor(u: number, S: number): RGB {
  let boundary = -0.5;
  boundary += 0.25 * (1 - smoothstep(0.02, 0.07, u));
  boundary += 0.5 * smoothstep(0.4, 0.53, u) ** 1.5 * (1 - smoothstep(0.55, 0.66, u));
  boundary -= 0.8 * smoothstep(0.77, 0.81, u);
  const dorsalness = smoothstep(boundary - 0.045, boundary + 0.045, S);
  const back = mix(FLANK, mix(DORSAL, DORSAL_TOP, smoothstep(0.35, 0.95, S)), smoothstep(boundary + 0.04, 0.35, S));
  return mix(VENTRAL, back, dorsalness);
}

// ── 지느러미 설계 ─────────────────────────────────────────────────────────
/** 날개 방향 행: s = 날개 좌표, lead/trail = 시위 좌표, thick = 앞전 쪽 반두께 (TL) */
interface FinRow {
  s: number;
  lead: number;
  trail: number;
  thick: number;
}
interface FinDesign {
  name: string;
  ring: number; // 뿌리 면 앞쪽 링의 u
  faceCenterDeg: number;
  rows: FinRow[];
  /** 지느러미 평면 좌표 → 모델 좌표 */
  frame(root: { lead: Vector3; trail: Vector3; center: Vector3; across: Vector3 }): {
    place(c: number, s: number, z: number): Vector3;
    normal: Vector3;
  };
  tint(t: number, upper: boolean, trailing: boolean): RGB;
  /**
   * 뿌리 고리: 뿌리 면에서 면 바깥 방향으로 먼저 이만큼(TL) 나간 행을 하나 둔다.
   * 날개 방향이 면 바깥 방향과 크게 다른 짝지느러미가 뿌리에서 비틀리지 않고 돌아 나가게 하고,
   * 두께 방향만 좁혀(시위는 그대로) 뿌리 면(≈3.7 cm)에서 지느러미 두께(≈1 cm)로 바로 얇아지게 한다 — 나팔 모양 방지.
   */
  collar?: number;
}

const TRAIL_THICKNESS = 0.3; // 뒷전 반두께 / 앞전 반두께 — 앞전이 둥글고 뒷전이 얇은 익형

/** 정중선 지느러미: 평면 x=0, c = u, s = h (아래로 뻗으면 h 가 음수) */
const sagittalFrame = () => ({
  place: (c: number, s: number, z: number) => toModel(z, s, c),
  normal: new Vector3(1, 0, 0),
});

/**
 * 짝지느러미: 뿌리 앞 모서리 가운데에서 날개 방향 S, 평면 법선 N, 시위 C (뒤쪽).
 * N 은 뿌리 면의 둘레 방향(across)에서 가져온다 — 뿌리 단면과 지느러미 단면의 두께 방향이 같아서
 * 첫 마디에서 단면이 돌아가지 않는다. upHint 는 N 의 부호(윗면)만 정한다.
 */
const pairedFrame = (spanDir: Vector3, upHint: Vector3) => (root: { lead: Vector3; trail: Vector3; center: Vector3; across: Vector3 }) => {
  const side = Math.sign(root.center.x) || 1;
  const S = spanDir.clone().setX(spanDir.x * side).normalize();
  const N = root.across.clone().addScaledVector(S, -root.across.dot(S)).normalize();
  if (N.dot(upHint.clone().setX(upHint.x * side)) < 0) N.negate();
  const C = new Vector3().crossVectors(S, N);
  if (C.z > 0) C.negate();
  return {
    place: (c: number, s: number, z: number) =>
      root.lead.clone().addScaledVector(C, c * TL).addScaledVector(S, s * TL).addScaledVector(N, z * TL),
    normal: N,
  };
};

/** 지느러미 색: 끝으로 갈수록 어두운 테두리, trailingMargin 만큼 뒷전도 어둡게 */
const finTint = (base: RGB, under: RGB | null, trailingMargin = 0) => (t: number, upper: boolean, trailing: boolean) => {
  const b = under && !upper ? mix(under, DUSKY, smoothstep(0.55, 1, t) * 0.65) : base;
  return mix(b, DUSKY, Math.min(1, smoothstep(0.6, 1, t) * 0.5 + (trailing ? trailingMargin * smoothstep(0.1, 0.6, t) : 0)));
};

const DORSAL_FIN_COLOR = mix(DORSAL, DORSAL_TOP, 0.85);

/**
 * 외곽은 사진 외곽이 아니라 설계한 행(조절점)이다. 끝점·시작점만 사진 랜드마크를 따른다.
 * 앞전 조절 다각형이 한 방향으로만 꺾이게 둬서 한계 곡선의 곡률 부호가 바뀌지 않게 한다.
 */
const FINS: FinDesign[] = [
  {
    // 첫 등지느러미: 시작 u≈0.36, 꼭대기 (0.46, 0.19), 뒷전은 오목, 뒤 끝 0.49
    name: 'dorsal-fin',
    ring: 0.37,
    faceCenterDeg: 90,
    rows: [
      { s: 0.105, lead: 0.385, trail: 0.479, thick: 0.0065 },
      { s: 0.13, lead: 0.404, trail: 0.469, thick: 0.005 },
      { s: 0.155, lead: 0.424, trail: 0.464, thick: 0.0036 },
      { s: 0.176, lead: 0.443, trail: 0.464, thick: 0.0024 },
      { s: 0.19, lead: 0.456, trail: 0.467, thick: 0.0014 },
    ],
    frame: sagittalFrame,
    tint: finTint(DORSAL_FIN_COLOR, null, 0.35),
  },
  {
    name: 'second-dorsal-fin',
    ring: 0.675,
    faceCenterDeg: 90,
    rows: [
      { s: 0.036, lead: 0.688, trail: 0.722, thick: 0.0028 },
      { s: 0.042, lead: 0.699, trail: 0.716, thick: 0.0018 },
      { s: 0.045, lead: 0.706, trail: 0.713, thick: 0.001 },
    ],
    frame: sagittalFrame,
    tint: finTint(DORSAL_FIN_COLOR, null),
  },
  {
    name: 'anal-fin',
    ring: 0.675,
    faceCenterDeg: 270,
    rows: [
      { s: -0.039, lead: 0.687, trail: 0.721, thick: 0.0028 },
      { s: -0.047, lead: 0.697, trail: 0.714, thick: 0.0018 },
      { s: -0.051, lead: 0.704, trail: 0.711, thick: 0.001 },
    ],
    frame: sagittalFrame,
    tint: finTint(mix(DORSAL, VENTRAL, 0.35), null),
  },
  {
    // 꼬리 아래 엽: 끝 (0.851, -0.125)
    name: 'caudal-fin-lower',
    ring: 0.785,
    faceCenterDeg: 270,
    rows: [
      { s: -0.047, lead: 0.801, trail: 0.848, thick: 0.0052 },
      { s: -0.072, lead: 0.812, trail: 0.849, thick: 0.0042 },
      { s: -0.096, lead: 0.827, trail: 0.852, thick: 0.0031 },
      { s: -0.115, lead: 0.84, trail: 0.853, thick: 0.002 },
      { s: -0.125, lead: 0.849, trail: 0.856, thick: 0.0011 },
    ],
    frame: sagittalFrame,
    tint: finTint(DORSAL_FIN_COLOR, null, 0.6),
  },
  ...(['R', 'L'] as const).flatMap((side): FinDesign[] => [
    {
      // 가슴지느러미: 길고 좁은 낫 모양 (앞전 ≈ 0.23 TL), 옆·아래·뒤로 뻗고 바깥이 처진다
      name: `pectoral-fin-${side}`,
      ring: 0.315,
      faceCenterDeg: side === 'R' ? -22.5 + 360 : 180 + 22.5,
      rows: [
        { s: 0.045, lead: 0.014, trail: 0.066, thick: 0.0055 },
        { s: 0.095, lead: 0.043, trail: 0.079, thick: 0.0042 },
        { s: 0.145, lead: 0.075, trail: 0.096, thick: 0.003 },
        { s: 0.19, lead: 0.107, trail: 0.118, thick: 0.0019 },
        { s: 0.222, lead: 0.132, trail: 0.137, thick: 0.0011 },
      ],
      // 측면 투영 각도(아래로 ≈32°)는 사진과 같고, 바깥쪽 성분을 키워 몸에 붙은 소매처럼 보이지 않게 한다
      frame: pairedFrame(new Vector3(0.55, -0.45, -0.7), new Vector3(0.45, 0.89, 0.05)),
      tint: finTint(DORSAL, VENTRAL),
      collar: 0.007,
    },
    {
      name: `pelvic-fin-${side}`,
      ring: 0.53,
      faceCenterDeg: side === 'R' ? -67.5 + 360 : 180 + 67.5,
      rows: [
        { s: 0.025, lead: 0.012, trail: 0.06, thick: 0.0045 },
        { s: 0.05, lead: 0.03, trail: 0.064, thick: 0.003 },
        { s: 0.07, lead: 0.05, trail: 0.066, thick: 0.0018 },
      ],
      frame: pairedFrame(new Vector3(0.32, -0.72, -0.62), new Vector3(0.2, 1, 0)),
      tint: finTint(DORSAL, VENTRAL),
      collar: 0.005,
    },
  ]),
];

export interface SharkCage {
  mesh: PolyMesh;
  targets: Float64Array;
  /** 지느러미 이름 → 목표점들의 중심 (확대 검토 카메라용) */
  finCenters: Record<string, [number, number, number]>;
  /** 각 지느러미 앞전 조절점 (곡률 검사용, 지느러미 평면 좌표 [s, lead]) */
  finLeadingEdges: Record<string, [number, number][]>;
  /** 각 지느러미의 행 중심 (뿌리 면 중심부터 끝 행까지, 모델 좌표) — 지느러미 뼈 배치용 */
  finRows: Record<string, { center: [number, number, number]; span: number }[]>;
  /**
   * 입 케이지 정점 (모두 오른쪽 구석 → 왼쪽 구석 순서, 양끝은 두 구석).
   * lipUpper/lipLower = 틈의 위·아래 입술 (구석은 공유), gumUpper/gumLower = 이빨이 박히는 잇몸 행.
   * hinge = 턱 관절 (두 입 구석을 잇는 x 축 위의 점, 모델 좌표)
   */
  mouth: { lipUpper: number[]; lipLower: number[]; gumUpper: number[]; gumLower: number[]; hinge: [number, number, number]; cornerPhi: number };
}

export function buildSharkCage(): SharkCage {
  const targets: number[] = [];
  const finSpan: number[] = [];
  const tint: number[] = [];
  /** inner = 입 안 (0 바깥 피부, 1 주머니), jaw = 아래턱 뼈 가중치 — 서브디비전이 함께 부드럽게 나눈다 */
  const inner: number[] = [];
  const jaw: number[] = [];
  const faces: number[][] = [];

  const addVertex = (p: Vector3, span: number, color: RGB, innerW = 0, jawW = 0) => {
    targets.push(p.x, p.y, p.z);
    finSpan.push(span);
    tint.push(...color);
    inner.push(innerW);
    jaw.push(jawW);
    return targets.length / 3 - 1;
  };
  const bodyVertex = (u: number, theta: number) => {
    const [x, h] = sectionPoint(sectionAt(u), theta);
    return addVertex(toModel(x, h, u), 0, bodyColor(u, Math.sin(theta)));
  };

  // 입 구석 φ 를 가장 가까운 둘레 정점 각도에 맞춘다 (구석이 케이지 정점이어야 틈이 거기서 끝난다)
  const colPhi = (j: number) => phiOf(colTheta(j));
  let cornerCol = 0;
  for (let j = 0; j < COLS; j++) if (Math.abs(colPhi(j) - rawCornerPhi()) < Math.abs(colPhi(cornerCol) - rawCornerPhi())) cornerCol = j;
  const phiC = colPhi(cornerCol);

  // ── 몸 링 ────────────────────────────────────────────────────────────────
  const ringVertex: number[][] = RINGS.map((_, r) =>
    Array.from({ length: COLS }, (_, j) => bodyVertex(headRingU(RINGS, MOUTH_RING, r, colPhi(j), phiC), colTheta(j))),
  );
  for (let r = 0; r < RINGS.length - 1; r++) {
    for (let j = 0; j < COLS; j++) {
      const jn = (j + 1) % COLS;
      faces.push([ringVertex[r][j], ringVertex[r][jn], ringVertex[r + 1][jn], ringVertex[r + 1][j]]);
    }
  }
  const bodyFace = (r: number, j: number) => r * COLS + j;
  const P = (i: number) => new Vector3(targets[i * 3], targets[i * 3 + 1], targets[i * 3 + 2]);

  // ── 주둥이·꼬리 끝 덮개: 링 점들을 G×G 격자(G = COLS/4)의 테두리로 쓰고 안쪽 점을 돔 위에 둔다 ──
  const cap = (ring: number[], ringU: number, uAt: (rho: number) => number, endPoint: Vector3, endCenter: number) => {
    const G = COLS / 4;
    const offset = Math.PI / COLS; // 격자 테두리 각도(Δ 배수)를 링 각도(Δ/2 + Δ·j)에 맞춘다
    const grid: number[][] = [];
    for (let gy = 0; gy <= G; gy++) {
      grid.push([]);
      for (let gx = 0; gx <= G; gx++) {
        const a = (gx - G / 2) / (G / 2);
        const b = (gy - G / 2) / (G / 2);
        // 정사각형 → 원판 (Shirley 동심 사상): 테두리 점들이 같은 각도 간격이 된다
        let rho = 0;
        let phi = 0;
        if (a !== 0 || b !== 0) {
          if (Math.abs(a) > Math.abs(b)) {
            rho = a;
            phi = (Math.PI / 4) * (b / a);
          } else {
            rho = b;
            phi = Math.PI / 2 - (Math.PI / 4) * (a / b);
          }
        }
        const angle = Math.atan2(rho * Math.sin(phi), rho * Math.cos(phi)) + offset;
        const radius = Math.abs(rho);
        if (gx === 0 || gx === G || gy === 0 || gy === G) {
          const j = ((Math.round((angle - colTheta(0)) / ((2 * Math.PI) / COLS)) % COLS) + COLS) % COLS;
          grid[gy].push(ring[j]);
        } else if (radius === 0) {
          const u = uAt(0);
          grid[gy].push(addVertex(endPoint, 0, bodyColor(u, 0.3)));
        } else {
          // 덮개 안쪽은 바깥 링 단면을 반지름 비율로 줄인 포물면 위에 둔다 (끝이 원뿔처럼 뾰족해지지 않게)
          const u = uAt(radius);
          const sec = sectionAt(ringU);
          const s = radius;
          const [x, h] = sectionPoint({ center: sec.center + (endCenter - sec.center) * (1 - s * s), halfHeight: sec.halfHeight * s, halfWidth: sec.halfWidth * s }, angle);
          grid[gy].push(addVertex(toModel(x, h, u), 0, bodyColor(u, Math.sin(angle))));
        }
      }
    }
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) faces.push([grid[gy][gx], grid[gy][gx + 1], grid[gy + 1][gx + 1], grid[gy + 1][gx]]);
    }
  };
  /**
   * 입: 입 링(MOUTH_RING)의 두 구석 사이 정점을 복제해 틈을 낸다 (앞쪽 면 = 위 입술, 뒤쪽 면 = 아래 입술 → 복제본).
   * 틈의 테두리 고리에서 주머니 행들을 안으로 밀어내 목구멍에서 닫는다.
   *   잇몸 행: 입술 바로 안쪽 — 위 잇몸은 조금 앞, 아래 잇몸은 조금 뒤 (이빨이 박히는 곳)
   *   입천장(위 벽) / 입바닥(아래 벽): 아래턱 피부를 안으로 τ 만큼 들인 면이 바닥, 그 위 cav 만큼이 천장.
   *   뒤로 갈수록(s → 1) 좌우 폭을 좁혀 목구멍으로 모은다.
   * 다물었을 때 주머니는 머리 속에 납작하게 들어 있고, 턱이 내려가면 아래 벽이 따라 내려가 입 안이 드러난다.
   */
  function buildMouth(): SharkCage['mouth'] {
    const M = MOUTH_RING;
    // 오른쪽 구석(φ=+φc) → 왼쪽 구석(φ=−φc) 순서의 열
    const cols: number[] = [];
    for (let j = cornerCol; ; j = (j - 1 + COLS) % COLS) {
      cols.push(j);
      if (Math.abs(colPhi(j) + phiC) < 1e-6) break;
      if (cols.length > COLS) throw new Error('입 구석을 못 찾음');
    }
    const n = cols.length - 1;
    const lipUpper = cols.map((j) => ringVertex[M][j]);
    const lipLower = lipUpper.map((v, i) => {
      if (i === 0 || i === n) return v;
      return addVertex(P(v), 0, [tint[v * 3], tint[v * 3 + 1], tint[v * 3 + 2]], 0, 1);
    });
    jaw[lipUpper[0]] = jaw[lipUpper[n]] = 0.5;
    // 입 링 뒤쪽 띠의 면들은 복제한 아래 입술을 쓴다
    const dup = new Map(lipUpper.map((v, i) => [v, lipLower[i]]));
    for (let j = 0; j < COLS; j++) {
      const f = faces[bodyFace(M, j)];
      faces[bodyFace(M, j)] = f.map((v) => dup.get(v) ?? v);
    }
    // 아래턱 피부 가중치: 입 안쪽 열은 링 M+1·M+2 가 1, M+3 이 0.45 (목 쪽으로 늘어난다), 구석 열은 절반
    const lowerJaw: Record<number, number> = { [M + 1]: 1, [M + 2]: 1, [M + 3]: 0.45 };
    cols.forEach((j, i) => {
      const edge = i === 0 || i === n ? 0.5 : 1;
      for (const [r, w] of Object.entries(lowerJaw)) jaw[ringVertex[+r][j]] = w * edge;
    });

    // 주머니 행 (TL 단위로 계산 → 모델 좌표)
    const phis = cols.map(colPhi);
    const skin = (u: number, phi: number, xs = 1) => {
      const sec = sectionAt(u);
      const x = sec.halfWidth * Math.sin(phi);
      const h = sec.center - sec.halfHeight * Math.cos(phi);
      // 바깥 법선 (단면 타원)
      const nx = x / sec.halfWidth ** 2;
      const nh = (h - sec.center) / sec.halfHeight ** 2;
      const l = Math.hypot(nx, nh);
      return { x: x * xs, h, u, nin: [-nx / l, -nh / l] as const };
    };
    const tl = (q: { x: number; h: number; u: number }, nin: readonly [number, number], d: number, du = 0) => toModel(q.x + nin[0] * d, q.h + nin[1] * d, q.u + du);
    const S_ROWS = [0.2, 0.45, 0.72, 1];
    const point = (i: number, row: number, wall: 'upper' | 'lower') => {
      const phi = phis[i];
      const u0 = P(lipUpper[i]).z; // 모델 z → u
      const um = U0 - u0 / TL;
      if (row === 0) {
        // 잇몸: 입술에서 안으로 — 위는 앞(u−), 아래는 뒤(u+)로 조금 비켜서 이빨이 엇갈려 다물린다
        const q = skin(um, phi);
        return wall === 'upper' ? tl(q, q.nin, 0.006, -0.0025) : tl(q, q.nin, 0.0045, 0.003);
      }
      const s = S_ROWS[row - 1];
      const q = skin(um + (MOUTH.throat - um) * s, phi, 1 - 0.55 * s ** 1.3);
      const tau = 0.012 + 0.003 * s;
      const cav = 0.003 + 0.014 * s;
      return tl(q, q.nin, wall === 'upper' ? tau + cav : tau);
    };
    const rowColor = (row: number) => (row === 0 ? GUM : mix(PALATE, THROAT, S_ROWS[row - 1] ** 1.5));
    const rows: number[][] = [[...lipUpper, ...lipLower.slice(1, n).reverse()]];
    const gumUpper: number[] = [];
    const gumLower: number[] = [];
    for (let row = 0; row <= S_ROWS.length; row++) {
      const s = row === 0 ? 0 : S_ROWS[row - 1];
      const loop: number[] = [];
      const upper: number[] = [];
      const lower: number[] = [];
      for (let i = 0; i <= n; i++) {
        const corner = i === 0 || i === n;
        // 아래 벽은 턱을 따라가고, 목구멍 쪽으로 갈수록 머리와 반반으로 늘어난다
        const jawLower = 1 - 0.5 * smoothstep(0.3, 1, s);
        if (corner) {
          const c = point(i, row, 'upper').add(point(i, row, 'lower')).multiplyScalar(0.5);
          const v = addVertex(c, 0, rowColor(row), 1, 0.5 * (jawLower + 0));
          upper.push(v);
          lower.push(v);
        } else {
          upper.push(addVertex(point(i, row, 'upper'), 0, rowColor(row), 1, 0.5 * smoothstep(0.6, 1, s)));
          lower.push(addVertex(point(i, row, 'lower'), 0, rowColor(row), 1, jawLower));
        }
      }
      if (row === 0) {
        gumUpper.push(...upper);
        gumLower.push(...lower);
      }
      loop.push(...upper, ...lower.slice(1, n).reverse());
      rows.push(loop);
    }
    for (let k = 0; k < rows.length - 1; k++) {
      const a = rows[k];
      const b = rows[k + 1];
      for (let i = 0; i < a.length; i++) {
        const i1 = (i + 1) % a.length;
        faces.push([a[i], a[i1], b[i1], b[i]]);
      }
    }
    faces.push(rows[rows.length - 1].slice()); // 목구멍 끝 덮개
    const c0 = P(lipUpper[0]);
    return { lipUpper, lipLower, gumUpper, gumLower, hinge: [0, c0.y, c0.z], cornerPhi: phiC };
  }

  const tipCenter = (bodyTop(0) + bodyBottom(0)) / 2;
  cap(ringVertex[0], RINGS[0], (rho) => RINGS[0] * rho * rho, toModel(0, tipCenter, 0), tipCenter);
  const last = RINGS[RINGS.length - 1];
  const endSec = sectionAt(CAUDAL.end);
  cap(ringVertex[RINGS.length - 1], last, (rho) => last + (CAUDAL.end - last) * (1 - rho * rho), toModel(0, endSec.center, CAUDAL.end), endSec.center);

  const mouth = buildMouth();

  // 면 방향 통일 → 옆면(θ=0) 면의 법선이 +x 가 되도록
  const nv0 = targets.length / 3;
  orientFaces(faces, nv0);
  const probe = faces[bodyFace(ringOf(0.37), colOfFaceCenter(0))];
  const pn = new Vector3().crossVectors(P(probe[1]).sub(P(probe[0])), P(probe[2]).sub(P(probe[1])));
  if (pn.x < 0) faces.forEach((f) => f.reverse());

  // ── 지느러미: 뿌리 면을 밀어낸다 ─────────────────────────────────────────
  const finCenters: SharkCage['finCenters'] = {};
  const finLeadingEdges: SharkCage['finLeadingEdges'] = {};
  const finRows: SharkCage['finRows'] = {};
  for (const fin of FINS) {
    const r = ringOf(fin.ring);
    const fi = bodyFace(r, colOfFaceCenter(fin.faceCenterDeg));
    const root = faces[fi].slice();
    const isLead = (v: number) => ringVertex[r].includes(v);
    const leadVerts = root.filter(isLead);
    const trailVerts = root.filter((v) => !isLead(v));
    const avg = (vs: number[]) => vs.reduce((acc, v) => acc.add(P(v)), new Vector3()).multiplyScalar(1 / vs.length);
    // 뿌리 면의 둘레 방향: 같은 링 위 두 정점의 차
    const across = P(leadVerts[1]).sub(P(leadVerts[0])).normalize();
    const frame = fin.frame({ lead: avg(leadVerts), trail: avg(trailVerts), center: avg(root), across });
    const center = avg(root);
    const sideOf = (v: number) => (P(v).sub(center).dot(frame.normal) >= 0 ? 1 : -1);
    const upper = (side: number) => frame.normal.y * side >= 0;

    let prev = root;
    const sum = new Vector3();
    const rowCenters: SharkCage['finRows'][string] = [{ center: center.toArray() as [number, number, number], span: 0 }];
    const recordRow = (row: number[], span: number) =>
      rowCenters.push({ center: avg(row).toArray() as [number, number, number], span });
    const link = (next: number[]) => {
      for (let i = 0; i < 4; i++) {
        const i1 = (i + 1) % 4;
        faces.push([prev[i], prev[i1], next[i1], next[i]]);
      }
      prev = next;
    };
    if (fin.collar) {
      // 뿌리 면 바깥 법선 (Newell)
      const fn = new Vector3();
      for (let i = 0; i < 4; i++) {
        const a = P(root[i]);
        const b = P(root[(i + 1) % 4]);
        fn.x += (a.y - b.y) * (a.z + b.z);
        fn.y += (a.z - b.z) * (a.x + b.x);
        fn.z += (a.x - b.x) * (a.y + b.y);
      }
      fn.normalize();
      link(
        root.map((v) => {
          const d = P(v).sub(center);
          const p = P(v).addScaledVector(frame.normal, -d.dot(frame.normal) * 0.4).addScaledVector(fn, fin.collar! * TL);
          return addVertex(p, 0.12, fin.tint(0, upper(sideOf(v)), !isLead(v)));
        }),
      );
    }
    fin.rows.forEach((row, k) => {
      const t = (k + 1) / fin.rows.length;
      const next = root.map((v) => {
        const side = sideOf(v);
        const lead = isLead(v);
        const thick = row.thick * (lead ? 1 : TRAIL_THICKNESS);
        const p = frame.place(lead ? row.lead : row.trail, row.s, side * thick);
        sum.add(p);
        return addVertex(p, t, fin.tint(t, upper(side), !lead));
      });
      link(next);
      recordRow(next, t);
    });
    faces[fi] = [];
    faces.push(prev.slice()); // 끝 덮개 (뿌리 면과 같은 방향 = 바깥)
    finCenters[fin.name] = sum.multiplyScalar(1 / (fin.rows.length * 4)).toArray() as [number, number, number];
    finLeadingEdges[fin.name] = fin.rows.map((row) => [row.s, row.lead]);
    finRows[fin.name] = rowCenters;
  }

  const n = targets.length / 3;
  const mesh: PolyMesh = {
    positions: Float64Array.from(targets),
    faces: faces.filter((f) => f.length > 0),
    attributes: {
      finSpan: { size: 1, data: Float64Array.from(finSpan) },
      tint: { size: 3, data: Float64Array.from(tint) },
      inner: { size: 1, data: Float64Array.from(inner) },
      jaw: { size: 1, data: Float64Array.from(jaw) },
    },
  };
  if (mesh.attributes.finSpan.data.length !== n) throw new Error('속성 길이 불일치');
  return { mesh, targets: Float64Array.from(targets), finCenters, finLeadingEdges, finRows, mouth };
}

export { LANDMARKS };
