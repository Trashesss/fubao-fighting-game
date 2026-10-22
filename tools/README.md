# tools

품질 검사·사진 측정 도구. 사용법과 기준은 [docs/05-quality-gates.md](../docs/05-quality-gates.md).

| 파일 | 하는 일 |
|---|---|
| `render/shoot.sh` | 뷰어를 헤드리스 Chrome 으로 찍기 (`Q`, `W`, `H` 환경변수) |
| `render/check.sh` | 곡률·동작 접지 검사 JSON (`npm run check`) |
| `render/practice-check.sh` | 연습 모드 프레임 자동 검사 JSON (기술마다 실제 판, 이득 측정 = 계산) |
| `render/practice-shot.sh` | 연습 모드 찍기 (`script=b2@1&stop=20` 같은 입력 대본) |
| `render/contact_sheet.py` | 여러 장을 비교 시트로 |
| `render/fubao-shot.sh` | 푸바오 뷰어 찍기 |
| `render/fubao-compare.sh` | 푸바오 실루엣 vs 기준 그림 IoU |
| `reference/panda_silhouette.py` | 판다 기준 그림 → 측면·정면 마스크 + 높이별 윤곽 |
| `reference/panda_compare.py` | 렌더 실루엣과 마스크 IoU (구간별) + 겹침 그림 |
| `render/grid_crop.py` | 확대 + 좌표 격자 (사진 좌표 읽기용) |
| `reference/segment_photo.py` | 사진에서 상어 마스크 |
| `reference/measure_profile.py` | 마스크 → `spec/reference-measurements.json` |
| `reference/compare_silhouette.py` | 렌더 실루엣과 사진 마스크 IoU |

Python 도구는 `uv run --with pillow --with numpy python -I <스크립트> …` 로 실행한다 (시스템 Python 3.9 에 설치하지 않는다).
출력은 `out/` 에 둔다 (git 무시).
