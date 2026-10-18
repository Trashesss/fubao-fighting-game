import { BufferGeometry, Float32BufferAttribute } from 'three';

/**
 * 닫힌 다각형 메시용 Catmull-Clark 서브디비전.
 *
 * 저해상도 제어 케이지를 나누면 곡면이 저절로 매끈해진다 (곡률이 출렁이려면 조절점이 출렁여야 한다).
 * 한 번 나눌 때마다 정점 순서를 [원래 정점, 모서리 점, 면 점] 으로 둬서
 * 케이지 정점 i 는 몇 번을 나눠도 인덱스 i 로 남는다 — 한계면 맞춤에 쓴다.
 */
export interface PolyMesh {
  positions: Float64Array;
  faces: number[][];
  /** 위치와 같은 규칙으로 함께 나뉘는 정점 속성 */
  attributes: Record<string, { size: number; data: Float64Array }>;
}

const edgeKey = (a: number, b: number, n: number) => (a < b ? a * n + b : b * n + a);

export function subdivide(mesh: PolyMesh): PolyMesh {
  const nv = mesh.positions.length / 3;
  const faces = mesh.faces;

  // 모서리 목록과 인접 면
  const edgeIndex = new Map<number, number>();
  const edges: { a: number; b: number; faces: number[] }[] = [];
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      const key = edgeKey(a, b, nv);
      let e = edgeIndex.get(key);
      if (e === undefined) {
        e = edges.length;
        edgeIndex.set(key, e);
        edges.push({ a, b, faces: [] });
      }
      edges[e].faces.push(fi);
    }
  });
  for (const e of edges) {
    if (e.faces.length !== 2) throw new Error(`열린 모서리 또는 비다양체 모서리 (${e.a}-${e.b}, 면 ${e.faces.length}개)`);
  }

  const vertexFaces: number[][] = Array.from({ length: nv }, () => []);
  const vertexEdges: number[][] = Array.from({ length: nv }, () => []);
  faces.forEach((f, fi) => f.forEach((v) => vertexFaces[v].push(fi)));
  edges.forEach((e, ei) => {
    vertexEdges[e.a].push(ei);
    vertexEdges[e.b].push(ei);
  });

  const ne = edges.length;
  const nf = faces.length;
  const total = nv + ne + nf;

  const channels: { size: number; src: Float64Array; dst: Float64Array }[] = [
    { size: 3, src: mesh.positions, dst: new Float64Array(total * 3) },
    ...Object.values(mesh.attributes).map((a) => ({ size: a.size, src: a.data, dst: new Float64Array(total * a.size) })),
  ];

  for (const { size, src, dst } of channels) {
    const facePoint = (fi: number, out: number[]) => {
      const f = faces[fi];
      out.fill(0);
      for (const v of f) for (let k = 0; k < size; k++) out[k] += src[v * size + k];
      for (let k = 0; k < size; k++) out[k] /= f.length;
    };
    const fp = new Float64Array(nf * size);
    const tmp = new Array(size).fill(0);
    for (let fi = 0; fi < nf; fi++) {
      facePoint(fi, tmp);
      for (let k = 0; k < size; k++) fp[fi * size + k] = tmp[k];
    }
    // 모서리 점 = (양 끝점 + 양쪽 면 점) / 4
    for (let ei = 0; ei < ne; ei++) {
      const e = edges[ei];
      for (let k = 0; k < size; k++) {
        dst[(nv + ei) * size + k] =
          (src[e.a * size + k] + src[e.b * size + k] + fp[e.faces[0] * size + k] + fp[e.faces[1] * size + k]) / 4;
      }
    }
    // 정점 = (F + 2R + (n-3)P) / n
    for (let v = 0; v < nv; v++) {
      const n = vertexEdges[v].length;
      for (let k = 0; k < size; k++) {
        let F = 0;
        for (const fi of vertexFaces[v]) F += fp[fi * size + k];
        F /= vertexFaces[v].length;
        let R = 0;
        for (const ei of vertexEdges[v]) R += (src[edges[ei].a * size + k] + src[edges[ei].b * size + k]) / 2;
        R /= n;
        dst[v * size + k] = (F + 2 * R + (n - 3) * src[v * size + k]) / n;
      }
    }
    for (let fi = 0; fi < nf; fi++) for (let k = 0; k < size; k++) dst[(nv + ne + fi) * size + k] = fp[fi * size + k];
  }

  const newFaces: number[][] = [];
  faces.forEach((f, fi) => {
    const m = f.length;
    for (let i = 0; i < m; i++) {
      const prev = f[(i - 1 + m) % m];
      const cur = f[i];
      const next = f[(i + 1) % m];
      const eNext = nv + edgeIndex.get(edgeKey(cur, next, nv))!;
      const ePrev = nv + edgeIndex.get(edgeKey(prev, cur, nv))!;
      newFaces.push([cur, eNext, nv + ne + fi, ePrev]);
    }
  });

  const attributes: PolyMesh['attributes'] = {};
  Object.keys(mesh.attributes).forEach((name, i) => {
    attributes[name] = { size: mesh.attributes[name].size, data: channels[i + 1].dst };
  });
  return { positions: channels[0].dst, faces: newFaces, attributes };
}

export function subdivideLevels(mesh: PolyMesh, levels: number): PolyMesh {
  let m = mesh;
  for (let i = 0; i < levels; i++) m = subdivide(m);
  return m;
}

/**
 * 케이지 정점의 한계 위치(levels 번 나눈 뒤 같은 인덱스)가 targets 에 오도록 케이지를 반복 보정한다.
 * fit 이 주어지면 그 정점만 보정하고 나머지는 조절점 그대로 둔다.
 *
 * 주의: 간격이 고르지 않은 조절점을 "정확히 지나게" 맞추면 균일 B-스플라인 보간처럼 출렁임이 생긴다.
 * 맞추지 않은 조절점은 근사라서 곡면이 조절점보다 더 출렁이지 않는다 (변동 감소).
 */
export function fitCageToTargets(cage: PolyMesh, targets: Float64Array, levels = 3, iterations = 8, fit?: Uint8Array): PolyMesh {
  const positions = Float64Array.from(cage.positions);
  for (let it = 0; it < iterations; it++) {
    const limit = subdivideLevels({ positions, faces: cage.faces, attributes: {} }, levels).positions;
    for (let i = 0; i < targets.length; i++) {
      if (fit && !fit[(i / 3) | 0]) continue;
      positions[i] += targets[i] - limit[i];
    }
  }
  return { ...cage, positions };
}

/** 면 방향을 이웃과 맞춘다 (공유 모서리가 서로 반대 방향이 되게) */
export function orientFaces(faces: number[][], nv: number): void {
  const edgeFaces = new Map<number, number[]>();
  faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const key = edgeKey(f[i], f[(i + 1) % f.length], nv);
      const list = edgeFaces.get(key) ?? [];
      list.push(fi);
      edgeFaces.set(key, list);
    }
  });
  const has = (f: number[], a: number, b: number) => {
    for (let i = 0; i < f.length; i++) if (f[i] === a && f[(i + 1) % f.length] === b) return true;
    return false;
  };
  const seen = new Uint8Array(faces.length);
  for (let start = 0; start < faces.length; start++) {
    if (seen[start]) continue;
    seen[start] = 1;
    const queue = [start];
    while (queue.length) {
      const fi = queue.pop()!;
      const f = faces[fi];
      for (let i = 0; i < f.length; i++) {
        const a = f[i];
        const b = f[(i + 1) % f.length];
        for (const gi of edgeFaces.get(edgeKey(a, b, nv)) ?? []) {
          if (gi === fi || seen[gi]) continue;
          if (has(faces[gi], a, b)) faces[gi].reverse();
          seen[gi] = 1;
          queue.push(gi);
        }
      }
    }
  }
}

/** 사각형 메시를 삼각형 BufferGeometry 로. 법선은 한 메시 전체의 면적 가중 평균이라 이음매가 없다 */
export function toBufferGeometry(mesh: PolyMesh): BufferGeometry {
  const p = mesh.positions;
  const nv = p.length / 3;
  const normals = new Float64Array(nv * 3);
  const index: number[] = [];
  for (const f of mesh.faces) {
    for (let i = 1; i < f.length - 1; i++) index.push(f[0], f[i], f[i + 1]);
    // 면 법선 (Newell 방법)
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < f.length; i++) {
      const a = f[i] * 3;
      const b = f[(i + 1) % f.length] * 3;
      nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
      ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
      nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
    }
    for (const v of f) {
      normals[v * 3] += nx;
      normals[v * 3 + 1] += ny;
      normals[v * 3 + 2] += nz;
    }
  }
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]) || 1;
    normals[v * 3] /= l;
    normals[v * 3 + 1] /= l;
    normals[v * 3 + 2] /= l;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(Float32Array.from(p), 3));
  g.setAttribute('normal', new Float32BufferAttribute(Float32Array.from(normals), 3));
  for (const [name, a] of Object.entries(mesh.attributes)) g.setAttribute(name, new Float32BufferAttribute(Float32Array.from(a.data), a.size));
  g.setIndex(index);
  return g;
}
