"""여러 장을 2열 비교 시트로 묶는다.
사용: uv run --with pillow python -I tools/render/contact_sheet.py <출력.png> "라벨=경로" "라벨=경로" ...
라벨에 '=' 를 쓰면 안 된다 (첫 '=' 에서 나눈다).
"""
import sys
import os
for arg in sys.argv[1:]:  # 출력 폴더가 없으면 만든다
    if arg.endswith(('.png', '.json', '.npy')) and os.path.dirname(arg):
        os.makedirs(os.path.dirname(arg), exist_ok=True)
from PIL import Image, ImageDraw
out=sys.argv[1]; items=sys.argv[2:]
ims=[]
for it in items:
    label,path=it.split('=',1)
    im=Image.open(path).convert('RGB'); im.thumbnail((900,600)); ims.append((label,im))
W=sum(i.width for _,i in ims[:2])+30; 
rows=[ims[i:i+2] for i in range(0,len(ims),2)]
H=sum(max(i.height for _,i in r)+40 for r in rows)
sheet=Image.new('RGB',(max(W,10),H),(20,20,22)); d=ImageDraw.Draw(sheet); y=0
for r in rows:
    x=10
    for label,im in r:
        sheet.paste(im,(x,y+30)); d.text((x,y+8),label,fill=(240,240,240)); x+=im.width+10
    y+=max(i.height for _,i in r)+40
sheet.save(out)
