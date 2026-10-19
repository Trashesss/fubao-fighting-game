/**
 * 손잡이(채널) 값으로 정의하는 포즈 클립. 뼈 회전을 직접 키로 잡지 않고
 * "머리 숙임 12°", "왼팔 들기 30°" 같은 채널을 키로 잡은 뒤 캐릭터별 애니메이터가 뼈로 옮긴다.
 *
 * 시간 단위는 60fps 프레임 (격투게임 프레임 데이터와 같은 단위).
 * 키에 적지 않은 채널은 앞 키의 값을 이어받는다 (첫 키는 기본값에서 시작).
 */
export type PoseChannels = Record<string, number>;

/**
 * smooth = 넘치지 않는 3차 보간 (기울기 제한형, 애니메이션 툴의 auto-clamped 탄젠트).
 *          키 값을 넘어서지 않고, 같은 값이 이어지는 키 사이는 평평하다 — 발이 미끄러지거나 바닥을 뚫지 않는다.
 */
export type Ease = 'smooth' | 'linear' | 'hold' | 'in' | 'out';

export interface PoseKey {
  f: number;
  pose: PoseChannels;
  /** 이 키에서 다음 키로 가는 구간의 보간 */
  ease?: Ease;
}

export interface PoseClip {
  name: string;
  /** 전체 길이 (프레임). 반복 클립은 length 에서 첫 키로 돌아간다 */
  length: number;
  loop: boolean;
  keys: PoseKey[];
  /**
   * 반복 한 번에 캐릭터가 앞(+z)으로 나아가는 거리 (m). 걷기처럼 제자리로 돌아오지 않는 반복 클립에 쓴다.
   * 반복 클립의 마지막 키를 f = length 에 두고 이동 채널을 이 거리만큼 앞선 값으로 적으면, 다음 반복은 0 에서 다시 시작한다.
   */
  rootMotion?: number;
  /**
   * 밀려남 구간 [시작, 끝] 프레임: 맞거나 막아서 두 발을 딛은 채 뒤로 밀리는 곳. 이 구간의 미끄러짐은 의도된 것이라 검사에서 세지 않는다
   * (격투게임의 넉백 — 발이 바닥에 붙은 채 밀려난다)
   */
  skid?: [number, number];
}

export const FPS = 60;

/** 모든 키를 채널 전체로 채운다 (이어받기 규칙 적용) */
function resolveKeys(clip: PoseClip, defaults: PoseChannels): PoseChannels[] {
  const out: PoseChannels[] = [];
  let prev = { ...defaults };
  for (const key of clip.keys) {
    prev = { ...prev, ...key.pose };
    out.push(prev);
  }
  return out;
}

/** 키 기울기 (값/프레임). 이웃 구간 기울기 부호가 다르거나 0 이면 0, 크기는 3·min(|d0|,|d1|) 로 제한 (넘침 방지) */
function clampedTangent(pPrev: number, p: number, pNext: number, tPrev: number, t: number, tNext: number): number {
  const d0 = (p - pPrev) / (t - tPrev);
  const d1 = (pNext - p) / (tNext - t);
  if (d0 * d1 <= 0) return 0;
  const m = (pNext - pPrev) / (tNext - tPrev);
  return Math.sign(m) * Math.min(Math.abs(m), 3 * Math.min(Math.abs(d0), Math.abs(d1)));
}

export function samplePose(clip: PoseClip, frame: number, defaults: PoseChannels): PoseChannels {
  const poses = resolveKeys(clip, defaults);
  const keys = clip.keys;
  const n = keys.length;
  if (n === 1) return poses[0];

  const f = clip.loop ? ((frame % clip.length) + clip.length) % clip.length : Math.max(keys[0].f, Math.min(clip.length, frame));

  // 정수 인덱스 k 의 키 (반복 클립은 앞뒤 주기로 이어 붙이고, 아니면 양끝에 고정)
  const wrap = (k: number) => ((k % n) + n) % n;
  const keyTime = (k: number) => (clip.loop ? keys[wrap(k)].f + Math.floor(k / n) * clip.length : keys[Math.max(0, Math.min(n - 1, k))].f);
  const keyPose = (k: number) => poses[clip.loop ? wrap(k) : Math.max(0, Math.min(n - 1, k))];

  // f 가 속한 구간 [i, i+1]
  let i = -1;
  for (let k = 0; k < n; k++) if (keys[k].f <= f) i = k;
  if (!clip.loop && i >= n - 1) return poses[n - 1];
  if (!clip.loop && i < 0) return poses[0];

  const t0 = keyTime(i);
  const t1 = keyTime(i + 1);
  const tm = keyTime(i - 1);
  const t2 = keyTime(i + 2);
  const dt = t1 - t0;
  const u = Math.min(1, Math.max(0, (f - t0) / Math.max(1e-6, dt)));
  const ease = keys[wrap(i)].ease ?? 'smooth';

  const A = keyPose(i);
  const B = keyPose(i + 1);
  const P = keyPose(i - 1);
  const Q = keyPose(i + 2);
  const out: PoseChannels = {};
  for (const ch of Object.keys(A)) {
    const p1 = A[ch];
    const p2 = B[ch];
    if (ease === 'hold') out[ch] = p1;
    else if (ease === 'linear') out[ch] = p1 + (p2 - p1) * u;
    else if (ease === 'in') out[ch] = p1 + (p2 - p1) * u * u;
    else if (ease === 'out') out[ch] = p1 + (p2 - p1) * (1 - (1 - u) * (1 - u));
    else {
      // 양끝에 고정된 키(앞뒤 키가 없는 곳)는 기울기 0 — 부드럽게 출발·정지
      const m1 = tm < t0 ? clampedTangent(P[ch], p1, p2, tm, t0, t1) * dt : 0;
      const m2 = t2 > t1 ? clampedTangent(p1, p2, Q[ch], t0, t1, t2) * dt : 0;
      const u2 = u * u;
      const u3 = u2 * u;
      out[ch] = (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
    }
  }
  return out;
}
