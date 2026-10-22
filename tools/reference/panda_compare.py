"""푸바오 렌더 실루엣과 기준 그림 마스크 비교 (IoU + 겹쳐 그린 그림).

사용: uv run --with pillow --with numpy python -I tools/reference/panda_compare.py <마스크.png> <렌더.png> <겹침.png>
렌더: fubao.html?view=ref-side|ref-front&mode=silhouette 를 768×1024 로 찍은 것 (검은 실루엣).
바닥 그림자 띠가 마스크에 섞여 있어 이미지 y 945 아래는 뺀다.
겹침 그림: 회색 = 둘 다, 빨강 = 렌더에만(너무 큼), 파랑 = 그림에만(모자람).
구간: 머리(1.35 m 위), 몸통·팔(0.55~1.35 m), 다리(0.55 m 아래).
"""
import json
import sys

import numpy as np
from PIL import Image

mask = np.asarray(Image.open(sys.argv[1]).convert('L')) > 127
ren = np.asarray(Image.open(sys.argv[2]).convert('L').resize((mask.shape[1], mask.shape[0]))) < 128
H = mask.shape[0]
valid = np.zeros_like(mask)
valid[:945] = True
S, G = 0.00188, 955


def iou(rows):
    v = valid.copy()
    v[: rows[0]] = False
    v[rows[1]:] = False
    a = mask & v
    b = ren & v
    u = (a | b).sum()
    return round(float((a & b).sum() / u), 3) if u else None


y = lambda m: int(G - m / S)
res = {
    'iou': iou((0, H)),
    'head': iou((0, y(1.35))),
    'torso': iou((y(1.35), y(0.55))),
    'legs': iou((y(0.55), H)),
    'renderOnly': int((ren & ~mask & valid).sum()),
    'refOnly': int((mask & ~ren & valid).sum()),
}
img = np.full(mask.shape + (3,), 255, np.uint8)
img[mask & ren] = (150, 150, 150)
img[ren & ~mask] = (220, 60, 60)
img[mask & ~ren] = (60, 90, 220)
img[~valid] = (255, 255, 255)
for m in (0.55, 1.35):
    img[y(m), ::4] = (0, 0, 0)
Image.fromarray(img).save(sys.argv[3])
print(json.dumps(res))
