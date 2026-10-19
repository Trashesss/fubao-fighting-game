# 05. 품질 검사와 검토 절차

**원칙:** 매끈함·사실감을 감으로 판단하지 않는다. 숫자 하나(곡률)와 렌더 하나(얼룩말)를 먼저 보고, 그다음 확대 렌더를 본다.
사용자가 결함을 먼저 찾아내는 일이 없게 한다 — 지금까지 사용자가 찾아낸 결함(목, 울퉁불퉁, 구김, 곰보)은 전부 아래 검사로 잡을 수 있는 것이었다.

모든 도구는 개발 서버(`npm run dev`, 포트 5317)가 떠 있어야 한다. 렌더 출력은 `out/`(git 무시)에 둔다.

## 1. 자동 검사 — `npm run check`

뷰어를 `?check=1` 로 헤드리스 Chrome 에서 열고 JSON 을 출력한다 (`tools/render/check.sh`).

```json
{ "pass": true,
  "designed": { "top": 1, "bottom": 1, "width": 1 },   // 설계 곡선의 곡률 부호 바뀜 (u 0.03~0.75)
  "mesh": { "top": 2, "bottom": 1 },                    // 나뉜 메시의 등·배 정중선 (지느러미 뿌리 구간에서 끊어 셈)
  "where": { "top": [0.53, 0.64], "bottom": [0.64] },   // 부호가 바뀐 u 위치 — 고칠 곳 찾기용
  "fins": { "dorsal-fin": 0, … },                       // 지느러미 앞전 조절 다각형의 꺾임 방향 바뀜
  "size": [0.903, 2.561, 1.61],                         // 서 있는 자세 크기 (m)
  "motion": { "walk": { "maxGap": 0, "tailSkate": 0.00043, "shoeSkate": 0.0362, "minY": 0 }, … },
  "attacks": { "tail-sweep": { "startup": 15, "active": 5, "recovery": 27, "total": 46,
               "height": ["low"], "y": [0.015, 0.375], "reach": 1.234 }, … } }
```

| 항목 | 기준 | 근거 |
|---|---|---|
| 몸 윗선·아랫선 곡률 부호 바뀜 (설계·메시 모두) | **≤ 2** | 실제 상어는 0~2 (꼬리자루로 넘어가는 곳) |
| 지느러미 앞전 | **≤ 1** | |
| `motion.*.maxGap` (support=1 구간) | < 0.001 m | 두 점이 함께 닿아야 함 |
| `motion.*.tailSkate` | < 0.001 m | 바닥을 딛은 꼬리 끝이 미끄러지면 안 됨 |
| `motion.*.shoeSkate` | < 0.001 m (걷기 제외) | 걷기는 신발로 바닥을 끄는 동작이라 예외 |
| `motion.*.minY` | ≥ 0 | 바닥 아래로 들어가면 안 됨 |
| `motion.*.bodySkate` | < 0.001 m | 바닥에 닿은 몸 점(누운 몸)이 끌리면 안 됨 |
| `motion.*.bodyMinY` | 서 있는 동작은 > 0.3 m, 다운·누움·기상은 ≈ 0 | 서서 몸이 바닥에 닿거나, 누웠는데 떠 있으면 안 됨 |
| `motion.*.skid` | 클립의 밀려남 거리와 같음 | `skid` 구간은 미끄러짐 검사에서 빠진다 |
| `attacks.*.onHit / onBlock` | 문서(04)의 표와 같음 | 경직 값을 바꾸면 표도 고친다 |
| `attacks.*.chainOnHit` | 여러 번 때리는 기술은 true | 1타를 맞으면 2타까지 이어져야 함 |
| `attacks.*.y` (지속 프레임 판정 구의 아래~위 높이) | 하단 `low` 는 위끝 < 0.5 m, 상단 `high` 는 아래끝 > 1.3 m (부캉이 기준) | 적은 판정 높이와 실제 판정 위치가 맞아야 함 |
| `attacks.*.reach` (기본 자세 신발에서 판정 구 앞면까지) | > 0.6 m | 자기 몸 앞으로 나가야 상대에게 닿음 |

미끄러짐(`*Skate`)은 바닥 위 **앞뒤·좌우 거리**로 잰다. 처음엔 앞뒤만 쟀는데, 좌우로 넓히자 꼬리를 옆으로 굽힐 때 꼬리 끝이 1~3 mm 미끄러지던 것이 드러났다 (D-14 의 발 방향 고정으로 해결).

곡률은 "최대 곡률의 3% 미만 구간은 0 으로 본다" 허용치로 센다 (`curvatureSignChanges`). 기준을 느슨하게 바꾸지 말 것.

## 2. 얼룩말 반사 렌더 — `mode=zebra`

반사 방향의 y 성분으로 흑백 평행 줄을 그린다. **매끈한 곡면은 줄이 부드럽게 휘고, 출렁이거나 구겨진 곳은 줄이 꺾이거나 흔들린다.**
자동차·제품 디자인에서 곡면 품질을 보는 방법이다. 회색 스튜디오 조명은 출렁임을 잘 감춘다.

```bash
Q='&mode=zebra' W=1400 H=800 tools/render/shoot.sh out z side three-quarter top bottom
Q='&mode=zebra&pose=swim' W=1400 H=800 tools/render/shoot.sh out zswim side three-quarter
```

정상인데 이상해 보이는 것: 지느러미처럼 얇은 곳은 줄이 촘촘해진다. 아가미·입 홈은 맵이라 얼룩말에 안 나온다(셰이더가 노멀 맵을 쓰지 않음).

## 3. 확대·여러 방향 렌더

멀리서 찍은 한 장으로 끝내지 않는다. 화면을 채울 만큼 확대해 본다.

```bash
W=1000 H=800 tools/render/shoot.sh out c close-snout close-eye close-gills close-mouth close-pectoral close-dorsal close-pelvic close-caudal close-shoe
W=1200 H=1000 tools/render/shoot.sh out g side front back three-quarter top bottom
Q='&light=sea' W=1200 H=1000 tools/render/shoot.sh out sea side three-quarter
```

볼 것: 지느러미 뿌리가 떠 있거나 파묻힌 곳, 주둥이 끝 극점, 띠처럼 층진 곡면, 표면에 얹기만 한 선, 정면에서 체색 비율, 신발과 꼬리 사이 틈.

## 4. 사진 실루엣 비교 (헤엄 자세)

```bash
# 1회: 사진 마스크 만들기 → out/mask.npy
uv run --with pillow --with numpy python -I tools/reference/segment_photo.py assets/concept/bukangi/reference-shark-photo.png out/mask.png 28
# 렌더 후 비교
Q='&pose=swim&shoe=0&cam=ortho&mode=silhouette' W=1600 H=700 tools/render/shoot.sh out s side
uv run --with pillow --with numpy python -I tools/reference/compare_silhouette.py out/mask.npy assets/concept/bukangi/reference-shark-photo.png out/s-side.png out/compare.png
```

기준 **IoU ≥ 0.9** (현재 0.915, 구간별 머리 0.918 · 몸통 0.945 · 꼬리몸 0.915 · 꼬리지느러미 0.814).
0.95 를 쫓지 않는다 — 사진이 정측면이 아니라서, 그 이상은 잡음을 맞추는 것이다 (D-07).

### 사진 측정 다시 하기

```bash
uv run --with pillow --with numpy python -I tools/reference/measure_profile.py out/mask.npy \
  assets/concept/bukangi/reference-shark-photo.png src/characters/bukangi/spec/reference-measurements.json out/measure.png
```
`out/measure.png` 에 윤곽·지느러미·표식이 겹쳐 그려진다. 반드시 눈으로 확인한다 (지느러미 기부·두 번째 상어 영역은 손으로 보간한 값이다).
사진에서 좌표를 손으로 읽을 때는 `tools/render/grid_crop.py` 로 확대 격자를 만든다.

## 5. 동작 프레임 시트

```bash
for f in 0 20 40 60; do Q="&anim=idle&frame=$f" W=900 H=1000 tools/render/shoot.sh out idle-f$f side; done
uv run --with pillow python -I tools/render/contact_sheet.py out/idle-sheet.png "f0=out/idle-f0-side.png" "f20=out/idle-f20-side.png" …
```
(shoot.sh 출력 이름은 `<태그>-<view>.png`.)

## 검토 기록

무엇을 왜 바꿨는지와 검사 수치를 `src/characters/bukangi/spec/assessment.json` 의 `reviewLog` 에 남긴다.
보고할 때는 **바뀐 것, 근거 수치, 아직 안 맞는 것**을 함께 적는다. "개선됨"과 "완료"를 구분한다.

## 헤드리스 Chrome 메모

- 플래그: `--headless=new --use-angle=metal --enable-unsafe-swiftshader --virtual-time-budget=8000`. 맵 굽기(2048×4096)와 서브디비전 때문에 페이지 준비에 몇 초 걸린다. 검사는 20000.
- macOS 기준 경로. 다른 OS 는 `CHROME=/path/to/chrome` 로 지정.
