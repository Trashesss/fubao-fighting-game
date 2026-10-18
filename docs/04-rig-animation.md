# 04. 뼈대와 동작

## 뼈대 (`src/characters/bukangi/sharkRig.ts`)

- **척추:** 몸 축 위 0.03 TL 간격 **33개** (`SPINE_STATIONS`, u 0.02~0.98). 뿌리 뼈는 u=0.44(무게중심 근처)이고 여기서 앞 사슬(머리 쪽)과 뒤 사슬(꼬리 쪽)이 뻗는다.
- **짝지느러미:** 가슴(팔)·배(발) 좌우마다 뿌리·중간·끝 3마디. 가장 가까운 척추 뼈에 붙는다.
- **가중치:** 몸 정점은 척추 위치 u 에 대한 **균일 3차 B-스플라인(뼈 4개)**. 처음엔 이웃 뼈 2개 선형이었는데 큰 굽힘에서 등이 접혔다.
  짝지느러미 정점은 지느러미 2마디 + 척추 2개 (영향 4개 한도), 뿌리에서 몸 가중치로 부드럽게 넘어간다.
- **바인드 포즈 = 헤엄치는 자세.** 눈은 머리 뼈에, 운동화는 꼬리 뼈(u≈0.83)에 붙어 있다.

### 뼈 로컬 축의 뜻 (헷갈리기 쉬움)

뿌리 뼈를 −90° 가까이 돌려 세우면 축의 의미가 이렇게 된다 (`sharkAnimator.ts` 가 부호를 처리한다):

| 뼈 로컬 축 | 서 있을 때 | 앞 사슬 회전 + | 뒤 사슬 회전 + |
|---|---|---|---|
| x | 앞뒤 굽힘 | 머리가 앞(배 쪽)으로 | 꼬리가 뒤(등 쪽)로 |
| y | 옆 굽힘 (상어가 헤엄칠 때 흔드는 방향) | 머리가 오른쪽(+x)으로 | 꼬리가 **왼쪽**으로 |
| z | 몸 축 비틀기 | | |

큰 굽힘은 `bendRegion(rig, from, to, 총각도, 축)` 으로 구간 안 뼈들에 sin² 모양으로 나눈다. **한 뼈에 큰 각도를 몰지 않는다.**

## 서 있는 자세 = 두 점 접지

몸은 굽히지 않는다. 뿌리 뼈의 기울기만 풀어서 **꼬리 위 엽 끝과 운동화 밑창이 같은 높이**가 되게 한 뒤, 가장 낮은 점을 바닥(y=0)에 놓는다.
처음 운동화를 놓을 때는 `solveStandingTilt`(굳은 몸 회전식), 동작 중에는 애니메이터가 매 프레임 실제 뼈 자세로 다시 푼다(이분법, 지난 해 근처부터).

## 애니메이터 (`src/characters/bukangi/sharkAnimator.ts`)

`animator.apply(channels)` 가 한 프레임의 포즈를 적용한다. 순서:

1. 뼈 초기화 → 척추 구간 굽힘 적용
2. `support > 0` 이면 두 점이 함께 닿는 기울기를 풀고, 자유 기울기(`tilt`)와 `support` 비율로 섞는다
3. 지느러미 겨누기: 기본 자세 대비 **부모 뼈가 돈 만큼 같이 돌린 방향**을 겨눈다 (몸이 기울면 팔도 따라감)
4. 접지: 가장 낮은 접지점을 `hop` 높이에, 신발을 `slide` 위치에 고정 (`anchor`)

### 채널 (전부 0 이 기본 서 있는 자세, 각도는 도, 길이는 m)

| 채널 | 뜻 |
|---|---|
| `tilt` | 몸 전체 기울기 (+ = 앞으로 숙임). `support=1` 이면 무시됨(두 점 해가 정함) |
| `support` | 1 = 두 점 접지 유지 / 0 = 풀지 않음 (킥·점프처럼 한 점이나 공중일 때) |
| `hop` | 가장 낮은 접지점 높이 (점프·깡총) |
| `slide` | 신발을 고정할 앞뒤 위치 (+ = 앞). 걷기·대시에 쓴다 |
| `anchor` | 1 = 신발을 바닥에 고정 (미끄러지지 않게) |
| `headPitch/Side/Twist` | 머리 구간 (u 0~0.24). Pitch + = 앞으로 숙임, Side + = 오른쪽, Twist = 비틀기 |
| `trunkPitch/Side/Twist` | 몸통 구간 (u 0.22~0.44) |
| `tailPitch/Side` | 꼬리 구간 (u 0.55~0.8). Pitch + = 꼬리가 뒤로, Side + = 오른쪽 |
| `tailTipPitch/Side` | 꼬리 끝 구간 (u 0.79~1.0) |
| `pecR/L_yaw, _pitch, _elbow, _elbowYaw` | 가슴지느러미(팔). yaw + = 바깥으로, pitch + = 위로, elbow = 끝마디 추가 각도 |
| `pelR/L_yaw, _pitch, _knee` | 배지느러미(발) |
| `jaw` | 입 벌림 — **턱 뼈가 아직 없다** (로드맵 4단계) |

주의: 몸이 굳은 막대라 `support=1` 에서 몸 전체를 숙이고 싶으면 `tilt` 가 아니라 `trunkPitch`/`headPitch` 로 낸다 (발 쪽 접지에 영향이 없다).

## 동작 만들기 (`src/characters/bukangi/moves.ts`)

```ts
export const IDLE: PoseClip = {
  name: 'idle',
  length: 80,          // 60fps 프레임
  loop: true,
  keys: [
    { f: 0,  pose: { trunkPitch: 0, pecR_pitch: 0 } },
    { f: 20, pose: { trunkPitch: 5, pecR_pitch: 11 }, ease: 'smooth' },  // 'smooth'(기본, Catmull-Rom) | 'linear' | 'hold' | 'in' | 'out'
    …
  ],
};
export const CLIPS = { idle: IDLE, … };  // 여기 넣으면 뷰어 타임라인 목록에 뜬다
```

- 키에 적지 않은 채널은 **앞 키 값을 이어받는다** (첫 키는 `NEUTRAL`).
- 반복 클립은 마지막 키에서 첫 키로 이어 보간한다. 첫 키는 `f: 0` 에 둔다.
- 공격의 프레임 데이터·판정은 `src/fighting/frameData.ts` 의 `MoveSpec`/`HitboxSpec` 으로 적는다 (아직 사용하는 기술 없음).
  판정 기준점(소켓): `snout`, `pecR-tip`, `pecL-tip`, `tail-tip`, `shoe` (`animator.sockets`). 피격 캡슐: `head`, `trunk`, `tail`.

### 동작 검토 절차

1. 뷰어에서 재생, ◀ ▶ 로 키 근처를 한 프레임씩 본다. **판정** 버튼으로 피격 캡슐을 같이 본다.
2. `npm run check` 의 `motion.<클립>`: `maxGap`(두 접지점 높이 차, support=1 구간은 1 mm 미만이어야 함), `maxSlip`(신발 미끄러짐, anchor=1 구간은 0), `minY`(바닥 아래로 들어가지 않음, ≥ 0).
3. 키 프레임을 `?anim=<이름>&frame=N&shot=1` 로 찍어 시트로 묶어 본다 ([05-quality-gates.md](05-quality-gates.md)).
4. 굽힘이 큰 동작은 `mode=zebra` 로 굽은 곳의 구김을 본다.

## 현재 동작

| 클립 | 길이 | 내용 |
|---|---|---|
| `idle` | 80f 반복 | 몸통을 앞뒤로 들썩, 가드한 지느러미를 좌우 박자 어긋나게 까딱, 꼬리를 옆으로 살짝. 접지 검사: maxGap 0.09 mm, maxSlip 0 |
