/**
 * Trailer compositor: cuts the captured game footage (capture.mjs) into the final
 * trailer. Every frame is laid out by an HTML "stage" (real footage layers, floating
 * app screens, kinetic type, light bloom, grain, vignette) and screenshotted; the
 * frames are then encoded with the score (score.mjs).
 *
 *   node scripts/trailer/compose.mjs <captureDir> <score.wav> <out.mp4> [--format landscape|portrait] [--from s --to s]
 *
 * landscape: 1920x1080, 42 s — the trailer (web, YouTube, press).
 * portrait:  886x1920, 30 s — a vertical cut for TikTok / Reels / Shorts. It is NOT
 *            the App Store app preview: the hall footage sits over a composited
 *            background, which App Review's 2.3.4 capture-only rule may reject, so
 *            appstore/preview.mp4 (scripts/store-preview-video.mjs) stays the preview.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [CAP, SCORE, OUT] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const FORMAT = flag("--format", "landscape");
const FPS = 30;
const CHROME = existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined;
const HERE = resolve("scripts/trailer");
const W = FORMAT === "portrait" ? 886 : 1920;
const H = FORMAT === "portrait" ? 1920 : 1080;
const DURATION = FORMAT === "portrait" ? 30 : 42;
const FROM = Number(flag("--from", 0)), TO = Number(flag("--to", DURATION));

const shots = {};
for (const d of readdirSync(CAP)) shots[d] = { url: pathToFileURL(join(resolve(CAP), d)).href, n: readdirSync(join(CAP, d)).length };
const ICON = pathToFileURL(resolve("appstore/AppIcon-1024.png")).href;
const FONT = pathToFileURL(join(HERE, "assets/Inter-latin.woff2")).href;

// ---------------------------------------------------------------------------------
// The stage. Everything below runs in the browser; render(t) lays out one frame.
// ---------------------------------------------------------------------------------
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url("${FONT}") format("woff2");font-weight:100 900;font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#04050a}
body{font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#f5f7ff}
#stage{position:absolute;inset:0;overflow:hidden}
#bg{position:absolute;inset:-10%}
.layer{position:absolute;inset:0;overflow:hidden;opacity:0}
.layer img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 50%}
.phone{position:absolute;opacity:0;border-radius:44px;overflow:hidden;transform-style:preserve-3d;
  box-shadow:0 60px 120px -30px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.10),inset 0 0 0 1px rgba(255,255,255,.06)}
.phone img{display:block;width:100%;height:100%;object-fit:cover}
.phone .sheen{position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.10),transparent 35%);pointer-events:none}
.glow{position:absolute;border-radius:50%;filter:blur(90px);opacity:0}
.txt{position:absolute;opacity:0;white-space:nowrap}
.txt .w{display:inline-block;will-change:transform,opacity,filter}
.kick{font-size:${FORMAT === "portrait" ? 30 : 27}px;font-weight:700;letter-spacing:.32em;text-transform:uppercase}
.mark{font-size:${FORMAT === "portrait" ? 76 : 92}px;font-weight:800;letter-spacing:.08em;line-height:1}
.head{font-size:${FORMAT === "portrait" ? 92 : 104}px;font-weight:800;letter-spacing:-.04em;line-height:1.02}
.mega{font-size:${FORMAT === "portrait" ? 150 : 176}px;font-weight:850;letter-spacing:-.05em;line-height:.95}
.sub{font-size:${FORMAT === "portrait" ? 40 : 38}px;font-weight:400;letter-spacing:-.01em;color:rgba(232,236,255,.78)}
.label{font-size:26px;font-weight:600;letter-spacing:-.01em;color:rgba(236,240,255,.9)}
.shadow{text-shadow:0 8px 40px rgba(0,0,0,.65),0 2px 10px rgba(0,0,0,.5)}
#flash{position:absolute;inset:0;background:radial-gradient(60% 60% at 50% 50%,#fff,rgba(255,236,220,.6) 40%,rgba(255,200,160,0) 75%);opacity:0;mix-blend-mode:screen}
#dim{position:absolute;inset:0;background:#04050a;opacity:0}
#vig{position:absolute;inset:0;background:radial-gradient(120% 95% at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%);pointer-events:none}
#grain{position:absolute;inset:0;width:100%;height:100%;opacity:.045;mix-blend-mode:overlay;image-rendering:pixelated}
#logo{position:absolute;opacity:0;border-radius:22.5%;box-shadow:0 40px 100px -20px rgba(0,0,0,.8)}
#pill{position:absolute;opacity:0;padding:16px 30px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);
  font-size:26px;font-weight:600;letter-spacing:.01em;color:#eef1ff;white-space:nowrap}
</style></head><body><div id="stage">
<canvas id="bg" width="480" height="270"></canvas>
<div id="layers"></div><div id="glows"></div><div id="phones"></div><div id="texts"></div>
<img id="logo" src="${ICON}"><div id="pill">Available on the App Store</div>
<div id="flash"></div><canvas id="grain" width="${Math.round(W / 2)}" height="${Math.round(H / 2)}"></canvas><div id="vig"></div><div id="dim"></div>
</div><script>
const W=${W},H=${H},FPS=${FPS},SHOTS=${JSON.stringify(shots)};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const seg=(t,a,b)=>clamp((t-a)/(b-a));
const eOut=(p)=>1-Math.pow(1-clamp(p),3);
const eInOut=(p)=>{p=clamp(p);return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2};
const eExpo=(p)=>{p=clamp(p);return p===1?1:1-Math.pow(2,-10*p)};
const lerp=(a,b,p)=>a+(b-a)*p;
const frameUrl=(shot,local,speed=1,hold)=>{const s=SHOTS[shot];let f=Math.floor(Math.max(0,local)*FPS*speed);f=Math.min(f,hold??s.n-1,s.n-1);return s.url+"/"+String(f).padStart(4,"0")+".jpg"};
const pending=[];
function setSrc(img,url){if(img.dataset.u!==url){img.dataset.u=url;img.src=url;pending.push(img.decode().catch(()=>{}));}}
function el(parent,cls,id,html){let e=document.getElementById(id);if(!e){e=document.createElement("div");e.className=cls;e.id=id;if(html!=null)e.innerHTML=html;document.getElementById(parent).appendChild(e);}return e}

// --- background: slow aurora in the game's resource colours ---
const bg=document.getElementById("bg"),bx=bg.getContext("2d");
function aurora(t,mood){bx.fillStyle="#04050a";bx.fillRect(0,0,480,270);
  const blobs=mood.map((c,i)=>({c,x:240+Math.cos(t*.23+i*2.1)*150,y:135+Math.sin(t*.19+i*1.7)*80,r:190+40*Math.sin(t*.3+i)}));
  bx.globalCompositeOperation="lighter";
  for(const b of blobs){const g=bx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);g.addColorStop(0,b.c);g.addColorStop(1,"rgba(0,0,0,0)");bx.fillStyle=g;bx.fillRect(0,0,480,270)}
  bx.globalCompositeOperation="source-over";bg.style.opacity=1;bg.style.width="120%";bg.style.height="120%";bg.style.filter="blur(30px)"}

// --- grain (seeded per frame) ---
const gr=document.getElementById("grain"),gx=gr.getContext("2d"),gimg=gx.createImageData(gr.width,gr.height);
function grain(frame){let s=(frame*2654435761)>>>0;const d=gimg.data;for(let i=0;i<d.length;i+=4){s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;const v=s&255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}gx.putImageData(gimg,0,0)}

// --- text: word-by-word reveal ---
function text(id,cfg,t){
  const e=el("texts","txt "+cfg.cls,id);
  if(!e.dataset.b){e.dataset.b=1;e.innerHTML=cfg.text.split(" ").map((w)=>'<span class="w">'+w+'</span>').join(" ");
    if(cfg.grad){e.style.textShadow="none";e.style.filter="drop-shadow(0 10px 30px rgba(0,0,0,.55)) drop-shadow(0 0 40px "+(cfg.glowC??"rgba(143,176,255,.35)")+")";
      e.querySelectorAll(".w").forEach((w)=>{w.style.background=cfg.grad;w.style.webkitBackgroundClip="text";w.style.backgroundClip="text";w.style.webkitTextFillColor="transparent";w.style.paddingBottom=".08em"})}
    if(cfg.color)e.style.color=cfg.color;}
  const inP=seg(t,cfg.a,cfg.a+.01),out=cfg.b?eInOut(seg(t,cfg.b-(cfg.outDur??.45),cfg.b)):0;
  e.style.opacity=inP*(1-out);
  const [x,y,anchor]=cfg.at;
  e.style.left=x+"px";e.style.top=y+"px";
  e.style.transform=anchor==="c"?"translate(-50%,-50%)":anchor==="cb"?"translate(-50%,0)":anchor==="r"?"translate(-100%,0)":"none";
  e.style.textAlign=anchor==="c"||anchor==="cb"?"center":"left";
  const words=e.querySelectorAll(".w");
  words.forEach((w,i)=>{const p=eOut(seg(t,cfg.a+i*(cfg.stagger??.07),cfg.a+i*(cfg.stagger??.07)+(cfg.dur??.6)));
    w.style.opacity=p;w.style.transform="translateY("+((1-p)*(cfg.rise??28))+"px)";w.style.filter="blur("+((1-p)*10)+"px)";
    if(out>0){w.style.transform+=" translateY("+(-out*14)+"px)";w.style.filter="blur("+(out*8)+"px)"}});
}

// --- a full-bleed footage layer ---
function layer(id,cfg,t){
  const e=el("layers","layer",id,'<img>');const img=e.querySelector("img");
  const vis=t>=cfg.a-.001&&t<cfg.b+(cfg.fadeOut??0);
  e.style.display=vis?"block":"none";if(!vis)return;
  const local=t-cfg.a+(cfg.offset??0);
  setSrc(img,frameUrl(cfg.shot,local,cfg.speed??1,cfg.hold));
  const p=clamp((t-cfg.a)/(cfg.b-cfg.a));
  const z=lerp(cfg.zoom?.[0]??1,cfg.zoom?.[1]??1,cfg.ease?cfg.ease(p):p);
  const px=lerp(cfg.pan?.[0]??0,cfg.pan?.[2]??0,p),py=lerp(cfg.pan?.[1]??0,cfg.pan?.[3]??0,p);
  img.style.objectPosition=cfg.objPos??"50% 50%";
  img.style.transformOrigin=cfg.origin??(cfg.shot.startsWith("hall_")?"8% 6%":"50% 50%");
  img.style.transform="translate("+px+"px,"+py+"px) scale("+z+")";
  const fi=cfg.fadeIn?eInOut(seg(t,cfg.a,cfg.a+cfg.fadeIn)):1,fo=cfg.fadeOut?1-eInOut(seg(t,cfg.b,cfg.b+cfg.fadeOut)):1;
  e.style.opacity=fi*fo*(cfg.opacity??1);
  e.style.filter=cfg.filter?cfg.filter(t):"none";
}

// --- a floating app screen (landscape only) ---
function phone(id,cfg,t){
  const e=el("phones","phone",id,'<img><div class="sheen"></div>');const img=e.querySelector("img");
  const vis=t>=cfg.a-.001&&t<cfg.b+.6;e.style.display=vis?"block":"none";if(!vis)return;
  const local=t-cfg.a+(cfg.offset??0);
  setSrc(img,frameUrl(cfg.shot,local,cfg.speed??1,cfg.hold));
  const w=cfg.w,h=Math.round(w*1864/860);
  const pin=eExpo(seg(t,cfg.a,cfg.a+(cfg.inDur??.9))),pout=eInOut(seg(t,cfg.b,cfg.b+.5));
  const drift=(t-cfg.a)*(cfg.drift??6);
  e.style.width=w+"px";e.style.height=h+"px";
  e.style.left=(cfg.x-w/2)+"px";e.style.top=(cfg.y-h/2)+"px";
  e.style.opacity=pin*(1-pout);
  e.style.transform="perspective(2200px) translateY("+((1-pin)*140-drift+pout*-40)+"px) rotateY("+(cfg.ry??0)+"deg) rotateX("+(cfg.rx??0)+"deg) scale("+lerp(.92,1,pin)*(cfg.s??1)+")";
  if(cfg.glow){const g=el("glows","glow",id+"-g");g.style.display="block";g.style.left=(cfg.x-w*.8)+"px";g.style.top=(cfg.y-h*.45)+"px";g.style.width=w*1.6+"px";g.style.height=h*.9+"px";g.style.background=cfg.glow;g.style.opacity=.55*pin*(1-pout)}
  if(cfg.label)text(id+"-l",{text:cfg.label,cls:"label shadow",a:cfg.a+.35,b:cfg.b+.3,at:[cfg.x,cfg.y+h/2+34,"cb"],stagger:.05},t);
}

window.render=async function(t,frame,plan){
  pending.length=0;
  aurora(t,plan.mood(t));
  for(const [id,c] of plan.layers)layer(id,c,t);
  for(const [id,c] of plan.phones)phone(id,c,t);
  for(const [id,c] of plan.texts)text(id,c,t);
  plan.extra(t);
  grain(frame);
  await Promise.all(pending);
};
</script></body></html>`;

// ---------------------------------------------------------------------------------
// The edit. Times in seconds; bar = 2.4 s at 100 BPM (see score.mjs).
// ---------------------------------------------------------------------------------
const LANDSCAPE_PLAN = `(() => {
const BAR=2.4, bar=(n,b=0)=>n*BAR+b*.6;
const C={blue:"rgba(63,134,240,.55)",violet:"rgba(124,92,255,.55)",purple:"rgba(155,81,224,.5)",green:"rgba(22,179,100,.45)",orange:"rgba(255,122,60,.55)",deep:"rgba(20,24,60,.6)"};
const grad=(a,b)=>"linear-gradient(100deg,"+a+" 0%,#ffffff 42%,#ffffff 58%,"+b+" 100%)";
const layers=[
  // the closet: one rack, a slow push in from black
  ["closet",{shot:"hall_closet",a:bar(2),b:bar(4),zoom:[1.02,1.16],fadeIn:1.1,ease:(p)=>p,offset:.4}],
  // growth montage: a cut every half bar, each with a punch-in
  ["garage",{shot:"hall_garage",a:bar(4),b:bar(4,2),zoom:[1.1,1.0],ease:(p)=>1-Math.pow(1-p,3)}],
  ["floor",{shot:"hall_floor",a:bar(4,2),b:bar(5),zoom:[1.1,1.0],ease:(p)=>1-Math.pow(1-p,3)}],
  ["hallA",{shot:"hall_hall",a:bar(5),b:bar(5,2),zoom:[1.1,1.0],ease:(p)=>1-Math.pow(1-p,3)}],
  ["campusA",{shot:"hall_campus",a:bar(5,2),b:bar(6),zoom:[1.12,1.02],ease:(p)=>1-Math.pow(1-p,3),fadeOut:.35}],
  // finale: planet scale, a slow pull back
  ["campusB",{shot:"hall_campus",a:bar(12),b:bar(15),zoom:[1.22,1.0],offset:1.2,fadeIn:.25,ease:(p)=>1-Math.pow(1-p,2),filter:(t)=>"brightness("+(1-0.55*Math.max(0,Math.min(1,(t-bar(14))/1.6)))+")",fadeOut:.8}],
];
const phones=[
  // run the whole lab: three live screens
  ["pR",{shot:"ui_research",a:bar(6),b:bar(8),x:560,y:560,w:330,ry:16,s:.92,speed:.55,glow:C.violet,label:"Research the tree",offset:.2}],
  ["pP",{shot:"ui_products",a:bar(6,.5),b:bar(8),x:960,y:540,w:360,speed:.55,glow:C.green,label:"Launch products",offset:.2}],
  ["pT",{shot:"ui_team",a:bar(6,1),b:bar(8),x:1360,y:560,w:330,ry:-16,s:.92,speed:.55,glow:C.blue,label:"Hire the crew",offset:.2}],
  // decisions
  ["pC",{shot:"ui_charter",a:bar(8),b:bar(9,1.5),x:640,y:560,w:390,ry:12,speed:.7,glow:C.purple,offset:.3,inDur:.8}],
  ["pB",{shot:"ui_bazaar",a:bar(9),b:bar(9,3.4),x:640,y:560,w:390,ry:12,speed:.8,glow:C.violet,offset:.2,inDur:.5}],
  // the Ship
  ["pS",{shot:"ui_ship",a:bar(10),b:bar(12),x:1290,y:560,w:420,ry:-10,speed:1,hold:118,glow:C.orange,inDur:.6,drift:4}],
];
const texts=[
  ["t1",{text:"EVERY AI LAB",cls:"kick",a:.7,b:bar(1,3),at:[960,470,"c"],color:"rgba(205,214,255,.92)",stagger:.12}],
  ["t2",{text:"starts in a closet.",cls:"head shadow",a:1.6,b:bar(1,3.3),at:[960,560,"c"],stagger:.13,dur:.8}],
  ["t3",{text:"One rack. Big plans.",cls:"head shadow",a:bar(2,3),b:bar(3,3.6),at:[120,860,"l"],stagger:.1}],
  ["m1",{text:"Rack it.",cls:"mega shadow",a:bar(4),b:bar(4,2),at:[110,800,"l"],stagger:.05,dur:.35,outDur:.12,rise:40}],
  ["m2",{text:"Cool it.",cls:"mega shadow",a:bar(4,2),b:bar(5),at:[110,800,"l"],stagger:.05,dur:.35,outDur:.12,rise:40}],
  ["m3",{text:"Wire it.",cls:"mega shadow",a:bar(5),b:bar(5,2),at:[110,800,"l"],stagger:.05,dur:.35,outDur:.12,rise:40}],
  ["m4",{text:"Scale it.",cls:"mega shadow",a:bar(5,2),b:bar(6),at:[110,800,"l"],stagger:.05,dur:.35,outDur:.2,rise:40,grad:grad("#8fb0ff","#5cead9")}],
  ["f1",{text:"Run the whole lab.",cls:"head shadow",a:bar(6,.2),b:bar(8),at:[960,110,"cb"],stagger:.08}],
  ["d0",{text:"EVERY GENERATION",cls:"kick",a:bar(8,.3),b:bar(9,3.3),at:[1060,330,"l"],color:"rgba(214,196,255,.95)"}],
  ["d1",{text:"Pick a charter.",cls:"head shadow",a:bar(8,.6),b:bar(9,3.3),at:[1060,390,"l"]}],
  ["d2",{text:"Take a stance.",cls:"head shadow",a:bar(8,2.2),b:bar(9,3.3),at:[1060,510,"l"]}],
  ["d3",{text:"Bend the rules.",cls:"head shadow",a:bar(9,.2),b:bar(9,3.3),at:[1060,630,"l"],grad:grad("#c9a4ff","#ff8fb3")}],
  ["s0",{text:"THEN",cls:"kick",a:bar(10,.05),b:bar(11,3.5),at:[130,380,"l"],color:"rgba(255,200,165,.95)"}],
  ["s1",{text:"Ship the model.",cls:"head shadow",a:bar(10,.1),b:bar(11,3.5),at:[130,440,"l"],grad:grad("#ffb066","#ff5c7a"),stagger:.09}],
  ["s2",{text:"Bank Legacy. Start faster.",cls:"sub shadow",a:bar(10,2),b:bar(11,3.5),at:[134,580,"l"],stagger:.08}],
  ["s3",{text:"Go again.",cls:"sub shadow",a:bar(11,.4),b:bar(11,3.5),at:[134,634,"l"],stagger:.08}],
  ["g1",{text:"From a server closet",cls:"sub shadow",a:bar(12,.4),b:bar(14,1),at:[960,840,"cb"],stagger:.08}],
  ["g2",{text:"to a planet-scale cluster.",cls:"head shadow",a:bar(12,1.6),b:bar(14,1),at:[960,890,"cb"],stagger:.09,grad:grad("#8fb0ff","#c9a4ff")}],
  ["e1",{text:"SINGULARITY INC.",cls:"mark",a:bar(15,.35),b:41.4,at:[960,560,"cb"],stagger:.02,dur:.9,rise:18}],
  ["e2",{text:"Build the singularity.",cls:"sub",a:bar(15,1.3),b:41.4,at:[960,684,"cb"],stagger:.08}],
];
const mood=(t)=>t<bar(4)?[C.deep,"rgba(40,50,110,.35)",C.deep]:t<bar(8)?[C.blue,C.violet,C.green]:t<bar(10)?[C.purple,C.violet,"rgba(255,90,140,.35)"]:t<bar(12)?[C.orange,"rgba(255,80,110,.45)",C.violet]:[C.violet,C.blue,C.purple];
function extra(t){
  const flash=document.getElementById("flash"),dim=document.getElementById("dim"),logo=document.getElementById("logo"),pill=document.getElementById("pill");
  // light bloom on the hits: each montage cut, the Ship drop, the logo
  const hits=[[bar(4),.35],[bar(4,2),.3],[bar(5),.3],[bar(5,2),.4],[bar(10),1],[bar(15),.85]];
  let f=0;for(const [h,a] of hits){if(t>=h)f=Math.max(f,a*Math.exp(-(t-h)*(a>.6?2.6:7)))}
  flash.style.opacity=f;
  // dips: open from black, the held breath before the drop, the end
  let d=1-Math.min(1,t/.6);
  d=Math.max(d,Math.min(1,Math.max(0,(t-bar(9,3.2))/.35))*(t<bar(10)?1:0)*.85);
  d=Math.max(d,Math.max(0,(t-40.6)/1.2));
  dim.style.opacity=d;
  // end card
  const lp=Math.max(0,Math.min(1,(t-bar(15))/1.1)),le=1-Math.pow(1-lp,4);
  logo.style.width=logo.style.height="210px";logo.style.left=(960-105)+"px";logo.style.top=(390-105)+"px";
  logo.style.opacity=le;logo.style.transform="scale("+(0.72+0.28*le)+")";
  logo.style.boxShadow="0 40px 100px -20px rgba(0,0,0,.8),0 0 "+(60+80*le)+"px -10px rgba(143,176,255,"+(.6*le)+")";
  const pp=Math.max(0,Math.min(1,(t-bar(15,2.6))/.8)),pe=1-Math.pow(1-pp,3);
  pill.style.opacity=pe*(1-Math.max(0,(t-40.9)/.6));pill.style.left="960px";pill.style.top="790px";pill.style.transform="translate(-50%,"+((1-pe)*20)+"px)";
  document.getElementById("vig").style.opacity=t>bar(15)?.8:1;
}
return {layers,phones,texts,mood,extra};
})()`;

// The App Store preview: 30 s, portrait, only full-screen captures of the app.
const PORTRAIT_PLAN = `(() => {
const C={blue:"rgba(63,134,240,.55)",violet:"rgba(124,92,255,.55)",purple:"rgba(155,81,224,.5)",green:"rgba(22,179,100,.45)",orange:"rgba(255,122,60,.55)",deep:"rgba(20,24,60,.6)"};
const grad=(a,b)=>"linear-gradient(100deg,"+a+" 0%,#ffffff 42%,#ffffff 58%,"+b+" 100%)";
// Hall footage is 16:9; in portrait it fills the middle band over the aurora.
const hall=(shot,a,b,o={})=>({shot,a,b,zoom:o.zoom??[1.0,1.08],offset:o.offset??.3,fadeIn:o.fadeIn??.25,fadeOut:o.fadeOut??.25,objPos:"50% 50%",...o});
const layers=[
  ["closet",hall("hall_closet",0,3.6,{fadeIn:.8})],
  ["garage",hall("hall_garage",3.6,4.8,{zoom:[1.1,1]})],
  ["floor",hall("hall_floor",4.8,6.0,{zoom:[1.1,1]})],
  ["hallA",hall("hall_hall",6.0,7.2,{zoom:[1.1,1]})],
  ["campusA",hall("hall_campus",7.2,9.4,{zoom:[1.12,1]})],
  ["build",{shot:"ui_build",a:9.4,b:12.2,speed:.8,fadeIn:.3,fadeOut:.3}],
  ["products",{shot:"ui_products",a:12.2,b:15.0,speed:.8,fadeIn:.3,fadeOut:.3}],
  ["research",{shot:"ui_research",a:15.0,b:17.6,speed:.8,fadeIn:.3,fadeOut:.3}],
  ["charter",{shot:"ui_charter",a:17.6,b:20.2,speed:.8,fadeIn:.3,fadeOut:.3}],
  ["ship",{shot:"ui_ship",a:20.2,b:24.0,hold:118,fadeIn:.2,fadeOut:.4}],
  ["campusB",hall("hall_campus",24.0,27.6,{zoom:[1.25,1.0],offset:2,fadeIn:.4,fadeOut:.6})],
];
// Hall layers are letterboxed into a centred 16:9 band: object-fit contain.
for(const [id,c] of layers)if(c.shot.startsWith("hall_"))c.hallBand=true;
const texts=[
  ["t1",{text:"EVERY AI LAB",cls:"kick",a:.3,b:3.4,at:[443,380,"c"],color:"rgba(205,214,255,.92)"}],
  ["t2",{text:"starts in a closet.",cls:"head shadow",a:.8,b:3.4,at:[443,470,"c"],stagger:.1}],
  ["m1",{text:"Scale it",cls:"mega shadow",a:3.7,b:9.2,at:[443,1360,"cb"],stagger:.06,grad:grad("#8fb0ff","#5cead9")}],
  ["m2",{text:"to a planet.",cls:"head shadow",a:5.0,b:9.2,at:[443,1520,"cb"],stagger:.08}],
  ["u1",{text:"Build your lab.",cls:"head shadow",a:9.6,b:12.0,at:[443,1580,"cb"]}],
  ["u2",{text:"Launch products.",cls:"head shadow",a:12.4,b:14.8,at:[443,1580,"cb"]}],
  ["u3",{text:"Climb the tree.",cls:"head shadow",a:15.2,b:17.4,at:[443,1580,"cb"]}],
  ["u4",{text:"Pick your charter.",cls:"head shadow",a:17.8,b:20.0,at:[443,1580,"cb"]}],
  ["s1",{text:"Ship the model.",cls:"head shadow",a:20.4,b:23.8,at:[443,1640,"cb"],grad:grad("#ffb066","#ff5c7a")}],
  ["g1",{text:"Go again. Bigger.",cls:"head shadow",a:24.4,b:27.4,at:[443,1420,"cb"],grad:grad("#8fb0ff","#c9a4ff")}],
  ["e1",{text:"SINGULARITY INC.",cls:"mark",a:27.9,b:29.8,at:[443,1060,"cb"],stagger:.02,rise:18}],
];
const mood=(t)=>t<9.4?[C.deep,C.blue,C.violet]:t<20?[C.blue,C.violet,C.green]:t<24?[C.orange,C.violet,C.purple]:[C.violet,C.blue,C.purple];
function extra(t){
  // Hall footage: a tall centred band (cover crops the empty sides, the room stays whole).
  for(const img of document.querySelectorAll("#layers .layer img")){const id=img.parentElement.id;if(/closet|garage|floor|hallA|campus/.test(id)){img.style.objectFit="cover";img.parentElement.style.top="500px";img.parentElement.style.height="780px";
    img.parentElement.style.webkitMaskImage=img.parentElement.style.maskImage="linear-gradient(180deg,transparent 0,#000 12%,#000 88%,transparent 100%)"}}
  // A scrim under the captions while the app's own screens are on camera.
  let sc=document.getElementById("scrim");if(!sc){sc=document.createElement("div");sc.id="scrim";sc.style.cssText="position:absolute;left:0;right:0;bottom:0;height:720px;background:linear-gradient(180deg,rgba(4,5,10,0),rgba(4,5,10,.82) 45%,rgba(4,5,10,.94));pointer-events:none";document.getElementById("layers").after(sc)}
  const ui=Math.min(1,Math.max(0,(t-9.4)/.4))*(1-Math.min(1,Math.max(0,(t-23.6)/.4)));sc.style.opacity=ui;
  const flash=document.getElementById("flash"),dim=document.getElementById("dim"),logo=document.getElementById("logo");
  const hits=[[3.6,.3],[4.8,.3],[6.0,.3],[7.2,.35],[20.2,.9],[27.6,.7]];
  let f=0;for(const [h,a] of hits){if(t>=h)f=Math.max(f,a*Math.exp(-(t-h)*(a>.6?2.6:7)))}
  flash.style.opacity=f;
  dim.style.opacity=Math.max(1-Math.min(1,t/.5),Math.max(0,(t-29.3)/.7));
  const lp=Math.max(0,Math.min(1,(t-27.6)/1.0)),le=1-Math.pow(1-lp,4);
  logo.style.width=logo.style.height="240px";logo.style.left=(443-120)+"px";logo.style.top=(820-120)+"px";
  logo.style.opacity=le;logo.style.transform="scale("+(0.72+0.28*le)+")";
}
return {layers,phones:[],texts,mood,extra};
})()`;

async function run() {
  const dir = join(resolve(CAP), "..", `frames-${FORMAT}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const html = join(dir, "..", `stage-${FORMAT}.html`);
  writeFileSync(html, PAGE);
  const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ["--no-sandbox", "--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(`window.PLAN=${FORMAT === "portrait" ? PORTRAIT_PLAN : LANDSCAPE_PLAN}`);
  const STILLS = flag("--stills", "");
  if (STILLS) {
    for (const ts of STILLS.split(",")) {
      const t = Number(ts);
      await page.evaluate(([t, f]) => window.render(t, f, window.PLAN), [t, Math.round(t * FPS)]);
      await page.screenshot({ path: join(dir, `still-${ts}.png`) });
    }
    await browser.close();
    console.log(`stills in ${dir}`);
    return;
  }
  const f0 = Math.round(FROM * FPS), f1 = Math.round(TO * FPS);
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    await page.evaluate(([t, f]) => window.render(t, f, window.PLAN), [f / FPS, f]);
    await page.screenshot({ path: join(dir, `${String(f - f0).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95 });
    if (f % 150 === 0) console.log(`frame ${f}/${f1} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  await browser.close();
  if (errors.length) { console.log("page errors:", errors.slice(0, 5)); process.exitCode = 1; }

  // Encode: H.264 High, BT.709, faststart; the score is trimmed/faded to the cut and
  // normalised to -14 LUFS (streaming reference) with -1 dBTP headroom.
  const dur = (f1 - f0) / FPS;
  const afilter = `atrim=${FROM}:${TO},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, dur - 1.2)}:d=1.2,loudnorm=I=-14:TP=-1:LRA=11`;
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-framerate", String(FPS), "-i", join(dir, "%05d.jpg"), "-i", SCORE,
    "-filter:a", afilter, "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "20", "-tune", "film",
    "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-t", String(dur), "-movflags", "+faststart", OUT,
  ], { stdio: "inherit" });
  console.log(`wrote ${OUT} (${dur.toFixed(1)} s, ${W}x${H})`);
}

run();
