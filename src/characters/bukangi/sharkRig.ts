import { Bone, BufferGeometry, Float32BufferAttribute, Quaternion, Skeleton, Uint16BufferAttribute, Vector3 } from 'three';
import { smoothstep } from '../../procedural/profile';
import { bodyBottom, bodyTop } from './sharkAnatomy';
import { TOTAL_LENGTH, U0, toModel, type SharkCage } from './sharkCage';

/**
 * 부캉이 뼈대. 바인드 포즈는 헤엄치는 자세(몸 축이 z 방향으로 곧다)이고, 서 있는 자세는 이 뼈를 구부려 만든다.
 *
 * 척추: 몸 축 위 0.03 TL 간격 33개. 뿌리 뼈(u≈0.44, 무게중심 근처)에서 앞(머리)과 뒤(꼬리) 두 사슬로 뻗는다.
 * 몸 가중치는 3차 B-스플라인(뼈 4개)이라 굽힘이 뼈 마디에서 꺾이지 않고 곡선으로 이어진다.
 * 큰 굽힘(90°)은 구간 총량으로 정해 그 구간의 뼈들에 매끈하게 나눈다 (한 뼈에 몰면 안쪽이 접힌다).
 * 짝지느러미: 가슴(팔)·배(발)마다 뿌리·중간·끝 3마디.
 */
const SPINE_STEP = 0.03;
export const SPINE_STATIONS = Array.from({ length: 33 }, (_, i) => +(0.02 + i * SPINE_STEP).toFixed(3));
const ROOT = SPINE_STATIONS.indexOf(0.44);
const LIMB_FINS = ['pectoral-fin-R', 'pectoral-fin-L', 'pelvic-fin-R', 'pelvic-fin-L'];

export interface SharkRig {
  root: Bone;
  spine: Bone[];
  limbs: Record<string, Bone[]>;
  skeleton: Skeleton;
}

const axisPoint = (u: number) => toModel(0, (bodyTop(u) + bodyBottom(u)) / 2, u);

export function buildSharkRig(cage: SharkCage): SharkRig {
  const spine = SPINE_STATIONS.map((u) => {
    const b = new Bone();
    b.name = `spine-${u.toFixed(2)}`;
    b.userData.u = u;
    return b;
  });
  const world = SPINE_STATIONS.map(axisPoint);
  const attach = (child: Bone, parent: Bone, childWorld: Vector3, parentWorld: Vector3) => {
    child.position.copy(childWorld).sub(parentWorld);
    parent.add(child);
  };
  spine[ROOT].position.copy(world[ROOT]);
  for (let i = ROOT - 1; i >= 0; i--) attach(spine[i], spine[i + 1], world[i], world[i + 1]);
  for (let i = ROOT + 1; i < spine.length; i++) attach(spine[i], spine[i - 1], world[i], world[i - 1]);

  const limbs: SharkRig['limbs'] = {};
  for (const name of LIMB_FINS) {
    const rows = cage.finRows[name];
    const picks = [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]];
    const pos = picks.map((r) => new Vector3(...r.center));
    const rootU = U0 - pos[0].z / TOTAL_LENGTH;
    const parentIndex = nearestStation(rootU);
    const chain = picks.map((r, k) => {
      const b = new Bone();
      b.name = `${name}-${['root', 'mid', 'tip'][k]}`;
      b.userData.span = r.span;
      return b;
    });
    attach(chain[0], spine[parentIndex], pos[0], world[parentIndex]);
    attach(chain[1], chain[0], pos[1], pos[0]);
    attach(chain[2], chain[1], pos[2], pos[1]);
    limbs[name] = chain;
  }

  const bones = [...spine, ...Object.values(limbs).flat()];
  return { root: spine[ROOT], spine, limbs, skeleton: new Skeleton(bones) };
}

function nearestStation(u: number): number {
  let best = 0;
  for (let i = 1; i < SPINE_STATIONS.length; i++) if (Math.abs(SPINE_STATIONS[i] - u) < Math.abs(SPINE_STATIONS[best] - u)) best = i;
  return best;
}

/** 균일 3차 B-스플라인 가중치: 척추 뼈 4개 (끝에서는 인덱스를 묶는다) */
function splineWeights(u: number): [number, number][] {
  const x = (u - SPINE_STATIONS[0]) / SPINE_STEP;
  const i = Math.floor(x);
  const t = x - i;
  const basis = [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  const last = SPINE_STATIONS.length - 1;
  const acc = new Map<number, number>();
  basis.forEach((w, k) => {
    const j = Math.min(last, Math.max(0, i - 1 + k));
    acc.set(j, (acc.get(j) ?? 0) + w);
  });
  return [...acc.entries()];
}

/** 두 지점 사이를 부드럽게 나누는 가중치 (구간 안에서 smoothstep) */
function stationWeights(stations: readonly number[], x: number): [number, number, number] {
  if (x <= stations[0]) return [0, 0, 1];
  const last = stations.length - 1;
  if (x >= stations[last]) return [last, last, 1];
  let k = 0;
  while (x > stations[k + 1]) k++;
  const t = smoothstep(0, 1, (x - stations[k]) / (stations[k + 1] - stations[k]));
  return [k, k + 1, 1 - t];
}

/**
 * 스키닝 가중치. 몸 정점은 척추 위치 u 로 이웃한 두 척추 뼈에,
 * 짝지느러미 정점은 finSpan 으로 지느러미 3마디에 나눈다. 뿌리(finSpan→0)에서는 몸 가중치로 넘어간다.
 */
export function bindWeights(geometry: BufferGeometry, rig: SharkRig, cage: SharkCage): void {
  const pos = geometry.getAttribute('position');
  const span = geometry.getAttribute('finSpan');
  const n = pos.count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const boneIndex = new Map(rig.skeleton.bones.map((b, i) => [b, i]));
  const limbRows = LIMB_FINS.map((name) => cage.finRows[name].map((r) => new Vector3(...r.center)));
  const p = new Vector3();

  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const u = U0 - p.z / TOTAL_LENGTH;
    const s = span.getX(i);
    const slots: [number, number][] = [];

    let limbW = 0;
    if (s > 0.001) {
      // 가장 가까운 짝지느러미 (행 중심까지 거리)
      let best = -1;
      let bestD = Infinity;
      limbRows.forEach((rows, f) => {
        for (const c of rows) {
          const d = c.distanceToSquared(p);
          if (d < bestD) {
            bestD = d;
            best = f;
          }
        }
      });
      const reach = 0.06 * TOTAL_LENGTH;
      if (best >= 0 && bestD < reach * reach) {
        const chain = rig.limbs[LIMB_FINS[best]];
        limbW = smoothstep(0, 0.2, s);
        const [a, b, wa] = stationWeights(chain.map((bone) => bone.userData.span as number), s);
        slots.push([boneIndex.get(chain[a])!, limbW * wa], [boneIndex.get(chain[b])!, limbW * (1 - wa)]);
      }
    }
    if (slots.length === 0) {
      for (const [j, w] of splineWeights(u)) slots.push([boneIndex.get(rig.spine[j])!, w]);
    } else {
      // 지느러미 정점은 지느러미 2마디 + 척추 2개 (영향 4개 한도)
      const [a, b, wa] = stationWeights(SPINE_STATIONS, u);
      slots.push([boneIndex.get(rig.spine[a])!, (1 - limbW) * wa], [boneIndex.get(rig.spine[b])!, (1 - limbW) * (1 - wa)]);
    }

    for (let k = 0; k < 4; k++) {
      index[i * 4 + k] = slots[k]?.[0] ?? 0;
      weight[i * 4 + k] = slots[k]?.[1] ?? 0;
    }
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(index, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4));
}

export const DEG = Math.PI / 180;

export function applySwimPose(rig: SharkRig): void {
  for (const b of rig.skeleton.bones) b.quaternion.identity();
}

/** 뼈의 자식 방향(뼈 → 다음 뼈)이 월드 방향 target 을 향하도록 돌린다 */
export function aimBone(bone: Bone, next: Bone, target: Vector3): void {
  bone.updateWorldMatrix(true, true);
  const from = next.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
  const turn = new Quaternion().setFromUnitVectors(from, target.clone().normalize());
  const worldQ = bone.getWorldQuaternion(new Quaternion());
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
  bone.quaternion.copy(parentQ.invert().multiply(turn.multiply(worldQ)));
  bone.updateWorldMatrix(false, true);
}

/**
 * 서 있는 자세 (반의인화 A안 · 팔다리 없이 지느러미로 선다).
 * 몸 축을 굽히지 않고 뿌리 뼈로 통째로 세운다. 기울기는 solveStandingTilt 로 정해
 * 꼬리 위 엽 끝과 아래 엽에 신긴 운동화 두 곳으로 선다.
 * 가슴지느러미 = 팔: 앞으로 들어 가드. 배지느러미 = 발: 앞·바깥 아래로 바닥을 짚는다.
 */
/**
 * 굽힘 구간: [시작 u, 끝 u, 총 각도(도)]. x 축 회전, 앞 사슬은 음수 = 머리 쪽이 위로,
 * 뒤 사슬은 음수 = 꼬리 쪽이 아래로. 구간 안의 뼈에 sin² 모양으로 나눠 준다.
 */
const STANDING_BENDS: [number, number, number][] = [
  // 꼿꼿이 선 자세: 머리·꼬리 모두 굽히지 않는다 (몸 축이 한 직선)
];
/** 뿌리 뼈 회전: 몸 전체를 세운다 (−90° = 수직, 주둥이가 위·꼬리가 아래) */
const STANDING_ROOT_TILT = -90;

function distributeBends(rig: SharkRig, bends: [number, number, number][]): void {
  for (const [from, to, total] of bends) bendRegion(rig, from, to, total, 'x');
}

/**
 * 구간 (from, to) 안의 척추 뼈에 총 각도를 sin² 모양으로 나눠 더한다 (한 뼈에 몰면 안쪽이 접힌다).
 * 축은 뼈 로컬: x = 앞뒤 굽힘, y = 옆 굽힘(상어가 헤엄칠 때 꼬리를 흔드는 방향), z = 몸 축 비틀기.
 */
export function bendRegion(rig: SharkRig, from: number, to: number, totalDeg: number, axis: 'x' | 'y' | 'z'): void {
  if (totalDeg === 0) return;
  const inside = rig.spine.filter((b) => (b.userData.u as number) > from && (b.userData.u as number) < to);
  const shape = inside.map((b) => Math.sin((Math.PI * ((b.userData.u as number) - from)) / (to - from)) ** 2);
  const sum = shape.reduce((a, b) => a + b, 0);
  inside.forEach((b, k) => (b.rotation[axis] += ((totalDeg * shape[k]) / sum) * DEG));
}

/**
 * 두 점으로 서는 기울기: 몸은 굽히지 않고 통째로 x 축으로 돌린다 (회전 중심 = 뿌리 뼈).
 * a 도 회전했을 때 contact(아래 엽 끝, 신발 칼라 안) 가 ground(위 엽 끝) 보다 정확히 lift 만큼 높아지는 a 를 찾는다.
 * 그러면 위 엽 끝과 신발 바닥이 함께 바닥에 닿는다. 수직(-90°)에서 가장 가까운 해를 이분법으로 구한다.
 */
export function solveStandingTilt(rig: SharkRig, ground: Vector3, contact: Vector3, lift: number): number {
  const pivot = rig.root.position;
  const yAt = (p: Vector3, a: number) => pivot.y + (p.y - pivot.y) * Math.cos(a * DEG) - (p.z - pivot.z) * Math.sin(a * DEG);
  const f = (a: number) => yAt(contact, a) - yAt(ground, a) - lift;
  let lo = -90;
  let hi = -90;
  const step = f(-90) > 0 ? 1 : -1; // contact 가 너무 높으면 뒤로(+), 낮으면 앞으로(-) 기울인다
  for (let k = 0; k < 90 && Math.sign(f(hi)) === Math.sign(f(lo)); k++) hi += step;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function applyStandingPose(rig: SharkRig, tiltDeg = STANDING_ROOT_TILT): void {
  applySwimPose(rig);
  rig.root.rotation.x = tiltDeg * DEG;
  distributeBends(rig, STANDING_BENDS);
  rig.root.updateWorldMatrix(true, true);

  for (const side of [1, -1] as const) {
    const s = side > 0 ? 'R' : 'L';
    const [pr, pm, pt] = rig.limbs[`pectoral-fin-${s}`];
    aimBone(pr, pm, new Vector3(side * 0.55, -0.12, 0.83));
    aimBone(pm, pt, new Vector3(side * 0.2, 0.25, 0.95));
    const [vr, vm, vt] = rig.limbs[`pelvic-fin-${s}`];
    aimBone(vr, vm, new Vector3(side * 0.45, -0.8, 0.4));
    aimBone(vm, vt, new Vector3(side * 0.4, -0.35, 0.85));
  }
}
