import { Vector3 } from 'three';

const ab = new Vector3();
const ac = new Vector3();

/** 공격 판정 구(중심 c, 반지름 r)가 피격 캡슐(선분 a–b, 반지름 R)에 닿는지 */
export function sphereHitsCapsule(c: Vector3, r: number, a: Vector3, b: Vector3, R: number): boolean {
  ab.subVectors(b, a);
  ac.subVectors(c, a);
  const len2 = ab.lengthSq();
  const t = len2 > 0 ? Math.min(1, Math.max(0, ac.dot(ab) / len2)) : 0;
  return ac.addScaledVector(ab, -t).lengthSq() <= (r + R) * (r + R);
}
