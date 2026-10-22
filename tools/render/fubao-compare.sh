#!/usr/bin/env bash
# 푸바오 실루엣을 기준 그림과 비교한다 (측면·정면 IoU + out/fubao/cmp.png). 개발 서버가 떠 있어야 한다.
# 처음 한 번: uv run --with pillow --with numpy python -I tools/reference/panda_silhouette.py assets/concept/fubao/reference-v1.png out/fubao
# 사용: tools/render/fubao-compare.sh ['&추가쿼리']    예) tools/render/fubao-compare.sh '&shells=0'  (털 없이 피부만)
set -euo pipefail
for v in side front; do
  W=768 H=1024 tools/render/fubao-shot.sh out/fubao/r-$v.png "view=ref-$v&mode=silhouette${1:-}" >/dev/null
  echo "$v $(uv run --with pillow --with numpy python -I tools/reference/panda_compare.py out/fubao/$v-mask.png out/fubao/r-$v.png out/fubao/cmp-$v.png)"
done
uv run --with pillow python -I -c "
from PIL import Image
a=Image.open('out/fubao/cmp-side.png'); b=Image.open('out/fubao/cmp-front.png')
c=Image.new('RGB',(a.width+b.width,a.height),'white'); c.paste(a,(0,0)); c.paste(b,(a.width,0)); c.save('out/fubao/cmp.png')"
echo out/fubao/cmp.png
