import type { SdfModel, Vec3 } from './sdf';

/**
 * 거리장 → 삼각형 메시 (Surface Nets).
 *
 * 격자 칸마다 표면이 지나가면 정점 하나(칸 모서리 교차점들의 평균)를 두고, 부호가 바뀌는 격자 모서리마다 둘러싼 네 칸의 정점을 사각형으로 잇는다.
 * Marching Cubes 보다 삼각형 모양이 고르고 정점 수가 적다. 정점은 거리장 기울기를 따라 표면 위로 끌어올리고(projection),
 * 법선은 거리장 기울기라 메시 해상도와 상관없이 매끈하다.
 */
export interface SurfaceMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export function surfaceNets(model: SdfModel, cell: number): SurfaceMesh {
  const { min, max } = model.bounds(cell * 2);
  const n = [0, 1, 2].map((i) => Math.ceil((max[i] - min[i]) / cell) + 1);
  const [nx, ny, nz] = n;
  const field = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell;
      for (let i = 0; i < nx; i++) field[at(i, j, k)] = model.distance(min[0] + i * cell, y, z);
    }
  }

  // 칸마다 정점
  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellAt = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = field[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          if (v[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let cnt = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          cnt++;
        }
        cellVertex[cellAt(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / cnt) * cell, min[1] + (j + sy / cnt) * cell, min[2] + (k + sz / cnt) * cell);
      }
    }
  }

  // 정점을 표면 위로 (뉴턴 2번)
  const g: Vec3 = [0, 0, 0];
  for (let p = 0; p < pos.length; p += 3) {
    for (let it = 0; it < 2; it++) {
      const d = model.distance(pos[p], pos[p + 1], pos[p + 2]);
      model.gradient(pos[p], pos[p + 1], pos[p + 2], g);
      // 칸 밖으로 크게 튀지 않게 (얇은 곳에서 기울기가 반대편 표면을 가리킬 때)
      const step = Math.max(-cell, Math.min(cell, d));
      pos[p] -= g[0] * step;
      pos[p + 1] -= g[1] * step;
      pos[p + 2] -= g[2] * step;
    }
  }

  // 부호가 바뀌는 격자 모서리마다 사각형 (둘러싼 네 칸)
  const quads: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) quads.push(a, d, c, b);
    else quads.push(a, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const f0 = field[at(i, j, k)] < 0;
        if (f0 !== field[at(i + 1, j, k)] < 0)
          quad(cellVertex[cellAt(i, j - 1, k - 1)], cellVertex[cellAt(i, j, k - 1)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i, j - 1, k)], !f0);
        if (f0 !== field[at(i, j + 1, k)] < 0)
          quad(cellVertex[cellAt(i - 1, j, k - 1)], cellVertex[cellAt(i - 1, j, k)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i, j, k - 1)], !f0);
        if (f0 !== field[at(i, j, k + 1)] < 0)
          quad(cellVertex[cellAt(i - 1, j - 1, k)], cellVertex[cellAt(i, j - 1, k)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i - 1, j, k)], !f0);
      }
    }
  }

  // 사각형 → 삼각형 (짧은 대각선으로)
  const idx = new Uint32Array((quads.length / 4) * 6);
  const d2 = (a: number, b: number) => (pos[a * 3] - pos[b * 3]) ** 2 + (pos[a * 3 + 1] - pos[b * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[b * 3 + 2]) ** 2;
  for (let q = 0, o = 0; q < quads.length; q += 4) {
    const [a, b, c, d] = [quads[q], quads[q + 1], quads[q + 2], quads[q + 3]];
    if (d2(a, c) <= d2(b, d)) idx.set([a, b, c, a, c, d], o);
    else idx.set([a, b, d, b, c, d], o);
    o += 6;
  }

  const positions = new Float32Array(pos);
  const normals = new Float32Array(pos.length);
  for (let p = 0; p < pos.length; p += 3) {
    model.gradient(pos[p], pos[p + 1], pos[p + 2], g);
    normals.set(g, p);
  }
  // 감기 방향을 거리장 법선에 맞춘다 (사각형 순서 규칙을 축마다 따로 맞추는 대신 한 번에 검증)
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    const nx2 = normals[a] + normals[b] + normals[c];
    const ny2 = normals[a + 1] + normals[b + 1] + normals[c + 1];
    const nz2 = normals[a + 2] + normals[b + 2] + normals[c + 2];
    if (fx * nx2 + fy * ny2 + fz * nz2 < 0) {
      const tmp = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = tmp;
    }
  }
  return { positions, normals, indices: idx };
}
