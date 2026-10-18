import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, Texture } from 'three';
import { identityLines, sectionAt, sectionPoint } from './sharkAnatomy';

/**
 * 몸 UV(x = 둘레 b, y = 길이 u) 공간에 정체를 말해 주는 선(아가미·입·콧구멍·눈꺼풀·꼬리 앞 오목)만 굽는다.
 *   normal : 접선 공간 노멀 (높이장의 실제 호 길이 기울기)
 *   cavity : 꼭짓점 색에 곱하는 회색 맵 — 홈 속 그늘만, 얼룩·노이즈는 없다
 * b = (θ + π/2) / 2π  (이음매는 배 정중선)
 */
export interface SkinMaps {
  normal: Texture;
  cavity: Texture;
}

export function buildSkinMaps(totalLength: number, width = 2048, height = 4096): SkinMaps {
  const W = width;
  const H = height;
  const field = new Float32Array(W * H);
  const arcB = new Float32Array(W * H);
  const xs = new Float32Array(W);
  const hs = new Float32Array(W);

  for (let r = 0; r < H; r++) {
    const u = (r + 0.5) / H;
    const sec = sectionAt(u);
    for (let c = 0; c < W; c++) {
      const theta = -Math.PI / 2 + ((c + 0.5) / W) * Math.PI * 2;
      const [x, h] = sectionPoint(sec, theta);
      xs[c] = x;
      hs[c] = h;
      field[r * W + c] = identityLines(u, x, h, Math.sin(theta)) * totalLength;
    }
    for (let c = 0; c < W; c++) {
      const n = (c + 1) % W;
      arcB[r * W + c] = Math.max(1e-6, Math.hypot(xs[n] - xs[c], hs[n] - hs[c]) * totalLength);
    }
  }

  const arcU = totalLength / H;
  const normal = new Uint8Array(W * H * 4);
  const cavity = new Uint8Array(W * H * 4);
  for (let r = 0; r < H; r++) {
    const rUp = Math.min(H - 1, r + 1);
    const rDn = Math.max(0, r - 1);
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      const cR = r * W + ((c + 1) % W);
      const cL = r * W + ((c - 1 + W) % W);
      const dx = (field[cR] - field[cL]) / (arcB[cL] + arcB[i]);
      const dy = (field[rUp * W + c] - field[rDn * W + c]) / (arcU * (rUp - rDn));
      const inv = 1 / Math.hypot(dx, dy, 1);
      normal.set([Math.round((-dx * inv * 0.5 + 0.5) * 255), Math.round((-dy * inv * 0.5 + 0.5) * 255), Math.round((inv * 0.5 + 0.5) * 255), 255], i * 4);
      // 홈 깊이 (m) → 그늘. 아가미·입선 깊이 ≈ 5 mm 에서 가장 어둡다
      const depth = Math.max(0, -field[i] - 0.0003);
      const v = Math.round((1 - 0.62 * Math.min(1, depth / 0.0036) ** 0.8) * 255);
      cavity.set([v, v, v, 255], i * 4);
    }
  }

  const make = (data: Uint8Array, srgb: boolean) => {
    const tex = new DataTexture(data, W, H, RGBAFormat);
    tex.wrapS = RepeatWrapping;
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return { normal: make(normal, false), cavity: make(cavity, true) };
}
