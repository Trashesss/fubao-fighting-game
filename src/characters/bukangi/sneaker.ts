import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial, Shape, TorusGeometry, Vector3 } from 'three';
import { smoothstep } from '../../procedural/profile';

/**
 * 부캉이의 운동화 (꼬리 아래 엽에 신는다).
 * 로컬 좌표: 뒤꿈치 z=0 → 앞코 z=LENGTH, 바닥 y=0, x = 오른쪽. 단위 m.
 * 파란 메시 갑피 + 흰 중창 + 회색 밑창 + 흰 끈 + 발목 칼라 + 옆면 흰 갈고리 띠 (밈 원본처럼).
 */
export const SNEAKER_LENGTH = 0.32;
const L = SNEAKER_LENGTH;

/** 위에서 본 반폭: 둥근 뒤꿈치, 좁은 아치, 넓은 앞발, 둥근 앞코 */
function halfWidth(t: number): number {
  const heel = Math.sqrt(Math.min(1, t / 0.09));
  const toe = Math.sqrt(Math.min(1, (1 - t) / 0.13));
  const body = 0.043 + 0.006 * Math.sin(Math.PI * t) - 0.006 * Math.exp(-(((t - 0.45) / 0.12) ** 2)) + 0.009 * Math.exp(-(((t - 0.72) / 0.12) ** 2));
  return body * heel * toe;
}

/** 중창 윗면 높이: 뒤꿈치가 조금 높고, 앞코는 위로 휜다(토 스프링) */
const soleTop = (t: number) => 0.034 - 0.008 * t + 0.016 * smoothstep(0.78, 1, t) ** 1.5;
/** 앞코 들림: 바닥 자체가 앞에서 올라간다 */
const toeSpring = (t: number) => 0.016 * smoothstep(0.8, 1, t) ** 2;

/** 갑피 높이 (중창 위로): 뒤꿈치 칼라 → 발등 → 낮은 앞코 */
function upperHeight(t: number): number {
  const heel = 0.075 * (1 - smoothstep(0.0, 0.05, t) * 0.08);
  const instep = 0.082 - 0.032 * smoothstep(0.5, 0.92, t);
  return (t < 0.3 ? heel + (instep - heel) * smoothstep(0, 0.3, t) : instep) * Math.sqrt(Math.min(1, (1 - t) / 0.06));
}

/** 갑피 위의 점. φ: 0 = 오른쪽 아래 가장자리, π/2 = 꼭대기, π = 왼쪽 */
export function upperPoint(t: number, phi: number, offset = 0): Vector3 {
  const w = halfWidth(t) * 1.02;
  const h = upperHeight(t);
  const y0 = soleTop(t) + toeSpring(t) - 0.004;
  // 아래쪽은 옆으로 부풀고 위쪽은 둥근 단면
  const x = (w + offset) * Math.cos(phi) * (1 + 0.06 * Math.sin(phi));
  const y = y0 + (h + offset) * Math.sin(phi) ** 0.85;
  return new Vector3(x, y, t * L);
}

function gridSurface(nt: number, np: number, fn: (t: number, p: number) => Vector3): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nt; i++) for (let j = 0; j <= np; j++) pos.push(...fn(i / nt, j / np).toArray());
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < np; j++) {
      const a = i * (np + 1) + j;
      const b = a + np + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function outlineShape(scale: number): Shape {
  const shape = new Shape();
  const n = 80;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([halfWidth(i / n) * scale, (i / n) * L]);
  for (let i = n; i >= 0; i--) pts.push([-halfWidth(i / n) * scale, (i / n) * L]);
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [x, z] of pts.slice(1)) shape.lineTo(x, z);
  return shape;
}

/** 위에서 본 외곽을 y 방향으로 밀어낸 판 (ExtrudeGeometry 는 z 로 밀므로 눕힌다) */
function soleSlab(scale: number, depth: number, bevel: number): BufferGeometry {
  const g = new ExtrudeGeometry(outlineShape(scale), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 });
  g.rotateX(Math.PI / 2); // (x, z_shape) → 바닥면, 밀기 방향 → -y
  g.translate(0, depth + bevel, 0);
  // 앞코 들림
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + toeSpring(Math.max(0, Math.min(1, p.getZ(i) / L))));
  g.computeVertexNormals();
  return g;
}

export interface Sneaker {
  group: Group;
  /** 발목 칼라 중심 (지느러미가 들어가는 곳, 로컬) */
  collar: Vector3;
}

/** scale: 실제 신발(약 32 cm) 대비 배율 */
export function createSneaker(scale = 1): Sneaker {
  const group = new Group();
  group.name = 'sneaker';

  const blue = new MeshPhysicalMaterial({ color: 0x2f9fe0, roughness: 0.78, sheen: 0.6, sheenRoughness: 0.8, sheenColor: 0x9fd6ff });
  const white = new MeshPhysicalMaterial({ color: 0xf2f2ef, roughness: 0.55 });
  const rubber = new MeshPhysicalMaterial({ color: 0x4a4c50, roughness: 0.85 });

  const outsole = new Mesh(soleSlab(1.04, 0.004, 0.003), rubber);
  outsole.name = 'sneaker-outsole';
  const midsole = new Mesh(soleSlab(1.02, 0.018, 0.006), white);
  midsole.name = 'sneaker-midsole';
  midsole.position.y = 0.006;

  const upper = new Mesh(
    gridSurface(72, 36, (t, p) => upperPoint(t, p * Math.PI)),
    blue,
  );
  upper.name = 'sneaker-upper';
  (upper.material as MeshPhysicalMaterial).side = 2;

  // 옆면 흰 갈고리 띠 (밈 원본의 스우시 느낌): 앞쪽(앞발 아래)이 굵고 둥글며,
  // 아래로 살짝 휘었다가 뒤꿈치 위쪽으로 가늘게 빠져 올라간다 (양쪽)
  const stripes = new Group();
  stripes.name = 'sneaker-stripes';
  for (const side of [1, -1]) {
    const stripe = gridSurface(48, 8, (sAlong, p) => {
      const tt = 0.7 - 0.52 * sAlong;
      const centerPhi = 0.33 - 0.1 * Math.sin(Math.PI * sAlong) + 0.45 * sAlong ** 3;
      const halfBand = 0.075 * (1 - sAlong) ** 1.3 * Math.sqrt(Math.min(1, sAlong / 0.06)) + 0.004 * (1 - sAlong);
      const phi = centerPhi + (p - 0.5) * 2 * halfBand;
      const v = upperPoint(tt, phi, 0.0015);
      v.x *= side;
      return v;
    });
    if (side > 0) stripe.index!.array.reverse();
    stripes.add(new Mesh(stripe, white));
  }

  // 신발 끈: 발등 위에 가로로 놓인 납작한 막대 5개
  const laces = new Group();
  laces.name = 'sneaker-laces';
  for (let k = 0; k < 5; k++) {
    const t = 0.42 + k * 0.065;
    const lace = gridSurface(6, 12, (a, p) => {
      const v = upperPoint(t + (a - 0.5) * 0.02, Math.PI / 2 + (p - 0.5) * 1.1, 0.004 + 0.002 * Math.sin(Math.PI * a));
      return v;
    });
    laces.add(new Mesh(lace, white));
  }

  // 발목 칼라 (지느러미가 들어가는 구멍 둘레의 도톰한 테)
  const collarCenter = upperPoint(0.17, Math.PI / 2);
  const collarRing = new Mesh(new TorusGeometry(1, 0.012, 10, 40), blue);
  collarRing.name = 'sneaker-collar';
  collarRing.scale.set(0.038, 0.06, 1);
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.copy(collarCenter).add(new Vector3(0, 0.004, 0.01));
  collarRing.rotation.x = Math.PI / 2 - 0.25;

  const shoe = new Group();
  shoe.add(outsole, midsole, upper, stripes, laces, collarRing);
  shoe.scale.setScalar(scale);
  group.add(shoe);
  group.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = o.receiveShadow = true;
  });
  return { group, collar: collarCenter.clone().add(new Vector3(0, -0.01, 0.01)).multiplyScalar(scale) };
}
