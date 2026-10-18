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

/** 걷기 보폭 (m / 한 번 끌기) */
const WALK_STEP = 0.22;

/**
 * 걷기(walk): "끌-탁". 몸이 굳은 막대라 두 접지점 거리가 고정돼서, 한 점이 미끄러지지 않고는 앞으로 갈 수 없다
 * (한 점을 축으로 돌리면 다른 점은 원을 그릴 뿐이다). 그래서 신발이 바닥을 끌며 나가고 꼬리는 들었다 딛는다.
 *   0–5f   몸통을 살짝 움츠림
 *   5–18f  앞으로 숙여 꼬리를 들고, 신발이 바닥을 끌며 한 보폭 나간다 (신발 미끄러짐 = 의도된 끌기)
 *   18–22f 꼬리를 내려 딛는다 — 이때부터 이동 채널은 멈춰 있어 꼬리 끝은 미끄러지지 않는다
 *   22–32f 몸통·지느러미가 반동으로 출렁이고 다음 걸음 준비
 * 마지막 키(f=32)는 이동 채널이 한 보폭 앞선 값이고, 다음 반복은 rootMotion 만큼 옮긴 자리에서 0 으로 시작한다.
 */
const WALK: PoseClip = {
  name: 'walk',
  length: 32,
  loop: true,
  rootMotion: WALK_STEP,
  keys: [
    { f: 0, pose: { support: 1, tilt: 0, slide: 0, trunkPitch: 2, headPitch: -1, tailSide: 0, tailTipSide: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_yaw: 0, pecL_yaw: 0 } },
    { f: 5, pose: { trunkPitch: 6, headPitch: -4, pecR_pitch: -6, pecL_pitch: -6 } },
    { f: 9, pose: { support: 0.2, tilt: 5, slide: WALK_STEP * 0.06, trunkPitch: 3, headPitch: -1, tailSide: 4, tailTipSide: -6, pecR_pitch: 8, pecL_pitch: 4, pecR_yaw: 8, pecL_yaw: 4 } },
    { f: 15, pose: { support: 0.2, tilt: 5.5, slide: WALK_STEP * 0.85, trunkPitch: 1, headPitch: 1, tailSide: -3, tailTipSide: 5, pecR_pitch: 4, pecL_pitch: 9, pecR_yaw: 4, pecL_yaw: 10 } },
    { f: 20, pose: { support: 1, tilt: 0, slide: WALK_STEP, trunkPitch: 7, headPitch: -5, tailSide: 0, tailTipSide: 0, pecR_pitch: -8, pecL_pitch: -8, pecR_yaw: 2, pecL_yaw: 2 } },
    { f: 26, pose: { trunkPitch: 0, headPitch: 1.5, pecR_pitch: 3, pecL_pitch: 3, pecR_yaw: 0, pecL_yaw: 0 } },
    { f: 32, pose: { slide: WALK_STEP, trunkPitch: 2, headPitch: -1, pecR_pitch: 0, pecL_pitch: 0 } },
  ],
};

/**
 * 대시(dash): 꼬리로 깡총 튀어 앞으로 약 0.85 m. 움츠림 → 도약 → 정점에서 지느러미를 펼침 → 착지 충격을 몸통으로 받음 → 복귀.
 * 신발이 고정점이라 slide 가 그대로 이동 거리다 (공중에서도 몸이 신발 목표 위치를 따라간다).
 */
const DASH: PoseClip = {
  name: 'dash',
  length: 36,
  loop: false,
  keys: [
    { f: 0, pose: {} },
    { f: 6, pose: { trunkPitch: 12, headPitch: -6, pecR_pitch: -18, pecL_pitch: -18, pecR_yaw: 18, pecL_yaw: 18, tailSide: 0 } },
    { f: 9, pose: { support: 0, tilt: 5, hop: 0.05, slide: 0.08, trunkPitch: 3, headPitch: 0, pecR_pitch: 6, pecL_pitch: 6, pecR_yaw: -4, pecL_yaw: -4 }, ease: 'out' },
    { f: 17, pose: { tilt: 8, hop: 0.3, slide: 0.48, trunkPitch: -4, headPitch: 4, pecR_pitch: 26, pecL_pitch: 26, pecR_yaw: 28, pecL_yaw: 28, pecR_elbow: 12, pecL_elbow: 12, tailSide: 9, tailTipSide: -12 }, ease: 'in' },
    { f: 25, pose: { support: 1, tilt: 0, hop: 0, slide: 0.85, trunkPitch: 14, headPitch: -7, pecR_pitch: -10, pecL_pitch: -10, pecR_yaw: 22, pecL_yaw: 22, pecR_elbow: 0, pecL_elbow: 0, tailSide: -5, tailTipSide: 5 } },
    { f: 36, pose: { slide: 0.85, trunkPitch: 0, headPitch: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_yaw: 0, pecL_yaw: 0, tailSide: 0, tailTipSide: 0 } },
  ],
};

/** 후진 보폭 (m / 한 번 깡총) */
const BACK_STEP = 0.16;

/**
 * 후진(walk-back): 가드를 올린 채 뒤로 콩콩 작게 깡총. 걷기처럼 끌면 앞으로 숙인 채 뒤로 가는 어색한 모양이 돼서,
 * 뒤로는 두 점이 함께 뜨는 작은 깡총으로 물러난다 (방어적인 걸음, 발이 미끄러지지 않는다).
 *   0–8f   딛은 채 살짝 움츠림 (이동 채널 고정)
 *   8–20f  뒤로 젖히며 떠서 한 보폭 물러남 (정점 8 cm)
 *   20–28f 착지 충격을 몸통으로 받고 가드 유지
 */
const WALK_BACK: PoseClip = {
  name: 'walk-back',
  length: 28,
  loop: true,
  rootMotion: -BACK_STEP,
  keys: [
    { f: 0, pose: { support: 1, tilt: 0, hop: 0, slide: 0, trunkPitch: 4, headPitch: -2, pecR_pitch: 8, pecL_pitch: 8, pecR_yaw: -8, pecL_yaw: -8, pecR_elbow: 6, pecL_elbow: 6 } },
    { f: 6, pose: { trunkPitch: 8, headPitch: -4 } },
    { f: 9, pose: { support: 0, tilt: -3, hop: 0.03, slide: 0, trunkPitch: 3, headPitch: 0 }, ease: 'out' },
    { f: 14, pose: { tilt: -4, hop: 0.08, slide: -BACK_STEP * 0.5, trunkPitch: 0, pecR_pitch: 12, pecL_pitch: 12, tailSide: 3, tailTipSide: -4 }, ease: 'in' },
    { f: 20, pose: { support: 1, tilt: 0, hop: 0, slide: -BACK_STEP, trunkPitch: 9, headPitch: -5, pecR_pitch: 4, pecL_pitch: 4, tailSide: 0, tailTipSide: 0 } },
    { f: 28, pose: { slide: -BACK_STEP, trunkPitch: 4, headPitch: -2, pecR_pitch: 8, pecL_pitch: 8 } },
  ],
};

/**
 * 점프: 움츠림 → 도약 → 공중에서 꼬리를 앞으로 말아 넣고 지느러미를 펼침 → 착지.
 * 올라갈 때 'out', 내려올 때 'in' 보간이라 높이가 포물선에 가깝다 (정점에서 느리고 착지 직전에 빠르다).
 * forward 거리만큼 신발 목표 위치를 옮겨 앞 점프가 된다.
 */
function jump(name: string, forward: number): PoseClip {
  return {
    name,
    length: 52,
    loop: false,
    keys: [
      { f: 0, pose: {} },
      { f: 7, pose: { trunkPitch: 15, headPitch: -8, pecR_pitch: -20, pecL_pitch: -20, pecR_yaw: 15, pecL_yaw: 15 } },
      { f: 10, pose: { support: 0, tilt: 3, hop: 0.06, slide: forward * 0.06, trunkPitch: 2, headPitch: 2, pecR_pitch: 15, pecL_pitch: 15, pecR_yaw: 0, pecL_yaw: 0 }, ease: 'out' },
      { f: 26, pose: { tilt: forward > 0 ? 6 : 0, hop: 0.9, slide: forward * 0.5, trunkPitch: -3, headPitch: 3, tailPitch: -16, tailTipPitch: -8, pecR_pitch: 30, pecL_pitch: 30, pecR_yaw: 30, pecL_yaw: 30, pecR_elbow: 10, pecL_elbow: 10, tailSide: 6 }, ease: 'in' },
      { f: 42, pose: { support: 1, tilt: 0, hop: 0, slide: forward, trunkPitch: 16, headPitch: -8, tailPitch: 0, tailTipPitch: 0, pecR_pitch: -12, pecL_pitch: -12, pecR_yaw: 20, pecL_yaw: 20, pecR_elbow: 0, pecL_elbow: 0, tailSide: -4 } },
      { f: 52, pose: { slide: forward, trunkPitch: 0, headPitch: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_yaw: 0, pecL_yaw: 0, tailSide: 0 } },
    ],
  };
}

export const CLIPS: Record<string, PoseClip> = {
  idle: IDLE,
  walk: WALK,
  'walk-back': WALK_BACK,
  dash: DASH,
  jump: jump('jump', 0),
  'jump-forward': jump('jump-forward', 0.9),
};
