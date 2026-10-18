"""레퍼런스 사진 마스크에서 상어 측면 비례를 뽑는다. 단위: 전장(TL) 비율.
u = (SNOUT_X - x)/TL  (0 = 주둥이 끝, 1 = 꼬리 끝),  h = (AXIS_Y - y)/TL (위가 +).
사용: uv run --with pillow --with numpy python -I tools/reference/measure_profile.py <마스크.npy> <사진> \
        src/characters/bukangi/spec/reference-measurements.json <확인용.png>
주둥이·꼬리 끝·몸 축(848, 23, 385)과 지느러미 기부 보간 구간, 가슴지느러미 손 추적 점은 이 사진 전용 값이다.
모델은 이 출력 중 랜드마크만 쓴다 (docs/decisions.md D-07)."""
import json, sys, numpy as np
import os
for arg in sys.argv[1:]:  # 출력 폴더가 없으면 만든다
    if arg.endswith(('.png', '.json', '.npy')) and os.path.dirname(arg):
        os.makedirs(os.path.dirname(arg), exist_ok=True)
from PIL import Image, ImageDraw
mm = np.load(sys.argv[1]); photo = sys.argv[2]; out_json = sys.argv[3]; out_png = sys.argv[4]
SNOUT_X, TAIL_X, AXIS_Y = 848, 23, 385
TL = SNOUT_X - TAIL_X
U = lambda x: (SNOUT_X - x) / TL
Hh = lambda y: (AXIS_Y - y) / TL

def runs(x):
    ys = np.where(mm[:, x])[0]
    if len(ys) == 0: return []
    r=[]; s=ys[0]; p=ys[0]
    for y in ys[1:]:
        if y != p+1: r.append((s,p)); s=y
        p=y
    r.append((s,p)); return r

def interp_fill(xs, vals, zones):
    vals = vals.astype(float).copy()
    for a,b in zones:
        sel = (xs>=a)&(xs<=b)
        keep = ~sel
        vals[sel] = np.interp(xs[sel], xs[keep], vals[keep])
    return vals

xs = np.arange(205, SNOUT_X+1)  # 몸통 구간 (꼬리지느러미 시작 전)
def body_run(x, y0=AXIS_Y):
    rs = runs(x)
    return min(rs, key=lambda r: 0 if r[0] <= y0 <= r[1] else min(abs(r[0]-y0), abs(r[1]-y0)))
def top_edge(x):
    # 몸 구간 위쪽으로 붙어 있는(간격 6px 이하) 조각까지 포함
    rs = sorted(runs(x)); b = body_run(x); t = b[0]
    for r in reversed([r for r in rs if r[1] < b[0]]):
        if t - r[1] <= 6: t = r[0]
        else: break
    return t
top = np.array([top_edge(x) for x in xs])
bot = np.array([body_run(x)[1] for x in xs])
# 지느러미 기부·두 번째 상어로 오염된 구간은 이웃에서 보간
top = interp_fill(xs, top, [(440,552),(238,292),(658,694)])
# 아래선: 가슴지느러미/두 번째 상어(380~612), 배지느러미(325~412), 뒷지느러미(252~293)
anch_x = np.array([205,215,230,252,293,300,325,412,418,428,448,468,488,528,568,612,640,660])
anch_y = np.array([403,402,403,406,412,412,418,433,435,436,438,440,442,443,443,444,443,443])
bot = bot.astype(float)
sel = (xs>=252)&(xs<=660)
bot[sel] = np.interp(xs[sel], anch_x, anch_y)
# 3픽셀 이동평균으로 JPEG 계단 제거
k = np.ones(5)/5
top_s = np.convolve(np.pad(top,2,mode='edge'), k, 'valid'); bot_s = np.convolve(np.pad(bot,2,mode='edge'), k, 'valid')

# 위 꼬리 엽 (척추가 이어지는 부분): 윗선 = 마스크, 아랫선 = 위 엽 아래 가장자리
ux = np.arange(23, 205)
utop = np.array([runs(x)[0][0] for x in ux], float)
ulow_anchor_x = np.array([23, 28, 38, 48, 58, 68, 78, 88, 98, 108, 118, 128, 138, 150, 175, 205])
ulow_anchor_y = np.array([246, 254, 284, 290, 305, 319, 330, 343, 354, 365, 376, 388, 398, 412, 407, 403])
ulow = np.interp(ux, ulow_anchor_x, ulow_anchor_y)

prof = []
for x, t, b in list(zip(xs, top_s, bot_s))[::-1]:
    prof.append([round(U(x),4), round(Hh(t),4), round(Hh(b),4)])
for x, t, b in list(zip(ux, utop, ulow))[::-1]:
    prof.append([round(U(x),4), round(Hh(t),4), round(Hh(b),4)])

# 지느러미 외곽 (사진 좌표 → u,h)
def fin_rows(xa, xb, ya, yb, above):
    pts_lead, pts_trail = [], []
    for y in range(ya, yb+1):
        row = np.where(mm[y, xa:xb+1])[0]
        if len(row)==0: continue
        pts_lead.append([round(U(xa+row.max()),4), round(Hh(y),4)])
        pts_trail.append([round(U(xa+row.min()),4), round(Hh(y),4)])
    return {'leading': pts_lead, 'trailing': pts_trail}

fins = {
  'dorsal1': fin_rows(436, 556, 226, 318, True),
  'dorsal2': fin_rows(238, 292, 348, 358, True),
  'caudalLower': fin_rows(130, 214, 410, 488, False),
  'anal': fin_rows(250, 295, 410, 428, False),
  # 가슴지느러미: 두 번째 상어와 겹쳐 수동 추적 (crop-pectoral.png)
  'pectoral': {
    'leading': [[round(U(x),4), round(Hh(y),4)] for x,y in [(600,405),(567,415),(540,435),(500,453),(463,467),(430,485),(400,502)]],
    'trailing': [[round(U(x),4), round(Hh(y),4)] for x,y in [(590,444),(570,448),(530,463),(500,473),(467,483),(430,495),(400,503)]],
  },
}
landmarks = {
  'eye': [round(U(770),4), round(Hh(388),4)], 'eyeRadius': round(6/TL,4),
  'gillSlits': [[round(U(x),4), round(Hh(372),4), round(Hh(403),4)] for x in (640,627,614,601,589)],
  'mouthCorner': [round(U(727),4), round(Hh(412),4)],
  'mouthFront': round(U(800),4),
  'dorsal1Origin': round(U(552),4), 'dorsal1RearTip': round(U(440),4),
  'pectoralOrigin': round(U(600),4), 'pelvicOrigin': round(U(410),4),
  'dorsal2Origin': round(U(290),4), 'analOrigin': round(U(293),4), 'caudalOrigin': round(U(205),4),
}
json.dump({'source':'reference-shark-photo.png', 'tlPixels': TL, 'axisY': AXIS_Y, 'snoutX': SNOUT_X,
           'profile': prof, 'fins': fins, 'landmarks': landmarks}, open(out_json,'w'), indent=1)

im = Image.open(photo).convert('RGB'); d = ImageDraw.Draw(im)
X = lambda u: SNOUT_X - u*TL; Y = lambda h: AXIS_Y - h*TL
d.line([(X(p[0]),Y(p[1])) for p in prof], fill=(255,60,60), width=2)
d.line([(X(p[0]),Y(p[2])) for p in prof], fill=(60,255,60), width=2)
for f in fins.values():
    d.line([(X(u),Y(h)) for u,h in f['leading']], fill=(255,230,0), width=2)
    d.line([(X(u),Y(h)) for u,h in f['trailing']], fill=(0,200,255), width=2)
for g in landmarks['gillSlits']: d.line([(X(g[0]),Y(g[1])),(X(g[0]),Y(g[2]))], fill=(255,0,255), width=2)
e = landmarks['eye']; d.ellipse([X(e[0])-6,Y(e[1])-6,X(e[0])+6,Y(e[1])+6], outline=(255,0,255), width=2)
im.save(out_png)
print('profile pts', len(prof), 'max depth', max(p[1]-p[2] for p in prof))
