#!/usr/bin/env bash
# 연습 모드 프레임 자동 검사 JSON 을 출력한다 (practice.html?test=1). 개발 서버가 떠 있어야 한다.
# 사용: tools/render/practice-check.sh [추가 쿼리]
set -euo pipefail
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=${TMPDIR:-/tmp}/bukangi-chrome-profile
"$CHROME" --headless=new --disable-gpu-sandbox --use-angle=metal --enable-unsafe-swiftshader --window-size=800,600 \
  --virtual-time-budget=${BUDGET:-120000} --user-data-dir="$PROFILE" --dump-dom "http://localhost:${PORT:-5317}/practice.html?test=1${1:-}" 2>/dev/null \
  | python3 -c "import sys,re,html; m=re.search(r'<pre id=\"check\">(.*?)</pre>', sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else 'NO REPORT')"
