/**
 * 비균등 간격 키 프레임을 부드럽게 보간한다 (Catmull-Rom 접선의 큐빅 에르미트).
 * keys: [s, v0, v1, ...] 형태, s 오름차순.
 */
export function sampleProfile(keys: readonly (readonly number[])[], s: number, channel: number): number {
  const last = keys.length - 1;
  if (s <= keys[0][0]) return keys[0][channel];
  if (s >= keys[last][0]) return keys[last][channel];

  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid][0] <= s) lo = mid;
    else hi = mid;
  }
  const i = lo;

  const x1 = keys[i][0];
  const x2 = keys[i + 1][0];
  const y1 = keys[i][channel];
  const y2 = keys[i + 1][channel];
  const slope = (a: number, b: number) => (keys[b][channel] - keys[a][channel]) / (keys[b][0] - keys[a][0]);
  const m1 = i === 0 ? slope(0, 1) : slope(i - 1, i + 1);
  const m2 = i + 1 === last ? slope(last - 1, last) : slope(i, i + 2);

  const dx = x2 - x1;
  const t = (s - x1) / dx;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y1 +
    (t3 - 2 * t2 + t) * dx * m1 +
    (-2 * t3 + 3 * t2) * y2 +
    (t3 - t2) * dx * m2
  );
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 가우시안 종 모양 (x=0 에서 1) */
export const bell = (x: number) => Math.exp(-x * x);

/**
 * 측정값처럼 잡음이 있는 (x, y) 표를 균일 격자로 다시 뽑고 가우시안으로 다듬은 뒤
 * 큐빅 보간 키로 돌려준다. 끝점은 반사 패딩으로 처리해 주둥이 끝 같은 경계가 끌려가지 않게 한다.
 */
export function smoothTable(
  points: readonly (readonly number[])[],
  options: { samples: number; sigma: number; channels: number },
): number[][] {
  const { samples, sigma, channels } = options;
  const x0 = points[0][0];
  const x1 = points[points.length - 1][0];
  const grid: number[][] = [];
  for (let i = 0; i <= samples; i++) {
    const x = x0 + ((x1 - x0) * i) / samples;
    const row = [x];
    for (let c = 1; c <= channels; c++) row.push(linear(points, x, c));
    grid.push(row);
  }
  const step = (x1 - x0) / samples;
  const radius = Math.ceil((3 * sigma) / step);
  const out: number[][] = [];
  for (let i = 0; i <= samples; i++) {
    const row = [grid[i][0]];
    for (let c = 1; c <= channels; c++) {
      let sum = 0;
      let wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        let j = i + k;
        if (j < 0) j = -j;
        if (j > samples) j = 2 * samples - j;
        const w = Math.exp(-0.5 * ((k * step) / sigma) ** 2);
        sum += grid[j][c] * w;
        wsum += w;
      }
      row.push(sum / wsum);
    }
    out.push(row);
  }
  return out;
}

function linear(points: readonly (readonly number[])[], x: number, c: number): number {
  let lo = 0;
  let hi = points.length - 1;
  if (x <= points[0][0]) return points[0][c];
  if (x >= points[hi][0]) return points[hi][c];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - points[lo][0]) / (points[hi][0] - points[lo][0]);
  return points[lo][c] + (points[hi][c] - points[lo][c]) * t;
}
