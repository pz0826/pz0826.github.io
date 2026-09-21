"""Export selected photos, real DINOv2 patch PCA, and cross-theme visual echoes.
Run with the dinov2 conda Python; no training or original-file modifications.
"""
import argparse, hashlib, io, json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageCms, ImageOps
import torch

ROOT=Path(__file__).resolve().parents[2]
def rgb(path):
    with Image.open(path) as src:
        im=ImageOps.exif_transpose(src)
        profile=im.info.get('icc_profile')
        if profile:
            im=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(profile)),ImageCms.createProfile('sRGB'),outputMode='RGB')
        else: im=im.convert('RGB')
        return im.copy()

def main():
    p=argparse.ArgumentParser(); p.add_argument('--source',required=True); p.add_argument('--dinov2',default='/home/pyn/CODE/dinov2'); p.add_argument('--checkpoint',default='/home/pyn/.cache/torch/hub/checkpoints/dinov2_vits14_reg4_pretrain.pth'); a=p.parse_args()
    config=json.loads((ROOT/'tools/art-gallery/edit.json').read_text())
    out=ROOT/'public/media/arts'; out.mkdir(exist_ok=True,parents=True)
    private=ROOT/'photography-review/art-features';private.mkdir(exist_ok=True,parents=True)
    torch.manual_seed(0);torch.set_num_threads(4)
    model=torch.hub.load(a.dinov2,'dinov2_vits14_reg',source='local',pretrained=False)
    model.load_state_dict(torch.load(a.checkpoint,map_location='cpu'));model=model.eval().cuda()
    mean=torch.tensor([.485,.456,.406],device='cuda')[:,None,None];std=torch.tensor([.229,.224,.225],device='cuda')[:,None,None]
    photos={};features=[];cls=[];spatial=[];ids=[]
    for n,item in enumerate(config['photos']):
        pid=item['id']; im=rgb(Path(a.source)/item['filename']);w,h=im.size
        files={}
        for size,q in [(640,79),(1280,83),(1920,85),(3200,90)]:
            copy=im.copy();copy.thumbnail((size,size),Image.Resampling.LANCZOS)
            name=f'{pid}-{size}.webp';copy.save(out/name,'WEBP',quality=q,method=6)
            files[str(size)]={'src':'/media/arts/'+name,'width':copy.width,'height':copy.height,'bytes':(out/name).stat().st_size}
        # Aspect-preserving resize, symmetric reflect pad to patch multiples. Record
        # the content rectangle so PCA preview cropping exactly matches the photograph.
        scale=504/max(w,h);rw=max(14,round(w*scale));rh=max(14,round(h*scale))
        resized=im.resize((rw,rh),Image.Resampling.LANCZOS)
        pw=math.ceil(rw/14)*14;ph=math.ceil(rh/14)*14;left=(pw-rw)//2;top=(ph-rh)//2
        arr=np.pad(np.asarray(resized),((top,ph-rh-top),(left,pw-rw-left),(0,0)),mode='reflect').copy()
        x=torch.from_numpy(arr).cuda().permute(2,0,1).float()/255
        with torch.inference_mode():
            result=model.forward_features(((x-mean)/std)[None]);f=result['x_norm_patchtokens'][0]
            assert torch.isfinite(f).all()
            centered=f-f.mean(0);_,_,v=torch.linalg.svd(centered,full_matrices=False);basis=v[:3].T
            # Deterministic component signs.
            signs=torch.sign(basis[basis.abs().argmax(0),torch.arange(3,device='cuda')]);basis*=signs
            projected=centered@basis;lo=torch.quantile(projected,.02,dim=0);hi=torch.quantile(projected,.98,dim=0)
            colors=((projected-lo)/(hi-lo).clamp_min(1e-6)).clamp(0,1)
            c=result['x_norm_clstoken'][0]; grid=f.reshape(ph//14,pw//14,-1)
            pooled=torch.nn.functional.adaptive_avg_pool2d(grid.permute(2,0,1)[None],(2,2))[0].permute(1,2,0).reshape(4,-1)
        Image.fromarray((colors.cpu().numpy().reshape(ph//14,pw//14,3)*255).astype('uint8')).save(out/f'{pid}-pca.png')
        np.savez_compressed(private/f'{pid}.npz',patch=f.cpu().numpy(),cls=c.cpu().numpy(),basis=basis.cpu().numpy(),mean=f.mean(0).cpu().numpy(),lo=lo.cpu().numpy(),hi=hi.cpu().numpy(),content=[left,top,rw,rh,pw,ph])
        photos[pid]={'id':pid,'alt':item['alt'],'width':w,'height':h,'images':files,'pca':'/media/arts/'+pid+'-pca.png','content':[left/pw,top/ph,rw/pw,rh/ph]}
        ids.append(pid);cls.append(c.cpu().numpy());spatial.append(pooled.cpu().numpy());features.append(f.cpu().numpy())
        print(f'{n+1}/{len(config["photos"])} {item["filename"]}',flush=True)
    C=np.array(cls);C/=np.linalg.norm(C,axis=1,keepdims=True)
    S=np.array(spatial);S/=np.linalg.norm(S,axis=2,keepdims=True)
    scores=.65*(C@C.T)+.35*np.einsum('ikd,jkd->ij',S,S)/4
    themes=config['themes'];members={pid:{t['id'] for t in themes if any(pid in s for s in t['spreads'])} for pid in ids}
    candidates={}
    for i,pid in enumerate(ids):
        ranked=sorted([j for j,q in enumerate(ids) if not members[pid]&members[q]],key=lambda j:-float(scores[i,j]))
        seen=set();picks=[]
        for j in ranked:
            tid=next(iter(members[ids[j]]))
            if tid in seen:continue
            seen.add(tid);picks.append({'id':ids[j],'theme':tid,'similarity':round(float(scores[i,j]),5)})
            if len(picks)==3:break
        candidates[pid]=picks
    # Shared PCA comparison artifact stays private; publish the higher-contrast per-photo PCA.
    sample=np.concatenate([f[::8] for f in features]);mu=sample.mean(0);_,_,v=np.linalg.svd(sample-mu,full_matrices=False)
    np.savez_compressed(private/'shared-pca-comparison.npz',mean=mu,basis=v[:3].T)
    manifest={'version':1,'model':'DINOv2 ViT-S/14 with registers','checkpointSha256':hashlib.sha256(Path(a.checkpoint).read_bytes()).hexdigest(),'pca':'Per-image patch PCA, 3 components, deterministic signs, 2–98 percentile RGB normalization','echoMetric':'0.65 CLS cosine + 0.35 mean aligned 2×2 patch-pool cosine; best candidate per other theme','themes':themes,'photos':photos,'echoes':candidates}
    (ROOT/'src/content/art-gallery.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print('Export complete.',flush=True)
if __name__=='__main__':main()
