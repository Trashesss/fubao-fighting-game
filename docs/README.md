# 문서 안내

"푸바오가 늑구와 세로를 찾아 부캉이를 타고 돌아오는 격투게임"의 개발 문서다.
목표는 레포를 처음 클론한 개발자(사람이든 AI 에이전트든)가 **지금까지와 같은 품질 기준으로** 작업을 이어가는 것이다.
그래서 "무엇을 만들었나"보다 **왜 그렇게 정했나, 무엇이 실패했나, 품질을 어떻게 재나**를 더 자세히 적는다.

## 읽는 순서

| 문서 | 내용 | 언제 읽나 |
|---|---|---|
| [01-project.md](01-project.md) | 게임 개요, 캐릭터, 확정된 방향 | 처음 |
| [02-decisions.md](02-decisions.md) | 의사결정 기록 (실패한 시도와 교훈 포함) | 처음, 그리고 방향을 바꾸고 싶을 때 |
| [03-bukangi-model.md](03-bukangi-model.md) | 부캉이(상어) 모델 제작 파이프라인 | 모델·형태·재질을 고칠 때 |
| [04-rig-animation.md](04-rig-animation.md) | 뼈대, 서 있는 자세, 동작(포즈 클립) 만들기 | 동작을 만들 때 |
| [05-quality-gates.md](05-quality-gates.md) | 품질 검사 도구와 기준, 검토 절차 | **무엇을 고치든 커밋 전에** |
| [06-roadmap.md](06-roadmap.md) | 진행 단계, 알려진 문제, 남은 결정 | 다음 할 일을 정할 때 |
| [07-conventions.md](07-conventions.md) | 코드·좌표·커밋 규칙 | 코드를 쓰기 전에 |

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:5317 (포트 고정 — 검사 스크립트가 이 포트를 쓴다)
npm run check        # 다른 터미널에서. 곡률·접지 검사 JSON 출력 (서버가 떠 있어야 함)
npm run build        # 타입 검사 + 빌드
```

필요한 것: Node 20 이상, Google Chrome(헤드리스 스크린샷·검사), 사진 측정 도구를 쓸 때만 [uv](https://docs.astral.sh/uv/)
(Python 3.10+ 와 pillow·numpy 를 `uv run --with` 로 그때그때 받는다. 시스템 Python 에 설치하지 않는다).

## 연습 모드

`http://localhost:5317/practice.html` — 부캉이 두 마리 2.5D 대결 (D-18). 1P: `A` `D` 이동(앞 두 번 = 대시), `W` 점프, `S` 앉기, 뒤 = 막기, `J K L U I O` 기술.
`P` 멈춤 · `F` 한 프레임 · `T` ¼ 속도 · `B` 판정 표시 · `R` 위치 초기화. 오른쪽 아래에서 상대 행동(서 있기·막기·점프·2P 조작)을 고른다.
화면 왼쪽 아래에 지금 프레임과 마지막 기술의 이득 프레임(측정 / 계산)이 나온다. URL 파라미터는 `src/practice/main.ts` 머리 주석.

## 뷰어 URL 파라미터 요약

`http://localhost:5317/?…` — 전체 목록은 `src/viewer/main.ts` 머리 주석.

| 파라미터 | 뜻 |
|---|---|
| `view=side\|front\|back\|top\|bottom\|three-quarter\|close-<부위>` | 카메라 (부위: snout, eye, gills, mouth, pectoral, dorsal, pelvic, caudal, shoe) |
| `pose=swim` | 바인드 포즈(헤엄치는 자세). 기본은 서 있는 격투 자세 |
| `shoe=0` | 운동화 빼기 |
| `jaw=40` | 입을 그 각도만큼 벌림 (클립이 jaw 를 키로 잡지 않은 동안) |
| `mode=zebra` / `mode=silhouette` | 얼룩말 반사 검사 / 검은 실루엣 |
| `light=sea` | 바닷속 조명 (사실감 판단용) |
| `cam=ortho` | 직교 카메라 (사진과 실루엣 비교) |
| `anim=idle&frame=20` | 동작 선택, 그 프레임에 멈춤 |
| `boxes=1` | 판정 표시 (파랑 = 피격 캡슐, 빨강 = 공격 판정, 지속 프레임에만) |
| `set={채널 JSON}` | 그 채널 값의 자세 하나로 멈춤 (자세 설계용, URL 인코딩) |
| `follow=0` | 카메라 따라가기 끔 (기본은 몸통을 따라가고 높이는 절반만) |
| `check=1` | 품질 검사 결과를 `#check` 에 JSON 으로 (`&trace=<클립>`, `&probe={채널 JSON}` 추가 가능) |
| `shot=1` | UI 숨김 (스크린샷용) |
