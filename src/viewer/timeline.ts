import { CapsuleGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3, type Object3D, type Scene } from 'three';
import { FPS, eventFrames, samplePose, type PoseClip, type PoseChannels } from '../animation/poseClip';
import { activeHitboxes, capsuleSegment, hurtboxesActive, moveFrames, type Hurtbox, type MoveSpec } from '../fighting/frameData';
import { RippleField, type RippleType } from '../effects/ripples';

/**
 * 뷰어 타임라인: 클립 재생·일시정지·한 프레임씩 넘기기, 판정 표시 (피격 캡슐 = 파랑, 공격 판정 = 빨강, 지속 프레임에만).
 * 재생은 60fps 고정 스텝 (격투게임과 같은 시간 단위).
 * 반복 클립에 rootMotion 이 있으면 반복마다 캐릭터를 앞으로 옮기고 4번마다 제자리로 돌린다.
 * 반복하지 않는 클립은 끝에서 HOLD 프레임 멈췄다가 처음부터 다시 재생한다 (미리보기용).
 * 클립 효과 이벤트(바닥 물결)는 클립을 고를 때 이벤트 프레임마다 자세를 한 번 적용해 소켓 위치를 미리 구해 두고, 프레임 나이로 그린다.
 * 무적 구간(invuln)에는 피격 캡슐을 숨긴다.
 */
const MAX_LOOPS = 4;
const HOLD = 40;
export interface Animated {
  apply(c: PoseChannels): void;
  hurtboxes: Hurtbox[];
  sockets: Map<string, Object3D>;
}

export class Timeline {
  frame = 0;
  playing = true;
  private acc = 0;
  private loops = 0;
  private held = 0;
  private readonly basePosition: Vector3;
  private readonly boxes = new Group();
  private readonly hits = new Group();
  private readonly ripples = new RippleField();
  private emissions: { type: RippleType; f: number; x: number; z: number }[] = [];
  private readonly hitMaterial = new MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly bar: HTMLDivElement;
  private readonly label: HTMLSpanElement;
  private readonly slider: HTMLInputElement;
  private readonly playButton: HTMLButtonElement;

  constructor(
    private readonly target: Animated,
    private readonly clips: Record<string, PoseClip>,
    private clip: PoseClip,
    private readonly defaults: PoseChannels,
    scene: Scene,
    private readonly mover: Object3D,
    private readonly moves: Record<string, MoveSpec> = {},
  ) {
    this.basePosition = mover.position.clone();
    this.boxes.name = 'debug-boxes';
    this.boxes.visible = false;
    const hurt = new MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.28, depthWrite: false, });
    for (const box of target.hurtboxes) {
      // 캡슐 양끝 소켓은 서로 다른 척추 뼈에 붙어 있지만 굽혀도 길이는 거의 같으므로 지금 길이로 한 번 만든다
      const [pa, pb] = capsuleSegment(box);
      const m = new Mesh(new CapsuleGeometry(box.radius, pa.distanceTo(pb), 6, 16), hurt);
      m.userData.box = box;
      m.renderOrder = 10;
      this.boxes.add(m);
    }
    this.hits.name = 'debug-hits';
    this.boxes.add(this.hits);
    scene.add(this.boxes);
    scene.add(this.ripples);

    this.bar = document.createElement('div');
    this.bar.id = 'timeline';
    const btn = (text: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', onClick);
      this.bar.appendChild(b);
      return b;
    };
    const select = document.createElement('select');
    for (const name of Object.keys(clips)) select.add(new Option(name, name));
    select.value = clip.name;
    select.addEventListener('change', () => this.setClip(select.value));
    this.bar.appendChild(select);
    this.playButton = btn('❚❚', () => this.setPlaying(!this.playing));
    btn('◀', () => this.step(-1));
    btn('▶', () => this.step(1));
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.addEventListener('input', () => {
      this.setPlaying(false);
      this.frame = Number(this.slider.value);
      this.apply();
    });
    this.bar.appendChild(this.slider);
    this.label = document.createElement('span');
    this.bar.appendChild(this.label);
    btn('판정', () => (this.boxes.visible = !this.boxes.visible));
    document.body.appendChild(this.bar);
    this.setClip(clip.name);
  }

  setClip(name: string): void {
    this.clip = this.clips[name];
    this.frame = 0;
    this.loops = 0;
    this.held = 0;
    this.slider.max = String(this.clip.length - 1);
    // 효과 이벤트 위치 (그 프레임 자세의 소켓 바닥 위 위치)
    this.emissions = [];
    for (const e of this.clip.events ?? []) {
      for (const f of eventFrames(e)) {
        this.mover.position.copy(this.basePosition);
        this.mover.updateMatrixWorld(true);
        this.target.apply(samplePose(this.clip, f, this.defaults));
        const p = this.target.sockets.get(e.socket)!.getWorldPosition(new Vector3());
        this.emissions.push({ type: e.type as RippleType, f, x: p.x, z: p.z });
      }
    }
    // 이 기술의 공격 판정 구 (지속 프레임에만 보인다)
    for (const m of [...this.hits.children] as Mesh[]) {
      m.geometry.dispose();
      this.hits.remove(m);
    }
    for (const h of this.moves[name]?.hitboxes ?? []) {
      const m = new Mesh(new SphereGeometry(h.radius, 20, 12), this.hitMaterial);
      m.userData.hit = h;
      m.renderOrder = 11;
      this.hits.add(m);
    }
    this.apply();
  }

  setPlaying(on: boolean): void {
    this.playing = on;
    this.playButton.textContent = on ? '❚❚' : '▶︎';
  }

  showBoxes(on: boolean): void {
    this.boxes.visible = on;
  }

  step(d: number): void {
    this.setPlaying(false);
    this.frame = (this.frame + d + this.clip.length) % this.clip.length;
    this.apply();
  }

  update(dt: number): void {
    if (!this.playing) return;
    this.acc += dt;
    let advanced = false;
    while (this.acc >= 1 / FPS) {
      this.acc -= 1 / FPS;
      advanced = true;
      if (this.clip.loop) {
        this.frame++;
        if (this.frame >= this.clip.length) {
          this.frame = 0;
          this.loops = (this.loops + 1) % MAX_LOOPS;
        }
      } else if (this.frame < this.clip.length - 1) {
        this.frame++;
      } else if (++this.held >= HOLD) {
        this.held = 0;
        this.frame = 0;
      }
    }
    if (advanced) this.apply();
  }

  apply(): void {
    this.mover.position.copy(this.basePosition);
    this.mover.position.z += this.loops * (this.clip.rootMotion ?? 0);
    this.mover.updateMatrixWorld(true);
    this.target.apply(samplePose(this.clip, this.frame, this.defaults));
    this.slider.value = String(this.frame);
    this.label.textContent = `${this.clip.name}  ${this.frame} / ${this.clip.length}f`;
    const move = this.moves[this.clip.name];
    if (move) {
      // 프레임 데이터와 지금 구간: 발생(판정 전) / 지속 / 회복
      const fd = moveFrames(move);
      const lastActive = Math.max(...move.hitboxes.map((h) => h.frames[1]));
      const phase = activeHitboxes(move, this.frame).length ? '■ 지속' : this.frame < fd.startup - 1 ? '발생' : this.frame > lastActive ? '회복' : '사이';
      const invuln = hurtboxesActive(move, this.frame) ? '' : ' 무적';
      this.label.textContent += `   발생 ${fd.startup} · 지속 ${fd.active}${fd.hits > 1 ? ` (${fd.hits}타)` : ''} · 회복 ${fd.recovery}   [${phase}${invuln}]`;
      const on = activeHitboxes(move, this.frame);
      for (const m of this.hits.children as Mesh[]) {
        const h = m.userData.hit as (typeof move.hitboxes)[number];
        m.visible = on.includes(h);
        this.target.sockets.get(h.socket)!.getWorldPosition(m.position);
      }
    }
    this.ripples.set(this.emissions.map((e) => ({ type: e.type, x: e.x, z: e.z + this.loops * (this.clip.rootMotion ?? 0), age: this.frame - e.f })));
    const hurtOn = hurtboxesActive(move, this.frame);
    const a = new Vector3();
    const b = new Vector3();
    for (const m of this.boxes.children as Mesh[]) {
      if (!m.userData.box) continue; // 공격 판정 묶음(hits)은 아래에서
      m.visible = hurtOn;
      const [pa, pb] = capsuleSegment(m.userData.box as Hurtbox, a, b);
      m.position.copy(pa).add(pb).multiplyScalar(0.5);
      m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), pb.clone().sub(pa).normalize()));
    }
  }
}
