import { Group, Object3D, Vector3 } from 'three';
import { eventFrames, samplePose, type PoseChannels, type PoseClip } from '../animation/poseClip';
import { activeHitboxes, capsuleSegment, hurtboxesActive, reactionFor, type Guard, type HitboxSpec, type Hurtbox, type MoveSpec, type ReactionClips } from './frameData';

/**
 * 게임 속 캐릭터 한 명: 입력 → 동작 선택, 클립 재생, 경직, 다운·기상. 캐릭터를 모른다 (CharacterDef 로 받는다).
 *
 * 시간은 60fps 틱. 한 틱에 클립 한 프레임을 보인다. 공격을 시작한 틱이 0 프레임이고, 길이 L 인 클립은 L 틱 뒤에 다시 움직일 수 있다.
 * 맞으면 다음 틱부터 반응 클립을 경직(stun) 틱 동안 재생하고 stun 틱 뒤에 움직일 수 있다 — frameData.frameAdvantage 의 정의와 같다.
 * 반응 클립은 길이가 정해져 있어서 경직 길이에 맞춰 늘이거나 줄여 재생한다 (마지막 프레임이 경직 마지막 틱에 온다).
 *
 * 위치: 싸움은 월드 x 축 위에서 한다. x = 모델 원점, facing = 바라보는 방향(+1 = +x).
 * 클립마다 이동 채널(slide)이 0 에서 시작하므로, 동작이 바뀔 때 딛는 발(groundAnchor)이 제자리에 남도록 x 를 넘겨준다.
 * 바뀌는 순간 자세가 튀지 않게 앞 자세에서 몇 틱 섞는다 (발 위치는 넘겨준 만큼 고쳐서 섞는다).
 */
export type AttackButton = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6';
export const ATTACK_BUTTONS: AttackButton[] = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

export interface FighterInput {
  /** 화면 기준 왼쪽·오른쪽 (앞·뒤는 바라보는 방향으로 바꾼다) */
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** 이 틱에 새로 누른 버튼 */
  pressed: AttackButton[];
}
export const NO_INPUT: FighterInput = { left: false, right: false, up: false, down: false, pressed: [] };

/** 캐릭터 애니메이터가 게임에 내놓는 것 */
export interface FighterBody {
  apply(c: PoseChannels): void;
  readonly hurtboxes: Hurtbox[];
  readonly sockets: Map<string, Object3D>;
  /** 딛는 발의 바닥 위 위치 (캐릭터 좌표, y = 0) */
  groundAnchor(out?: Vector3): Vector3;
}

export interface CharacterDef {
  name: string;
  /** 게임용 모델과 몸. variant = 같은 캐릭터끼리 붙을 때 2P 색 */
  create(variant: number): { model: Group; body: FighterBody };
  neutral: PoseChannels;
  clips: Record<string, PoseClip>;
  moves: Record<string, MoveSpec>;
  reactions: ReactionClips;
  /** 기본 동작 클립 이름 */
  basics: { idle: string; walk: string; walkBack: string; crouch: string; dash: string; jump: string; jumpForward: string };
  /** 버튼 → 기술 이름 */
  buttons: Partial<Record<AttackButton, string>>;
  /**
   * 밀어내기: 기준 피격 캡슐 이름(가운데 x)과 반폭 (m) — 두 캐릭터가 겹치지 않게.
   * ground = 바닥에 닿아 있는 동안 상대의 같은 캡슐과 x 범위가 겹치지 않게 하는 피격 캡슐 (발).
   * 몸통 반폭만으로는 가까이 붙었을 때 앞으로 내민 발끼리 파고들고, 반폭을 발 길이만큼 넓히면 몸 가운데를 노리는 기술이 닿지 않는다
   */
  push: { hurtbox: string; halfWidth: number; ground?: string[] };
  maxHp: number;
}

/** neutral = 대기·걷기·앉기(반복, 언제든 움직임), action = 공격·대시·점프(끝까지), stun = 피격·가드 경직, down = 다운 → 누움 → 기상 */
export type Phase = 'neutral' | 'action' | 'stun' | 'down';

/** 입력 버퍼: 움직일 수 없는 동안 누른 버튼을 이만큼 기억했다가 움직일 수 있게 되면 낸다 */
const BUFFER = 6;
/** 앞을 두 번 두드려 대시: 두 번째 누름까지 */
const DASH_WINDOW = 12;
/** 다운 뒤 누워 있는 시간 (틱) */
const DOWN_TIME = 40;
/** 발 캡슐 아랫면이 이 높이(m) 아래면 바닥에 닿은 것으로 본다 */
const GROUND_TOUCH = 0.05;
/** 자세 섞기 틱 수 */
export const BLEND = { move: 5, attack: 3, react: 2 };

const fold = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

export class Fighter {
  phase: Phase = 'neutral';
  clip: PoseClip;
  /** 지금 클립에서 지난 틱 수 (보이는 프레임은 frame()) */
  t = 0;
  /** 경직 틱 수 (phase = stun) */
  stun = 0;
  /** 막은 경직인지 (막은 경직 중에는 계속 막을 수 있다) */
  blocked = false;
  move: MoveSpec | null = null;
  /** 이번 기술에서 이미 맞힌 판정 (판정 하나는 한 번만 맞는다) */
  readonly hitDone = new Set<HitboxSpec>();
  hp: number;
  /** 지금 적용된 채널 */
  pose: PoseChannels;
  /** 이 틱에 움직일 수 있었는지 (control 에서 정한다 — 이득 프레임 측정용) */
  freeNow = true;
  /** 상대 공격 높이를 보고 알맞게 막는다 (연습 모드 상대 설정) */
  autoGuard = false;
  holdBack = false;
  holdDown = false;
  private snapshot: PoseChannels | null = null;
  private blendLeft = 0;
  private blendTotal = 0;
  private buffer: { button: AttackButton; age: number }[] = [];
  private prevFwd = false;
  private sinceFwdTap = Infinity;
  private dashAge = Infinity;

  constructor(
    readonly def: CharacterDef,
    readonly model: Group,
    readonly body: FighterBody,
    public x: number,
    public facing: 1 | -1,
    /** 왼쪽을 보는 쪽은 좌우를 뒤집어 그린다 (두 캐릭터 모두 같은 옆구리가 카메라를 본다) */
    readonly mirror = true,
    /** 효과 이벤트 (바닥 물결 등): 월드 x·z */
    private readonly onEvent: (type: string, x: number, z: number) => void = () => {},
  ) {
    this.hp = def.maxHp;
    this.clip = def.clips[def.basics.idle];
    this.pose = { ...def.neutral };
    this.place();
    this.applyPose();
  }

  /** 처음 상태로 (연습 모드 위치 초기화·자동 검사) */
  reset(x: number, facing: 1 | -1): void {
    this.phase = 'neutral';
    this.clip = this.def.clips[this.def.basics.idle];
    this.t = 0;
    this.stun = 0;
    this.blocked = false;
    this.move = null;
    this.hitDone.clear();
    this.hp = this.def.maxHp;
    this.pose = { ...this.def.neutral };
    this.snapshot = null;
    this.blendLeft = 0;
    this.buffer = [];
    this.prevFwd = false;
    this.sinceFwdTap = Infinity;
    this.dashAge = Infinity;
    this.freeNow = true;
    this.x = x;
    this.facing = facing;
    this.place();
    this.applyPose();
  }

  /** 보이는 클립 프레임 (경직 반응은 경직 길이에 맞춰 늘이거나 줄인다) */
  frame(): number {
    const L = this.clip.length;
    if (this.phase === 'stun') return Math.min(L - 1, Math.max(0, this.t) * ((L - 1) / Math.max(1, this.stun - 1)));
    return this.clip.loop ? this.t : Math.min(Math.max(0, this.t), L - 1);
  }

  free(): boolean {
    if (this.phase === 'neutral') return true;
    if (this.phase === 'action') return this.t >= this.clip.length;
    if (this.phase === 'stun') return this.t >= this.stun;
    return this.clip.name === this.def.reactions.wakeUp && this.t >= this.clip.length;
  }

  /** 맞을 몸이 있는지 (다운·누움·기상은 맞지 않는다, 기술의 무적 구간) */
  hurtActive(): boolean {
    if (this.phase === 'down') return false;
    if (this.phase === 'action' && this.move) return hurtboxesActive(this.move, this.t);
    return true;
  }

  /** 지금 켜진 공격 판정 */
  activeHits(): HitboxSpec[] {
    if (this.phase !== 'action' || !this.move) return [];
    return activeHitboxes(this.move, this.t).filter((h) => !this.hitDone.has(h));
  }

  airborne(): boolean {
    const b = this.def.basics;
    return this.phase === 'action' && (this.clip.name === b.jump || this.clip.name === b.jumpForward) && (this.pose.hop ?? 0) > 0.02;
  }

  sunk(): boolean {
    return (this.pose.sink ?? 0) > 1e-4;
  }

  /** 밀어내기 기준 가운데 (월드 x) */
  center(): number {
    const box = this.body.hurtboxes.find((b) => b.name === this.def.push.hurtbox)!;
    const [a, b] = capsuleSegment(box);
    return (a.x + b.x) / 2;
  }

  /** 바닥에 닿은 발 캡슐(push.ground)의 월드 x 범위. 발을 들고 있으면 null */
  groundSpan(): [number, number] | null {
    let lo = Infinity;
    let hi = -Infinity;
    for (const box of this.body.hurtboxes) {
      if (!this.def.push.ground?.includes(box.name)) continue;
      const [a, b] = capsuleSegment(box);
      if (Math.min(a.y, b.y) - box.radius > GROUND_TOUCH) continue;
      lo = Math.min(lo, a.x - box.radius, b.x - box.radius);
      hi = Math.max(hi, a.x + box.radius, b.x + box.radius);
    }
    return lo < hi ? [lo, hi] : null;
  }

  /** 1) 시간 진행 */
  advance(): void {
    this.t++;
    const L = this.clip.length;
    if (this.phase === 'neutral' && this.clip.loop && this.t >= L) {
      // 반복이 넘어가면 반복 한 번의 전진 거리를 넘겨준다 (다음 반복은 slide 0 에서 시작)
      this.t -= L;
      this.x += this.facing * (this.clip.rootMotion ?? 0);
    }
    if (this.phase === 'down') {
      const r = this.def.reactions;
      if (this.clip.name === r.knockdown && this.t >= L) this.start(r.down, 'down', 0);
      else if (this.clip.name === r.down && this.t >= DOWN_TIME) this.start(r.wakeUp, 'down', 0);
    }
  }

  /** 2) 입력 → 다음 동작 (움직일 수 있을 때만) */
  control(input: FighterInput): void {
    const fwd = this.facing > 0 ? input.right : input.left;
    const back = this.facing > 0 ? input.left : input.right;
    this.holdBack = back;
    this.holdDown = input.down;
    for (const b of this.buffer) b.age++;
    this.buffer = this.buffer.filter((b) => b.age <= BUFFER);
    for (const button of input.pressed) if (this.def.buttons[button]) this.buffer.push({ button, age: 0 });
    this.sinceFwdTap++;
    this.dashAge++;
    if (fwd && !this.prevFwd) {
      if (this.sinceFwdTap <= DASH_WINDOW) this.dashAge = 0;
      this.sinceFwdTap = 0;
    }
    this.prevFwd = fwd;

    this.freeNow = this.free();
    if (!this.freeNow) return;
    const basics = this.def.basics;
    const pressed = this.buffer.shift();
    if (pressed) {
      this.buffer = [];
      const name = this.def.buttons[pressed.button]!;
      this.start(name, 'action', BLEND.attack);
      return;
    }
    if (this.dashAge <= BUFFER) {
      this.dashAge = Infinity;
      this.start(basics.dash, 'action', BLEND.move);
      return;
    }
    if (input.up) {
      this.start(fwd ? basics.jumpForward : basics.jump, 'action', BLEND.move);
      return;
    }
    const target = input.down ? basics.crouch : fwd ? basics.walk : back ? basics.walkBack : basics.idle;
    if (this.phase !== 'neutral' || this.clip.name !== target) this.start(target, 'neutral', BLEND.move);
  }

  /**
   * 동작 시작. t0 = −1 이면 다음 틱(advance 뒤)에 0 프레임을 보인다 (맞은 다음 틱부터 경직).
   * 딛는 발이 제자리에 남도록 x 를 넘겨주고, 앞 자세에서 blend 틱 동안 섞는다
   */
  start(name: string, phase: Phase, blend: number, t0 = 0, stun = 0): void {
    const clip = this.def.clips[name];
    const before = this.body.groundAnchor(new Vector3());
    this.body.apply(samplePose(clip, 0, this.def.neutral));
    const delta = before.z - this.body.groundAnchor(new Vector3()).z;
    this.x += this.facing * delta;
    this.snapshot = blend > 0 ? { ...this.pose, slide: (this.pose.slide ?? 0) - delta, tailSlide: (this.pose.tailSlide ?? 0) - delta, turn: fold(this.pose.turn ?? 0) } : null;
    this.blendLeft = this.blendTotal = blend;
    this.clip = clip;
    this.phase = phase;
    this.t = t0;
    this.stun = stun;
    this.move = phase === 'action' ? (this.def.moves[name] ?? null) : null;
    this.hitDone.clear();
    if (phase !== 'stun') this.blocked = false;
    // 섞기 전 자세로 되돌려 둔다 (같은 틱에 판정·밀어내기가 이 자세를 본다)
    this.place();
    this.body.apply(this.pose);
  }

  /** 3) 자세 적용 + 효과 이벤트 */
  applyPose(): void {
    const f = this.frame();
    let pose = samplePose(this.clip, f, this.def.neutral);
    if (this.snapshot && this.blendLeft > 0) {
      const w = 1 - this.blendLeft / (this.blendTotal + 1);
      const s = w * w * (3 - 2 * w);
      const from = this.snapshot;
      pose = Object.fromEntries(Object.keys(pose).map((k) => [k, (from[k] ?? pose[k]) + (pose[k] - (from[k] ?? pose[k])) * s]));
      this.blendLeft--;
    }
    this.pose = pose;
    this.place();
    this.body.apply(pose);
    if (this.phase === 'action' && Number.isInteger(f) && f === this.t) {
      for (const e of this.clip.events ?? []) {
        if (!eventFrames(e).includes(f)) continue;
        const p = this.body.sockets.get(e.socket)!.getWorldPosition(new Vector3());
        this.onEvent(e.type, p.x, p.z);
      }
    }
  }

  /** 모델을 x·facing 에 놓는다 (+z 가 앞인 모델을 x 축 위로 돌린다) */
  place(): void {
    this.model.position.set(this.x, 0, 0);
    this.model.rotation.set(0, (this.facing * Math.PI) / 2, 0);
    this.model.scale.set(this.mirror && this.facing < 0 ? -1 : 1, 1, 1);
    this.model.updateMatrixWorld(true);
  }

  /** 바라보는 방향 바꾸기 (몸 가운데는 제자리) */
  turnTo(facing: 1 | -1): void {
    if (facing === this.facing) return;
    const before = this.center();
    this.facing = facing;
    this.place();
    this.x += before - this.center();
    this.place();
  }

  /** 막을 수 있으면 막는 자세 (대기·뒤로 걷기·앉기, 막은 경직 중) */
  guardFor(hit: HitboxSpec): Guard | null {
    const canGuard = (this.phase === 'neutral' && this.clip.name !== this.def.basics.walk) || (this.phase === 'stun' && this.blocked);
    if (!canGuard) return null;
    if (this.autoGuard) return hit.height === 'low' ? 'low' : 'high';
    if (!this.holdBack) return null;
    return this.holdDown ? 'low' : 'high';
  }

  /** 맞음·막음 처리. 반환: 막았는지, 다운인지 */
  react(hit: HitboxSpec, attackerX: number): { blocked: boolean; knockdown: boolean } {
    // 뒤에서 맞으면 때린 쪽을 보고 반응한다 (밀려나는 방향이 맞게)
    const toward = attackerX >= this.center() ? 1 : -1;
    this.turnTo(toward);
    const guard = this.guardFor(hit);
    const r = reactionFor(hit, guard, this.def.reactions);
    const knockdown = !r.blocked && (!!hit.knockdown || this.airborne());
    if (!r.blocked) this.hp = Math.max(0, this.hp - hit.damage);
    if (knockdown) this.start(this.def.reactions.knockdown, 'down', BLEND.react, -1);
    else {
      this.start(r.clip, 'stun', BLEND.react, -1, r.stun);
      this.blocked = r.blocked;
    }
    return { blocked: r.blocked, knockdown };
  }
}
