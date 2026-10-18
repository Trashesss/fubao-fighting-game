export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 가우시안 종 모양 (x=0 에서 1) */
export const bell = (x: number) => Math.exp(-x * x);
