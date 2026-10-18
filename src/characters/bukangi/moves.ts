import type { PoseClip } from '../../animation/poseClip';

/**
 * 부캉이 동작. 채널 뜻은 sharkAnimator.ts 머리 주석. 프레임은 60fps.
 *
 * 대기(idle): 격투 자세에서 숨 쉬듯 들썩인다. 두 점 접지는 유지하고(support=1, anchor=1),
 * 몸통을 살짝 앞뒤로 숙였다 펴고, 지느러미는 가드에서 위아래로 까딱이고,
 * 꼬리는 헤엄치듯 옆으로 아주 조금 흔든다 (박자를 어긋나게 둬서 기계적으로 보이지 않게).
 */
export const IDLE: PoseClip = {
  name: 'idle',
  length: 80,
  loop: true,
  keys: [
    { f: 0, pose: { trunkPitch: 0, headPitch: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_elbow: 0, pecL_elbow: 0, tailSide: 0, tailTipSide: 0 } },
    { f: 20, pose: { trunkPitch: 5, headPitch: -3, pecR_pitch: 11, pecL_pitch: 8, pecR_elbow: -8, pecL_elbow: -5, tailSide: 4, tailTipSide: -6 } },
    { f: 40, pose: { trunkPitch: 6.5, headPitch: -4.5, pecR_pitch: 3, pecL_pitch: 5, pecR_elbow: -3, pecL_elbow: -6, tailSide: 0, tailTipSide: 0 } },
    { f: 60, pose: { trunkPitch: 1.5, headPitch: 1.5, pecR_pitch: -6, pecL_pitch: -5, pecR_elbow: 5, pecL_elbow: 3, tailSide: -4, tailTipSide: 6 } },
  ],
};

export const CLIPS: Record<string, PoseClip> = { idle: IDLE };
