import { Vector3 } from 'three';
import { activeHitboxes, blocks, capsuleSegment, moveFrames, type Guard } from '../fighting/frameData';
import { NO_INPUT, type AttackButton, type FighterInput } from '../fighting/fighter';
import type { HitRecord, Match } from '../fighting/match';

const segDist = (c: Vector3, a: Vector3, b: Vector3) => {
  const ab = b.clone().sub(a);
  const t = Math.min(1, Math.max(0, c.clone().sub(a).dot(ab) / ab.lengthSq()));
  return a.clone().addScaledVector(ab, t).distanceTo(c);
};

/**
 * 프레임 자동 검사 (practice.html?test=1): 1P 가 기술마다 한 번 내고, 서 있는 2P 가 맞거나 막는 판을 실제로 돌린다.
 *   gaps     시작 간격(몸통 가운데 사이, 0.1 m 간격, 밀어내기 뒤 실제 간격)마다 맞았는지 → 맞는 간격 범위 [가까운 끝, 먼 끝]
 *   hit / guardHigh / guardLow   맞는 가장 가까운 간격에서 가드 없음 / 서서 막기 / 앉아 막기로 돌린 기록:
 *            [닿은 프레임, 결과, 측정 이득, 닿은 프레임으로 계산한 이득] — 측정 = 계산이어야 한다 (다운은 기상까지 측정만)
 *   rule     가드 규칙(blocks)대로 막혔는지
 * 측정 이득은 게임 루프(Match)가 센 틱 차라서, 반응 클립을 경직 길이로 늘이고 줄이는 것·입력 버퍼·히트스톱·자세 섞기가 모두 들어 있다.
 */
const GAP_MIN = 0.6;
const GAP_MAX = 3.6;

export function runFrameTests(match: Match, reset: (gap: number) => void): object {
  const [p1, p2] = match.fighters;
  const def = p1.def;
  const started = performance.now();
  const moves: Record<string, object> = {};
  let pass = true;

  const run = (button: AttackButton, gap: number, guard: Guard | null, full: boolean): HitRecord[] => {
    reset(gap);
    p2.autoGuard = false;
    for (let tick = 1; tick < 400; tick++) {
      const i1: FighterInput = { ...NO_INPUT, pressed: tick === 1 ? [button] : [] };
      const i2: FighterInput = { ...NO_INPUT, pressed: [], down: guard === 'low' };
      if (guard) i2[p2.facing > 0 ? 'left' : 'right'] = true;
      match.step([i1, i2]);
      const recs = match.records.filter((r) => r.attacker === 0);
      if (!full && recs.length) return recs;
      // 기술이 끝나 1P 가 다시 서 있고, 기록이 전부 측정됐으면 끝
      if (tick > 2 && p1.phase === 'neutral' && p2.phase !== 'down' && recs.every((r) => r.measured !== null)) return recs;
    }
    return match.records.filter((r) => r.attacker === 0);
  };
  const row = (r: HitRecord) => [r.connect, r.result, r.chained ? 'chain' : r.measured, r.expected];
  const exact = (recs: HitRecord[]) => recs.every((r) => r.chained || (r.measured !== null && (r.expected === 'KD' || r.measured === r.expected)));

  // ?test=1&profile=1 : 서 있는 자세에서 높이(0.1 m 간격)마다 피격 캡슐 앞끝이 몸통 가운데보다 얼마나 앞인지 (밀어내기로 붙었을 때 어디까지 닿아야 하는지)
  if (new URLSearchParams(location.search).get('profile') === '1') {
    reset(3);
    const c = p1.center();
    const out: Record<string, number> = {};
    const a = new Vector3();
    const b = new Vector3();
    for (let y = 0; y <= 2.81; y += 0.1) {
      let front = -Infinity;
      for (const box of p1.body.hurtboxes) {
        capsuleSegment(box, a, b);
        // 선분을 잘게 나눠 그 높이에서 캡슐 단면의 앞끝
        for (let k = 0; k <= 40; k++) {
          const p = a.clone().lerp(b, k / 40);
          const dy = Math.abs(p.y - y);
          if (dy < box.radius) front = Math.max(front, p.x + Math.sqrt(box.radius ** 2 - dy ** 2));
        }
      }
      out[y.toFixed(1)] = +(front - c).toFixed(3);
    }
    return { profile: out };
  }

  // ?test=1&trace=b2&tgap=1 : 그 기술 한 판의 틱별 [틱, 1P 클립, 프레임, 1P x, 2P x, 판정 구 x·y, 가장 가까운 피격 캡슐까지 거리 − 반지름 합]
  const traceButton = new URLSearchParams(location.search).get('trace') as AttackButton | null;
  if (traceButton) {
    reset(Number(new URLSearchParams(location.search).get('tgap') ?? 1));
    const rows: unknown[] = [];
    const c = new Vector3();
    for (let tick = 1; tick < 80; tick++) {
      match.step([{ ...NO_INPUT, pressed: tick === 1 ? [traceButton] : [] }, NO_INPUT]);
      const hs = p1.move ? activeHitboxes(p1.move, p1.t) : [];
      const h = p1.move?.hitboxes[0];
      let gap = NaN;
      if (h) {
        p1.body.sockets.get(h.socket)!.getWorldPosition(c);
        gap = Math.min(...p2.body.hurtboxes.map((b) => segDist(c, ...capsuleSegment(b)) - b.radius - h.radius));
      }
      rows.push([match.tick, p1.clip.name, p1.t, +p1.center().toFixed(3), +p2.center().toFixed(3), +c.x.toFixed(3), +c.y.toFixed(3), +gap.toFixed(3), hs.length, match.records.length]);
    }
    return { trace: rows };
  }

  for (const [button, name] of Object.entries(def.buttons) as [AttackButton, string][]) {
    const spec = def.moves[name];
    const hitGaps: number[] = [];
    for (let g = GAP_MIN; g <= GAP_MAX + 1e-6; g += 0.1) {
      // 밀어내기로 벌어진 실제 시작 간격을 적는다 (가까운 쪽은 여러 g 가 같은 간격이 된다)
      const hit = run(button, g, null, false).length > 0;
      reset(g);
      const actual = +(p2.center() - p1.center()).toFixed(2);
      if (hit && !hitGaps.includes(actual)) hitGaps.push(actual);
    }
    if (!hitGaps.length) {
      moves[name] = { gaps: null };
      pass = false;
      continue;
    }
    const gap = hitGaps[0] - 0.01;
    const hit = run(button, gap, null, true);
    const guardHigh = run(button, gap, 'high', true);
    const guardLow = run(button, gap, 'low', true);
    // 가드 규칙: 판정마다 막혀야 하는지 (앉아 막기에 상단은 위로 지나가 헛칠 수도 있다 — 그때는 기록이 없다)
    const ruleOk = (recs: HitRecord[], guard: Guard) =>
      recs.every((r, k) => {
        const h = [...spec.hitboxes].sort((a, b) => a.frames[0] - b.frames[0])[k];
        return (r.result === 'block') === blocks(guard, h.height);
      });
    const rule = ruleOk(guardHigh, 'high') && ruleOk(guardLow, 'low');
    const ok = exact(hit) && exact(guardHigh) && exact(guardLow) && rule && hit.length === spec.hitboxes.length;
    if (!ok) pass = false;
    moves[name] = {
      ok,
      startup: moveFrames(spec).startup,
      gaps: [hitGaps[0], hitGaps[hitGaps.length - 1]],
      hit: hit.map(row),
      guardHigh: guardHigh.map(row),
      guardLow: guardLow.map(row),
      rule,
    };
  }
  return { pass, ms: Math.round(performance.now() - started), moves };
}
