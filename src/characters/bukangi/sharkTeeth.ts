import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Uint16BufferAttribute, Vector3 } from 'three';
import type { SharkCage } from './sharkCage';

/**
 * 이빨: 잇몸 행을 따라 늘어선 납작한 칼날. 흉상어 기준
 *   위턱: 넓은 삼각형, 끝이 입 구석 쪽으로 조금 기운다 (톱니는 이 크기에서 안 보여 생략)
 *   아래턱: 폭이 좁고 곧게 선 송곳 모양
 * 앞니가 가장 크고 구석으로 갈수록 작아진다. 한 줄(기능 이빨)만 둔다.
 *
 * 위치는 서브디비전한 메시 위 잇몸 행의 한계 위치(케이지 정점 인덱스는 나눠도 그대로라 바로 읽는다)를 잇는 곡선에서 뽑고,
 * 방향은 위 이빨 = 잇몸 → 입술 (다물면 아래로), 아래 이빨 = 입술 → 잇몸 (입 안쪽 위로).
 * 스키닝은 가장 가까운 잇몸 정점의 가중치를 그대로 쓴다 — 잇몸과 똑같이 움직인다.
 */
export interface TeethOptions {
  /** 한쪽 턱의 이빨 수 (좌우 합) */
  upperCount: number;
  lowerCount: number;
  /** 가장 큰(앞) 이빨 높이 (m) */
  upperHeight: number;
  lowerHeight: number;
}

export const DEFAULT_TEETH: TeethOptions = { upperCount: 26, lowerCount: 24, upperHeight: 0.017, lowerHeight: 0.014 };

export function buildTeeth(positions: ArrayLike<number>, mouth: SharkCage['mouth'], skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>, opts = DEFAULT_TEETH): BufferGeometry {
  const at = (i: number) => new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const pos: number[] = [];
  const idx: number[] = [];
  const sIndex: number[] = [];
  const sWeight: number[] = [];

  const row = (gum: number[], lip: number[], count: number, height: number, upper: boolean) => {
    const gumCurve = new CatmullRomCurve3(gum.map(at), false, 'centripetal');
    const lipCurve = new CatmullRomCurve3(lip.map(at), false, 'centripetal');
    const length = gumCurve.getLength();
    const spacing = (length * 0.92) / count;
    for (let k = 0; k < count; k++) {
      // 구석 4% 는 비운다 (구석은 접히는 곳이라 이빨이 피부를 뚫는다)
      const t = 0.04 + (0.92 * (k + 0.5)) / count;
      const base = gumCurve.getPointAt(t);
      const lipP = lipCurve.getPointAt(t);
      const T = gumCurve.getTangentAt(t);
      const D = (upper ? lipP.clone().sub(base) : base.clone().sub(lipP)).normalize();
      // 칼날 면이 잇몸 곡선을 따르도록 T 를 D 에 수직으로
      T.addScaledVector(D, -T.dot(D)).normalize();
      const N = new Vector3().crossVectors(T, D);
      const centre = 1 - Math.abs(2 * t - 1); // 앞 1 → 구석 0
      const H = height * (0.55 + 0.45 * centre ** 0.8);
      const halfW = spacing * (upper ? 0.48 : 0.36);
      // 위 이빨 끝은 구석 쪽으로 기운다 (곡선 방향 T 는 오른쪽 구석 → 왼쪽 구석이라 앞 기준 바깥 = 반쪽마다 부호가 다르다)
      const lean = upper ? Math.sign(0.5 - t) * -0.25 * halfW * (1 - centre) : 0;
      // 가장 가까운 잇몸 케이지 정점의 스키닝
      const nearest = gum[Math.min(gum.length - 1, Math.round(t * (gum.length - 1)))];
      const first = pos.length / 3;
      const ROWS = 7;
      const AROUND = 10;
      for (let r = 0; r <= ROWS; r++) {
        const b = -0.2 + (1.2 * r) / ROWS; // 뿌리는 잇몸 속에 묻는다
        const tb = Math.max(0, Math.min(1, b));
        // 윗 이빨은 가장자리가 살짝 오목한 넓은 삼각형, 아래 이빨은 밑동만 넓고 곧은 송곳
        const w = upper ? halfW * (1 - tb) ** 1.15 : halfW * (0.35 + 0.65 * (1 - tb) ** 3) * (1 - tb) ** 0.6;
        const th = halfW * (upper ? 0.32 : 0.45) * (1 - tb) ** 0.7;
        for (let a = 0; a < AROUND; a++) {
          const psi = (a / AROUND) * Math.PI * 2;
          const p = base
            .clone()
            .addScaledVector(D, b * H)
            .addScaledVector(T, Math.cos(psi) * w + lean * tb)
            .addScaledVector(N, Math.sin(psi) * th);
          pos.push(p.x, p.y, p.z);
          for (let s = 0; s < 4; s++) {
            sIndex.push(skinIndex[nearest * 4 + s]);
            sWeight.push(skinWeight[nearest * 4 + s]);
          }
        }
      }
      for (let r = 0; r < ROWS; r++) {
        for (let a = 0; a < AROUND; a++) {
          const a1 = (a + 1) % AROUND;
          const v00 = first + r * AROUND + a;
          const v01 = first + r * AROUND + a1;
          const v10 = first + (r + 1) * AROUND + a;
          const v11 = first + (r + 1) * AROUND + a1;
          idx.push(v00, v10, v11, v00, v11, v01);
        }
      }
    }
  };
  row(mouth.gumUpper, mouth.lipUpper, opts.upperCount, opts.upperHeight, true);
  row(mouth.gumLower, mouth.lipLower, opts.lowerCount, opts.lowerHeight, false);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new Uint16BufferAttribute(sIndex, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(sWeight, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
