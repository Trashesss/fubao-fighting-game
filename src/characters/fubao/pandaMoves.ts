import type { PoseChannels, PoseClip } from '../../animation/poseClip';

/**
 * 격투 자세 (2.5D 에서 오른쪽(+x)을 볼 때 카메라 쪽이 캐릭터 왼쪽 → 왼발·왼팔이 앞인 오소독스).
 * 곰이 뒷발로 서서 싸울 때처럼 무릎을 굽혀 낮추고, 윗몸을 앞으로 숙이고, 앞발을 얼굴·가슴 앞에 든다.
 */
export const STANCE: PoseChannels = {
  drop: 0.07,
  hipZ: 0.02,
  lean: 14,
  twist: -8,
  headPitch: -6,
  footL_z: 0.13,
  footL_x: -0.03,
  footR_z: -0.13,
  footR_x: 0.03,
  footL_yaw: -8,
  footR_yaw: -18,
  kneeL_out: 10,
  kneeR_out: 15,
  armL_fwd: 38,
  armL_out: 12,
  armL_roll: 5,
  elbowL: 30,
  wristL: 15,
  armR_fwd: 28,
  armR_out: 14,
  armR_roll: 5,
  elbowR: 48,
  wristR: 20,
};

/** 대기: 숨 쉬듯 낮췄다 올리며 앞발을 엇박자로 까딱 */
export const IDLE: PoseClip = {
  name: 'idle',
  length: 90,
  loop: true,
  keys: [
    { f: 0, pose: { ...STANCE } },
    { f: 25, pose: { drop: STANCE.drop + 0.018, lean: STANCE.lean + 2, headPitch: STANCE.headPitch + 2, armL_fwd: STANCE.armL_fwd - 4, elbowL: STANCE.elbowL + 5, armR_fwd: STANCE.armR_fwd + 2, elbowR: STANCE.elbowR - 3 } },
    { f: 48, pose: { drop: STANCE.drop + 0.024, lean: STANCE.lean + 2.5, headPitch: STANCE.headPitch + 2.5, armL_fwd: STANCE.armL_fwd - 1, elbowL: STANCE.elbowL + 2, armR_fwd: STANCE.armR_fwd + 4, elbowR: STANCE.elbowR - 6 } },
    { f: 70, pose: { drop: STANCE.drop + 0.006, lean: STANCE.lean + 0.5, headPitch: STANCE.headPitch + 0.5, armL_fwd: STANCE.armL_fwd + 3, elbowL: STANCE.elbowL - 3, armR_fwd: STANCE.armR_fwd - 1, elbowR: STANCE.elbowR + 2 } },
  ],
};

export const PANDA_CLIPS: Record<string, PoseClip> = { idle: IDLE };
