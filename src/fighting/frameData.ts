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
}

/**
 * 공격 기술 = 동작 클립 + 판정. 발생·지속·회복 프레임은 판정에서 계산한다 (moveFrames) — 숫자를 두 군데 적지 않는다.
 */
export interface MoveSpec {
  clip: PoseClip;
  hitboxes: HitboxSpec[];
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
