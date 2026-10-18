#!/usr/bin/env bash
# 뷰어를 헤드리스 Chrome 으로 찍는다. 개발 서버(npm run dev)가 떠 있어야 한다.
# 사용: tools/render/shoot.sh <출력폴더> <태그> <view> [<view> ...]
#   환경변수 Q  = 추가 쿼리 (예: Q='&mode=zebra&frame=20')
#            W,H = 창 크기 (기본 1200x900), PORT = 5317, CHROME = Chrome 실행 파일
set -euo pipefail
OUT=$1; TAG=$2; shift 2
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
PROFILE=${TMPDIR:-/tmp}/bukangi-chrome-profile
mkdir -p "$OUT"
for v in "$@"; do
  "$CHROME" --headless=new --disable-gpu-sandbox --use-angle=metal --enable-unsafe-swiftshader --hide-scrollbars \
    --window-size="${W:-1200},${H:-900}" --virtual-time-budget=8000 --user-data-dir="$PROFILE" \
    --screenshot="$OUT/$TAG-$v.png" "http://localhost:${PORT:-5317}/?shot=1&view=$v${Q:-}" >/dev/null 2>&1
  echo "$OUT/$TAG-$v.png"
done
