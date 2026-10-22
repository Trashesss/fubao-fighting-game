import { Euler, Matrix3, Matrix4 } from 'three';

/**
 * 부호 거리장(SDF) 부위 모형: 타원체·둥근 원뿔을 부드럽게 이어 붙여 털 짐승 몸을 만든다.
 *
 * 왜 서브디비전 케이지(부캉이)가 아닌가: 팔다리·머리·귀가 몸에서 갈라지는 네 발 짐승은 케이지의 면 배치(어디서 팔을 밀어낼지)가 형태 설계보다 일이 많고,
 * 털이 표면을 덮어 상어처럼 곡률을 다듬을 필요가 적다. 해부 부위(덩어리)를 그대로 적고 이음매는 부드러운 합집합(smooth min)이 필렛처럼 메운다.
 * 각 부위가 뼈 하나에 속하므로 스키닝 가중치도 같은 거리장에서 나온다 (sdfWeights).
 *
 * 부드러운 합집합은 2차 다항식 smin — 이음매가 C1 로 이어진다 (D-07 의 smoothstep 이어 붙이기와 달리 거리장 자체를 섞는다).
 */
export type Vec3 = [number, number, number];

interface Base {
  name: string;
  /** 이 부위를 움직이는 뼈 */
  bone: string;
  /** 앞 부위들과 이어 붙이는 부드러움 (m). 0 = 날카롭게 */
  blend: number;
  /** true 면 빼낸다 (오목한 곳) */
  subtract?: boolean;
}
export interface Ellipsoid extends Base {
  kind: 'ellipsoid';
  center: Vec3;
  radii: Vec3;
  /** 회전 (도, XYZ 순서) */
  rotation?: Vec3;
}
export interface RoundCone extends Base {
  kind: 'cone';
  a: Vec3;
  b: Vec3;
  ra: number;
  rb: number;
}
export type SdfPrimitive = Ellipsoid | RoundCone;

/** 계산용으로 미리 푼 부위 */
interface Compiled {
  prim: SdfPrimitive;
  min: Vec3;
  max: Vec3;
  /** 타원체: 월드 → 로컬 회전 (행 우선 3×3) */
  inv?: number[];
}

export class SdfModel {
  private readonly compiled: Compiled[];
  readonly bones: string[];
  /** 부위마다 쓴 부드러움의 최댓값 — 상자 밖 여유 */
  readonly margin: number;

  constructor(readonly prims: SdfPrimitive[]) {
    this.margin = Math.max(0.01, ...prims.map((p) => p.blend)) + 0.01;
    this.compiled = prims.map((prim) => compile(prim, this.margin));
    this.bones = [...new Set(prims.map((p) => p.bone))];
  }

  /** 전체 경계 상자 */
  bounds(pad = 0): { min: Vec3; max: Vec3 } {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const c of this.compiled) {
      if (c.prim.subtract) continue;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], c.min[i] - pad);
        max[i] = Math.max(max[i], c.max[i] + pad);
      }
    }
    return { min, max };
  }

  /** 거리값. 어느 부위 상자에도 들지 않으면 margin (밖) */
  distance(x: number, y: number, z: number): number {
    let d = Infinity;
    for (const c of this.compiled) {
      if (x < c.min[0] || y < c.min[1] || z < c.min[2] || x > c.max[0] || y > c.max[1] || z > c.max[2]) continue;
      const di = primDistance(c, x, y, z);
      const p = c.prim;
      if (p.subtract) d = smax(d, -di, p.blend);
      else d = d === Infinity ? di : smin(d, di, p.blend);
    }
    return d === Infinity ? this.margin : d;
  }

  /** 부위마다 거리 (스키닝·무늬용). 상자 밖 부위는 Infinity */
  distances(x: number, y: number, z: number, out: Float64Array): Float64Array {
    this.compiled.forEach((c, i) => {
      out[i] = x < c.min[0] - 0.2 || y < c.min[1] - 0.2 || z < c.min[2] - 0.2 || x > c.max[0] + 0.2 || y > c.max[1] + 0.2 || z > c.max[2] + 0.2 ? Infinity : primDistance(c, x, y, z);
    });
    return out;
  }

  /** 거리장 기울기 (중앙 차분) */
  gradient(x: number, y: number, z: number, out: Vec3, h = 5e-4): Vec3 {
    out[0] = this.distance(x + h, y, z) - this.distance(x - h, y, z);
    out[1] = this.distance(x, y + h, z) - this.distance(x, y - h, z);
    out[2] = this.distance(x, y, z + h) - this.distance(x, y, z - h);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l;
    out[1] /= l;
    out[2] /= l;
    return out;
  }
}

function compile(prim: SdfPrimitive, margin: number): Compiled {
  if (prim.kind === 'ellipsoid') {
    const r = Math.max(...prim.radii) + prim.blend + margin;
    const m = new Matrix4().makeRotationFromEuler(new Euler(...((prim.rotation ?? [0, 0, 0]).map((v) => (v * Math.PI) / 180) as Vec3)));
    // 로컬 = R^T (월드 − 중심). R 의 열 우선 원소 = R^T 의 행 우선 원소
    return {
      prim,
      inv: [...new Matrix3().setFromMatrix4(m).elements],
      min: prim.center.map((v) => v - r) as Vec3,
      max: prim.center.map((v) => v + r) as Vec3,
    };
  }
  const pad = Math.max(prim.ra, prim.rb) + prim.blend + margin;
  return {
    prim,
    min: [0, 1, 2].map((i) => Math.min(prim.a[i], prim.b[i]) - pad) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(prim.a[i], prim.b[i]) + pad) as Vec3,
  };
}

function primDistance(c: Compiled, x: number, y: number, z: number): number {
  const p = c.prim;
  if (p.kind === 'ellipsoid') {
    const dx = x - p.center[0];
    const dy = y - p.center[1];
    const dz = z - p.center[2];
    const m = c.inv!;
    const lx = m[0] * dx + m[1] * dy + m[2] * dz;
    const ly = m[3] * dx + m[4] * dy + m[5] * dz;
    const lz = m[6] * dx + m[7] * dy + m[8] * dz;
    return ellipsoid(lx, ly, lz, p.radii[0], p.radii[1], p.radii[2]);
  }
  return roundCone(x, y, z, p.a, p.b, p.ra, p.rb);
}

/** 타원체 근사 거리 (Inigo Quilez) — 표면 근처에서 정확, 멀어질수록 과소 추정 */
function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

/** 두 끝 반지름이 다른 둥근 원뿔 (Inigo Quilez, 정확한 거리) */
function roundCone(x: number, y: number, z: number, a: Vec3, b: Vec3, r1: number, r2: number): number {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = x - a[0];
  const pay = y - a[1];
  const paz = z - a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const qx = pax * l2 - bax * yy;
  const qy = pay * l2 - bay * yy;
  const qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

/** 2차 다항식 부드러운 최솟값 (k = 이음 폭) */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/**
 * 스키닝 가중치: 부위 거리가 가장 가까운 부위보다 tau 이상 멀면 거의 0 (지수 감쇠), 뼈별로 모아 큰 4개를 정규화한다.
 * 이음매(부드러운 합집합 구간)에서 두 부위 거리가 비슷해 가중치가 저절로 섞인다.
 */
export function sdfWeights(model: SdfModel, x: number, y: number, z: number, tau: number, scratch: Float64Array): { bones: number[]; weights: number[] } {
  const d = model.distances(x, y, z, scratch);
  let dmin = Infinity;
  model.prims.forEach((p, i) => {
    if (!p.subtract) dmin = Math.min(dmin, d[i]);
  });
  const acc = new Map<number, number>();
  model.prims.forEach((p, i) => {
    if (p.subtract || !isFinite(d[i])) return;
    const w = Math.exp(-(d[i] - dmin) / tau);
    if (w < 1e-4) return;
    const b = model.bones.indexOf(p.bone);
    acc.set(b, (acc.get(b) ?? 0) + w);
  });
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0);
  return { bones: top.map(([b]) => b), weights: top.map(([, w]) => w / sum) };
}
