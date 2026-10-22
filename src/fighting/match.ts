import { Vector3 } from 'three';
import { sphereHitsCapsule } from './collision';
import { capsuleSegment, frameAdvantage, type HitboxSpec } from './frameData';
import type { Fighter, FighterInput } from './fighter';

/**
 * 한 판: 두 캐릭터를 같은 틱으로 진행하고 판정·밀어내기·방향·히트스톱을 처리한다. 그리기는 모른다.
 *
 * 한 틱의 순서 (프레임 데이터 정의가 여기에 기대고 있다):
 *   1) advance   두 캐릭터 시간 +1
 *   2) control   움직일 수 있으면 입력으로 다음 동작 (같은 틱에 0 프레임)
 *   3) applyPose 자세 적용
 *   4) 밀어내기·무대 끝·방향
 *   5) 판정: 켜진 공격 구 × 상대 피격 캡슐 → 맞으면 상대는 다음 틱부터 경직
 * 맞으면 두 캐릭터가 HITSTOP 틱 동안 멈춘다 (둘 다 같이 멈추므로 이득 프레임은 바뀌지 않는다).
 *
 * 이득 프레임 측정: 판정이 닿은 뒤 두 캐릭터가 처음 움직일 수 있게 된 틱의 차 (상대 − 공격 쪽).
 * frameAdvantage(계산값, 첫 지속 프레임에 닿았다고 보고 계산)와 나란히 기록한다.
 */
export const HITSTOP = { hit: 8, block: 6 };
/** 무대 반폭 (m) */
export const STAGE_HALF = 6;

export interface HitRecord {
  tick: number;
  attacker: 0 | 1;
  move: string;
  result: 'hit' | 'block' | 'KD';
  /** 판정이 닿은 클립 프레임 */
  connect: number;
  /** 계산값 (frameAdvantage, 첫 지속 프레임 기준) */
  calc: number | 'KD';
  /** 닿은 프레임 기준으로 다시 계산한 값 (늦게 닿으면 그만큼 이득이 커진다) */
  expected: number | 'KD';
  /** 측정값 (상대가 움직일 수 있게 된 틱 − 공격 쪽이 움직일 수 있게 된 틱). 다운이면 기상까지 */
  measured: number | null;
  combo: number;
  damage: number;
  /** 움직일 수 있게 되기 전에 다음 판정이 닿아 이 판정의 이득은 잴 수 없다 (여러 번 때리는 기술의 앞 판정) */
  chained?: boolean;
}

export class Match {
  tick = 0;
  hitstop = 0;
  readonly records: HitRecord[] = [];
  private pending: { rec: HitRecord; att: number | null; def: number | null } | null = null;
  private combo = 0;

  constructor(readonly fighters: [Fighter, Fighter]) {}

  reset(): void {
    this.tick = 0;
    this.hitstop = 0;
    this.records.length = 0;
    this.pending = null;
    this.combo = 0;
  }

  step(inputs: [FighterInput, FighterInput]): void {
    this.tick++;
    const [a, b] = this.fighters;
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    a.advance();
    b.advance();
    a.control(inputs[0]);
    b.control(inputs[1]);
    a.applyPose();
    b.applyPose();
    this.separate();
    for (const f of this.fighters) {
      const other = f === a ? b : a;
      if (f.phase === 'neutral') f.turnTo(other.center() >= f.center() ? 1 : -1);
    }
    this.measure();
    this.hits();
  }

  /**
   * 두 몸이 겹치지 않게 반씩 밀고, 무대 끝 안에 둔다. 잠긴(sink) 동안은 상대 밑을 지나간다.
   * 겹침 = 몸통 가운데 사이 겹침과 바닥에 닿은 발끼리 x 범위 겹침 중 큰 쪽
   */
  separate(): void {
    const [a, b] = this.fighters;
    if (!a.sunk() && !b.sunk()) {
      const ca = a.center();
      const cb = b.center();
      let overlap = a.def.push.halfWidth + b.def.push.halfWidth - Math.abs(cb - ca);
      const sa = a.groundSpan();
      const sb = b.groundSpan();
      if (sa && sb) overlap = Math.max(overlap, Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]));
      if (overlap > 0) {
        const dir = cb !== ca ? Math.sign(cb - ca) : a.facing;
        a.x -= (dir * overlap) / 2;
        b.x += (dir * overlap) / 2;
        a.place();
        b.place();
      }
    }
    for (const f of this.fighters) {
      const c = f.center();
      const lim = STAGE_HALF - f.def.push.halfWidth;
      if (Math.abs(c) > lim) {
        f.x -= c - Math.sign(c) * lim;
        f.place();
      }
    }
  }

  private hits(): void {
    const found: [Fighter, Fighter, HitboxSpec][] = [];
    const c = new Vector3();
    const p = new Vector3();
    const q = new Vector3();
    for (const att of this.fighters) {
      const def = att === this.fighters[0] ? this.fighters[1] : this.fighters[0];
      if (!def.hurtActive()) continue;
      for (const h of att.activeHits()) {
        att.body.sockets.get(h.socket)!.getWorldPosition(c);
        // 바닥 아래 부분은 판정이 없다 (잠수)
        if (c.y + h.radius < 0) continue;
        if (def.body.hurtboxes.some((box) => sphereHitsCapsule(c, h.radius, ...capsuleSegment(box, p, q), box.radius))) found.push([att, def, h]);
      }
    }
    // 같은 틱에 서로 맞히면 둘 다 맞는다 (상쇄)
    for (const [att, def, h] of found) {
      att.hitDone.add(h);
      const wasStunned = def.phase === 'stun' && !def.blocked;
      const connect = att.t;
      const r = def.react(h, att.center());
      this.hitstop = Math.max(this.hitstop, r.blocked ? HITSTOP.block : HITSTOP.hit);
      this.combo = !r.blocked && wasStunned ? this.combo + 1 : 1;
      const move = att.clip.name;
      const spec = att.def.moves[move];
      // 이 판정 하나만 본 계산값 (여러 번 때리는 기술의 앞 판정도 따로 잰다)
      const adv = frameAdvantage({ ...spec, hitboxes: [h] });
      const remaining = att.clip.length - 1 - connect;
      const rec: HitRecord = {
        tick: this.tick,
        attacker: att === this.fighters[0] ? 0 : 1,
        move,
        result: r.blocked ? 'block' : r.knockdown ? 'KD' : 'hit',
        connect,
        calc: r.blocked ? adv.onBlock : r.knockdown ? 'KD' : adv.onHit,
        expected: r.blocked ? h.blockstun - remaining : r.knockdown ? 'KD' : h.hitstun - remaining,
        measured: null,
        combo: r.blocked ? 0 : this.combo,
        damage: r.blocked ? 0 : h.damage,
      };
      if (this.pending) this.pending.rec.chained = true;
      this.records.push(rec);
      this.pending = { rec, att: null, def: null };
    }
  }

  /** 맞은 뒤 두 캐릭터가 처음 움직일 수 있게 된 틱 */
  private measure(): void {
    const pend = this.pending;
    if (!pend) return;
    const att = this.fighters[pend.rec.attacker];
    const def = this.fighters[1 - pend.rec.attacker];
    if (pend.att === null && att.freeNow) pend.att = this.tick;
    if (pend.def === null && def.freeNow) pend.def = this.tick;
    if (pend.att !== null && pend.def !== null) {
      pend.rec.measured = pend.def - pend.att;
      this.pending = null;
    }
  }
}
