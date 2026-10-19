import { bell, smoothstep } from '../../procedural/profile';
import measurements from './spec/reference-measurements.json';

/**
 * 흉상어(Carcharhinus) 몸의 설계 곡선. 모든 길이는 전장(TL) 비율이다.
 *   u = 주둥이 끝(0) → 꼬리 끝(1),  h = 몸 축 기준 높이(위 +),  x = 오른쪽 +
 *
 * 원칙: 사진은 비례(랜드마크)만 주고, 곡선은 자유도가 작은 식으로 설계한다.
 * 사진 윤곽(826점)에는 원근·몸 비틀림·하이라이트·JPEG 잡음이 섞여 있어서, 그대로 맞추면
 * 그 잡음이 곡률 출렁임으로 들어간다. 측정 윤곽은 겹침 확인용으로만 쓴다.
 */
export const LANDMARKS = measurements.landmarks;

const PHOTO = measurements.profile as number[][];

/** 측정 윤곽에서 한 지점의 값을 랜드마크로 읽는다 (구간 중앙값 — 픽셀 잡음 제거) */
function landmarkAt(u: number, channel: 1 | 2, halfWindow = 0.01): number {
  const vals = PHOTO.filter((p) => Math.abs(p[0] - u) <= halfWindow).map((p) => p[channel]);
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}
/**
 * 몸 높이 랜드마크 (TL) — 몸 윤곽에서 사진으로부터 가져오는 값은 이것뿐이다.
 * 정해진 측점에서 ±0.01 구간 중앙값을 읽는다. 배선은 사진 속 입이 살짝 벌어진 턱(u 0.07~0.15)을 뺀다.
 */
const TOP_STATIONS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.76];
const BOTTOM_STATIONS = [0.02, 0.05, 0.17, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.76];
export const BODY_LANDMARKS = {
  tip: (landmarkAt(0.004, 1, 0.004) + landmarkAt(0.004, 2, 0.004)) / 2,
  top: TOP_STATIONS.map((u) => [u, landmarkAt(u, 1)] as [number, number]),
  bottom: BOTTOM_STATIONS.map((u) => [u, landmarkAt(u, 2)] as [number, number]),
};

/**
 * 방추형 곡선 h(u) = tip ± A·u^p·(1-u)^q — 매개변수 3개. 랜드마크에 최소제곱으로 맞춘다.
 * 자유도가 작아서 랜드마크 잡음을 따라 출렁일 수 없고, 몸통 구간의 곡률 부호는 꼬리자루로 넘어가는 곳에서 한 번 바뀐다.
 */
function fusiform(stations: [number, number][], tip: number, sign: 1 | -1) {
  let best = { A: 0, p: 0.5, q: 1, err: Infinity };
  for (let p = 0.3; p <= 1.2; p += 0.005) {
    for (let q = 0.3; q <= 4; q += 0.01) {
      let num = 0;
      let den = 0;
      for (const [u, h] of stations) {
        const f = u ** p * (1 - u) ** q;
        num += f * sign * (h - tip);
        den += f * f;
      }
      const A = num / den;
      let err = 0;
      for (const [u, h] of stations) err += (tip + sign * A * u ** p * (1 - u) ** q - h) ** 2;
      if (err < best.err) best = { A, p, q, err };
    }
  }
  return (u: number) => tip + sign * best.A * Math.max(0, u) ** best.p * Math.max(0, 1 - u) ** best.q;
}

const L = BODY_LANDMARKS;
const topCurve = fusiform(L.top, L.tip, 1);
const bottomCurve = fusiform(L.bottom, L.tip, -1);

/**
 * 꼬리 위 엽 (heterocercal): 척추가 이어지는 몸의 연장.
 * 앞전(윗선)은 꼬리 시작에서 끝까지 곧은 선, 뒷전(아랫선)은 갈래에서 끝까지 곧은 선으로 설계한다.
 * 끝점은 사진 랜드마크 (꼬리 끝 x=23,y=245 / 갈래 x≈138).
 */
export const CAUDAL = {
  start: LANDMARKS.caudalOrigin,
  end: 0.998,
  topEnd: 0.174,
  forkU: 0.86,
  forkH: -0.016,
  bottomEnd: 0.158,
};
const lobeTop = (u: number) => {
  // 앞전은 살짝 오목하다 (사진: 곧은 선보다 u 0.9 에서 0.007 낮음)
  const t = ((u - CAUDAL.start) / (CAUDAL.end - CAUDAL.start)) ** 1.15;
  return topCurve(CAUDAL.start) * (1 - t) + CAUDAL.topEnd * t;
};
const lobeBottom = (u: number) => CAUDAL.forkH + ((u - CAUDAL.forkU) / (CAUDAL.end - CAUDAL.forkU)) * (CAUDAL.bottomEnd - CAUDAL.forkH);

export const bodyTop = (u: number) => (u <= CAUDAL.start ? topCurve(u) : lobeTop(u));
export const bodyBottom = (u: number) => (u <= CAUDAL.start ? bottomCurve(u) : Math.max(bottomCurve(CAUDAL.start), lobeBottom(u)));

/**
 * 반폭 = k(u) × 반높이. 사진에서 보이지 않으므로 흉상어 일반 해부 비례로 잡는다:
 * 머리는 위아래로 납작(폭/높이 ≈ 1.1 @눈, 주둥이 끝 1.4), 몸통 ≈ 0.9, 꼬리자루 ≈ 0.86. 꼬리 위 엽은 얇은 판.
 * 주둥이 끝 비율을 1.76 까지 키웠을 때는 옆 가장자리가 칼날처럼 휘어 얼룩말 줄이 한 선으로 몰렸다.
 */
export function halfWidth(u: number): number {
  if (u > CAUDAL.start) {
    const t = (u - CAUDAL.start) / (CAUDAL.end - CAUDAL.start);
    const w0 = halfWidth(CAUDAL.start);
    return w0 * (1 - t) + 0.004 * t;
  }
  return (0.86 + 0.55 * Math.exp(-u / 0.12)) * ((topCurve(u) - bottomCurve(u)) / 2);
}

export interface Section {
  center: number;
  halfHeight: number;
  halfWidth: number;
}
export function sectionAt(u: number): Section {
  const top = bodyTop(u);
  const bottom = bodyBottom(u);
  return { center: (top + bottom) / 2, halfHeight: Math.max(1e-5, (top - bottom) / 2), halfWidth: Math.max(1e-5, halfWidth(u)) };
}
/** 단면은 하나의 식(타원)만 쓴다. theta=0 → +x, π/2 → 등, -π/2 → 배 */
export function sectionPoint(sec: Section, theta: number): [number, number] {
  return [sec.halfWidth * Math.cos(theta), sec.center + sec.halfHeight * Math.sin(theta)];
}
/** 모델 위의 점 (x, h) 의 단면 각도 */
export function thetaOf(u: number, x: number, h: number): number {
  const sec = sectionAt(u);
  return Math.atan2((h - sec.center) / sec.halfHeight, x / sec.halfWidth);
}

// ── 정체를 말해 주는 선 (노멀·AO 맵) ─────────────────────────────────────────
// 노이즈·감각공·옆줄·얼룩은 쓰지 않는다. 확대하면 곰보로 보인다.

const GILL_TOP = LANDMARKS.gillSlits[0][1];
const GILL_BOTTOM = LANDMARKS.gillSlits[0][2];
const MOUTH_CORNER_U = LANDMARKS.mouthCorner[0];
export const EYE_U = LANDMARKS.eye[0];
export const EYE_H = LANDMARKS.eye[1];
export const EYE_RADIUS = LANDMARKS.eyeRadius * 0.95;

function gillSlits(u: number, ax: number, w: number, h: number): number {
  if (u < 0.23 || u > 0.34) return 0;
  const along = smoothstep(GILL_BOTTOM - 0.003, GILL_BOTTOM + 0.005, h) * (1 - smoothstep(GILL_TOP - 0.005, GILL_TOP + 0.003, h));
  const side = smoothstep(0.35, 0.6, ax / w);
  if (along * side === 0) return 0;
  const mid = (GILL_TOP + GILL_BOTTOM) / 2;
  const half = (GILL_TOP - GILL_BOTTOM) / 2;
  let d = 0;
  LANDMARKS.gillSlits.forEach(([gu], k) => {
    const du = u - (gu - 0.0028 * ((h - mid) / half) ** 2);
    const len = 1 - 0.12 * k * smoothstep(0.6, 1, Math.abs(h - mid) / half);
    // 앞쪽 피부 덮개가 살짝 솟고, 그 뒷가장자리에서 좁은 틈으로 떨어진다
    d += len * (0.0007 * smoothstep(-0.006, -0.0006, du) * (1 - smoothstep(-0.0006, 0.0004, du)) - 0.0019 * bell((du - 0.0002) / 0.0006));
  });
  return along * side * d;
}

/**
 * 입 구석 뒤의 입술 고랑(labial furrow)만 남긴다. 입 선 자체는 이제 케이지의 실제 틈이다 (sharkMouth.ts) —
 * 노멀 맵 선을 같이 두면 틈 바깥에 선이 하나 더 보였다.
 */
function mouth(u: number, ax: number, S: number): number {
  if (u > 0.2 || S > -0.1) return 0;
  const xc = 0.82 * halfWidth(MOUTH_CORNER_U);
  const furrow =
    smoothstep(-0.1, -0.3, S) *
    bell((ax - xc * 0.97) / 0.0014) *
    smoothstep(MOUTH_CORNER_U - 0.016, MOUTH_CORNER_U - 0.004, u) *
    (1 - smoothstep(MOUTH_CORNER_U, MOUTH_CORNER_U + 0.004, u));
  return -0.0004 * furrow;
}

function nostrils(u: number, ax: number, S: number): number {
  if (u > 0.06 || S > -0.4) return 0;
  const r = Math.hypot((u - 0.034) / 0.0028, (ax - 0.017) / 0.0055);
  const flap = Math.hypot((u - 0.0325) / 0.0016, (ax - 0.016) / 0.0035);
  return -0.0014 * bell(r) + 0.0006 * bell(flap);
}

/** 눈꺼풀: 앞뒤로 긴 아몬드형 틈. 틈 가장자리만 살짝 접혀 눈알 테두리를 덮는다 */
function eyelid(u: number, ax: number, w: number, h: number): number {
  if (Math.abs(u - EYE_U) > 0.03) return 0;
  const side = smoothstep(0.5, 0.8, ax / w);
  const lid = Math.hypot((u - EYE_U) / 1.3, h - EYE_H) / EYE_RADIUS;
  return side * (0.00025 * smoothstep(1.3, 1.02, lid) * smoothstep(0.92, 1.0, lid) - 0.0005 * bell((lid - 0.97) / 0.05));
}

/** 높이장 (TL, 바깥 +). S = sinθ (배 -1 → 등 +1) */
export function identityLines(u: number, x: number, h: number, S: number): number {
  const ax = Math.abs(x);
  const w = halfWidth(u);
  let d = gillSlits(u, ax, w, h) + mouth(u, ax, S) + nostrils(u, ax, S) + eyelid(u, ax, w, h);
  // 꼬리 앞 오목 (위·아래 정중선)
  if (Math.abs(u - LANDMARKS.caudalOrigin) < 0.012 && Math.abs(S) > 0.7) {
    d -= 0.001 * bell((u - LANDMARKS.caudalOrigin) / 0.0016) * bell(ax / 0.008);
  }
  return d;
}

/** 눈알이 앉을 오목한 자리 (메시를 실제로 민다, TL) */
export function eyeSocket(u: number, x: number, h: number): number {
  if (Math.abs(u - EYE_U) > 0.03) return 0;
  const r = Math.hypot(u - EYE_U, h - EYE_H) / EYE_RADIUS;
  return smoothstep(0.5, 0.8, Math.abs(x) / halfWidth(u)) * -0.0032 * bell(r / 1.15);
}

// ── 곡률 검사 ──────────────────────────────────────────────────────────────
/**
 * 곡선 (x_i, y_i) 의 곡률 부호가 바뀌는 횟수. 곡률이 최대값의 tolerance 비율보다 작은 구간은
 * 0 으로 보고 넘긴다 (변곡점 근처의 수치 잡음 무시).
 */
export function curvatureSignChanges(points: readonly (readonly [number, number])[], tolerance = 0.03, where?: number[]): number {
  const k: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const ax = x1 - x0;
    const ay = y1 - y0;
    const bx = x2 - x1;
    const by = y2 - y1;
    const denom = Math.hypot(ax, ay) * Math.hypot(bx, by) * Math.hypot(x2 - x0, y2 - y0);
    k.push(denom > 0 ? (2 * (ax * by - ay * bx)) / denom : 0);
  }
  const max = Math.max(...k.map(Math.abs));
  let sign = 0;
  let changes = 0;
  for (const v of k) {
    if (Math.abs(v) < tolerance * max) continue;
    const s = Math.sign(v);
    if (sign !== 0 && s !== sign) {
      changes++;
      where?.push(points[k.indexOf(v) + 1][0]);
    }
    sign = s;
  }
  return changes;
}

export function designedCurveReport() {
  const sample = (f: (u: number) => number, a: number, b: number) =>
    Array.from({ length: 400 }, (_, i) => {
      const u = a + ((b - a) * i) / 399;
      return [u, f(u)] as [number, number];
    });
  return {
    top: curvatureSignChanges(sample(bodyTop, 0.03, 0.75)),
    bottom: curvatureSignChanges(sample(bodyBottom, 0.03, 0.75)),
    width: curvatureSignChanges(sample(halfWidth, 0.03, 0.75)),
  };
}
