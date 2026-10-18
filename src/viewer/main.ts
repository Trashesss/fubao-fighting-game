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
import { createBukangiModel } from '../characters/bukangi/createBukangiModel';
import { qualityReport } from '../characters/bukangi/qualityReport';

/**
 * URL 파라미터 (헤드리스 Chrome 스크린샷 비교용)
 *   view=side|side-r|front|back|top|bottom|three-quarter|close-<landmark>
 *   cam=ortho          직교 카메라 (측면 실루엣 비교)
 *   mode=silhouette    흰 배경에 검은 실루엣
 *   mode=zebra         얼룩말 반사 — 흑백 줄무늬 환경을 거울 재질로 비춰 곡면의 출렁임·구김을 찾는다
 *   check=1            곡률 검사 결과를 #check 에 JSON 으로 쓴다
 *   light=sea          사실감 판단용 조명 (위에서 내리는 차가운 빛 + 약한 안개)
 *   pose=swim          바인드 포즈 (헤엄치는 자세) — 기본은 서 있는 격투 자세
 *   shoe=0             운동화 빼기 (사진 실루엣 비교용)
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

if (params.get('check') === '1') {
  const pre = document.createElement('pre');
  pre.id = 'check';
  const s = new Box3().setFromObject(model).getSize(new Vector3());
  pre.textContent = JSON.stringify({ ...qualityReport(model), cage: model.userData.sculptRuntime.cage, size: s.toArray().map((v) => +v.toFixed(3)) });
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
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
