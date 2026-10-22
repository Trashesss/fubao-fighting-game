#!/usr/bin/env bash
# 푸바오 뷰어(fubao.html)를 헤드리스 Chrome 으로 찍는다. 개발 서버가 떠 있어야 한다.
# 사용: tools/render/fubao-shot.sh <출력.png> '<쿼리>'    예) tools/render/fubao-shot.sh out/fubao/side.png 'view=side'
# W,H = 창 크기 (기본 1000x1100). 기준 그림 비교(view=ref-side|ref-front)는 W=768 H=1024 로 찍는다
set -euo pipefail
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=${TMPDIR:-/tmp}/bukangi-chrome-profile
"$CHROME" --headless=new --disable-gpu-sandbox --use-angle=metal --enable-unsafe-swiftshader --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="${W:-1000},${H:-1100}" --virtual-time-budget=${BUDGET:-20000} --user-data-dir="$PROFILE" \
  --screenshot="$1" "http://localhost:${PORT:-5317}/fubao.html?shot=1&$2" >/dev/null 2>&1
echo "$1"
