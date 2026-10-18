"""이미지 일부를 확대하고 10px 격자(50px 마다 좌표)를 그린다 — 사진에서 좌표를 손으로 읽을 때 쓴다.
사용: uv run --with pillow python -I tools/render/grid_crop.py <입력> <출력> x0 y0 x1 y1 배율
"""
import sys
import os
for arg in sys.argv[1:]:  # 출력 폴더가 없으면 만든다
    if arg.endswith(('.png', '.json', '.npy')) and os.path.dirname(arg):
        os.makedirs(os.path.dirname(arg), exist_ok=True)
from PIL import Image, ImageDraw
src,out,x0,y0,x1,y1,k=sys.argv[1],sys.argv[2],*map(int,sys.argv[3:8])
im=Image.open(src).convert('RGB').crop((x0,y0,x1,y1)).resize(((x1-x0)*k,(y1-y0)*k),Image.LANCZOS)
d=ImageDraw.Draw(im)
for x in range(x0 - x0%10 + 10, x1, 10):
  X=(x-x0)*k; d.line([(X,0),(X,im.height)],fill=(255,255,0) if x%50==0 else (90,90,40),width=1)
  if x%50==0: d.text((X+2,2),str(x),fill=(255,255,0))
for y in range(y0 - y0%10 + 10, y1, 10):
  Y=(y-y0)*k; d.line([(0,Y),(im.width,Y)],fill=(255,255,0) if y%50==0 else (90,90,40),width=1)
  if y%50==0: d.text((2,Y+2),str(y),fill=(255,255,0))
im.save(out)
