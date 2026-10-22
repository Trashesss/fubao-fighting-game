"""판다 기준 이미지(측면 | 정면 두 장이 한 그림)에서 실루엣 마스크를 따고 높이별 윤곽을 잰다.

사용: uv run --with pillow --with numpy python -I tools/reference/panda_silhouette.py <이미지> <출력 폴더>
출력: side-mask.png, front-mask.png, profile.json (높이 비율마다 측면 앞·뒤 끝, 정면 왼·오른 끝, 픽셀→m 환산 전)
배경이 고른 회색이라 모서리 색과의 거리로 자르고, 바닥 그림자(배경보다 조금 어두운 넓은 띠)는 채도·밝기 차가 작아 빠진다.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
img = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = img.shape
corners = np.concatenate([img[:40, :40].reshape(-1, 3), img[:40, -40:].reshape(-1, 3)])
bg = np.median(corners, axis=0)
# 배경은 위에서 아래로 조금 밝기가 바뀐다 → 행마다 양 끝 30px 의 중앙값을 배경으로
rowbg = np.median(np.concatenate([img[:, :30], img[:, -30:]], axis=1), axis=1)  # (H,3)
d = np.linalg.norm(img - rowbg[:, None, :], axis=2)
mask = d > float(sys.argv[3]) if len(sys.argv) > 3 else d > 22
m = Image.fromarray((mask * 255).astype(np.uint8))
# 털 끝 잡음 정리: 닫기 → 열기
m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
mask = np.asarray(m) > 127


def largest(mask_half):
    # 가장 큰 연결 성분만 (네 방향 채우기)
    from collections import deque
    h, w = mask_half.shape
    lab = np.zeros((h, w), np.int32)
    best, best_n, cur = 0, 0, 0
    for y0 in range(0, h, 4):
        for x0 in range(0, w, 4):
            if not mask_half[y0, x0] or lab[y0, x0]:
                continue
            cur += 1
            q = deque([(y0, x0)])
            lab[y0, x0] = cur
            n = 0
            while q:
                y, x = q.popleft()
                n += 1
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < h and 0 <= xx < w and mask_half[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = cur
                        q.append((yy, xx))
            if n > best_n:
                best, best_n = cur, n
    keep = lab == best
    # 안쪽 구멍 메우기 (행마다 처음~끝 사이를 채우지 않는다 — 팔 사이 틈은 남긴다)
    return keep


half = W // 2
side = largest(mask[:, :half])
front = largest(mask[:, half:])
Image.fromarray((side * 255).astype(np.uint8)).save(out / 'side-mask.png')
Image.fromarray((front * 255).astype(np.uint8)).save(out / 'front-mask.png')


def bbox(mk):
    ys, xs = np.nonzero(mk)
    return int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())


res = {'image': [W, H]}
for name, mk, x_off in (('side', side, 0), ('front', front, half)):
    y0, y1, x0, x1 = bbox(mk)
    rows = {}
    for k in range(0, 101):
        y = int(round(y1 - (y1 - y0) * k / 100))
        xs = np.nonzero(mk[y])[0]
        if len(xs):
            # 끊긴 구간(팔과 몸 사이)도 보이게 구간 목록
            runs = []
            start = xs[0]
            for a, b in zip(xs[:-1], xs[1:]):
                if b != a + 1:
                    runs.append([int(start + x_off), int(a + x_off)])
                    start = b
            runs.append([int(start + x_off), int(xs[-1] + x_off)])
            rows[k] = runs
    res[name] = {'top': y0, 'bottom': y1, 'left': x0 + x_off, 'right': x1 + x_off, 'rows': rows}
(out / 'profile.json').write_text(json.dumps(res))
print(json.dumps({k: (v if k == 'image' else {kk: vv for kk, vv in v.items() if kk != 'rows'}) for k, v in res.items()}))
