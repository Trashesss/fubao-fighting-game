import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Camera,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createFubaoModel } from '../characters/fubao/createFubaoModel';
import { REF } from '../characters/fubao/pandaAnatomy';
import { PandaAnimator, PANDA_NEUTRAL } from '../characters/fubao/pandaAnimator';
import { PANDA_CLIPS, STANCE } from '../characters/fubao/pandaMoves';
import { samplePose } from '../animation/poseClip';

/**
 * 푸바오 뷰어 (fubao.html)
 *   view=three-quarter|side|front|back|face|face-side|paw|foot|ref-side|ref-front
 *        ref-side / ref-front = 기준 그림과 같은 직교 화면 (창 768×1024 로 찍으면 기준 그림 반쪽과 픽셀이 맞는다)
 *   mode=silhouette   흰 배경에 검은 실루엣 (털 포함)
 *   shells=24         털 껍질 장수 (0 = 털 없이 피부만)
 *   cell=0.009        거리장 격자 간격 (m)
 *   weights=<뼈>      그 뼈 가중치를 빨강으로 (스키닝 확인)
 *   bones={"upperarm_L":[x,y,z],…}  뼈 로컬 회전 (도, XYZ) — 스키닝·자세 확인 (URL 인코딩한 JSON)
 *   pose=stance       격투 자세 (기본은 바인드 포즈 = 기준 그림 자세)
 *   set={채널 JSON}   애니메이터 채널 값 하나로 멈춤 (pose=stance 위에 덮어쓴다)
 *   anim=idle         동작 재생 (&frame=N 이면 그 프레임에 멈춤)
 *   check=1           메시 통계 JSON 을 #check 에
 *   dist=4.6          카메라 거리 (확대 보기가 아닐 때)
 *   shot=1            UI 숨김
 */
const params = new URLSearchParams(location.search);
if (params.has('shot')) document.body.classList.add('shot');
const silhouette = params.get('mode') === 'silhouette';
const view = params.get('view') ?? 'three-quarter';

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(view.startsWith('ref-') ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.enabled = !silhouette;
renderer.shadowMap.type = PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(silhouette ? 0xffffff : 0xd9d9d6);

const started = performance.now();
const model = createFubaoModel({
  shells: params.has('shells') ? Number(params.get('shells')) : undefined,
  cell: params.has('cell') ? Number(params.get('cell')) : undefined,
  silhouette,
});
const buildMs = Math.round(performance.now() - started);
scene.add(model);
const boneMap = model.userData.bones as Map<string, Object3D>;
const animator = new PandaAnimator(model);
const basePose = { ...PANDA_NEUTRAL, ...(params.get('pose') === 'stance' ? STANCE : {}), ...(params.has('set') ? JSON.parse(params.get('set')!) : {}) };
const clip = params.has('anim') ? PANDA_CLIPS[params.get('anim')!] : null;
const frameParam = params.has('frame') ? Number(params.get('frame')) : null;
if (clip || params.has('pose') || params.has('set')) animator.apply(clip ? samplePose(clip, frameParam ?? 0, basePose) : basePose);
if (params.has('bones')) {
  for (const [name, deg] of Object.entries(JSON.parse(params.get('bones')!) as Record<string, [number, number, number]>)) {
    boneMap.get(name)?.rotation.set(...(deg.map((v) => (v * Math.PI) / 180) as [number, number, number]));
  }
  model.updateMatrixWorld(true);
}

// 가중치 보기
const wb = params.get('weights');
if (wb) {
  const skin = model.getObjectByName('skin') as SkinnedMesh;
  const names: string[] = skin.skeleton.bones.map((b) => b.name);
  const bi = names.indexOf(wb);
  const g = skin.geometry;
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const col = g.getAttribute('color');
  for (let i = 0; i < si.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
    col.setXYZ(i, 0.15 + 0.85 * w, 0.15, 0.15 + 0.5 * (1 - w));
  }
  col.needsUpdate = true;
  const fur = model.getObjectByName('fur');
  if (fur) fur.visible = false;
}

if (!silhouette) {
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new HemisphereLight(0xf4f1ea, 0x6d6a64, 0.6));
  const key = new DirectionalLight(0xfff4e6, 2.4);
  key.position.set(2.5, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.2, bottom: -0.5 });
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new DirectionalLight(0xdfe8ff, 1.2);
  rim.position.set(-3, 2, -4);
  scene.add(rim);
  const ground = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: 0.25 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// ── 카메라 ──────────────────────────────────────────────────────────────────
const box = new Box3().setFromObject(model);
const center = box.getCenter(new Vector3());
let camera: Camera & { updateProjectionMatrix(): void };
const DIRS: Record<string, [number, number, number]> = {
  side: [-1, 0, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  'three-quarter': [-0.7, 0.2, 0.7],
};
// 확대 검토: [목표점, 방향, 거리]
const CLOSE: Record<string, [[number, number, number], [number, number, number], number]> = {
  face: [[0, 1.5, 0.3], [0, 0.05, 1], 0.9],
  'face-side': [[0, 1.5, 0.25], [-1, 0.1, 0.35], 1.0],
  paw: [[0.2, 0.95, 0.35], [0.5, 0.1, 1], 0.8],
  foot: [[0.27, 0.1, 0.05], [0.6, 0.35, 1], 0.9],
};
if (view.startsWith('ref-')) {
  // 기준 그림 반쪽(768×1024 px)과 같은 범위: 측면은 수평축 = z, 정면은 수평축 = x (그림 오른쪽 = 캐릭터 왼쪽 = +x)
  const s = REF.scale;
  const x0 = view === 'ref-side' ? REF.sideZ0 : REF.frontX0 - 768;
  const cam = new OrthographicCamera(-x0 * s, (768 - x0) * s, REF.ground * s, (REF.ground - 1024) * s, 0.1, 50);
  if (view === 'ref-side') cam.position.set(-10, 0, 0);
  else cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  camera = cam;
} else {
  const cam = new PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 50);
  camera = cam;
}
const controls = new OrbitControls(camera, renderer.domElement);
if (!view.startsWith('ref-')) {
  let target = center.clone();
  let dir = new Vector3(...(DIRS[view] ?? DIRS['three-quarter'])).normalize();
  let dist = Number(params.get('dist') ?? 4.6);
  if (CLOSE[view]) {
    target = new Vector3(...CLOSE[view][0]);
    dir = new Vector3(...CLOSE[view][1]).normalize();
    dist = CLOSE[view][2];
  }
  camera.position.copy(target).addScaledVector(dir, dist);
  controls.target.copy(target);
  controls.update();
} else {
  controls.enabled = false;
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  if (camera instanceof PerspectiveCamera) {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
});

// ── 정보 ────────────────────────────────────────────────────────────────────
const skin = model.getObjectByName('skin') as Mesh;
const tris = skin.geometry.index!.count / 3;
const size = box.getSize(new Vector3());
const info = { buildMs, vertices: skin.geometry.getAttribute('position').count, triangles: tris, size: size.toArray().map((v) => +v.toFixed(3)), top: +box.max.y.toFixed(3) };
document.getElementById('info')!.textContent = `${info.vertices} 정점 · ${info.triangles} 삼각형 · ${buildMs} ms · 크기 ${info.size.join(' × ')} m`;
if (params.get('check') === '1') {
  const pre = document.createElement('pre');
  pre.id = 'check';
  pre.textContent = JSON.stringify(info);
  document.body.appendChild(pre);
}

let frame = frameParam ?? 0;
renderer.setAnimationLoop(() => {
  if (clip && frameParam === null) animator.apply(samplePose(clip, (frame += 1), basePose));
  controls.update();
  renderer.render(scene, camera);
});
