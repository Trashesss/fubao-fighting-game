import type { CharacterDef } from '../../fighting/fighter';
import { bukangiAnimator, createBukangiModel } from './createBukangiModel';
import { CLIPS, MOVES, REACTIONS } from './moves';
import { NEUTRAL } from './sharkAnimator';

/** 2P 운동화 색 (같은 캐릭터끼리 붙을 때 구분) */
const ALT_SNEAKER = 0xe0533a;

/** 부캉이를 게임(연습 모드)에 내놓는 정의 */
export const BUKANGI: CharacterDef = {
  name: '부캉이',
  create(variant) {
    // 게임용 해상도: 서브디비전 3단계 (뷰어 4단계의 1/4, 화면 높이 절반 크기에서는 차이가 안 보인다)
    const model = createBukangiModel({ levels: 3, sneakerColor: variant ? ALT_SNEAKER : undefined });
    return { model, body: bukangiAnimator(model) };
  },
  neutral: NEUTRAL,
  clips: CLIPS,
  moves: MOVES,
  reactions: REACTIONS,
  basics: { idle: 'idle', walk: 'walk', walkBack: 'walk-back', crouch: 'crouch', dash: 'dash', jump: 'jump', jumpForward: 'jump-forward' },
  buttons: { b1: 'fin-jab', b2: 'shoe-kick', b3: 'tail-sweep', b4: 'rising-bite', b5: 'twist-tear', b6: 'dive-assault' },
  // 몸통 캡슐 반지름(약 0.27 m)보다 조금 넓게. 운동화는 몸통 가운데보다 0.44 m 앞까지 나와 있어서 따로 막는다 (킥으로 들면 빠진다)
  push: { hurtbox: 'trunk', halfWidth: 0.3, ground: ['shoe'] },
  maxHp: 170,
};
