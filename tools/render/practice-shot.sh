#!/usr/bin/env bash
# 연습 모드를 헤드리스 Chrome 으로 찍는다. 개발 서버가 떠 있어야 한다.
# 사용: tools/render/practice-shot.sh <출력.png> '<쿼리>'   예) tools/render/practice-shot.sh out/kick.png 'script=b2@1&stop=21&boxes=1&gap=1'
# W,H = 창 크기 (기본 1400x800)
set -euo pipefail
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=${TMPDIR:-/tmp}/bukangi-chrome-profile
"$CHROME" --headless=new --disable-gpu-sandbox --use-angle=metal --enable-unsafe-swiftshader --hide-scrollbars \
  --window-size="${W:-1400},${H:-800}" --virtual-time-budget=${BUDGET:-15000} --user-data-dir="$PROFILE" \
  --screenshot="$1" "http://localhost:${PORT:-5317}/practice.html?$2" >/dev/null 2>&1
echo "$1"
