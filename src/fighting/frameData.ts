import { Object3D, Vector3 } from 'three';
import type { PoseClip } from '../animation/poseClip';

/** 격투게임 공통 판정·프레임 데이터 (60fps 프레임 단위) */
export type AttackHeight = 'high' | 'mid' | 'low';

export interface HitboxSpec {
  /** 이 판정이 따라가는 기준점 이름 (캐릭터가 정의하는 소켓) */
  socket: string;
  radius: number;
  /** 활성 프레임 [시작, 끝] (포함) */
  frames: [number, number];
  height: AttackHeight;
  damage: number;
}

export interface MoveSpec {
  clip: PoseClip;
  startup: number;
  active: number;
  recovery: number;
  hitboxes: HitboxSpec[];
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
