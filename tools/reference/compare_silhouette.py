"""직교 측면 실루엣 렌더를 사진 마스크에 겹쳐 IoU 를 잰다 (주둥이 끝·전장으로 맞춤).
사용: uv run --with pillow --with numpy python -I tools/reference/compare_silhouette.py <마스크.npy> <사진> <렌더.png> <출력.png>
렌더: Q='&pose=swim&shoe=0&cam=ortho&mode=silhouette' W=1600 H=700 tools/render/shoot.sh <폴더> s side
출력 색: 흰색 = 겹침, 빨강 = 모델에만 있음, 초록 = 사진에만 있음. 가슴지느러미·두 번째 상어 영역은 제외.
"""
"""렌더 실루엣(직교 측면)을 레퍼런스 마스크에 주둥이·꼬리 끝으로 맞춰 겹치고 IoU 를 잰다."""
import sys, json, numpy as np
import os
for arg in sys.argv[1:]:  # 출력 폴더가 없으면 만든다
    if arg.endswith(('.png', '.json', '.npy')) and os.path.dirname(arg):
        os.makedirs(os.path.dirname(arg), exist_ok=True)
from PIL import Image
ref_mask = np.load(sys.argv[1]); photo = sys.argv[2]; render = sys.argv[3]; out = sys.argv[4]
r = np.asarray(Image.open(render).convert('L')) < 128
ys, xs = np.where(r)
rx0, rx1 = xs.min(), xs.max()
snout_y = ys[xs >= rx1 - 1].mean()
SNOUT = (848, 387.0); TAIL_X = 23
scale = (SNOUT[0] - TAIL_X) / (rx1 - rx0)
H, W = ref_mask.shape
gy, gx = np.mgrid[0:H, 0:W]
sx = np.round(rx1 + (gx - SNOUT[0]) / scale).astype(int)
sy = np.round(snout_y + (gy - SNOUT[1]) / scale).astype(int)
ok = (sx >= 0) & (sx < r.shape[1]) & (sy >= 0) & (sy < r.shape[0])
ren = np.zeros_like(ref_mask); ren[ok] = r[sy[ok], sx[ok]]
excl = (gx >= 380) & (gx <= 660) & (gy > 440)   # 가슴지느러미 + 두 번째 상어
ref = ref_mask & ~excl; rn = ren & ~excl
inter = (ref & rn).sum(); union = (ref | rn).sum()
iou = inter / union
# 구간별 IoU
zones = {'head(u<.2)': (683, 848), 'trunk(.2-.55)': (394, 683), 'tail-body(.55-.78)': (205, 394), 'caudal(>.78)': (0, 205)}
zr = {}
for k, (a, b) in zones.items():
    m = (gx >= a) & (gx < b)
    zr[k] = round(float((ref & rn & m).sum() / max(1, ((ref | rn) & m).sum())), 3)
vis = np.asarray(Image.open(photo).convert('RGB')).astype(float) * 0.45
vis[rn & ref] = [230, 230, 230]
vis[rn & ~ref] = [255, 60, 60]     # 렌더에만 있음 (튀어나옴)
vis[ref & ~rn] = [60, 220, 90]     # 사진에만 있음 (모자람)
vis[excl] *= 0.5
Image.fromarray(vis.astype(np.uint8)).save(out)
print(json.dumps({'iou': round(float(iou), 4), 'zones': zr, 'scale': round(scale, 4)}))
