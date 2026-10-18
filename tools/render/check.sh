#!/usr/bin/env bash
# 품질 검사 결과(JSON)를 출력한다: 곡률 검사 + 동작 접지 검사 + 모델 크기. 개발 서버가 떠 있어야 한다.
# 사용: tools/render/check.sh [추가 쿼리]     예) tools/render/check.sh '&shoe=0'
set -euo pipefail
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=${TMPDIR:-/tmp}/bukangi-chrome-profile
"$CHROME" --headless=new --disable-gpu-sandbox --use-angle=metal --enable-unsafe-swiftshader --window-size=800,600 \
  --virtual-time-budget=20000 --user-data-dir="$PROFILE" --dump-dom "http://localhost:${PORT:-5317}/?shot=1&check=1${1:-}" 2>/dev/null \
  | python3 -c "import sys,re,html; m=re.search(r'<pre id=\"check\">(.*?)</pre>', sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else 'NO REPORT')"
