import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, MeshStandardMaterial, Uint32BufferAttribute, type Material } from 'three';

/**
 * 껍질 털 (shell fur): 몸 메시를 법선 방향으로 조금씩 부풀린 껍질 N 장을 겹치고, 껍질마다 털 가닥 자리만 남기고 버린다.
 * 가닥은 바인드 포즈 위치(rest)로 정하므로 스키닝으로 몸이 움직여도 털이 피부에 붙어 따라간다.
 *
 * 메시에 UV 가 없어서(거리장 메시) 가닥 자리는 법선의 주축 평면에 투영한 2D 격자에서 고른다 (삼면 투영).
 * 주축이 바뀌는 곳에 이음이 생기지만 털 끝이 덮어 보이지 않는다.
 *
 * 필요한 기본 메시 속성: position, normal, color, skinIndex, skinWeight, furLen (털 길이 m).
 */
export interface FurOptions {
  shells: number;
  /** 털 끝이 처지는 정도 (털 길이 대비, 바인드 포즈 −Y 방향) */
  droop: number;
  /** 가닥 격자 간격 (m) */
  strand: number;
}

export function buildFurShells(base: BufferGeometry, opts: FurOptions): BufferGeometry {
  const pos = base.getAttribute('position');
  const nrm = base.getAttribute('normal');
  const len = base.getAttribute('furLen');
  const n = pos.count;
  const N = opts.shells;
  const out = new BufferGeometry();
  const position = new Float32Array(n * N * 3);
  const rest = new Float32Array(n * N * 3);
  const restNormal = new Float32Array(n * N * 3);
  const layer = new Float32Array(n * N);
  for (let s = 0; s < N; s++) {
    const t = (s + 1) / N;
    for (let i = 0; i < n; i++) {
      const o = (s * n + i) * 3;
      const L = len.getX(i);
      let dx = nrm.getX(i);
      let dy = nrm.getY(i) - opts.droop * t * t;
      let dz = nrm.getZ(i);
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l;
      dy /= l;
      dz /= l;
      position[o] = pos.getX(i) + dx * L * t;
      position[o + 1] = pos.getY(i) + dy * L * t;
      position[o + 2] = pos.getZ(i) + dz * L * t;
      rest[o] = pos.getX(i);
      rest[o + 1] = pos.getY(i);
      rest[o + 2] = pos.getZ(i);
      restNormal[o] = nrm.getX(i);
      restNormal[o + 1] = nrm.getY(i);
      restNormal[o + 2] = nrm.getZ(i);
      layer[s * n + i] = L > 1e-4 ? t : 2; // 털 없는 곳은 버려지게
    }
  }
  out.setAttribute('position', new Float32BufferAttribute(position, 3));
  out.setAttribute('rest', new Float32BufferAttribute(rest, 3));
  out.setAttribute('restNormal', new Float32BufferAttribute(restNormal, 3));
  out.setAttribute('layer', new Float32BufferAttribute(layer, 1));
  for (const name of ['normal', 'color', 'skinIndex', 'skinWeight']) {
    const a = base.getAttribute(name);
    const data = new Float32Array(n * N * a.itemSize);
    for (let s = 0; s < N; s++) data.set(a.array as ArrayLike<number>, s * n * a.itemSize);
    out.setAttribute(name, new Float32BufferAttribute(data, a.itemSize));
  }
  const index = base.getIndex()!;
  const idx = new Uint32Array(index.count * N);
  for (let s = 0; s < N; s++) for (let k = 0; k < index.count; k++) idx[s * index.count + k] = index.getX(k) + s * n;
  out.setIndex(new Uint32BufferAttribute(idx, 1));
  return out;
}

/** 털 껍질 재질. silhouette = 검은 실루엣(형태 비교용) */
export function furMaterial(opts: FurOptions, silhouette = false): Material {
  const m = silhouette ? new MeshBasicMaterial({ color: 0x000000 }) : new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  m.alphaToCoverage = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 rest;\nattribute vec3 restNormal;\nattribute float layer;\nvarying vec3 vRest;\nvarying vec3 vRestNormal;\nvarying float vLayer;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = rest;\nvRestNormal = restNormal;\nvLayer = layer;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRest;
varying vec3 vRestNormal;
varying float vLayer;
float furHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 furHash2(vec2 p) { return vec2(furHash(p), furHash(p + 17.13)); }
// 가장 가까운 가닥까지 거리(칸 단위)와 그 가닥의 난수
vec2 furStrand(vec3 p, vec3 n) {
  vec3 an = abs(n);
  vec2 q = an.x > an.y && an.x > an.z ? p.yz : (an.y > an.z ? p.xz : p.xy);
  q /= ${opts.strand.toFixed(5)};
  vec2 c = floor(q);
  vec2 f = q - c;
  float best = 1e9;
  float rnd = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 d = o + 0.15 + 0.7 * furHash2(c + o) - f;
    float dd = dot(d, d);
    if (dd < best) { best = dd; rnd = furHash(c + o + 3.7); }
  }
  return vec2(sqrt(best), rnd);
}`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
{
  vec2 s = furStrand(vRest, vRestNormal);
  float tall = 0.55 + 0.45 * s.y;           // 가닥마다 길이가 다르다
  float h = vLayer / tall;
  if (h > 1.0) discard;
  float radius = 0.5 * (1.0 - h * h);       // 끝으로 갈수록 가늘다
  float a = 1.0 - smoothstep(radius * 0.6, radius, s.x);
  if (a < 0.02) discard;
  diffuseColor.a = a;
  ${silhouette ? '' : 'diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(0.0, 0.85, vLayer)) * (0.88 + 0.24 * s.y);'}
}`,
      );
  };
  return m;
}
