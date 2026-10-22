import { smoothstep } from '../../procedural/profile';

/**
 * 판다 무늬 (바인드 포즈 위치 + 뼈 가중치 → 검정 정도 0~1).
 *
 * 기준 그림에서 읽은 경계:
 *   - 귀, 네 다리 전체(뒷다리는 허벅지 위끝 0.6 m 까지, 정면에서 안쪽 허벅지는 흰색), 앞다리 전체.
 *   - 어깨 띠: 앞다리 두 개를 등 위로 잇는 검은 띠. 등 쪽은 1.41 m(목덜미)~0.87 m 까지 넓고, 앞(가슴 위)은 1.35~1.20 m 로 좁아져 턱 밑을 감싼다.
 *   - 눈 무늬: 눈을 감싼 기울어진 눈물 모양 (안쪽 위 → 바깥 아래로 길다). 정면 |x| 0.04~0.12, y 1.47~1.57.
 * 경계는 털이라 또렷하지 않다 — 위치 잡음(값 노이즈)으로 1.5 cm 정도 흔든다.
 */
const BLACK_BONES = /^(ear|upperarm|forearm|hand|thigh|shin|foot)_/;
const TORSO_BONES = new Set(['chest', 'neck', 'spine', 'pelvis']);

/** 결정적 3D 값 노이즈 (−1~1) — 경계 흔들기용 */
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  let acc = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1;
    const dy = (c >> 1) & 1;
    const dz = (c >> 2) & 1;
    acc += hash(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return acc * 2 - 1;
}

export function blackness(p: [number, number, number], boneWeights: Map<string, number>): number {
  const [x, y, z] = p;
  const jitter = 0.012 * valueNoise(x * 40, y * 40, z * 40) + 0.006 * valueNoise(x * 110, y * 110, z * 110);
  let limb = 0;
  let torso = 0;
  let head = 0;
  for (const [bone, w] of boneWeights) {
    if (BLACK_BONES.test(bone)) limb += w;
    else if (TORSO_BONES.has(bone)) torso += w;
    else if (bone === 'head' || bone === 'jaw') head += w;
  }
  // 다리·팔: 가중치 경계(이음매 가운데)를 무늬 경계로. 뒷다리는 허벅지 위끝(0.6 m)에서 흰 엉덩이로, 안쪽 허벅지(가랑이 쪽)는 흰색
  let black = smoothstep(0.35, 0.65, limb + jitter * 4);
  const leg = boneWeights.has('thigh_L') || boneWeights.has('thigh_R') || boneWeights.has('shin_L') || boneWeights.has('shin_R');
  if (leg) {
    const top = 0.6 - 0.25 * smoothstep(0.22, 0.08, Math.abs(x)) * smoothstep(0, -0.15, -z + 0.15); // 안쪽 앞은 낮게
    black *= smoothstep(top + 0.03, top - 0.03, y + jitter);
  }
  // 어깨 띠 (몸통·목). 띠 안에서는 몸통·팔 어느 쪽 점이든 검다 — 몸통 가중치로만 세기를 정하면
  // 어깨(팔)와 가슴 이음매(가중치 반반)가 회색 줄로 남았다
  if (torso > 0.05) {
    const front = smoothstep(-0.22, 0.2, z);
    const lo = 0.87 + (1.2 - 0.87) * front;
    const hi = 1.42 + (1.35 - 1.42) * front;
    const band = smoothstep(lo - 0.02, lo + 0.02, y + jitter) * smoothstep(hi + 0.02, hi - 0.02, y + jitter);
    black = Math.max(black, band * smoothstep(0.05, 0.3, torso + limb));
  }
  // 눈 무늬 (머리): 기준 그림 확대(6배)에서 위끝 1.570 · 아래끝 1.468 m, 안쪽 끝 |x| 0.041 (눈 높이) · 바깥 끝 0.12.
  // 눈은 무늬 위 안쪽 1/3 에 있고, 무늬는 아래 바깥으로 늘어진 눈물 모양 (긴 축이 세로에서 25° 바깥으로 기운다)
  if (head > 0.05 && z > 0.26) {
    const th = (25 * Math.PI) / 180;
    const dx = Math.abs(x) - 0.083;
    const dy = y - 1.515;
    const along = dx * Math.sin(th) - dy * Math.cos(th); // + = 아래 바깥
    const across = dx * Math.cos(th) + dy * Math.sin(th);
    const a = 0.034 + 0.01 * smoothstep(-0.02, 0.04, along); // 아래쪽이 넓다
    const e = Math.hypot(across / a, along / 0.058);
    // 앞뒤 범위: 측면에서 무늬는 z 0.30~0.37 (피부) — 정면 2D 판정만 하면 얼굴 옆으로 띠처럼 뻗었다
    const patch = smoothstep(1.08, 0.92, e + jitter * 5) * smoothstep(0.27, 0.31, z);
    black = Math.max(black, patch * Math.min(1, head * 1.5));
  }
  return Math.min(1, Math.max(0, black));
}

/** 털 색 (sRGB 0~1): 흰 털은 크림색, 배·엉덩이 아래쪽은 조금 더 누렇고 탁하다. 검은 털은 아주 조금 갈색 */
export function furColor(p: [number, number, number], black: number): [number, number, number] {
  const [, y] = p;
  const dirt = smoothstep(1.1, 0.4, y) * 0.5;
  const white: [number, number, number] = [0.92 - 0.06 * dirt, 0.89 - 0.07 * dirt, 0.82 - 0.1 * dirt];
  const dark: [number, number, number] = [0.075, 0.068, 0.062];
  return [0, 1, 2].map((i) => white[i] + (dark[i] - white[i]) * black) as [number, number, number];
}
