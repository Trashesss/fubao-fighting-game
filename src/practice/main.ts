import {
  ACESFilmicToneMapping,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BUKANGI } from '../characters/bukangi/character';
import { Fighter, NO_INPUT, type AttackButton, type CharacterDef, type FighterInput } from '../fighting/fighter';
import { activeHitboxes, capsuleSegment, moveFrames } from '../fighting/frameData';
import { Match, STAGE_HALF, type HitRecord } from '../fighting/match';
import { RIPPLE_LIFE, RippleField, type RippleType } from '../effects/ripples';
import { runFrameTests } from './frameTests';

/**
 * 연습 모드: 같은 캐릭터 둘을 2.5D 로 붙여 프레임·판정을 확인한다.
 *
 * 2.5D: 싸움은 월드 x 축 위, 카메라는 +z 쪽에서 두 캐릭터 가운데를 본다 (거리는 둘 사이 간격에 맞춘다).
 * 왼쪽을 보는 캐릭터는 좌우를 뒤집어 그린다 — 둘 다 같은 옆구리(캐릭터 왼쪽)가 카메라를 봐서, 다운 때 배가 보이는 것처럼 양쪽이 같게 보인다 (D-18).
 *
 * URL 파라미터
 *   dummy=stand|guard-high|guard-low|guard-auto|crouch|jump|p2   상대(2P) 행동 (기본 stand)
 *   reversal=1     상대가 경직이 끝나는 대로 1번 버튼(가장 빠른 기술)을 낸다 — 막힌 기술이 반격당하는지 확인
 *   boxes=1        판정 표시
 *   mirror=0       2P 좌우 뒤집기 끔
 *   gap=2.4        시작 간격 (몸통 가운데 사이, m. 밀어내기보다 가까우면 밀려난다)
 *   script=b1@10,fwd@20-40   1P 입력 대본 (b1~b6 누름, fwd/back/up/down 누르고 있기 시작-끝 틱)
 *   script2=...    2P 입력 대본 (dummy 대신)
 *   stop=N         N 틱을 바로 진행하고 멈춘다 (스크린샷용)
 *   shot=1         도움말 숨김
 *   test=1         프레임 자동 검사 → #check 에 JSON (화면은 그리지 않는다)
 */
const params = new URLSearchParams(location.search);
if (params.has('shot')) document.body.classList.add('shot');
const DEF: CharacterDef = BUKANGI;
const mirror = params.get('mirror') !== '0';
const startGap = Number(params.get('gap') ?? 2.4);

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0xd9d9d6);
const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.add(new HemisphereLight(0xf4f1ea, 0x6d6a64, 0.6));
const key = new DirectionalLight(0xfff4e6, 2.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2 });
key.shadow.bias = -0.0004;
scene.add(key, key.target);
const rim = new DirectionalLight(0xdfe8ff, 1.2);
rim.position.set(-3, 2, -4);
scene.add(rim);

// 바닥: 무대 폭만큼 밝게, 끝은 선으로
const floor = new Mesh(new PlaneGeometry(STAGE_HALF * 2 + 8, 10), new MeshStandardMaterial({ color: 0xc8c5bd, roughness: 0.92 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
for (const x of [-STAGE_HALF, STAGE_HALF]) {
  const line = new Mesh(new PlaneGeometry(0.04, 4), new MeshBasicMaterial({ color: 0x8a8780 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(x, 0.002, 0);
  scene.add(line);
}

// 바닥(y=0) 아래는 그리지 않는다 (잠수) — 뷰어와 같다
const floorPlane = new Plane(new Vector3(0, 1, 0), 0);
const ripples = new RippleField();
scene.add(ripples);
const emissions: { type: RippleType; x: number; z: number; tick: number }[] = [];

const made = [DEF.create(0), DEF.create(1)];
for (const { model } of made) {
  model.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of [o.material].flat()) {
      m.clippingPlanes = [floorPlane];
      m.clipShadows = true;
    }
  });
  scene.add(model);
}
let match: Match;
const onEvent = (type: string, x: number, z: number) => emissions.push({ type: type as RippleType, x, z, tick: match.tick });
const fighters: [Fighter, Fighter] = [
  new Fighter(DEF, made[0].model, made[0].body, -startGap / 2, 1, mirror, onEvent),
  new Fighter(DEF, made[1].model, made[1].body, startGap / 2, -1, mirror, onEvent),
];
match = new Match(fighters);

/** 몸통 가운데 사이가 gap 이 되게 놓는다 */
function resetPositions(gap = startGap): void {
  fighters[0].reset(-gap / 2, 1);
  fighters[1].reset(gap / 2, -1);
  const d = fighters[1].center() - fighters[0].center() - gap;
  fighters[0].x += d / 2;
  fighters[1].x -= d / 2;
  for (const f of fighters) {
    f.place();
    f.applyPose();
  }
  // 몸통보다 앞으로 나온 발 때문에 gap 보다 더 벌어질 수 있다 (가장 가까운 간격 = 신발끝이 맞닿는 0.88 m)
  match.separate();
  match.reset();
  emissions.length = 0;
}
resetPositions();

if (params.get('test') === '1') {
  const pre = document.createElement('pre');
  pre.id = 'check';
  pre.textContent = JSON.stringify(runFrameTests(match, resetPositions));
  document.body.appendChild(pre);
  throw new Error('frame tests done'); // 화면은 그리지 않는다
}

// ── 판정 표시 ───────────────────────────────────────────────────────────────
const boxes = new Group();
boxes.visible = params.get('boxes') === '1';
scene.add(boxes);
const hurtMat = new MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.28, depthWrite: false });
const hitMat = new MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.45, depthWrite: false });
const hurtMeshes = fighters.map((f) =>
  f.body.hurtboxes.map((box) => {
    const [a, b] = capsuleSegment(box);
    const m = new Mesh(new CapsuleGeometry(box.radius, a.distanceTo(b), 6, 16), hurtMat);
    m.renderOrder = 10;
    boxes.add(m);
    return m;
  }),
);
const hitPool: Mesh[] = [];
const unit = new SphereGeometry(1, 20, 12);
function updateBoxes(): void {
  const a = new Vector3();
  const b = new Vector3();
  let n = 0;
  fighters.forEach((f, i) => {
    const on = f.hurtActive();
    f.body.hurtboxes.forEach((box, k) => {
      const m = hurtMeshes[i][k];
      m.visible = on;
      capsuleSegment(box, a, b);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    });
    if (f.phase !== 'action' || !f.move) return;
    for (const h of activeHitboxes(f.move, f.t)) {
      if (!hitPool[n]) {
        hitPool[n] = new Mesh(unit, hitMat);
        hitPool[n].renderOrder = 11;
        boxes.add(hitPool[n]);
      }
      const m = hitPool[n++];
      m.visible = true;
      m.scale.setScalar(h.radius);
      f.body.sockets.get(h.socket)!.getWorldPosition(m.position);
    }
  });
  for (let i = n; i < hitPool.length; i++) hitPool[i].visible = false;
}

// ── 입력 ───────────────────────────────────────────────────────────────────
const held = new Set<string>();
const pressedQueue = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  held.add(e.code);
  pressedQueue.add(e.code);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

const P1_KEYS = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', b1: 'KeyJ', b2: 'KeyK', b3: 'KeyL', b4: 'KeyU', b5: 'KeyI', b6: 'KeyO' };
const P2_KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', b1: 'Numpad1', b2: 'Numpad2', b3: 'Numpad3', b4: 'Numpad4', b5: 'Numpad5', b6: 'Numpad6' };
const BUTTONS: AttackButton[] = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];

function keyboardInput(k: typeof P1_KEYS): FighterInput {
  return {
    left: held.has(k.left),
    right: held.has(k.right),
    up: held.has(k.up),
    down: held.has(k.down),
    pressed: BUTTONS.filter((b) => pressedQueue.has(k[b])),
  };
}

/** 입력 대본: "b1@10,fwd@20-40" */
function parseScript(text: string | null): ((tick: number, facing: number) => FighterInput) | null {
  if (!text) return null;
  const items = text.split(',').map((s) => {
    const [name, range] = s.split('@');
    const [a, b] = range.split('-').map(Number);
    return { name, a, b: b ?? a };
  });
  return (tick, facing) => {
    const on = (n: string) => items.some((it) => it.name === n && tick >= it.a && tick <= it.b);
    const fwd = on('fwd');
    const back = on('back');
    return {
      left: facing > 0 ? back : fwd,
      right: facing > 0 ? fwd : back,
      up: on('up'),
      down: on('down'),
      pressed: BUTTONS.filter((b) => items.some((it) => it.name === b && it.a === tick)),
    };
  };
}
const script1 = parseScript(params.get('script'));
const script2 = parseScript(params.get('script2'));

type Dummy = 'stand' | 'guard-high' | 'guard-low' | 'guard-auto' | 'crouch' | 'jump' | 'p2';
let dummy = (params.get('dummy') ?? 'stand') as Dummy;
let reversal = params.get('reversal') === '1';

function dummyInput(f: Fighter): FighterInput {
  f.autoGuard = dummy === 'guard-auto';
  const backKey = f.facing > 0 ? 'left' : 'right';
  const input: FighterInput = { ...NO_INPUT, pressed: [] };
  if (dummy === 'guard-high' || dummy === 'guard-low') input[backKey] = true;
  if (dummy === 'guard-low' || dummy === 'crouch') input.down = true;
  if (dummy === 'jump') input.up = true;
  // 반격: 경직이 끝나기 직전에 누른다 (입력 버퍼가 받아 두었다가 움직일 수 있는 첫 틱에 낸다)
  if (reversal && f.phase === 'stun' && f.t === f.stun - 2) input.pressed = ['b1'];
  return input;
}

function step(): void {
  const t = match.tick + 1;
  const i1 = script1 ? script1(t, fighters[0].facing) : keyboardInput(P1_KEYS);
  const i2 = script2 ? script2(t, fighters[1].facing) : dummy === 'p2' ? keyboardInput(P2_KEYS) : dummyInput(fighters[1]);
  pressedQueue.clear();
  match.step([i1, i2]);
  // 연습 모드: 체력은 맞고 나서 움직일 수 있게 되면 1초 뒤에 다시 채운다
  for (const f of fighters) {
    if (f.phase === 'neutral' && f.t > 60) f.hp = f.def.maxHp;
  }
}

// ── 카메라 ──────────────────────────────────────────────────────────────────
const FOV = 28;
const camera = new PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 80);
const camGoal = new Vector3();
function cameraGoal(): Vector3 {
  const c0 = fighters[0].center();
  const c1 = fighters[1].center();
  const mid = (c0 + c1) / 2;
  // 두 캐릭터 + 양옆 1.6 m 가 화면 폭에 들어오는 거리, 최소 7.2 m (키 2.6 m + 점프 0.9 m 가 화면 높이에 들어옴)
  const halfW = Math.abs(c1 - c0) / 2 + 1.6;
  const dist = Math.max(7.2, halfW / (Math.tan(((FOV / 2) * Math.PI) / 180) * camera.aspect));
  return camGoal.set(mid, 1.55, dist);
}
camera.position.copy(cameraGoal());
const lookAt = new Vector3();
function updateCamera(instant: boolean): void {
  const goal = cameraGoal();
  camera.position.lerp(goal, instant ? 1 : 0.12);
  lookAt.set(camera.position.x, 1.3, 0);
  camera.lookAt(lookAt);
  key.position.set(camera.position.x + 2.5, 5, 3.5);
  key.target.position.set(camera.position.x, 0, 0);
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ── 화면 글자 ───────────────────────────────────────────────────────────────
const $ = (id: string) => document.getElementById(id)!;
$('name1').textContent = `1P ${DEF.name}`;
$('name2').textContent = `${DEF.name} 2P`;
const bars = [$('bar1').firstElementChild as HTMLElement, $('bar2').firstElementChild as HTMLElement];
const PHASE_NAME = { neutral: '', action: '', stun: '경직', down: '다운' } as const;
const RESULT_NAME = { hit: '맞음', block: '막음', KD: '다운' } as const;
const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);

function stateLine(f: Fighter, i: number): string {
  let s = `${i + 1}P ${f.clip.name.padEnd(13)} ${String(Math.floor(f.frame())).padStart(2)}/${f.clip.length}f`;
  if (f.phase === 'stun') s += `  ${f.blocked ? '가드' : ''}경직 ${Math.max(0, f.stun - Math.max(0, f.t))}/${f.stun}`;
  else if (PHASE_NAME[f.phase]) s += `  ${PHASE_NAME[f.phase]}`;
  if (f.phase === 'action' && f.move) {
    const fd = moveFrames(f.move);
    const last = Math.max(...f.move.hitboxes.map((h) => h.frames[1]));
    const tag = activeHitboxes(f.move, f.t).length ? '<b>지속</b>' : f.t < fd.startup - 1 ? '발생' : f.t > last ? '회복' : '사이';
    s += `  [${tag}${f.hurtActive() ? '' : ' 무적'}]`;
  }
  return s;
}

function recordLine(r: HitRecord): string {
  const who = `${r.attacker + 1}P ${r.move}`;
  const combo = r.combo > 1 ? ` ${r.combo}콤보` : '';
  if (r.result === 'KD') return `${who} ${r.connect}f <b>다운</b>${combo}${r.measured !== null ? `  기상까지 ${sign(r.measured)}` : ''}`;
  if (r.chained) return `${who} ${r.connect}f ${RESULT_NAME[r.result]}${combo}  → 다음 판정으로 이어짐`;
  const m = r.measured === null ? '…' : sign(r.measured);
  const ok = r.measured === null ? '' : r.measured === r.expected ? ' <span class="ok">✓</span>' : ' <span class="bad">✗</span>';
  const late = r.expected !== r.calc ? ` (늦게 닿음, 첫 프레임 기준 ${sign(r.calc as number)})` : '';
  return `${who} ${r.connect}f ${RESULT_NAME[r.result]}${combo}  이득 <b>${m}</b> 계산 ${sign(r.expected as number)}${ok}${late}`;
}

function updateHud(): void {
  fighters.forEach((f, i) => (bars[i].style.width = `${(100 * f.hp) / f.def.maxHp}%`));
  $('clock').textContent = `${match.tick}f  간격 ${Math.abs(fighters[1].center() - fighters[0].center()).toFixed(2)} m${paused ? '  ❚❚' : slow ? '  ×¼' : ''}`;
  $('state').innerHTML = [stateLine(fighters[0], 0), stateLine(fighters[1], 1), '', ...match.records.slice(-6).reverse().map(recordLine)].join('<br>');
}

const help = $('help');
const moveList = Object.entries(DEF.buttons)
  .map(([b, name]) => {
    const fd = moveFrames(DEF.moves[name!]);
    return `<kbd>${P1_KEYS[b as AttackButton].slice(3)}</kbd> ${name} <span style="opacity:.7">i${fd.startup}</span>`;
  })
  .join('<br>');
help.innerHTML = `
  <div><kbd>A</kbd><kbd>D</kbd> 이동 (앞 두 번 = 대시) · <kbd>W</kbd> 점프 · <kbd>S</kbd> 앉기 · 뒤 = 막기</div>
  <div style="margin:4px 0">${moveList}</div>
  <div class="row">상대 <select id="dummy">
    <option value="stand">서 있기</option><option value="guard-high">서서 막기</option><option value="guard-low">앉아 막기</option>
    <option value="guard-auto">자동 막기</option><option value="crouch">앉아 있기</option><option value="jump">점프</option><option value="p2">2P 조작 (방향키·숫자패드)</option>
  </select></div>
  <div class="row"><button id="rev">경직 뒤 반격</button><button id="box">판정 <kbd>B</kbd></button></div>
  <div><kbd>P</kbd> 멈춤 · <kbd>F</kbd> 한 프레임 · <kbd>T</kbd> ¼ 속도 · <kbd>R</kbd> 위치 초기화</div>`;
const dummySelect = $('dummy') as HTMLSelectElement;
dummySelect.value = dummy;
dummySelect.addEventListener('change', () => {
  dummy = dummySelect.value as Dummy;
  dummySelect.blur();
});
const revButton = $('rev');
revButton.setAttribute('aria-pressed', String(reversal));
revButton.addEventListener('click', () => {
  reversal = !reversal;
  revButton.setAttribute('aria-pressed', String(reversal));
});
const boxButton = $('box');
const toggleBoxes = () => {
  boxes.visible = !boxes.visible;
  boxButton.setAttribute('aria-pressed', String(boxes.visible));
};
boxButton.setAttribute('aria-pressed', String(boxes.visible));
boxButton.addEventListener('click', toggleBoxes);

// ── 진행 ────────────────────────────────────────────────────────────────────
let paused = false;
let slow = false;
let acc = 0;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP') paused = !paused;
  if (e.code === 'KeyT') slow = !slow;
  if (e.code === 'KeyB') toggleBoxes();
  if (e.code === 'KeyR') resetPositions();
  if (e.code === 'KeyF' && paused) {
    step();
    frameAdvanced = true;
  }
});
let frameAdvanced = false;

const stopAt = params.has('stop') ? Number(params.get('stop')) : null;
if (stopAt !== null) {
  while (match.tick < stopAt) step();
  paused = true;
}

function draw(instant: boolean): void {
  ripples.set(emissions.filter((e) => match.tick - e.tick < RIPPLE_LIFE[e.type]).map((e) => ({ type: e.type, x: e.x, z: e.z, age: match.tick - e.tick })));
  if (boxes.visible) updateBoxes();
  updateCamera(instant);
  updateHud();
  renderer.render(scene, camera);
}
draw(true);

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += dt * (slow ? 0.25 : 1);
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      step();
    }
  }
  draw(stopAt !== null || frameAdvanced);
  frameAdvanced = false;
});
