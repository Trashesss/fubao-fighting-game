import {
  ACESFilmicToneMapping,
  Box3,
  Camera,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShadowMaterial,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bukangiAnimator, createBukangiModel } from '../characters/bukangi/createBukangiModel';
import { CLIPS, MOVES } from '../characters/bukangi/moves';
import { activeHitboxes, capsuleSegment, moveFrames } from '../fighting/frameData';
import { NEUTRAL } from '../characters/bukangi/sharkAnimator';
import { samplePose } from '../animation/poseClip';
import { Timeline } from './timeline';
import { qualityReport } from '../characters/bukangi/qualityReport';

/**
 * URL 파라미터 (헤드리스 Chrome 스크린샷 비교용)
 *   view=side|side-r|front|back|top|bottom|three-quarter|close-<landmark>
 *   cam=ortho          직교 카메라 (측면 실루엣 비교)
 *   mode=silhouette    흰 배경에 검은 실루엣
 *   mode=zebra         얼룩말 반사 — 흑백 줄무늬 환경을 거울 재질로 비춰 곡면의 출렁임·구김을 찾는다
 *   check=1            곡률 검사 + 동작 접지 검사 결과를 #check 에 JSON 으로 쓴다
 *     &trace=<클립>    그 클립의 프레임별 접지점 기록을 덧붙인다
 *     &probe={...}     그 채널 값으로 한 프레임 적용한 소켓·접지점 좌표를 덧붙인다 (동작 설계용)
 *   anim=idle          재생할 동작 (서 있는 자세에서 기본 idle)
 *   frame=N            그 프레임에 멈춘다 (스크린샷용)
 *   boxes=1            판정 표시 (피격 캡슐 + 공격 판정)
 *   follow=0           카메라가 캐릭터를 따라가지 않음 (기본은 몸통을 따라간다. 높이는 절반만 따라가 점프 높이가 보이게)
 *   light=sea          사실감 판단용 조명 (위에서 내리는 차가운 빛 + 약한 안개)
 *   pose=swim          바인드 포즈 (헤엄치는 자세) — 기본은 서 있는 격투 자세
 *   shoe=0             운동화 빼기 (사진 실루엣 비교용)
 *   jaw=30             입을 그 각도(도)만큼 벌린다 (클립이 jaw 를 키로 잡지 않은 동안)
 *   hide=a,b           이름에 a 나 b 가 들어간 부위 숨김
 *   explode=1          부위 분해
 *   shot=1             UI 숨김
 */
const params = new URLSearchParams(location.search);
if (params.has('shot')) document.body.classList.add('shot');
const silhouette = params.get('mode') === 'silhouette';
const zebra = params.get('mode') === 'zebra';
const sea = params.get('light') === 'sea';

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.enabled = !silhouette;
renderer.shadowMap.type = PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(silhouette ? 0xffffff : zebra ? 0x808080 : sea ? 0x1d4a5c : 0xd9d9d6);

/**
 * 얼룩말 반사: 반사 방향의 한 성분(R.y)으로 평행 줄을 그린다. 환경맵 줄무늬와 달리 극점이 없어서
 * 줄이 한 점으로 모이는 가짜 무늬가 생기지 않는다. 줄이 꺾이거나 흔들리는 곳이 곡면의 출렁임이다.
 */
const mirror = zebra
  ? new ShaderMaterial({
      // 스키닝 블록을 넣어야 서 있는 자세(뼈로 구부린 메시)에서도 검사할 수 있다
      vertexShader: `
        #include <common>
        #include <skinning_pars_vertex>
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          #include <skinbase_vertex>
          #include <beginnormal_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          vec3 n = normalize(vWorldNormal);
          vec3 r = reflect(normalize(vWorldPos - cameraPosition), n);
          float s = smoothstep(-0.12, 0.12, sin(r.y * 26.0));
          gl_FragColor = vec4(vec3(0.06 + 0.9 * s), 1.0);
        }`,
    })
  : null;

const model = createBukangiModel({ pose: params.get('pose') === 'swim' ? 'swim' : 'stand', shoe: params.get('shoe') !== '0' });
model.traverse((o) => {
  if (o instanceof Mesh) {
    o.castShadow = true;
    o.receiveShadow = true;
    if (silhouette) o.material = new MeshBasicMaterial({ color: 0x000000 });
    if (mirror) o.material = mirror;
  }
});
const hide = (params.get('hide') ?? '').split(',').filter(Boolean);
for (const part of model.children) if (hide.some((h) => part.name.includes(h))) part.visible = false;
const rawBox = new Box3().setFromObject(model);
// 서 있는 자세는 바닥에 딛고, 헤엄치는 자세는 바닥 위에 띄운다
model.position.y += -rawBox.min.y + (params.get('pose') === 'swim' ? 0.12 : 0);
scene.add(model);
(window as unknown as { model: Object3D }).model = model;

const standing = params.get('pose') !== 'swim';
const animator = bukangiAnimator(model);

if (params.get('check') === '1') {
  const pre = document.createElement('pre');
  pre.id = 'check';
  // 곡률 검사는 바인드 포즈(헤엄)를 기준으로 하므로 메시 정중선은 자세와 관계없이 같다
  const s = new Box3().setFromObject(model).getSize(new Vector3());
  // 동작 접지 검사. 접지점(꼬리 위 엽 끝·신발)마다:
  //   tailSkate / shoeSkate = 두 프레임 연속 바닥에 닿아 있는 동안 앞뒤로 미끄러진 최대 거리 (발 미끄러짐).
  //                           꼬리는 항상 0 이어야 하고, 신발은 걷기의 '끌기'에서만 움직인다
  //   gap    = support=1 프레임에서 두 접지점 높이 차
  //   minY   = 가장 낮은 접지점 높이 (바닥 아래로 들어가면 음수)
  const motion: Record<string, { maxGap: number; tailSkate: number; shoeSkate: number; minY: number }> = {};
  const ON_GROUND = 0.002;
  const neutralShoe = animator.contactReport().shoe;
  // ?trace=<클립> : 프레임별 [f, tailY, shoeY, tailX, tailZ, shoeX, shoeZ, support, anchorTail]
  const traces: Record<string, (string | number)[][]> = {};
  // 공격 판정: 지속 프레임 동안 판정 구의 높이(바닥~구 아래/위)와 앞으로 뻗은 거리 (기본 자세 신발 기준, 구 앞면까지)
  const attacks: Record<string, object> = {};
  const probe: Record<string, number[]> = {};
  if (standing) {
    for (const clip of Object.values(CLIPS)) {
      let maxGap = 0;
      let tailSkate = 0;
      let shoeSkate = 0;
      let minY = Infinity;
      let prev: ReturnType<typeof animator.contactReport> | null = null;
      const trace: (string | number)[][] = [];
      const move = MOVES[clip.name];
      const hit = { yLow: Infinity, yHigh: -Infinity, reach: -Infinity };
      const frames = clip.loop ? clip.length + 1 : clip.length;
      for (let f = 0; f < frames; f++) {
        const wrapped = clip.loop && f === clip.length;
        const pose = samplePose(clip, wrapped ? 0 : f, NEUTRAL);
        animator.apply(pose);
        const c = animator.contactReport();
        // 반복이 넘어가는 프레임은 rootMotion 만큼 옮긴 자리에서 다시 시작한다
        if (wrapped) {
          c.tail.z += clip.rootMotion ?? 0;
          c.shoe.z += clip.rootMotion ?? 0;
        }
        if (pose.support >= 0.999) maxGap = Math.max(maxGap, Math.abs(c.tailY - c.shoeY));
        minY = Math.min(minY, c.tailY, c.shoeY);
        if (prev) {
          if (prev.tailY < ON_GROUND && c.tailY < ON_GROUND) tailSkate = Math.max(tailSkate, c.tail.distanceTo(prev.tail));
          if (prev.shoeY < ON_GROUND && c.shoeY < ON_GROUND) shoeSkate = Math.max(shoeSkate, c.shoe.distanceTo(prev.shoe));
        }
        if (move && !wrapped) {
          for (const h of activeHitboxes(move, f)) {
            const p = animator.socketPosition(h.socket);
            hit.yLow = Math.min(hit.yLow, p.y - h.radius);
            hit.yHigh = Math.max(hit.yHigh, p.y + h.radius);
            hit.reach = Math.max(hit.reach, p.z + h.radius - neutralShoe.z);
          }
        }
        if (params.get('trace') === clip.name)
          trace.push([f, ...[c.tailY, c.shoeY, c.tail.x, c.tail.z, c.shoe.x, c.shoe.z].map((v) => +v.toFixed(4)), +pose.support.toFixed(2), +pose.anchorTail.toFixed(2)]);
        prev = c;
      }
      if (trace.length) traces[clip.name] = trace;
      motion[clip.name] = { maxGap: +maxGap.toFixed(5), tailSkate: +tailSkate.toFixed(5), shoeSkate: +shoeSkate.toFixed(5), minY: +minY.toFixed(5) };
      if (move) attacks[clip.name] = { ...moveFrames(move), height: move.hitboxes.map((h) => h.height), y: [+hit.yLow.toFixed(3), +hit.yHigh.toFixed(3)], reach: +hit.reach.toFixed(3) };
    }
    // ?probe={"tilt":-20,...} : 그 채널로 한 프레임 적용한 뒤 소켓·접지점 위치 (동작 설계용)
    if (params.has('probe')) {
      animator.apply({ ...NEUTRAL, ...JSON.parse(params.get('probe')!) });
      for (const name of animator.sockets.keys()) probe[name] = animator.socketPosition(name).toArray().map((v) => +v.toFixed(3));
      const c = animator.contactReport();
      probe.contact = [c.tailY, c.shoeY, c.tail.x, c.tail.z, c.shoe.x, c.shoe.z].map((v) => +v.toFixed(3));
    }
    animator.apply(NEUTRAL);
  }
  pre.textContent = JSON.stringify({ ...qualityReport(model), cage: model.userData.sculptRuntime.cage, size: s.toArray().map((v) => +v.toFixed(3)), motion, attacks, traces, probe });
  document.body.appendChild(pre);
}

if (!silhouette && !zebra) {
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = sea ? 0.25 : 0.55;
  scene.add(new HemisphereLight(sea ? 0x9fd4e6 : 0xf4f1ea, sea ? 0x0b2530 : 0x6d6a64, sea ? 0.9 : 0.6));
  const key = new DirectionalLight(sea ? 0xd8f1ff : 0xfff4e6, sea ? 3.2 : 2.4);
  key.position.set(sea ? 0.6 : 2.5, 5, sea ? 0.8 : 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5 });
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new DirectionalLight(0xdfe8ff, sea ? 0.5 : 1.2);
  rim.position.set(-3, 2, -4);
  scene.add(rim);
  if (sea) scene.fog = new FogExp2(0x1d4a5c, 0.09);
  else {
    const ground = new Mesh(new PlaneGeometry(30, 30), new ShadowMaterial({ opacity: 0.25 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }
}

// ── 카메라 ────────────────────────────────────────────────────────────────
const box = new Box3().setFromObject(model);
const center = box.getCenter(new Vector3());
const size = box.getSize(new Vector3());
const radius = size.length() / 2;
const ortho = params.get('cam') === 'ortho';
const camera: Camera & { updateProjectionMatrix(): void } = ortho
  ? new OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
  : new PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const DIRS: Record<string, [number, number, number]> = {
  side: [-1, 0, 0],
  'side-r': [1, 0, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
  'three-quarter': [-0.75, 0.35, 0.6],
};
// 확대 검토 지점별 카메라 방향
const CLOSE_DIRS: Record<string, [number, number, number]> = {
  snout: [-0.8, 0.25, 0.7],
  eye: [-1, 0.1, 0.25],
  gills: [-1, 0.05, 0.15],
  mouth: [-0.5, -1, 0.45],
  pectoral: [-0.85, -0.45, 0.3],
  dorsal: [-1, 0.45, 0.25],
  pelvic: [-0.6, -1, 0.2],
  caudal: [-1, 0.15, -0.3],
  shoe: [-0.8, 0.45, 0.6],
};

function setView(name: string) {
  let target = center.clone();
  let dir = new Vector3(...(DIRS[name] ?? DIRS['three-quarter'])).normalize();
  // 화면에 모델 전체(키 포함)가 들어오는 거리
  const fovHalf = (30 / 2) * (Math.PI / 180);
  const aspectNow = innerWidth / innerHeight;
  let dist = Math.max(size.y / 2 / Math.tan(fovHalf), Math.max(size.x, size.z) / 2 / (Math.tan(fovHalf) * aspectNow)) * 1.15 + radius;
  if (name.startsWith('close-')) {
    const key = name.slice(6);
    const lm = (model.userData.sculptRuntime.landmarks as Record<string, number[]>)[key];
    if (lm) {
      target = new Vector3(...lm).add(model.position);
      dir = new Vector3(...(CLOSE_DIRS[key] ?? [-1, 0, 0])).normalize();
      dist = 0.55;
    }
  }
  camera.position.copy(target).addScaledVector(dir, dist);
  controls.target.copy(target);
  const aspect = innerWidth / innerHeight;
  if (camera instanceof PerspectiveCamera) camera.aspect = aspect;
  if (camera instanceof OrthographicCamera) {
    // 측면에서 몸 전장이 화면 폭의 90% 를 채우도록
    const halfW = (Math.max(size.z, size.x) / 2) * 1.08;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfW / aspect;
    camera.bottom = -halfW / aspect;
  }
  camera.updateProjectionMatrix();
  controls.update();
}
setView(params.get('view') ?? 'three-quarter');

// ── 카메라 따라가기: 몸통 피격 캡슐 가운데가 움직인 만큼 카메라와 회전 중심을 옮긴다 ──────────────
const trunk = animator.hurtboxes.find((b) => b.name === 'trunk')!;
const trunkCenter = () => {
  const [a, b] = capsuleSegment(trunk);
  return a.add(b).multiplyScalar(0.5);
};
const followBase = trunkCenter();
const followed = new Vector3();
let follow = standing && params.get('follow') !== '0';
const updateFollow = () => {
  const goal = follow ? trunkCenter().sub(followBase) : new Vector3();
  goal.y *= 0.5;
  // 재생 중에는 부드럽게 따라간다 (꼬리 쓸기처럼 제자리에서 돌 때 몸통 가운데가 작은 원을 그려 화면이 떨리지 않게).
  // 멈춰 있으면(한 프레임 보기·스크린샷) 바로 붙는다
  const d = goal.sub(followed).multiplyScalar(timeline?.playing ? 0.15 : 1);
  followed.add(d);
  camera.position.add(d);
  controls.target.add(d);
};

// ── 분해 보기 ─────────────────────────────────────────────────────────────
const parts = model.children.filter((c) => c.name);
const rest = new Map(parts.map((p) => [p, p.position.clone()]));
let exploded = false;
const setExplode = (on: boolean) => {
  exploded = on;
  for (const part of parts) {
    part.position.copy(rest.get(part)!);
    if (!on) continue;
    const c = new Box3().setFromObject(part).getCenter(new Vector3()).sub(center);
    part.position.addScaledVector(c, 0.8).add(c.clone().normalize().multiplyScalar(0.12));
  }
};
if (params.get('explode') === '1') setExplode(true);

// ── 부위 선택 ─────────────────────────────────────────────────────────────
const label = document.getElementById('label')!;
const raycaster = new Raycaster();
renderer.domElement.addEventListener('click', (e) => {
  raycaster.setFromCamera(new Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  let target: Object3D | null = raycaster.intersectObjects(parts, true)[0]?.object ?? null;
  while (target && target.parent !== model) target = target.parent;
  label.textContent = target ? target.name : '';
});

// ── UI ────────────────────────────────────────────────────────────────────
const ui = document.getElementById('ui')!;
const button = (text: string, onClick: (b: HTMLButtonElement) => void) => {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', () => onClick(b));
  ui.appendChild(b);
};
for (const [name, text] of [
  ['side', '측면'],
  ['front', '정면'],
  ['back', '후면'],
  ['top', '위'],
  ['bottom', '아래'],
  ['three-quarter', '3/4'],
  ['close-snout', '주둥이'],
  ['close-gills', '아가미'],
  ['close-mouth', '입'],
  ['close-pectoral', '가슴지느러미'],
  ['close-dorsal', '등지느러미'],
  ['close-caudal', '꼬리'],
  ['close-shoe', '신발'],
]) {
  button(text, () => setView(name));
}
button('분해', (b) => {
  setExplode(!exploded);
  b.setAttribute('aria-pressed', String(exploded));
});
button('따라가기', (b) => {
  follow = !follow;
  b.setAttribute('aria-pressed', String(follow));
});
ui.lastElementChild!.setAttribute('aria-pressed', String(follow));
button('와이어프레임', (b) => {
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  model.traverse((o) => {
    if (o instanceof Mesh) (o.material as { wireframe: boolean }).wireframe = on;
  });
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  setView(params.get('view') ?? 'three-quarter');
  followed.set(0, 0, 0);
});

// ── 동작 타임라인 (서 있는 자세만) ───────────────────────────────────────────
let timeline: Timeline | null = null;
if (standing && !silhouette) {
  const clip = CLIPS[params.get('anim') ?? 'idle'] ?? CLIPS.idle;
  timeline = new Timeline(animator, CLIPS, clip, { ...NEUTRAL, jaw: Number(params.get('jaw') ?? 0) }, scene, model, MOVES);
  if (params.has('frame')) {
    timeline.setPlaying(false);
    timeline.frame = Number(params.get('frame'));
    timeline.apply();
  }
  if (params.get('boxes') === '1') timeline.showBoxes(true);
}

if (!standing && params.has('jaw')) model.getObjectByName('jaw')!.rotation.x = (Number(params.get('jaw')) * Math.PI) / 180;

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  timeline?.update(Math.min(0.1, (now - last) / 1000));
  last = now;
  updateFollow();
  controls.update();
  renderer.render(scene, camera);
});
