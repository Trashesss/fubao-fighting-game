import { Object3D, Vector3 } from 'three';
import type { PoseClip } from '../animation/poseClip';

/** 격투게임 공통 판정·프레임 데이터 (60fps 프레임 단위) */
export type AttackHeight = 'high' | 'mid' | 'low';

export interface HitboxSpec {
  /** 이 판정이 따라가는 기준점 이름 (캐릭터가 정의하는 소켓) */
  socket: string;
  radius: number;
  /** 활성 프레임 [시작, 끝] (클립 프레임, 0 부터, 끝 포함) */
  frames: [number, number];
  height: AttackHeight;
  damage: number;
  /** 맞은 쪽 경직 (프레임, 맞은 다음 프레임부터). 다운시키는 판정은 무시된다 */
  hitstun: number;
  /** 막은 쪽 경직 (프레임) */
  blockstun: number;
  /** 맞으면 다운 (knockdown → down → wake-up) */
  knockdown?: boolean;
}

/** 가드 자세: 서서 막기 / 앉아 막기 */
export type Guard = 'high' | 'low';

/**
 * 가드 규칙 (3단 높이, 철권식):
 *   서서 막기 = 상단·중단을 막는다, 하단에 맞는다
 *   앉아 막기 = 하단을 막는다, 중단에 맞는다. 상단은 앉은 몸 위로 지나가면 헛치고(판정 위치로 정해짐), 닿으면 막는다
 */
export function blocks(guard: Guard, height: AttackHeight): boolean {
  return guard === 'high' ? height !== 'low' : height !== 'mid';
}

/** 피격·가드 반응 동작 이름 (캐릭터마다 클립 이름을 맞춘다) */
export interface ReactionClips {
  hitHigh: string;
  hitLow: string;
  guardHigh: string;
  guardLow: string;
  knockdown: string;
  down: string;
  wakeUp: string;
}

/** 이 판정을 받은 쪽이 재생할 반응. guard = null 이면 가드하지 않음. 상단·중단 피격은 hitHigh, 하단 피격은 hitLow */
export function reactionFor(hit: HitboxSpec, guard: Guard | null, clips: ReactionClips): { clip: string; stun: number; blocked: boolean } {
  if (guard && blocks(guard, hit.height)) return { clip: guard === 'high' ? clips.guardHigh : clips.guardLow, stun: hit.blockstun, blocked: true };
  if (hit.knockdown) return { clip: clips.knockdown, stun: 0, blocked: false };
  return { clip: hit.height === 'low' ? clips.hitLow : clips.hitHigh, stun: hit.hitstun, blocked: false };
}

/**
 * 공격 기술 = 동작 클립 + 판정. 발생·지속·회복 프레임은 판정에서 계산한다 (moveFrames) — 숫자를 두 군데 적지 않는다.
 */
export interface MoveSpec {
  clip: PoseClip;
  hitboxes: HitboxSpec[];
  /** 무적 [시작, 끝] 프레임 (끝 포함): 피격 캡슐이 꺼진다 — 잠수처럼 맞을 몸이 없는 구간 */
  invuln?: [number, number];
}

/** 이 프레임에 피격 캡슐이 켜져 있는지 */
export function hurtboxesActive(move: MoveSpec | undefined, frame: number): boolean {
  return !move?.invuln || frame < move.invuln[0] || frame > move.invuln[1];
}

/**
 * 발생(startup) = 첫 판정이 나오는 프레임 번호 (1 부터 센다, 격투게임 표기 "i10" 과 같다),
 * 지속(active) = 판정이 하나라도 켜져 있는 프레임 수 (여러 번 때리는 기술은 사이 빈 프레임을 빼고 센다),
 * 회복(recovery) = 마지막 판정 뒤 클립 끝까지 프레임 수, hits = 판정 구간 수.
 */
export function moveFrames(move: MoveSpec): { startup: number; active: number; recovery: number; total: number; hits: number } {
  const start = Math.min(...move.hitboxes.map((h) => h.frames[0]));
  const end = Math.max(...move.hitboxes.map((h) => h.frames[1]));
  let active = 0;
  for (let f = start; f <= end; f++) if (activeHitboxes(move, f).length) active++;
  return { startup: start + 1, active, recovery: move.clip.length - 1 - end, total: move.clip.length, hits: move.hitboxes.length };
}

/**
 * 이득 프레임: 판정이 첫 지속 프레임에 닿았을 때 (상대 경직) − (공격 쪽이 그 뒤 클립 끝까지 남은 프레임).
 * + 면 공격 쪽이 먼저 움직인다. 여러 번 때리는 기술은 마지막 판정 기준.
 * onHit 은 다운이면 'KD'. chain = 앞 판정에 맞으면 다음 판정까지 경직이 이어지는지 (연속 히트 보장), 막아도 이어지는지
 */
export function frameAdvantage(move: MoveSpec): { onHit: number | 'KD'; onBlock: number; chainOnHit: boolean; chainOnBlock: boolean } {
  const hits = [...move.hitboxes].sort((a, b) => a.frames[0] - b.frames[0]);
  const last = hits[hits.length - 1];
  const remaining = move.clip.length - 1 - last.frames[0];
  let chainOnHit = true;
  let chainOnBlock = true;
  for (let i = 1; i < hits.length; i++) {
    const gap = hits[i].frames[0] - hits[i - 1].frames[0];
    if (hits[i - 1].knockdown || hits[i - 1].hitstun < gap) chainOnHit = false;
    if (hits[i - 1].blockstun < gap) chainOnBlock = false;
  }
  return { onHit: last.knockdown ? 'KD' : last.hitstun - remaining, onBlock: last.blockstun - remaining, chainOnHit, chainOnBlock };
}

/** 이 프레임에 켜져 있는 판정 */
export function activeHitboxes(move: MoveSpec, frame: number): HitboxSpec[] {
  return move.hitboxes.filter((h) => frame >= h.frames[0] && frame <= h.frames[1]);
}

/** 몸에 붙는 피격 캡슐: 두 소켓 사이 선분 + 반지름 */
export interface Hurtbox {
  name: string;
  a: Object3D;
  b: Object3D;
  radius: number;
}

export function capsuleSegment(box: Hurtbox, a = new Vector3(), b = new Vector3()): [Vector3, Vector3] {
  return [box.a.getWorldPosition(a), box.b.getWorldPosition(b)];
}
