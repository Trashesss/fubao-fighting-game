import { CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';

/**
 * 바닥 물결: 바닥을 물처럼 쓰는 동작(잠수)에서 바닥 위에 그리는 고리.
 *   splash = 들어가거나 나오는 자리. 어두운 구멍이 줄어들고 고리 세 개가 차례로 퍼진다
 *   wake   = 등지느러미가 바닥을 가르는 자리. 작은 고리가 퍼지며 사라진다 (몇 프레임마다 하나씩 → 지나간 자국)
 * 나이(age, 프레임)만으로 모양이 정해져서, 같은 프레임은 언제 그려도 같다 (스크린샷·되감기).
 */
export type RippleType = 'splash' | 'wake';
export interface Ripple {
  type: RippleType;
  x: number;
  z: number;
  age: number;
}

/** 고리가 보이는 프레임 수 */
export const RIPPLE_LIFE: Record<RippleType, number> = { splash: 40, wake: 26 };

const FLOOR_Y = 0.003;
const RING_COLOR = 0x2f4650;
const HOLE_COLOR = 0x16232a;

export class RippleField extends Group {
  private readonly ring = new RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
  private readonly disk = new CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  private readonly pool: Mesh[] = [];

  constructor() {
    super();
    this.name = 'ripples';
  }

  private mesh(i: number): Mesh {
    while (this.pool.length <= i) {
      const m = new Mesh(this.ring, new MeshBasicMaterial({ color: RING_COLOR, transparent: true, depthWrite: false }));
      m.renderOrder = 5;
      this.pool.push(m);
      this.add(m);
    }
    return this.pool[i];
  }

  set(items: Ripple[]): void {
    let n = 0;
    const draw = (x: number, z: number, radius: number, opacity: number, hole: boolean) => {
      if (radius <= 0 || opacity <= 0) return;
      const m = this.mesh(n++);
      m.geometry = hole ? this.disk : this.ring;
      const mat = m.material as MeshBasicMaterial;
      mat.color.setHex(hole ? HOLE_COLOR : RING_COLOR);
      mat.opacity = opacity;
      m.position.set(x, FLOOR_Y + (hole ? 0 : 0.001), z);
      m.scale.setScalar(radius);
      m.visible = true;
    };
    for (const r of items) {
      const t = r.age / RIPPLE_LIFE[r.type];
      if (t < 0 || t >= 1) continue;
      if (r.type === 'splash') {
        draw(r.x, r.z, 0.38 * (1 - t) ** 2, 0.85, true);
        for (let k = 0; k < 3; k++) {
          const tk = t * 1.25 - k * 0.14;
          if (tk > 0 && tk < 1) draw(r.x, r.z, 0.2 + 0.75 * Math.sqrt(tk), 0.55 * (1 - tk), false);
        }
      } else {
        draw(r.x, r.z, 0.06 + 0.4 * Math.sqrt(t), 0.45 * (1 - t), false);
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}
