import { smoothstep } from '../../procedural/profile';
import { LANDMARKS, sectionAt } from './sharkAnatomy';

/**
 * 부캉이 입. 배 쪽의 초승달 모양 틈 + 안으로 들어가는 주머니(잇몸·입천장·입바닥·목구멍).
 *
 * 각도 φ = 배 정중선에서 잰 둘레 각도 (+ = 오른쪽, +x). 단면 위 점은 x = 반폭·sinφ, h = 중심 − 반높이·cosφ.
 * 입 선은 φ 에 대한 식으로 둔다: u(φ) = 앞끝 + (구석 − 앞끝)·(sin|φ| / sinφc)^1.7 — 예전 노멀 맵 입 선과 같은 모양.
 *
 * 케이지에서는 머리 링 하나(MOUTH_RING)를 배 쪽에서 이 선을 따라 휘게 하고, 두 입 구석 사이를 갈라 틈을 만든다.
 * 앞뒤 링들도 같은 비율로 휘어서 링끼리 엇갈리지 않는다 (등 쪽 u 와 배 쪽 u 를 φ 로 섞는다 — 둘 다 순서가 맞으면 섞어도 맞다).
 */
export const MOUTH = {
  /** 입 앞끝 (배 정중선). 흉상어 입 앞 길이 ≈ 0.07 TL (사진 0.058 은 입이 살짝 벌어진 값) */
  front: 0.066,
  corner: LANDMARKS.mouthCorner[0],
  cornerH: LANDMARKS.mouthCorner[1],
  /** 목구멍 끝 (주머니가 닫히는 곳). 아가미(0.25) 앞 */
  throat: 0.19,
};

/** 입 구석의 φ (사진 랜드마크). 케이지는 이 값에 가장 가까운 둘레 열로 맞춘다 */
export function rawCornerPhi(): number {
  const sec = sectionAt(MOUTH.corner);
  const theta = Math.asin(Math.max(-1, Math.min(1, (MOUTH.cornerH - sec.center) / sec.halfHeight)));
  return Math.PI / 2 + theta;
}

/** 단면 각도 θ (0 = +x, π/2 = 등) → φ (배 정중선 0, 오른쪽 +), −π~π */
export const phiOf = (theta: number) => {
  let p = theta - (3 * Math.PI) / 2;
  while (p <= -Math.PI) p += 2 * Math.PI;
  while (p > Math.PI) p -= 2 * Math.PI;
  return p;
};

/** 입 선의 u (구석 바깥은 구석 값) */
export function mouthU(phi: number, phiC: number): number {
  const r = Math.min(1, Math.sin(Math.min(Math.abs(phi), phiC)) / Math.sin(phiC));
  return MOUTH.front + (MOUTH.corner - MOUTH.front) * r ** 1.7;
}

/** 링을 입 선 쪽으로 휘는 정도: 입 안쪽 1, 구석에서 옆구리 위로 70° 에 걸쳐 0 으로 */
function bendWeight(phi: number, phiC: number): number {
  const a = Math.abs(phi);
  return a <= phiC ? 1 : 1 - smoothstep(phiC, phiC + (70 * Math.PI) / 180, a);
}

/**
 * 머리 링의 u. rings = 등 쪽 u 목록, mouthRing = 입 링 인덱스.
 * 입 링 앞 두 링은 (mouthRing−3 링 ~ 입 선) 을, 뒤 두 링은 (입 선 ~ mouthRing+3 링) 을 고르게 나눈 값으로 휜다.
 */
export function headRingU(rings: readonly number[], mouthRing: number, r: number, phi: number, phiC: number): number {
  const d = rings[r];
  const k = r - mouthRing;
  if (Math.abs(k) > 2) return d;
  const m = mouthU(phi, phiC);
  const v = k === 0 ? m : k < 0 ? rings[mouthRing - 3] + (m - rings[mouthRing - 3]) * ((3 + k) / 3) : m + (rings[mouthRing + 3] - m) * (k / 3);
  return d + (v - d) * bendWeight(phi, phiC);
}
