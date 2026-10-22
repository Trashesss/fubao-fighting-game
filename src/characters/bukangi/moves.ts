import type { PoseClip } from '../../animation/poseClip';
import type { MoveSpec, ReactionClips } from '../../fighting/frameData';

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

/**
 * 지느러미 잽(약, 상단): 오른쪽 가슴지느러미로 빠르게 찌르며 두 발을 붙인 채 JAB_STEP 만큼 미끄러지듯 내딛는다 (support=1).
 *   0–3f  지느러미를 살짝 뒤로 당김 (예비 동작)
 *   3–8f  몸통을 오른쪽 앞으로 비틀며 지느러미 끝을 정면으로 뻗고, 두 발이 바닥에 붙은 채 앞으로 미끄러짐 (skid 3–8f)
 *   8–10f 판정 (뻗은 채 유지)
 *   10–25f 거둬들이고 가드로 복귀
 * 지느러미가 짧아 끝이 신발 앞 약 0.6 m 까지만 나간다 (몸통을 숙여도 지느러미 뿌리가 내려갈 뿐 더 나가지 않는다 — 22° 숙여도 연습 모드 사거리 그대로).
 * 제자리 잽은 연습 모드에서 맞는 간격이 0.92–1.0 m 뿐이라, 맞고 0.14 m 밀려난 상대에게 잽을 이어 치면 헛쳤다 → 내딛는다.
 */
const JAB_STEP = 0.18;
const FIN_JAB: PoseClip = {
  name: 'fin-jab',
  length: 26,
  loop: false,
  skid: [3, 8],
  keys: [
    { f: 0, pose: {} },
    { f: 3, pose: { slide: 0, tailSlide: 0, pecR_yaw: 10, pecR_pitch: -10, pecR_elbow: 8, trunkTwist: 6, pecL_yaw: 4, pecL_pitch: 4 } },
    { f: 8, pose: { slide: JAB_STEP, tailSlide: JAB_STEP, pecR_yaw: -30, pecR_pitch: 6, pecR_elbow: -12, trunkTwist: -18, trunkPitch: 12, headPitch: -6, pecL_yaw: 10, pecL_pitch: 8 }, ease: 'out' },
    { f: 10, pose: { pecR_yaw: -31, pecR_pitch: 5, trunkTwist: -19 } },
    { f: 25, pose: { pecR_yaw: 0, pecR_pitch: 0, pecR_elbow: 0, trunkTwist: 0, trunkPitch: 0, headPitch: 0, pecL_yaw: 0, pecL_pitch: 0 } },
  ],
};

/**
 * 꼬리 쓸기(하단): 몸을 숙이고 신발을 축으로 한 바퀴 돌며 꼬리 위 엽 끝으로 바닥을 쓴다.
 * 꼬리 끝은 서 있을 때 몸 뒤에 있어서, 정면을 쓸려면 몸이 반 바퀴 이상 돌아야 한다.
 * 신발 가운데가 고정점이라 신발은 제자리에서 돌고(미끄러짐 0), 앞으로 숙인 만큼 꼬리 끝이 바닥 위 약 20 cm 로 뜬다.
 *   0–3f   숙이며 꼬리를 먼저 든다 (support 를 풀어 몸이 돌 수 있게. 꼬리가 바닥에 있을 때 돌면 미끄러진다)
 *   3–8f   반대쪽으로 30° 감음
 *   8–13f  돌기 시작 (가속)
 *   13–19f 빠르게 돎 — 꼬리 끝이 정면을 지나는 14–18f 가 판정
 *   19–24f 한 바퀴를 채우며 감속
 *   24–45f 꼬리를 딛고 일어서 복귀
 */
const TAIL_SWEEP: PoseClip = {
  name: 'tail-sweep',
  length: 46,
  loop: false,
  keys: [
    { f: 0, pose: {} },
    { f: 3, pose: { support: 0.4, tilt: 3, turn: 0, trunkPitch: 7, headPitch: -3 } },
    { f: 8, pose: { support: 0, tilt: 6, turn: -30, trunkPitch: 16, headPitch: -8, pecR_yaw: 20, pecL_yaw: 20, pecR_pitch: -12, pecL_pitch: -12 }, ease: 'in' },
    { f: 13, pose: { tilt: 9, turn: 70, pecR_yaw: 30, pecL_yaw: 30, pecR_pitch: 10, pecL_pitch: 10 }, ease: 'linear' },
    { f: 19, pose: { tilt: 9, turn: 290 }, ease: 'out' },
    { f: 24, pose: { tilt: 5, turn: 360, trunkPitch: 12 } },
    { f: 34, pose: { support: 1, tilt: 0, turn: 360, trunkPitch: 6, headPitch: -3, pecR_yaw: 6, pecL_yaw: 6, pecR_pitch: -4, pecL_pitch: -4 } },
    { f: 45, pose: { trunkPitch: 0, headPitch: 0, pecR_yaw: 0, pecL_yaw: 0, pecR_pitch: 0, pecL_pitch: 0 } },
  ],
};

/** 신발 킥에서 꼬리로 깡총 들어가는 거리 (m) */
const KICK_STEP = 0.7;
/**
 * 차올리는 동안 꼬리 끝이 공중에서 더 나아가는 거리 (m).
 * 꼬리 끝을 축으로 신발을 차올리면 몸 전체가 뒤로 돌아 몸통 가운데가 꼬리 끝 대비 0.8 m 뒤로 간다 (probe: tailPitch 58·tilt 6).
 * 연습 모드에서 두 몸이 밀어내기로 겹치지 않으니, 꼬리 끝이 그 자리에 딛고 차면 신발이 상대 배 앞 0.36 m 에서 멈췄다.
 * 그래서 차올리는 동안 공중에서 그만큼 더 나아가 몸통 가운데가 거의 제자리에 머물게 한다.
 */
const KICK_LUNGE = 0.7;

/**
 * 신발 킥(중단): 꼬리로 깡총 뛰어 들어가며 공중에서 운동화 신은 아래 엽을 앞으로 차올리고, 꼬리 위 엽 끝으로 착지한다.
 * 꼬리 끝과 신발 거리가 고정(약 1.07 m)이라 제자리에서 차면 신발이 원래 자리보다 뒤에서 올라간다 → 들어가며 찬다.
 * 꼬리 구간을 뒤로 굽히면(tailPitch +) 꼬리 끝을 축으로 꼬리지느러미 전체가 돌아 신발이 들린다.
 *   0–6f   움츠림
 *   6–22f  깡총 앞으로 (고정점을 꼬리 끝으로 바꾼다, anchorTail=1). 16f 부터 공중에서 차올림 — 19–23f 판정
 *   22f    꼬리 끝으로 착지
 *   23–38f 신발을 내려 두 점으로 다시 딛음
 *   38–49f 복귀 (KICK_STEP + KICK_LUNGE 만큼 앞에서 끝난다)
 */
const SHOE_KICK: PoseClip = {
  name: 'shoe-kick',
  length: 50,
  loop: false,
  keys: [
    { f: 0, pose: {} },
    { f: 6, pose: { trunkPitch: 10, headPitch: -5, pecR_pitch: -10, pecL_pitch: -10 } },
    { f: 10, pose: { support: 0, anchorTail: 1, hop: 0.08, tailSlide: KICK_STEP * 0.35, slide: KICK_STEP * 0.35, tailPitch: 10, trunkPitch: 2, headPitch: 0 }, ease: 'out' },
    { f: 16, pose: { hop: 0.1, tailSlide: KICK_STEP, slide: KICK_STEP, tailPitch: 25, tilt: 3, pecR_yaw: 15, pecL_yaw: 15 } },
    { f: 20, pose: { hop: 0.03, tailSlide: KICK_STEP + KICK_LUNGE * 0.85, slide: KICK_STEP + KICK_LUNGE * 0.85, tailPitch: 58, tilt: 6, trunkPitch: -8, headPitch: 4, pecR_yaw: 28, pecL_yaw: 28, pecR_pitch: 20, pecL_pitch: 20 } },
    { f: 22, pose: { hop: 0, tailSlide: KICK_STEP + KICK_LUNGE, slide: KICK_STEP + KICK_LUNGE }, ease: 'in' },
    { f: 23, pose: { tailPitch: 60 } },
    { f: 32, pose: { tailPitch: 15, tilt: 2, trunkPitch: 4, pecR_yaw: 10, pecL_yaw: 10, pecR_pitch: 0, pecL_pitch: 0 } },
    { f: 38, pose: { support: 1, tailPitch: 0, tilt: 0, trunkPitch: 10, headPitch: -5, pecR_pitch: -8, pecL_pitch: -8 } },
    { f: 49, pose: { trunkPitch: 0, headPitch: 0, pecR_yaw: 0, pecL_yaw: 0, pecR_pitch: 0, pecL_pitch: 0 } },
  ],
};

/** 물기 기술이 앞으로 들어가는 거리 (m) */
const RISE_STEP = 0.3;
const TEAR_STEP = 0.45;

/**
 * 솟구쳐 물기(상단): 꼬리로 튀어 오르며 입을 크게 벌리고, 정점에서 머리를 앞으로 숙이며 턱을 닫는다.
 * 입이 배 쪽(정면)에 있어서 머리를 숙이면(headPitch +) 입이 상대 쪽 위로 향한다.
 *   0–6f   움츠리며 입을 살짝 벌림
 *   6–16f  튀어 오르며 입을 50° 까지 벌림 (정점 0.42 m)
 *   16–19f 머리를 숙이며 턱을 닫음 — 17–19f 판정
 *   22–30f 내려와 착지, 47f 까지 복귀 (RISE_STEP 앞에서 끝)
 */
const RISING_BITE: PoseClip = {
  name: 'rising-bite',
  length: 48,
  loop: false,
  keys: [
    { f: 0, pose: {} },
    { f: 6, pose: { trunkPitch: 12, headPitch: -6, jaw: 8, pecR_pitch: -14, pecL_pitch: -14 } },
    { f: 10, pose: { support: 0, hop: 0.08, tilt: 4, slide: RISE_STEP * 0.3, trunkPitch: 4, headPitch: 5, jaw: 30, pecR_pitch: 6, pecL_pitch: 6 }, ease: 'out' },
    { f: 16, pose: { hop: 0.42, tilt: 10, slide: RISE_STEP * 0.8, trunkPitch: 10, headPitch: 25, jaw: 50, pecR_yaw: 30, pecL_yaw: 30, pecR_pitch: 25, pecL_pitch: 25 } },
    { f: 19, pose: { headPitch: 30, jaw: 0, trunkPitch: 12 } },
    { f: 22, pose: { slide: RISE_STEP, headPitch: 26 }, ease: 'in' },
    { f: 30, pose: { support: 1, hop: 0, tilt: 0, trunkPitch: 14, headPitch: -4, pecR_yaw: 18, pecL_yaw: 18, pecR_pitch: -10, pecL_pitch: -10 } },
    { f: 47, pose: { trunkPitch: 0, headPitch: 0, pecR_yaw: 0, pecL_yaw: 0, pecR_pitch: 0, pecL_pitch: 0 } },
  ],
};

/**
 * 비틀어 물어뜯기(강, 중단): 뒤로 젖혀 힘을 모았다가 앞으로 덤벼 물고(1타), 문 채로 몸통·머리를 좌우로 비틀어 뜯는다(2타).
 *   0–8f   뒤로 젖히며 몸을 감음, 입을 벌리기 시작
 *   8–17f  앞으로 덤빔 (깡총 0.45 m, 입 55°)
 *   17–20f 착지하며 턱을 닫음 — 18–20f 1타
 *   20–37f 오른쪽 → 왼쪽 → 오른쪽으로 비틀어 뜯기 — 27–33f 2타
 *   37–44f 입을 벌려 놓아 줌, 59f 까지 복귀
 */
const TWIST_TEAR: PoseClip = {
  name: 'twist-tear',
  length: 60,
  loop: false,
  keys: [
    { f: 0, pose: {} },
    { f: 8, pose: { trunkPitch: -6, headPitch: -8, trunkTwist: 12, jaw: 15, pecR_yaw: 15, pecL_yaw: 15, pecR_pitch: -8, pecL_pitch: -8 } },
    { f: 12, pose: { support: 0, hop: 0.06, slide: TEAR_STEP * 0.25, tilt: 6, trunkPitch: 4, headPitch: 6, trunkTwist: 4, jaw: 45 }, ease: 'out' },
    { f: 17, pose: { hop: 0.12, slide: TEAR_STEP * 0.85, tilt: 12, trunkPitch: 12, headPitch: 22, trunkTwist: -6, jaw: 55, pecR_yaw: 30, pecL_yaw: 30, pecR_pitch: 18, pecL_pitch: 18 }, ease: 'in' },
    { f: 20, pose: { support: 1, hop: 0, tilt: 0, slide: TEAR_STEP, trunkPitch: 16, headPitch: 24, trunkTwist: 0, jaw: 0, pecR_pitch: -6, pecL_pitch: -6 } },
    { f: 26, pose: { trunkTwist: 30, headSide: 18, headTwist: 15 } },
    { f: 32, pose: { trunkTwist: -30, headSide: -18, headTwist: -15 } },
    { f: 37, pose: { trunkTwist: 14, headSide: 8, headTwist: 6 } },
    { f: 44, pose: { trunkTwist: 0, headSide: 0, headTwist: 0, jaw: 25, trunkPitch: 6, headPitch: 4, pecR_yaw: 10, pecL_yaw: 10, pecR_pitch: 0, pecL_pitch: 0 } },
    { f: 59, pose: { jaw: 0, trunkPitch: 0, headPitch: 0, pecR_yaw: 0, pecL_yaw: 0 } },
  ],
};

/** 맞거나 막아서 뒤로 밀려나는 거리 (m) */
const HIT_PUSH = 0.14;
const GUARD_PUSH = 0.07;

/**
 * 상단 피격(hit-high): 머리·몸통에 맞음 (상단·중단 공통). 발은 딛은 채 윗몸이 뒤로 젖혀지고 바닥을 밀려난다.
 *   0–3f   맞는 순간: 머리가 뒤로 꺾이고 입이 벌어지며 지느러미가 튄다
 *   1–10f  두 발이 바닥에 붙은 채 HIT_PUSH 만큼 밀려남 (skid)
 *   10–27f 몸통을 다시 앞으로 접으며 가드 자세로 복귀
 * 경직(hitstun)은 기술마다 달라서, 게임은 이 클립을 경직 길이에 맞춰 늘이거나 줄여 재생한다.
 */
const HIT_HIGH: PoseClip = {
  name: 'hit-high',
  length: 28,
  loop: false,
  skid: [1, 10],
  keys: [
    { f: 0, pose: { slide: 0 } },
    { f: 1, pose: { slide: 0 } },
    { f: 3, pose: { headPitch: -38, trunkPitch: -16, headSide: 8, jaw: 26, pecR_pitch: 30, pecL_pitch: 26, pecR_yaw: 26, pecL_yaw: 30, pecR_elbow: 18, pecL_elbow: 14, tailTipSide: 5 }, ease: 'out' },
    { f: 10, pose: { slide: -HIT_PUSH, headPitch: -24, trunkPitch: -10, headSide: 4, jaw: 14, pecR_pitch: 16, pecL_pitch: 14, pecR_elbow: 8, pecL_elbow: 6, tailTipSide: -3 } },
    { f: 18, pose: { slide: -HIT_PUSH, headPitch: 4, trunkPitch: 8, headSide: 0, jaw: 4, pecR_pitch: -4, pecL_pitch: -4, pecR_yaw: 6, pecL_yaw: 6, pecR_elbow: 0, pecL_elbow: 0, tailTipSide: 0 } },
    { f: 27, pose: { slide: -HIT_PUSH, headPitch: 0, trunkPitch: 0, jaw: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_yaw: 0, pecL_yaw: 0 } },
  ],
};

/**
 * 하단 피격(hit-low): 꼬리·신발을 맞아 발이 걷어차인다. 발이 뒤로 빠지며 깡총 뜨고, 윗몸은 앞으로 고꾸라졌다가 버틴다.
 *   0–3f   맞는 순간: 몸이 앞으로 숙고(꼬리가 들림) 발이 뜬다
 *   3–12f  떠서 HIT_PUSH 만큼 밀려남 (공중이라 미끄러짐 없음), 윗몸은 앞으로 접힘
 *   12–16f 신발부터 딛고 꼬리를 내림
 *   16–29f 몸을 펴며 복귀
 */
const HIT_LOW: PoseClip = {
  name: 'hit-low',
  length: 30,
  loop: false,
  keys: [
    { f: 0, pose: {} },
    { f: 3, pose: { support: 0, tilt: 7, hop: 0.03, slide: -HIT_PUSH * 0.15, trunkPitch: 14, headPitch: 10, jaw: 16, pecR_pitch: -22, pecL_pitch: -18, pecR_yaw: 22, pecL_yaw: 18, tailSide: -6, tailTipSide: 9 }, ease: 'out' },
    { f: 8, pose: { tilt: 9, hop: 0.07, slide: -HIT_PUSH * 0.7, trunkPitch: 20, headPitch: 14, jaw: 10, pecR_pitch: -28, pecL_pitch: -26, tailSide: 4, tailTipSide: -6 }, ease: 'in' },
    { f: 12, pose: { tilt: 6, hop: 0, slide: -HIT_PUSH, trunkPitch: 16, headPitch: 8 } },
    { f: 16, pose: { support: 1, tilt: 0, slide: -HIT_PUSH, trunkPitch: 12, headPitch: 4, jaw: 4, pecR_pitch: -10, pecL_pitch: -10, tailSide: 0, tailTipSide: 0 } },
    { f: 29, pose: { slide: -HIT_PUSH, trunkPitch: 0, headPitch: 0, jaw: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_yaw: 0, pecL_yaw: 0 } },
  ],
};

/**
 * 서서 막기(guard-high): 상단·중단을 막는다. 두 가슴지느러미를 얼굴 앞으로 모아 올리고 몸을 웅크린다.
 *   0–3f   가드를 올림 (프록시 가드 — 막는 순간 자세)
 *   4–10f  충격: 지느러미가 살짝 눌리고 GUARD_PUSH 만큼 밀려남 (skid)
 *   10–15f 가드 유지
 *   15–22f 내림
 */
const GUARD_UP = { pecR_yaw: -30, pecL_yaw: -22, pecR_pitch: 34, pecL_pitch: 30, pecR_elbow: 40, pecL_elbow: 36, pecR_elbowYaw: -14, pecL_elbowYaw: -14, trunkPitch: 10, headPitch: 16, trunkTwist: 14 };
const GUARD_HIGH: PoseClip = {
  name: 'guard-high',
  length: 23,
  loop: false,
  skid: [4, 10],
  keys: [
    { f: 0, pose: { slide: 0 } },
    { f: 3, pose: { ...GUARD_UP, slide: 0 } },
    { f: 4, pose: { slide: 0 } },
    { f: 6, pose: { pecR_pitch: 27, pecL_pitch: 24, pecR_elbow: 48, pecL_elbow: 44, trunkPitch: 5, headPitch: 10, trunkTwist: 10 }, ease: 'out' },
    { f: 10, pose: { ...GUARD_UP, slide: -GUARD_PUSH } },
    { f: 15, pose: { slide: -GUARD_PUSH } },
    { f: 22, pose: { pecR_yaw: 0, pecL_yaw: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_elbow: 0, pecL_elbow: 0, pecR_elbowYaw: 0, pecL_elbowYaw: 0, trunkPitch: 0, headPitch: 0, trunkTwist: 0 } },
  ],
};

/**
 * 앉아 막기(guard-low): 하단을 막는다. 몸통·머리를 앞으로 깊이 숙여 웅크리고(주둥이 높이 2.56 → 약 2.0 m),
 * 가슴지느러미를 앞 아래로 내려 꼬리·신발 앞을 가린다.
 * 하단은 앉아야 막을 수 있으므로 앉은 자세(crouch)에서 시작해 앉은 자세로 끝난다 — 서 있다가 막는 순간 일어섰다 다시 앉지 않게
 */
const GUARD_DOWN = { trunkPitch: 38, headPitch: 28, pecR_yaw: -18, pecL_yaw: -18, pecR_pitch: -34, pecL_pitch: -32, pecR_elbow: -10, pecL_elbow: -10, tailSide: 0 };
const GUARD_LOW: PoseClip = {
  name: 'guard-low',
  length: 26,
  loop: false,
  skid: [5, 11],
  keys: [
    { f: 0, pose: { ...GUARD_DOWN, slide: 0 } },
    { f: 5, pose: { slide: 0 } },
    { f: 7, pose: { trunkPitch: 33, headPitch: 22, pecR_pitch: -26, pecL_pitch: -24, pecR_elbow: -2, pecL_elbow: -2 }, ease: 'out' },
    { f: 11, pose: { ...GUARD_DOWN, slide: -GUARD_PUSH } },
    { f: 25, pose: { slide: -GUARD_PUSH } },
  ],
};

/**
 * 앉기(crouch): 아래를 누르고 있는 동안 반복. 앉아 막기와 같은 웅크린 자세에서 숨 쉬듯 조금 들썩인다.
 * 두 점 접지는 그대로라(몸통·머리 굽힘만) 발이 움직이지 않는다.
 */
const CROUCH: PoseClip = {
  name: 'crouch',
  length: 60,
  loop: true,
  keys: [
    { f: 0, pose: { ...GUARD_DOWN } },
    { f: 30, pose: { trunkPitch: 35, headPitch: 25, pecR_pitch: -30, pecL_pitch: -29, pecR_elbow: -6, pecL_elbow: -7 } },
  ],
};

/** 다운에서 뒤로 날아가는 거리 (꼬리 끝 기준, m) */
const DOWN_PUSH = 0.7;

/**
 * 누운 자세: 뒤로 넘어가 배를 카메라(−x, 캐릭터 왼쪽) 쪽으로 보이며 왼쪽 옆구리를 대고 눕는다.
 * 몸이 위아래로 높고 좌우로 좁은 데다 등지느러미가 있어서, 등을 대고 바로 누우면 등지느러미에 얹혀 25 cm 뜬다 → 옆으로 굴러 눕는 것이 안정한 자세다.
 * 바닥 쪽 왼 가슴·배지느러미는 배 쪽으로 접어 넣고(아니면 지느러미가 몸을 받쳐 든다), 위쪽 오른 지느러미는 힘없이 늘어진다.
 * tilt −96, lean −80, tailSide −4 에서 몸통 옆구리(u 0.3 근처)와 꼬리 위 엽 끝이 함께 바닥에 닿는다 (probe 로 맞춤).
 */
const LIE = {
  support: 0, anchorTail: 1, tailSlide: -DOWN_PUSH, hop: 0, tilt: -96, lean: -80,
  headSide: -4, headPitch: 0, trunkPitch: 0, tailSide: -4, tailPitch: 0, tailTipSide: 0,
  pecL_yaw: -35, pecL_pitch: 10, pecL_elbow: 0, pelL_yaw: -30,
  pecR_yaw: 14, pecR_pitch: 18, pecR_elbow: -14, jaw: 10,
};

/**
 * 다운(knockdown): 큰 공격에 맞아 뒤로 날아가 눕는다. 꼬리 끝을 고정점으로 바꿔(anchorTail) 공중 위치를 정한다.
 *   0–3f   맞는 순간 윗몸이 젖혀짐 (발은 아직 딛음)
 *   3–7f   발이 뜸
 *   7–17f  뒤로 젖혀지며 날아감 (정점 0.4 m), 공중에서 옆으로 구르기 시작
 *   17–27f 떨어져 누운 자세로 바닥에 닿음
 *   27–40f 한 번 크게, 한 번 작게 튐 (자세는 그대로라 몸이 바닥에 끌리지 않는다)
 *   40–55f 지느러미·턱이 늘어지며 멈춤
 */
const KNOCKDOWN: PoseClip = {
  name: 'knockdown',
  length: 56,
  loop: false,
  keys: [
    { f: 0, pose: {} },
    { f: 3, pose: { headPitch: -26, trunkPitch: -12, jaw: 26, pecR_pitch: 34, pecL_pitch: 30, pecR_yaw: 30, pecL_yaw: 34, pecR_elbow: 20, pecL_elbow: 16 } },
    { f: 7, pose: { support: 0, anchorTail: 1, hop: 0.05, tailSlide: -DOWN_PUSH * 0.12, tilt: -14, headPitch: -20, trunkPitch: -10 }, ease: 'out' },
    { f: 17, pose: { hop: 0.42, tailSlide: -DOWN_PUSH * 0.6, tilt: -62, lean: -30, headPitch: -8, trunkPitch: -4, tailPitch: -8, jaw: 30, pecR_pitch: 40, pecL_pitch: 20, pecR_yaw: 40, pecL_yaw: 10, tailSide: -8, tailTipSide: 10 }, ease: 'in' },
    { f: 27, pose: { ...LIE, jaw: 22, pecR_pitch: 30, pecR_yaw: 24 } },
    { f: 32, pose: { hop: 0.09, headSide: -8, tailSide: -8, tailTipSide: -6, pecR_pitch: 40, jaw: 26 }, ease: 'out' },
    { f: 37, pose: { hop: 0, headSide: -4, tailSide: -4, tailTipSide: 0, pecR_pitch: 22 }, ease: 'in' },
    { f: 40, pose: { hop: 0.022, pecR_pitch: 28, jaw: 18 }, ease: 'out' },
    { f: 43, pose: { hop: 0, pecR_pitch: 20 }, ease: 'in' },
    { f: 55, pose: { ...LIE } },
  ],
};

/**
 * 누워 있기(down): 다운 뒤 기상 전까지 반복. 몸은 그대로 두고(바닥에 끌리지 않게) 위쪽 지느러미·꼬리 끝·턱만 힘없이 움직인다.
 */
const DOWN: PoseClip = {
  name: 'down',
  length: 60,
  loop: true,
  keys: [
    { f: 0, pose: { ...LIE } },
    { f: 30, pose: { pecR_pitch: 24, pecR_elbow: -20, jaw: 14, tailTipSide: 3 } },
  ],
};

/**
 * 기상(wake-up): 꼬리로 바닥을 쳐 몸을 굴려 등을 대고, 꼬리 끝을 축으로 몸을 세워 두 점으로 딛는다.
 *   0–8f   예비: 꼬리를 감고 지느러미로 바닥을 짚음
 *   8–16f  꼬리로 바닥을 침 → 살짝 뜨며 등 쪽으로 구름 (뜬 채 구르므로 몸이 바닥에 끌리지 않는다)
 *   16–30f 꼬리 끝으로 딛고 그 점을 축으로 몸을 세움
 *   30–36f 신발을 딛음 (support 1), 반동
 *   36–47f 가드 자세로
 * 다운에서 밀려난 자리(꼬리 끝 −DOWN_PUSH)에서 일어나므로 신발 목표(slide)도 같은 거리로 둔다.
 */
const WAKE_UP: PoseClip = {
  name: 'wake-up',
  length: 48,
  loop: false,
  keys: [
    { f: 0, pose: { ...LIE, slide: -DOWN_PUSH } },
    { f: 8, pose: { tailSide: -14, tailTipSide: -10, pecR_pitch: -10, pecR_yaw: 30, pecR_elbow: 0, jaw: 4 } },
    { f: 12, pose: { hop: 0.12, tilt: -92, lean: -45, tailSide: 10, tailTipSide: 8, pecR_pitch: -30, pecL_pitch: 20 }, ease: 'out' },
    { f: 17, pose: { hop: 0, tilt: -80, lean: -10, tailSide: 2, tailTipSide: 0, headSide: 0, pecL_yaw: 10, pelL_yaw: 0 }, ease: 'in' },
    { f: 28, pose: { tilt: -8, lean: 0, trunkPitch: 14, headPitch: -6, tailSide: 0, pecR_yaw: 24, pecL_yaw: 24, pecR_pitch: 10, pecL_pitch: 10, pecR_elbow: 0, jaw: 0 }, ease: 'out' },
    { f: 31, pose: { support: 1, anchorTail: 1, tilt: 0, trunkPitch: 12, headPitch: -6 } },
    { f: 36, pose: { anchorTail: 0, trunkPitch: 6, headPitch: -2 } },
    { f: 47, pose: { trunkPitch: 0, headPitch: 0, pecR_yaw: 0, pecL_yaw: 0, pecR_pitch: 0, pecL_pitch: 0 } },
  ],
};

/**
 * 필살기 잠수 강습(dive-assault): 바닥을 물처럼 써서 머리부터 잠수 → 등지느러미만 내놓고 다가감 → 상대 앞에서 수직으로 솟구치며 물기.
 * 바닥 아래는 뷰어·게임이 그리지 않는다 (바닥 클리핑). sink = 가장 낮은 점 기준 잠긴 깊이.
 *   0–8f   움츠림
 *   8–13f  앞으로 작게 뜀
 *   13–19f 머리부터 바닥에 꽂힘 → 25f 에 꼬리·신발까지 잠김
 *   25–27f (바닥 아래) 수평으로 돌아눕기 — 'hold' 로 한 번에 바꿔 중간 자세가 바닥 위로 비치지 않게 한다
 *   27–52f 등지느러미만 바닥 위 약 20 cm 로 내놓고 꼬리를 좌우로 저으며 다가감
 *   52–57f 지느러미가 잠기고 (바닥 아래) 수직으로 섬 — 이때 신발 목표를 머리가 있던 자리 밑으로 옮긴다
 *   57–63f 바닥을 뚫고 수직으로 솟구치며 입을 벌림, 63–66f 턱을 닫음 (판정)
 *   66–80f 떨어져 두 점으로 착지, 95f 까지 복귀
 * 수평일 때 등지느러미는 신발보다 약 1.46 m 앞, 수직일 때 주둥이는 신발보다 약 0.14 m 앞 (probe) — 솟는 자리가 지느러미가 멈춘 자리와 맞게 slide 를 정했다.
 */
/** 잠수 중 신발 목표 위치: 지느러미가 나타날 때 / 멈출 때, 솟구칠 때 */
const DIVE_FIN_START = 0.33;
const DIVE_FIN_END = 1.33;
const DIVE_RISE = 2.25;
/** 수평으로 헤엄치는 자세. 꼬리를 아래로 굽혀(tailPitch +) 꼬리 위 엽 끝을 몸통 높이 아래로 내린다 — 안 굽히면 꼬리 끝이 등지느러미보다 높이 솟아 두 지느러미가 보인다 */
const SWIM = { pecR_yaw: 20, pecL_yaw: 20, pecR_pitch: -6, pecL_pitch: -6, pecR_elbow: -6, pecL_elbow: -6, trunkPitch: 0, headPitch: 0, jaw: 0, tailPitch: 25, tailTipPitch: 20 };
/** 등지느러미 끝이 바닥 위 0.22 m 로 나오는 깊이 (SWIM, tilt 82 에서 지느러미 끝 1.315 m, 등 0.985 m — probe) */
const FIN_SINK = 1.095;
const DIVE_ASSAULT: PoseClip = {
  name: 'dive-assault',
  length: 96,
  loop: false,
  events: [
    { f: 21, type: 'splash', socket: 'dorsal-tip' },
    { f: 30, type: 'wake', socket: 'dorsal-tip', until: 54, every: 3 },
    { f: 60, type: 'splash', socket: 'snout' },
  ],
  keys: [
    { f: 0, pose: {} },
    { f: 8, pose: { trunkPitch: 14, headPitch: -6, pecR_pitch: -20, pecL_pitch: -20, pecR_yaw: 10, pecL_yaw: 10 } },
    { f: 13, pose: { support: 0, hop: 0.22, tilt: 35, slide: 0, trunkPitch: 6, headPitch: 10, pecR_pitch: 10, pecL_pitch: 10, pecR_yaw: -10, pecL_yaw: -10 }, ease: 'out' },
    { f: 19, pose: { hop: 0, tilt: 115, slide: -0.6, sink: 0.5, headPitch: 6, tailSide: 6 }, ease: 'in' },
    { f: 25, pose: { tilt: 150, slide: 0.25, sink: 2.9, tailSide: -8 }, ease: 'hold' },
    { f: 27, pose: { ...SWIM, tilt: 82, slide: DIVE_FIN_START, sink: FIN_SINK + 0.4, tailSide: 0, tailTipSide: 0 } },
    { f: 31, pose: { sink: FIN_SINK, slide: DIVE_FIN_START + 0.1, tailSide: 12, tailTipSide: -8 }, ease: 'out' },
    { f: 37, pose: { slide: DIVE_FIN_START + 0.36, tailSide: -14, tailTipSide: 10, trunkSide: 3 } },
    { f: 43, pose: { slide: DIVE_FIN_START + 0.64, tailSide: 14, tailTipSide: -10, trunkSide: -3 } },
    { f: 49, pose: { slide: DIVE_FIN_END - 0.07, tailSide: -12, tailTipSide: 8, trunkSide: 2 } },
    { f: 52, pose: { slide: DIVE_FIN_END, sink: FIN_SINK, tailSide: 0, tailTipSide: 0, trunkSide: 0 } },
    { f: 55, pose: { sink: FIN_SINK + 0.5 }, ease: 'hold' },
    { f: 57, pose: { tilt: -4, slide: DIVE_RISE, sink: 2.9, tailPitch: 0, tailTipPitch: 0, trunkPitch: -4, headPitch: -12, jaw: 45, pecR_pitch: 30, pecL_pitch: 30, pecR_yaw: 30, pecL_yaw: 30 } },
    { f: 63, pose: { sink: 0, hop: 0.38, jaw: 58, headPitch: -6 }, ease: 'out' },
    { f: 66, pose: { hop: 0.46, jaw: 0, headPitch: 22, trunkPitch: 8 }, ease: 'out' },
    { f: 71, pose: { hop: 0.42, headPitch: 18 }, ease: 'in' },
    { f: 80, pose: { support: 1, hop: 0, tilt: 0, trunkPitch: 14, headPitch: -6, pecR_pitch: -10, pecL_pitch: -10, pecR_yaw: 20, pecL_yaw: 20 } },
    { f: 95, pose: { trunkPitch: 0, headPitch: 0, pecR_pitch: 0, pecL_pitch: 0, pecR_yaw: 0, pecL_yaw: 0, pecR_elbow: 0, pecL_elbow: 0 } },
  ],
};

export const CLIPS: Record<string, PoseClip> = {
  idle: IDLE,
  walk: WALK,
  'walk-back': WALK_BACK,
  dash: DASH,
  jump: jump('jump', 0),
  'jump-forward': jump('jump-forward', 0.9),
  'fin-jab': FIN_JAB,
  'tail-sweep': TAIL_SWEEP,
  'shoe-kick': SHOE_KICK,
  'rising-bite': RISING_BITE,
  'twist-tear': TWIST_TEAR,
  'hit-high': HIT_HIGH,
  'hit-low': HIT_LOW,
  'guard-high': GUARD_HIGH,
  'guard-low': GUARD_LOW,
  crouch: CROUCH,
  knockdown: KNOCKDOWN,
  down: DOWN,
  'wake-up': WAKE_UP,
  'dive-assault': DIVE_ASSAULT,
};

/**
 * 공격 판정. 발생·지속·회복은 moveFrames, 이득 프레임은 frameAdvantage 로 계산된다. 판정 높이 기준은 docs/04-rig-animation.md
 * 경직은 이득 프레임을 보고 정했다 (괄호 = 맞았을 때 / 막았을 때):
 *   지느러미 잽 (+2 / −1) 빠르고 안전한 견제, 신발 킥 (+3 / −4), 솟구쳐 물기 (+2 / −10, 막히면 반격당함),
 *   꼬리 쓸기 (다운 / −13, 하단 쓸기는 막히면 크게 불리), 비틀어 물어뜯기 1타 경직이 2타까지 이어지고 2타 다운 (다운 / −12)
 */
export const MOVES: Record<string, MoveSpec> = {
  'fin-jab': { clip: FIN_JAB, hitboxes: [{ socket: 'pecR-tip', radius: 0.12, frames: [8, 10], height: 'high', damage: 8, hitstun: 19, blockstun: 16 }] },
  'tail-sweep': { clip: TAIL_SWEEP, hitboxes: [{ socket: 'tail-tip', radius: 0.18, frames: [14, 18], height: 'low', damage: 14, hitstun: 0, blockstun: 18, knockdown: true }] },
  'shoe-kick': { clip: SHOE_KICK, hitboxes: [{ socket: 'shoe', radius: 0.2, frames: [19, 23], height: 'mid', damage: 18, hitstun: 33, blockstun: 26 }] },
  'rising-bite': { clip: RISING_BITE, hitboxes: [{ socket: 'bite', radius: 0.2, frames: [17, 19], height: 'high', damage: 16, hitstun: 32, blockstun: 20 }] },
  'twist-tear': {
    clip: TWIST_TEAR,
    hitboxes: [
      { socket: 'bite', radius: 0.2, frames: [18, 20], height: 'mid', damage: 10, hitstun: 14, blockstun: 12 },
      { socket: 'bite', radius: 0.22, frames: [27, 33], height: 'mid', damage: 20, hitstun: 0, blockstun: 20, knockdown: true },
    ],
  },
  // 필살기: 잠긴 동안(17–58f) 무적. 바닥에서 솟구치는 물기라 중단 (앉아 막기로 못 막음), 막히면 크게 불리
  'dive-assault': {
    clip: DIVE_ASSAULT,
    invuln: [17, 58],
    hitboxes: [{ socket: 'bite', radius: 0.28, frames: [60, 65], height: 'mid', damage: 30, hitstun: 0, blockstun: 22, knockdown: true }],
  },
};

/** 피격·가드 반응 클립 (reactionFor 에 넘긴다) */
export const REACTIONS: ReactionClips = {
  hitHigh: 'hit-high',
  hitLow: 'hit-low',
  guardHigh: 'guard-high',
  guardLow: 'guard-low',
  knockdown: 'knockdown',
  down: 'down',
  wakeUp: 'wake-up',
};
