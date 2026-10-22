import { Bone, Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { PoseChannels } from '../../animation/poseClip';

const DEG = Math.PI / 180;

/**
 * 푸바오 애니메이터: 채널(도·m) → 뼈 회전. 발은 다리 IK 로 바닥에 붙인다.
 *
 * 채널 (전부 0 = 바인드 포즈, 기준 그림의 선 자세)
 *   drop        골반 내리기 (m, + = 아래). 발은 IK 로 제자리 → 무릎이 굽는다
 *   hipZ / hipX 골반 앞뒤·좌우 옮기기 (m)
 *   lean        윗몸 앞으로 숙이기 (도, 골반 0.2 · 허리 0.35 · 가슴 0.45 로 나눔)
 *   twist       윗몸 비틀기 (도, + = 왼쪽(+x)으로 돈다. 허리 0.4 · 가슴 0.6)
 *   side        윗몸 옆으로 굽히기 (도, + = 왼쪽으로)
 *   headPitch / headYaw / headRoll   머리 (도, Pitch + = 숙임, 목 0.35 · 머리 0.65)
 *   jaw         입 벌림 (도)
 *   arm{L,R}_fwd   팔을 앞으로 들기 (도, 내린 팔에서)
 *   arm{L,R}_out   팔을 옆으로 벌리기 (도)
 *   arm{L,R}_roll  위팔 비틀기 (도, + = 팔꿈치가 바깥으로)
 *   elbow{L,R}     팔꿈치 굽히기 (도, + = 더 굽힘. 바인드에서 이미 약 75° 굽어 있다)
 *   wrist{L,R}     손목 (도, + = 앞발을 들어 발바닥이 앞을 봄)
 *   foot{L,R}_x / _y / _z   발목 목표를 바인드 위치에서 옮기기 (m)
 *   foot{L,R}_pitch / _yaw  발 각도 (도, pitch + = 발끝 들기, yaw + = 발끝이 왼쪽으로)
 *   knee{L,R}_out  무릎 방향을 바깥으로 (도)
 *   tail        꼬리 들기 (도)
 *
 * 좌표: 모델 공간(+Z 앞, +Y 위, +X 캐릭터 왼쪽). 모든 뼈의 바인드 회전이 0 이라 모델 공간 회전 = 부모부터 곱한 로컬 회전.
 */
export const PANDA_NEUTRAL: PoseChannels = Object.fromEntries(
  [
    'drop', 'hipZ', 'hipX', 'lean', 'twist', 'side', 'headPitch', 'headYaw', 'headRoll', 'jaw', 'tail',
    ...['L', 'R'].flatMap((k) => [`arm${k}_fwd`, `arm${k}_out`, `arm${k}_roll`, `elbow${k}`, `wrist${k}`, `foot${k}_x`, `foot${k}_y`, `foot${k}_z`, `foot${k}_pitch`, `foot${k}_yaw`, `knee${k}_out`]),
  ].map((k) => [k, 0]),
);

interface LegBind {
  hip: Vector3;
  knee: Vector3;
  ankle: Vector3;
  l1: number;
  l2: number;
  /** 바인드 허벅지·정강이 틀 (열 = 뼈 방향 u, v, 굽힘 평면 법선 w) */
  thighFrame: Matrix4;
  shinFrame: Matrix4;
}

export class PandaAnimator {
  readonly bones: Map<string, Bone>;
  private readonly bindPos = new Map<string, Vector3>();
  private readonly legs: Record<'L' | 'R', LegBind>;

  constructor(readonly model: Group) {
    this.bones = model.userData.bones as Map<string, Bone>;
    for (const [name, b] of this.bones) this.bindPos.set(name, b.position.clone());
    const at = (name: string) => this.modelPos(name);
    this.legs = {} as Record<'L' | 'R', LegBind>;
    for (const k of ['L', 'R'] as const) {
      const hip = at(`thigh_${k}`);
      const knee = at(`shin_${k}`);
      const ankle = at(`foot_${k}`);
      this.legs[k] = {
        hip,
        knee,
        ankle,
        l1: knee.distanceTo(hip),
        l2: ankle.distanceTo(knee),
        thighFrame: frame(knee.clone().sub(hip), ankle.clone().sub(knee)),
        shinFrame: frame(ankle.clone().sub(knee), hip.clone().sub(knee)),
      };
    }
  }

  /** 바인드 포즈에서 뼈 원점의 모델 공간 위치 (부모 위치 합) */
  private modelPos(name: string): Vector3 {
    const p = new Vector3();
    let b: Bone | null = this.bones.get(name)!;
    while (b && b.name !== 'root') {
      p.add(this.bindPos.get(b.name)!);
      b = b.parent instanceof Bone ? b.parent : null;
    }
    return p;
  }

  apply(c: PoseChannels): void {
    const v = (k: string) => c[k] ?? 0;
    const B = (n: string) => this.bones.get(n)!;
    for (const [name, b] of this.bones) {
      b.position.copy(this.bindPos.get(name)!);
      b.quaternion.identity();
    }
    // 몸통
    const pelvis = B('pelvis');
    pelvis.position.y -= v('drop');
    pelvis.position.z += v('hipZ');
    pelvis.position.x += v('hipX');
    pelvis.rotation.set(v('lean') * 0.2 * DEG, 0, 0);
    B('spine').rotation.set(v('lean') * 0.35 * DEG, v('twist') * 0.4 * DEG, v('side') * 0.45 * DEG, 'YXZ');
    B('chest').rotation.set(v('lean') * 0.45 * DEG, v('twist') * 0.6 * DEG, v('side') * 0.55 * DEG, 'YXZ');
    B('neck').rotation.set(v('headPitch') * 0.35 * DEG, v('headYaw') * 0.35 * DEG, v('headRoll') * 0.35 * DEG, 'YXZ');
    B('head').rotation.set(v('headPitch') * 0.65 * DEG, v('headYaw') * 0.65 * DEG, v('headRoll') * 0.65 * DEG, 'YXZ');
    B('jaw').rotation.x = v('jaw') * DEG;
    B('tail').rotation.x = -v('tail') * DEG;
    // 팔: 비틀기(y) → 벌리기(z) → 앞으로 들기(x) 순서로 부모 틀에서
    for (const [k, s] of [['L', 1], ['R', -1]] as const) {
      B(`upperarm_${k}`).rotation.set(-v(`arm${k}_fwd`) * DEG, s * v(`arm${k}_roll`) * DEG, s * v(`arm${k}_out`) * DEG, 'XZY');
      B(`forearm_${k}`).rotation.x = -v(`elbow${k}`) * DEG;
      B(`hand_${k}`).rotation.x = -v(`wrist${k}`) * DEG;
    }
    // 다리 IK
    this.model.updateMatrixWorld(true);
    const pelvisModel = modelMatrix(this.model, pelvis);
    const pelvisRot = new Quaternion().setFromRotationMatrix(pelvisModel);
    for (const [k, s] of [['L', 1], ['R', -1]] as const) {
      const leg = this.legs[k];
      const hip = this.bindPos.get(`thigh_${k}`)!.clone().applyMatrix4(pelvisModel);
      const target = leg.ankle.clone().add(new Vector3(v(`foot${k}_x`), v(`foot${k}_y`), v(`foot${k}_z`)));
      // 무릎은 앞(+z)을 보고, knee_out 만큼 바깥으로
      const out = v(`knee${k}_out`) * DEG;
      const pole = new Vector3(s * Math.sin(out), 0, Math.cos(out));
      const { thigh, shin } = solveLeg(hip, target, pole, leg);
      B(`thigh_${k}`).quaternion.copy(pelvisRot.clone().invert().multiply(thigh));
      B(`shin_${k}`).quaternion.copy(thigh.clone().invert().multiply(shin));
      const foot = new Quaternion().setFromEuler(new Euler(-v(`foot${k}_pitch`) * DEG, v(`foot${k}_yaw`) * DEG, 0, 'YXZ'));
      B(`foot_${k}`).quaternion.copy(shin.clone().invert().multiply(foot));
    }
    this.model.updateMatrixWorld(true);
  }
}

/**
 * 뼈 방향 a 와 두 번째 방향 b 로 정한 정규 직교 틀 (열: u = a, v, w = a × b).
 * 허벅지는 (허벅지, 정강이), 정강이는 (정강이, −허벅지) 로 만들면 둘 다 w = 굽힘 평면 법선으로 같다
 */
function frame(a: Vector3, b: Vector3): Matrix4 {
  const u = a.clone().normalize();
  const w = a.clone().cross(b).normalize();
  const v = w.clone().cross(u);
  return new Matrix4().makeBasis(u, v, w);
}

/**
 * 두 마디 IK: 엉덩이 hip 에서 발목 목표 target 까지, 무릎이 pole 쪽으로. 반환 = 허벅지·정강이의 모델 공간 회전 (바인드 대비).
 * 회전은 바인드 틀(뼈 방향 + 굽힘 평면)을 새 틀로 보내는 것이라 다리가 축으로 돌지 않는다.
 */
function solveLeg(hip: Vector3, target: Vector3, pole: Vector3, leg: LegBind): { thigh: Quaternion; shin: Quaternion } {
  const D = target.clone().sub(hip);
  const d = Math.min(leg.l1 + leg.l2 - 1e-4, Math.max(Math.abs(leg.l1 - leg.l2) + 1e-4, D.length()));
  const dn = D.normalize();
  const a = (leg.l1 * leg.l1 - leg.l2 * leg.l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, leg.l1 * leg.l1 - a * a));
  const p = pole.clone().addScaledVector(dn, -pole.dot(dn)).normalize();
  const knee = hip.clone().addScaledVector(dn, a).addScaledVector(p, h);
  const ankle = hip.clone().addScaledVector(dn, d);
  const thighNew = frame(knee.clone().sub(hip), ankle.clone().sub(knee));
  const shinNew = frame(ankle.clone().sub(knee), hip.clone().sub(knee));
  const thigh = new Quaternion().setFromRotationMatrix(thighNew.multiply(leg.thighFrame.clone().transpose()));
  const shin = new Quaternion().setFromRotationMatrix(shinNew.multiply(leg.shinFrame.clone().transpose()));
  return { thigh, shin };
}

/** 모델(그룹) 공간 행렬 */
function modelMatrix(model: Group, b: Bone): Matrix4 {
  return new Matrix4().copy(model.matrixWorld).invert().multiply(b.matrixWorld);
}
