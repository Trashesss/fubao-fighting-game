import { Bone, Object3D, Quaternion, Vector3 } from 'three';
import type { PoseChannels } from '../../animation/poseClip';
import type { Hurtbox } from '../../fighting/frameData';
import { DEG, aimBone, applySwimPose, bendRegion, type SharkRig } from './sharkRig';

/**
 * 부캉이 채널 → 뼈. 모든 각도는 도, 길이는 m. 0 이 기본 서 있는 자세다.
 *
 * 서 있는 자세 기준 방향: 앞(+z) = 배가 보는 쪽(상대 쪽), 위(+y) = 주둥이 쪽, +x = 오른쪽.
 *   tilt        몸 전체 기울기 (+ = 앞으로 숙임). support=1 이면 두 점 접지 해에 더한다
 *   support     1 = 꼬리 위 엽 끝과 신발이 함께 바닥에 닿도록 기울기를 푼다, 0 = 풀지 않는다
 *   hop         가장 낮은 접지점의 높이 (점프·깡총)
 *   slide       신발을 고정할 앞뒤 위치 (+ = 앞으로). anchor=1 이면 몸이 신발을 따라온다
 *   tailSlide   꼬리 위 엽 끝을 고정할 앞뒤 위치 (anchorTail=1 일 때)
 *   anchor      1 = 고정점을 바닥에 고정해 미끄러지지 않게 한다
 *   anchorTail  고정점 선택: 0 = 신발, 1 = 꼬리 위 엽 끝 (걸을 때 번갈아 딛는다)
 *   head*, trunk*, tail*   척추 구간 굽힘: Pitch(+ = 앞/배 쪽으로), Side(+ = 오른쪽으로), Twist(+ = 오른쪽이 뒤로)
 *   pecR/L_*    가슴지느러미(팔): yaw(+ = 바깥으로), pitch(+ = 위로), elbow(+ = 끝을 위로), elbowYaw
 *   pelR/L_*    배지느러미(발): 같은 규칙, knee 가 끝마디
 *   jaw         입 벌림 (턱 뼈가 생기면 쓴다)
 */
export const CHANNELS = [
  'tilt', 'support', 'hop', 'slide', 'tailSlide', 'anchor', 'anchorTail',
  'headPitch', 'headSide', 'headTwist',
  'trunkPitch', 'trunkSide', 'trunkTwist',
  'tailPitch', 'tailSide', 'tailTipPitch', 'tailTipSide',
  'pecR_yaw', 'pecR_pitch', 'pecR_elbow', 'pecR_elbowYaw',
  'pecL_yaw', 'pecL_pitch', 'pecL_elbow', 'pecL_elbowYaw',
  'pelR_yaw', 'pelR_pitch', 'pelR_knee',
  'pelL_yaw', 'pelL_pitch', 'pelL_knee',
  'jaw',
] as const;
export type SharkChannel = (typeof CHANNELS)[number];

export const NEUTRAL: PoseChannels = Object.fromEntries(CHANNELS.map((c) => [c, c === 'support' || c === 'anchor' ? 1 : 0]));

/** 척추 구간 (u). 뿌리 뼈 u=0.44 를 기준으로 앞 사슬·뒤 사슬 */
const REGIONS = {
  head: [0.0, 0.24],
  trunk: [0.22, 0.44],
  tail: [0.55, 0.8],
  tailTip: [0.79, 1.0],
} as const;

/** 서 있는 기본 자세의 지느러미 방향 (캐릭터 좌표, 오른쪽 기준; yaw 는 앞에서 바깥으로, pitch 는 위로) */
const LIMB_BASE = {
  pec: { yaw: 33.5, pitch: -7, lowYaw: 12, lowPitch: 14.5 },
  pel: { yaw: 48, pitch: -53, lowYaw: 25, lowPitch: -20.5 },
};

const dirFrom = (side: number, yawDeg: number, pitchDeg: number) => {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  return new Vector3(side * Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
};

export interface SharkContacts {
  /** 꼬리 위 엽 끝 */
  tailTip: Object3D;
  /** 신발 밑창 (뒤꿈치·가운데·앞코). 신발이 없으면 아래 엽 끝 하나 */
  shoe: Object3D[];
}

export class SharkAnimator {
  readonly hurtboxes: Hurtbox[] = [];
  readonly sockets = new Map<string, Object3D>();
  private readonly bindRootPos: Vector3;
  private neutralTilt = 0;
  private neutralAnchorZ = 0;
  private neutralTailZ = 0;
  /** 기본 자세에서 각 지느러미 부모 뼈의 방향 (캐릭터 좌표) — 지느러미가 몸을 따라 돌게 하는 기준 */
  private readonly limbParentRest = new Map<Bone, Quaternion>();
  private lastSolvedTilt = 0;

  constructor(
    private readonly character: Object3D,
    private readonly rig: SharkRig,
    private readonly contacts: SharkContacts,
    neutralTiltGuess: number,
  ) {
    this.bindRootPos = rig.root.position.clone();
    this.neutralTilt = neutralTiltGuess;
    this.lastSolvedTilt = neutralTiltGuess;
    // 기본 자세 한 번 풀어서 기준값을 잡는다
    this.neutralTilt = this.solveTilt(NEUTRAL, neutralTiltGuess);
    this.poseSpine(NEUTRAL, this.neutralTilt);
    for (const chain of Object.values(rig.limbs)) this.limbParentRest.set(chain[0], this.localQuat(chain[0].parent!));
    this.apply(NEUTRAL, false);
    this.neutralAnchorZ = this.local(this.anchorPoint()).z;
    this.neutralTailZ = this.local(this.contacts.tailTip).z;
    this.apply(NEUTRAL);
  }

  /** 바인드 포즈 위치를 따르는 소켓을 뼈에 붙인다 (판정 박스·접지점 기준) */
  addSocket(name: string, bone: Bone, bindPosition: Vector3): Object3D {
    const i = this.rig.skeleton.bones.indexOf(bone);
    const socket = new Object3D();
    socket.name = `socket-${name}`;
    socket.position.copy(bindPosition).applyMatrix4(this.rig.skeleton.boneInverses[i]);
    bone.add(socket);
    this.sockets.set(name, socket);
    return socket;
  }

  addHurtbox(name: string, a: Object3D, b: Object3D, radius: number): void {
    this.hurtboxes.push({ name, a, b, radius });
  }

  private local(o: Object3D, out = new Vector3()): Vector3 {
    return this.character.worldToLocal(o.getWorldPosition(out));
  }
  private localQuat(o: Object3D): Quaternion {
    const charQ = this.character.getWorldQuaternion(new Quaternion());
    return charQ.invert().multiply(o.getWorldQuaternion(new Quaternion()));
  }
  private anchorPoint(): Object3D {
    const s = this.contacts.shoe;
    return s[Math.floor(s.length / 2)];
  }

  private poseSpine(c: PoseChannels, tiltDeg: number): void {
    const rig = this.rig;
    applySwimPose(rig);
    rig.root.position.copy(this.bindRootPos);
    rig.root.rotation.x = tiltDeg * DEG;
    // 앞 사슬: 뼈 로컬 x+ = 배 쪽(앞)으로, y+ = 오른쪽으로, z = 비틀기
    bendRegion(rig, REGIONS.head[0], REGIONS.head[1], c.headPitch, 'x');
    bendRegion(rig, REGIONS.head[0], REGIONS.head[1], c.headSide, 'y');
    bendRegion(rig, REGIONS.head[0], REGIONS.head[1], c.headTwist, 'z');
    bendRegion(rig, REGIONS.trunk[0], REGIONS.trunk[1], c.trunkPitch, 'x');
    bendRegion(rig, REGIONS.trunk[0], REGIONS.trunk[1], c.trunkSide, 'y');
    bendRegion(rig, REGIONS.trunk[0], REGIONS.trunk[1], c.trunkTwist, 'z');
    // 뒤 사슬은 자식이 -z 쪽이라 부호가 반대: x+ = 등 쪽(뒤)으로, y+ = 왼쪽으로
    bendRegion(rig, REGIONS.tail[0], REGIONS.tail[1], -c.tailPitch, 'x');
    bendRegion(rig, REGIONS.tail[0], REGIONS.tail[1], -c.tailSide, 'y');
    bendRegion(rig, REGIONS.tailTip[0], REGIONS.tailTip[1], -c.tailTipPitch, 'x');
    bendRegion(rig, REGIONS.tailTip[0], REGIONS.tailTip[1], -c.tailTipSide, 'y');
    rig.root.updateWorldMatrix(true, true);
  }

  /** 꼬리 위 엽 끝과 신발 밑창이 같은 높이가 되는 기울기 (지난 해 근처에서 찾는다) */
  private solveTilt(c: PoseChannels, guess: number): number {
    const diff = (t: number) => {
      this.poseSpine(c, t);
      return this.local(this.anchorPoint()).y - this.local(this.contacts.tailTip).y;
    };
    const f0 = diff(guess);
    if (Math.abs(f0) < 1e-5) return guess;
    let lo = guess;
    let hi = guess;
    let found = false;
    for (let step = 1; step <= 40 && !found; step++) {
      for (const cand of [guess - step, guess + step]) {
        if (Math.sign(diff(cand)) !== Math.sign(f0)) {
          hi = cand;
          found = true;
          break;
        }
      }
    }
    if (!found) return guess;
    let flo = f0;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      const fm = diff(mid);
      if (Math.sign(fm) === Math.sign(flo)) {
        lo = mid;
        flo = fm;
      } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  apply(raw: PoseChannels, ground = true): void {
    const rig = this.rig;
    // 0~1 채널은 보간이 넘쳐도 범위 안으로
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const c: PoseChannels = { ...raw, support: clamp01(raw.support), anchor: clamp01(raw.anchor), anchorTail: clamp01(raw.anchorTail), hop: Math.max(0, raw.hop) };
    // 뿌리 뼈 회전은 −90° 가 수직이고 덜 음수일수록 앞으로 숙는다.
    // support=1 이면 두 점이 함께 닿는 해를 쓴다 (몸이 굳은 막대라 그때 tilt 는 꼬리 굽힘으로만 낼 수 있다)
    const free = this.neutralTilt + c.tilt;
    let tilt = free;
    if (c.support > 0) {
      const solved = this.solveTilt(c, this.lastSolvedTilt);
      this.lastSolvedTilt = solved;
      tilt = free + (solved - free) * c.support;
    }
    this.poseSpine(c, tilt);

    // 지느러미: 부모 뼈가 기본 자세에서 돈 만큼 같이 돌린 방향을 겨눈다
    const charQ = this.character.getWorldQuaternion(new Quaternion());
    const limb = (name: string, side: number, kind: 'pec' | 'pel', yaw: number, pitch: number, low: number, lowYaw: number) => {
      const [a, b, tip] = rig.limbs[name];
      const base = LIMB_BASE[kind];
      const follow = this.localQuat(a.parent!).multiply(this.limbParentRest.get(a)!.clone().invert());
      const toWorld = (d: Vector3) => d.applyQuaternion(follow).applyQuaternion(charQ);
      aimBone(a, b, toWorld(dirFrom(side, base.yaw + yaw, base.pitch + pitch)));
      aimBone(b, tip, toWorld(dirFrom(side, base.lowYaw + yaw + lowYaw, base.lowPitch + pitch + low)));
    };
    limb('pectoral-fin-R', 1, 'pec', c.pecR_yaw, c.pecR_pitch, c.pecR_elbow, c.pecR_elbowYaw);
    limb('pectoral-fin-L', -1, 'pec', c.pecL_yaw, c.pecL_pitch, c.pecL_elbow, c.pecL_elbowYaw);
    limb('pelvic-fin-R', 1, 'pel', c.pelR_yaw, c.pelR_pitch, c.pelR_knee, 0);
    limb('pelvic-fin-L', -1, 'pel', c.pelL_yaw, c.pelL_pitch, c.pelL_knee, 0);

    if (!ground) return;
    // 접지: 가장 낮은 접지점을 hop 높이에, 신발은 slide 위치에 고정
    const points = [this.contacts.tailTip, ...this.contacts.shoe].map((o) => this.local(o));
    const lowest = Math.min(...points.map((p) => p.y));
    const dzShoe = this.neutralAnchorZ + c.slide - this.local(this.anchorPoint()).z;
    const dzTail = this.neutralTailZ + c.tailSlide - this.local(this.contacts.tailTip).z;
    const dz = (dzShoe * (1 - c.anchorTail) + dzTail * c.anchorTail) * c.anchor;
    rig.root.position.copy(this.bindRootPos).add(new Vector3(0, c.hop - lowest, dz));
    rig.root.updateWorldMatrix(true, true);
  }

  /** 검사용: 접지점의 현재 높이와 앞뒤 위치 (캐릭터 좌표) */
  contactReport(): { tailY: number; shoeY: number; tailZ: number; shoeZ: number } {
    return {
      tailY: this.local(this.contacts.tailTip).y,
      shoeY: Math.min(...this.contacts.shoe.map((o) => this.local(o).y)),
      tailZ: this.local(this.contacts.tailTip).z,
      shoeZ: this.local(this.anchorPoint()).z,
    };
  }

}
