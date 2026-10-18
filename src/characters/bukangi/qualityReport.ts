import { Mesh, type Object3D } from 'three';
import { curvatureSignChanges, designedCurveReport } from './sharkAnatomy';
import { TOTAL_LENGTH, U0 } from './sharkCage';

/**
 * 곡률 검사. 기준: 몸 윗선·아랫선 부호 바뀜 ≤ 2, 지느러미 앞전 ≤ 1.
 *   designed : 설계 곡선 (윗선·아랫선·폭)
 *   mesh     : 나뉜 메시의 등·배 정중선 (지느러미 뿌리 구간은 빼고 이어진 구간마다 센다)
 *   fins     : 지느러미 앞전 조절 다각형 (변동 감소 성질 — 조절 다각형이 한 방향으로만 꺾이면 한계 곡선도 그렇다)
 */
export function qualityReport(model: Object3D) {
  const body = model.getObjectByName('body') as Mesh;
  const pos = body.geometry.getAttribute('position');
  const span = body.geometry.getAttribute('finSpan');
  const TL = TOTAL_LENGTH;

  const where: Record<string, number[]> = { top: [], bottom: [] };
  const midline = (upper: boolean) => {
    const pts: [number, number][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i)) > 1e-5 || span.getX(i) > 1e-4) continue;
      const u = U0 - pos.getZ(i) / TL;
      if (u < 0.03 || u > 0.75) continue;
      const h = pos.getY(i) / TL;
      if (upper !== h > 0) continue;
      const key = u.toFixed(7);
      if (seen.has(key)) continue;
      seen.add(key);
      pts.push([u, h]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    // 지느러미 뿌리 구간에서 끊어 이어진 구간마다 센다
    const segments: [number, number][][] = [[]];
    for (let i = 0; i < pts.length; i++) {
      if (i > 0 && pts[i][0] - pts[i - 1][0] > 0.01) segments.push([]);
      segments[segments.length - 1].push(pts[i]);
    }
    return segments.filter((s) => s.length > 4).reduce((n, s) => n + curvatureSignChanges(s, 0.03, where[upper ? 'top' : 'bottom']), 0);
  };

  const finEdges = (model.userData.sculptRuntime?.finLeadingEdges ?? {}) as Record<string, [number, number][]>;
  const fins: Record<string, number> = {};
  for (const [name, edge] of Object.entries(finEdges)) {
    // 뿌리 → 끝 방향 다각형의 꺾임 방향이 바뀌는 횟수
    let sign = 0;
    let changes = 0;
    for (let i = 1; i < edge.length - 1; i++) {
      const [s0, l0] = edge[i - 1];
      const [s1, l1] = edge[i];
      const [s2, l2] = edge[i + 1];
      const c = Math.sign((s1 - s0) * (l2 - l1) - (l1 - l0) * (s2 - s1));
      if (c === 0) continue;
      if (sign !== 0 && c !== sign) changes++;
      sign = c;
    }
    fins[name] = changes;
  }

  const designed = designedCurveReport();
  const mesh = { top: midline(true), bottom: midline(false) };
  const pass = designed.top <= 2 && designed.bottom <= 2 && mesh.top <= 2 && mesh.bottom <= 2 && Object.values(fins).every((n) => n <= 1);
  return { pass, designed, mesh, where, fins };
}
