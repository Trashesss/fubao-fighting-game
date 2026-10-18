"""레퍼런스 사진에서 상어 실루엣 마스크를 딴다 (물 배경을 5차 다항식으로 맞춘 뒤 색 차이 임계값).
사용: uv run --with pillow --with numpy python -I tools/reference/segment_photo.py <사진> <출력.png> <임계값, 28 권장>
출력: <출력.png> (마스크를 빨갛게 덮은 확인용), <출력.npy> (불리언 마스크), <출력>_dist.npy
주의: 상어가 있을 수 없는 영역(y<215, y>515, x>870)을 사진 좌표로 잘라 둔다 — reference-shark-photo.png 전용 값.
"""
import sys, numpy as np
import os
for arg in sys.argv[1:]:  # 출력 폴더가 없으면 만든다
    if arg.endswith(('.png', '.json', '.npy')) and os.path.dirname(arg):
        os.makedirs(os.path.dirname(arg), exist_ok=True)
from PIL import Image, ImageFilter
from collections import deque
src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB').filter(ImageFilter.GaussianBlur(1.0))).astype(np.float64)
H,W,_ = a.shape
yy,xx = np.mgrid[0:H,0:W]; X=xx/W; Y=yy/H
# 물 배경 표본: 상어 바깥 확실한 영역
samp = (Y<0.30)|(Y>0.84)|(X>0.90)|((X<0.02)&(Y>0.75))
def feats(X,Y):
  cols=[np.ones_like(X)]
  for i in range(5):
    for j in range(5-i):
      if i or j: cols.append(X**i*Y**j)
  return np.stack(cols,-1)
F = feats(X,Y)
bg = np.zeros_like(a)
for c in range(3):
  coef,*_ = np.linalg.lstsq(F[samp], a[...,c][samp], rcond=None)
  bg[...,c] = F@coef
d = a-bg
dist = np.sqrt((d**2).sum(-1))
print('dist pct in water', np.percentile(dist[samp],[50,90,99]))
np.save(out.replace('.png','_dist.npy'), dist)
m = dist > float(sys.argv[3])
m[:215,:]=False; m[515:,:]=False; m[:,870:]=False
H,W=m.shape; lab=np.zeros((H,W),np.int32); best=(0,0); cur=0
for y in range(H):
  for x in range(W):
    if m[y,x] and not lab[y,x]:
      cur+=1; q=deque([(y,x)]); lab[y,x]=cur; n=0
      while q:
        cy,cx=q.popleft(); n+=1
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
          ny,nx=cy+dy,cx+dx
          if 0<=ny<H and 0<=nx<W and m[ny,nx] and not lab[ny,nx]:
            lab[ny,nx]=cur; q.append((ny,nx))
      if n>best[0]: best=(n,cur)
mm=lab==best[1]
np.save(out.replace('.png','.npy'), mm)
vis=np.asarray(Image.open(src).convert('RGB')).copy()
vis[mm]=(vis[mm]*0.4+np.array([255,40,40])*0.6).astype(np.uint8)
Image.fromarray(vis).save(out); print('px',mm.sum())
