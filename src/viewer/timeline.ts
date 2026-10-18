import { CapsuleGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Scene } from 'three';
import { FPS, samplePose, type PoseClip, type PoseChannels } from '../animation/poseClip';
import { capsuleSegment, type Hurtbox } from '../fighting/frameData';

/**
 * 뷰어 타임라인: 클립 재생·일시정지·한 프레임씩 넘기기, 피격 캡슐 표시.
 * 재생은 60fps 고정 스텝 (격투게임과 같은 시간 단위).
 */
export interface Animated {
  apply(c: PoseChannels): void;
  hurtboxes: Hurtbox[];
}

export class Timeline {
  frame = 0;
  playing = true;
  private acc = 0;
  private readonly boxes = new Group();
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
  ) {
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
    scene.add(this.boxes);

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
    this.slider.max = String(this.clip.length - 1);
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
      this.frame++;
      if (this.frame >= this.clip.length) this.frame = this.clip.loop ? 0 : this.clip.length - 1;
      advanced = true;
    }
    if (advanced) this.apply();
  }

  apply(): void {
    this.target.apply(samplePose(this.clip, this.frame, this.defaults));
    this.slider.value = String(this.frame);
    this.label.textContent = `${this.clip.name}  ${this.frame} / ${this.clip.length}f`;
    const a = new Vector3();
    const b = new Vector3();
    for (const m of this.boxes.children as Mesh[]) {
      const [pa, pb] = capsuleSegment(m.userData.box as Hurtbox, a, b);
      m.position.copy(pa).add(pb).multiplyScalar(0.5);
      m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), pb.clone().sub(pa).normalize()));
    }
  }
}
