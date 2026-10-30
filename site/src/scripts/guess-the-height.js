import POOL from '../data/game-pool.json';
import MAPS from '../data/map-data.json';
import { $, ringPath, rnd } from './game-common.js';


const HI = POOL.extremes.highest, LO = POOL.extremes.lowest, AX = POOL.avgextremes;
const KINDS = ['highest','lowest','average'];
const ROUNDS = 10, TOP_MARKS = 1000;
const fmt = v => Math.round(v).toLocaleString('en-GB');
// ---- units: every figure is held in metres; the display can switch to feet (the choice is kept in localStorage and shared by all the games)
const FT = 3.28084; let IMP = false; try{ IMP = localStorage.getItem('country-extremes-units')==='imperial'; }catch(e){}
const U = () => IMP ? 'ft' : 'm';
const fmtL = v => Math.round(IMP ? v*FT : v).toLocaleString('en-GB');
function syncUnits(){ document.querySelectorAll('#units button').forEach(b=>b.classList.toggle('on',(b.dataset.u==='imperial')===IMP)); }
// nice round tick values in the display unit, returned in metres
function niceStepL(span,n){ const raw=span/n, mag=Math.pow(10,Math.floor(Math.log10(raw))); return [1,2,5,10].map(k=>k*mag).find(s=>s>=raw); }
function niceTicks(lo,hi,n){ const k=IMP?FT:1, st=niceStep((hi-lo)*k,n), out=[]; for(let d=Math.ceil(lo*k/st)*st; d<=hi*k+1e-9; d+=st) out.push(d/k); return out; }

const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

// the gauge and slider scale is uniform: equal heights take equal space
const f = v => v;
const finv = s => s;
const RANGE = {highest:{lo:0, hi:HI.m}, lowest:{lo:LO.m, hi:Math.ceil(Math.max(...POOL.lowest.map(r=>r.m))/100)*100}, average:{lo:0, hi:Math.ceil(AX.max.m/500)*500}};

const g = {mode:'highest', level:'intermediate', region:'', best:{}, items:[], idx:0, total:0, log:[], v:0, locked:false, anim:0};
[...new Set([...POOL.highest,...POOL.lowest,...POOL.average].map(r=>r.region))].filter(x=>x!=='Antarctica').sort().forEach(x=>$('region').add(new Option(x,x)));
try{ g.best = JSON.parse(localStorage.getItem('country-extremes-guess-best')||'{}'); }catch(e){ g.best={}; }
const saveBest = () => { try{ localStorage.setItem('country-extremes-guess-best',JSON.stringify(g.best)); }catch(e){} };

const poolFor = kind => POOL[kind].filter(r=>!g.region||r.region===g.region);
const bestKey = () => g.mode+'|'+g.region+'|'+g.level;
const kindsFor = () => g.mode==='mixed' ? KINDS : [g.mode];
const needed = () => Math.min(ROUNDS, kindsFor().reduce((n,k)=>n+poolFor(k).length,0));

function poolNote(){
  const ks=kindsFor(), n=ks.map(k=>poolFor(k).length), total=n.reduce((a,b)=>a+b,0), ok=total>=3;
  $('poolnote').textContent = ok ? `${ks.map((k,i)=>n[i]+' '+k+(k==='average'?' elevations':' points')).join(' and ')} in the question pool; ${Math.min(ROUNDS,total)} rounds per game.` : 'Not enough records for this choice. Pick another region or mode.';
  $('start').disabled = !ok;
  $('levelnote').textContent = levelNote();
  $('best').textContent = g.best[bestKey()] || 0;
  if(!$('hud').classList.contains('hidden')) return; document.body.dataset.kind = g.mode==='lowest'?'lowest':g.mode==='average'?'average':'highest';
}

// score: 1,000 for an exact answer. Beginner to advanced fall away as exp(-miss/allowance), allowance a share of the true value
// (40, 20, 10 per cent, with a floor in metres). Extreme: only guesses within 5 per cent (at least 10 m) score, 1,000 for exact
// falling in a straight line to 500 at the edge, 0 outside.
const LEVELS = {
  beginner:{label:'Beginner', pct:.4, floor:100, note:'Generous: a miss of 40 per cent of the true figure (or 100 m, for low places) still scores about 370; 10 per cent off scores about 780.'},
  intermediate:{label:'Intermediate', pct:.2, floor:50, note:'A miss of 20 per cent of the true figure (or 50 m, for low places) scores about 370; 10 per cent off scores about 600.'},
  advanced:{label:'Advanced', pct:.1, floor:25, note:'Tight: a miss of 10 per cent of the true figure (or 25 m, for low places) scores about 370; 5 per cent off scores about 600.'},
  extreme:{label:'Extreme', pct:.05, floor:10, note:'Only guesses within 5 per cent of the true figure (or 10 m, for low places) score. Exact scores 1,000, falling to 500 at the edge; anything further out scores 0.'}
};
const lenTxt = m => `${fmtL(m)} ${U()}`;
function levelNote(){ const L=LEVELS[g.level], p=Math.round(L.pct*100);
  if(g.level==='extreme') return `Only guesses within ${p} per cent of the true figure (or ${lenTxt(L.floor)}, for low places) score. Exact scores 1,000, falling to 500 at the edge; anything further out scores 0.`;
  const lead={beginner:'Generous: a miss',intermediate:'A miss',advanced:'Tight: a miss'}[g.level], tail={beginner:'10 per cent off scores about 780.',intermediate:'10 per cent off scores about 600.',advanced:'5 per cent off scores about 600.'}[g.level];
  return `${lead} of ${p} per cent of the true figure (or ${lenTxt(L.floor)}, for low places) scores about 370; ${tail}`; }
function scoreFor(guess,truth,level){
  const L=LEVELS[level||g.level], miss=Math.abs(guess-truth), tol=Math.max(L.floor,L.pct*Math.abs(truth));
  if(level==='extreme'||(!level&&g.level==='extreme')) return miss<=tol ? Math.round(TOP_MARKS*(1-.5*miss/tol)) : 0;
  return Math.round(TOP_MARKS*Math.exp(-miss/tol));
}
function ratingFor(p){ return p>=950?['Spot on',4]:p>=800?['Very close',3]:p>=550?['Close',2]:p>=250?['Off target',1]:['Way off',0]; }

function buildGame(){
  const ks=kindsFor(), pools={}; ks.forEach(k=>pools[k]=poolFor(k).slice());
  const items=[], n=needed();
  while(items.length<n){
    const avail=ks.filter(k=>pools[k].length); if(!avail.length) break;
    const k=avail[rnd(avail.length)], r=pools[k].splice(rnd(pools[k].length),1)[0]; items.push({kind:k,rec:r});
  }
  return items;
}

// ---- gauge ----
const GW=340, GH=330, GT=18, GB=18, GX0=64, GX1=GW-10;
function geom(kind){ const R=RANGE[kind], fl=f(R.lo), fh=f(R.hi), P=GH-GT-GB; const y=v=>GT+(fh-f(v))/(fh-fl)*P; return {R,fl,fh,P,y}; }
function ticksFor(kind,G){
  // evenly spaced ticks: the smallest round step that leaves at least 26 px between labels
  const k=IMP?FT:1, pxPerM=G.P/((G.R.hi-G.R.lo)*k), step=[10,20,50,100,200,250,500,1000,2000,2500,5000,10000].find(st=>st*pxPerM>=26)||10000, out=[];
  for(let d=Math.ceil(G.R.lo*k/step)*step; d<=G.R.hi*k+1e-9; d+=step) out.push(d/k);
  return out;
}
function drawGauge(extra){
  const q=g.items[g.idx], G=geom(q.kind), y0=G.y(0), yg=G.y(g.v), ticks=ticksFor(q.kind,G);
  let s=`<svg viewBox="0 0 ${GW} ${GH}" id="gsvg" role="img" aria-label="Scale of heights; your guess is marked">`;
  s+=`<defs>
   <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a)"/><stop offset="1" stop-color="var(--a)" stop-opacity=".5"/></linearGradient>
   <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--b)"/><stop offset="1" stop-color="var(--b)" stop-opacity=".5"/></linearGradient>
   <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".16"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient>
   <clipPath id="gclip"><rect x="${GX0}" y="${GT}" width="${GX1-GX0}" height="${G.P}"/></clipPath></defs>`;
  s+=`<g clip-path="url(#gclip)"><rect x="${GX0}" y="${GT}" width="${GX1-GX0}" height="${y0-GT}" fill="url(#gSky)"/><rect x="${GX0}" y="${y0}" width="${GX1-GX0}" height="${GT+G.P-y0}" fill="var(--sea)" fill-opacity=".14"/>`;
  ticks.forEach(v=>{ if(v!==0) s+=`<line x1="${GX0}" x2="${GX1}" y1="${G.y(v)}" y2="${G.y(v)}" stroke="#fff" stroke-opacity=".08"/>`; });
  // the answer, drawn as a mountain or a bowl once revealed
  if(extra){
    const t=extra.value, yt=G.y(t), h=Math.max(Math.abs(yt-y0),2), x=GX0+(GX1-GX0)*.32, hw=44;
    if(t>=0){ const pt=(dx,fr)=>`${x+dx},${(y0-h*fr).toFixed(1)}`;
      s+=`<path d="M${x-hw},${y0} L${pt(-25,.42)} L${pt(-14,.34)} L${pt(-5,.7)} L${x},${y0-h} L${pt(7,.78)} L${pt(16,.45)} L${pt(26,.5)} L${x+hw},${y0}Z" fill="url(#gB)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`;
      if(h>26) s+=`<path d="M${x},${y0-h} L${x-7},${y0-h+h*.2} L${x-2},${y0-h+h*.17} L${x+2},${y0-h+h*.23} L${x+7},${y0-h+h*.2}Z" fill="#fff" opacity=".9"/>`; }
    else s+=`<path d="M${x-hw},${y0} C${x-hw+12},${y0+h*1.05} ${x+hw-12},${y0+h*1.05} ${x+hw},${y0}Z" fill="url(#gB)" stroke="#fff" stroke-width="1.6"/>`;
  }
  s+=`</g>`;
  ticks.forEach(v=>{ const yy=G.y(v); if(v!==0&&Math.abs(yy-y0)>12) s+=`<text class="m" x="${GX0-6}" y="${yy+4}" text-anchor="end" style="font-size:10px">${fmtL(v)}</text>`; });
  s+=`<line x1="${GX0}" x2="${GX1}" y1="${y0}" y2="${y0}" stroke="var(--sea)" stroke-width="2.5"/><text x="${GX0-6}" y="${y0+4}" text-anchor="end" style="fill:var(--sea);font-weight:700;font-size:10px">0</text>`;
  if(extra){ const GA=POOL.global[q.kind], yg2=G.y(GA.v);
    s+=`<line x1="${GX0}" x2="${GX1}" y1="${yg2}" y2="${yg2}" stroke="#fff" stroke-opacity=".6" stroke-dasharray="2 4"/><text x="${GX1-3}" y="${yg2-4}" text-anchor="end" style="font-size:10px;fill:#fff;opacity:.9">${GA.label}: ${fmtL(GA.v)} ${U()}</text>`; }
  // the guess marker
  const gy=clamp(yg,GT,GT+G.P), left=GX0+(GX1-GX0)*.62;
  if(extra&&extra.showGap){ const ya=G.y(extra.value); s+=`<line x1="${left+34}" x2="${left+34}" y1="${gy}" y2="${ya}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="3 3"/><line x1="${GX0}" x2="${GX1}" y1="${ya}" y2="${ya}" stroke="var(--b)" stroke-width="1.5" stroke-dasharray="5 4"/>`; }
  { const idle=!g.touched&&!g.locked;   // before a guess is placed the bar sits mid-scale as a faint 'drag me' handle
  s+=`<g opacity="${idle?.6:1}"><line x1="${GX0}" x2="${GX1}" y1="${gy}" y2="${gy}" stroke="var(--a)" stroke-width="2.5" ${idle?'stroke-dasharray="6 5"':g.locked?'':'stroke-dasharray="0"'}/>`;
  s+=`<g transform="translate(${left},${gy})"><rect x="-6" y="-13" width="92" height="26" rx="13" fill="var(--a)"/><text x="40" y="5" text-anchor="middle" style="fill:#06232a;font-weight:800;font-size:${idle?11:13}px">${idle?'Drag to guess':fmtL(g.v)+' '+U()}</text></g></g>`; }
  s+=`</svg>`; $('gauge').innerHTML=s;
}

// ---- input handling ----
function setValue(v,fromNum){
  g.touched=true; $('lock').disabled=false; $('guessui').classList.remove('untouched');
  const q=g.items[g.idx], R=RANGE[q.kind]; const stepL=IMP?.1:1; g.v=+(Math.round(clamp(v,R.lo,R.hi)/stepL)*stepL).toFixed(1);
  $('read').textContent=fmtL(g.v); $('slider').value=f(g.v); if(!fromNum) $('num').value=Math.round(IMP?g.v*FT:g.v);
  $('readsub').textContent = g.v===0?'At sea level':`${fmtL(Math.abs(g.v))} ${U()} ${g.v>0?'above':'below'} sea level`;
  drawGauge();
}
function gaugeToValue(e){
  const svg=$('gsvg'); if(!svg) return; const r=svg.getBoundingClientRect(), q=g.items[g.idx], G=geom(q.kind);
  const yy=(e.clientY-r.top)/r.height*GH; const fv=G.fh-clamp((yy-GT)/G.P,0,1)*(G.fh-G.fl); setValue(finv(fv));
}
let dragging=false;
$('gauge').addEventListener('pointerdown',e=>{ if(g.locked) return; dragging=true; $('gauge').setPointerCapture(e.pointerId); gaugeToValue(e); });
$('gauge').addEventListener('pointermove',e=>{ if(dragging&&!g.locked) gaugeToValue(e); });
$('gauge').addEventListener('pointerup',()=>dragging=false);
$('slider').addEventListener('input',e=>{ if(!g.locked) setValue(finv(parseFloat(e.target.value))); });
$('num').addEventListener('input',e=>{ if(g.locked||e.target.value===''||e.target.value==='-') return; setValue(parseFloat(e.target.value)/(IMP?FT:1),true); });

// ---- flow ----
function dots(){ $('dots').innerHTML=g.items.map((_,i)=>`<i class="${i<g.idx?'done':i===g.idx?'now':''}"></i>`).join(''); }
function ask(){
  stopAnim(); g.locked=false;
  const q=g.items[g.idx], R=RANGE[q.kind]; document.body.dataset.kind=q.kind;
  $('setup').classList.add('hidden'); $('final').classList.add('hidden'); $('hud').classList.remove('hidden'); $('play').classList.remove('hidden');
  $('rn').textContent=g.idx+1; $('rof').textContent='of '+g.items.length; $('total').textContent=fmt(g.total); dots();
  $('kindword').textContent = {highest:'Highest point of', lowest:'Lowest point of', average:'Average elevation of'}[q.kind];
  $('country').textContent = q.rec.name; $('point').innerHTML = q.kind==='average' ? 'The mean height of all the land, <b>not</b> the peak' : `${q.kind==='highest'?'Peak':'Spot'}: <b>${esc(q.rec.point)}</b>`;
  const sl=$('slider'); sl.min=f(R.lo); sl.max=f(R.hi); sl.step=IMP?.1:1; sl.disabled=false;
  const nm=$('num'); nm.min=Math.round(IMP?R.lo*FT:R.lo); nm.max=Math.round(IMP?R.hi*FT:R.hi); nm.disabled=false;
  $('unit').textContent=U(); $('unit2').textContent=U();
  drawMap(q,false); $('cmp').classList.add('hidden');
  $('guessui').classList.remove('hidden'); $('resui').classList.add('hidden');
  setValue(finv((f(R.lo)+f(R.hi))/2));
  // no preset guess: the scale, slider and Lock in stay idle until the player places one
  g.touched=false; $('read').textContent='–'; $('readsub').textContent='Drag the scale, use the slider or type a figure to place your guess'; $('num').value=''; $('lock').disabled=true; $('guessui').classList.add('untouched'); drawGauge();
  $('slider').focus({preventScroll:true});
}

// ---- map (Natural Earth outlines, drawn as SVG; no tiles, works offline) ----
const WORLD = {}; MAPS.world.forEach(w=>WORLD[w[0]]=w);
const OWNED = new Set(); Object.values(MAPS.rows).forEach(r=>r.parts.forEach(p=>OWNED.add(p[0])));
const SVGNS='http://www.w3.org/2000/svg';
function drawMap(q, reveal){
  const svg=$('map'), row=MAPS.rows[String(q.rec.id)], cap=$('mapcap'); svg.innerHTML='';
  if(!row){ cap.textContent='No map for this place.'; svg.style.visibility='hidden'; return; }
  svg.style.visibility='visible';
  let [x0,y0,x1,y1]=row.view.map(v=>v/1000); const hasPt=q.rec.lat!=null&&q.rec.lon!=null;
  if(reveal&&hasPt){ const pd=Math.max(x1-x0,y1-y0)*.08; x0=Math.min(x0,q.rec.lon-pd); x1=Math.max(x1,q.rec.lon+pd); y0=Math.min(y0,q.rec.lat-pd); y1=Math.max(y1,q.rec.lat+pd); }
  const k=Math.max(.2,Math.cos(((y0+y1)/2)*Math.PI/180));
  svg.setAttribute('viewBox',`${(x0*k).toFixed(3)} ${(-y1).toFixed(3)} ${((x1-x0)*k).toFixed(3)} ${(y1-y0).toFixed(3)}`);
  let nd=''; const mn=[x0*1000,y0*1000,x1*1000,y1*1000];
  for(const id in WORLD){ if(OWNED.has(+id)&&row.parts.some(p=>p[0]===+id)) continue; const w=WORLD[id], b=w[1]; if(b[2]<mn[0]||b[0]>mn[2]||b[3]<mn[1]||b[1]>mn[3]) continue; w[2].forEach(r=>nd+=ringPath(r,k)); }
  const n=document.createElementNS(SVGNS,'path'); n.setAttribute('d',nd); n.setAttribute('class','mp-n'); n.setAttribute('fill-rule','evenodd'); svg.appendChild(n);
  let cd=''; row.parts.forEach(p=>p[1].forEach(r=>cd+=ringPath(r,k)));
  const c=document.createElementNS(SVGNS,'path'); c.setAttribute('d',cd); c.setAttribute('class','mp-c'+(reveal?' shown':'')); c.setAttribute('fill-rule','evenodd'); c.setAttribute('vector-effect','non-scaling-stroke'); svg.appendChild(c);
  if(reveal&&hasPt){
    const gp=document.createElementNS(SVGNS,'g'); gp.setAttribute('class','mp-pin'); const cx=q.rec.lon*k, cy=-q.rec.lat, rr=Math.max(x1-x0,y1-y0)*.012;
    gp.innerHTML=`<circle class="r" cx="${cx}" cy="${cy}" r="${rr*2.2}" vector-effect="non-scaling-stroke"/><circle class="d" cx="${cx}" cy="${cy}" r="${rr}" vector-effect="non-scaling-stroke"/>`; svg.appendChild(gp);
  }
  cap.textContent = q.kind==='average' ? (reveal?'Average over the whole country.':'Find your bearings: the outlined country is the one to guess for.') : !reveal ? 'Find your bearings: the outlined country is the one to guess for.' : `${q.rec.point}.`;
}
function stopAnim(){ cancelAnimationFrame(g.anim); g.anim=0; }
function lock(){
  if(g.locked||!g.touched) return; g.locked=true; dragging=false;
  const q=g.items[g.idx], truth=q.rec.m, pts=scoreFor(g.v,truth), err=Math.abs(g.v-truth);
  g.total+=pts; g.log.push({kind:q.kind,rec:q.rec,guess:g.v,pts,err});
  $('total').textContent=fmt(g.total); $('slider').disabled=true; $('num').disabled=true;
  $('guessui').classList.add('hidden');
  drawMap(q,true);
  const [word,tier]=ratingFor(pts);
  $('rating').className='rating t'+tier; $('rword').textContent=(g.level==='extreme'&&pts===0)?'Outside 5 per cent':word;
  const tol=Math.max(LEVELS[g.level].floor,LEVELS[g.level].pct*Math.abs(truth));
  $('rdetail').textContent = err===0 ? 'Exactly right.' : `You were ${fmtL(err)} ${U()} too ${g.v>truth?'high':'low'}.`+(g.level==='extreme'&&pts===0?` Extreme needs a guess within ${fmtL(tol)} ${U()}.`:'');
  $('cmp').innerHTML = `<div class="c"><div class="muted">Your guess</div><div class="big">${fmtL(g.v)}<i>${U()}</i></div></div><div class="c b"><div class="muted">${esc(q.rec.point)}</div><div class="big">${fmtL(truth)}<i>${U()}</i></div></div>`;
  $('next').textContent = g.idx+1>=g.items.length ? 'See your score' : 'Next';
  $('resui').classList.remove('hidden'); $('cmp').classList.remove('hidden');
  // answer rises (or sinks) from sea level, then the score counts up
  const t0=performance.now(), DUR=reduce?1:1300;
  const frame=now=>{ const p=Math.min(1,(now-t0)/DUR), e=1-Math.pow(1-p,3);
    drawGauge({value:truth*e, showGap:false}); $('pts').innerHTML=`${fmt(pts*e)}<small>points</small>`;
    if(p<1) g.anim=requestAnimationFrame(frame); else { g.anim=0; drawGauge({value:truth,showGap:true}); } };
  g.anim=requestAnimationFrame(frame);
  $('next').focus({preventScroll:true});
}
function nextRound(){ if(!g.locked) return; g.idx++; if(g.idx>=g.items.length) finish(); else ask(); }

function finish(){
  stopAnim(); document.body.dataset.kind=g.mode==='lowest'?'lowest':g.mode==='average'?'average':'highest';
  const max=g.items.length*TOP_MARKS, key=bestKey(), prev=g.best[key]||0, fresh=g.total>prev;
  if(fresh){ g.best[key]=g.total; saveBest(); }
  const avg=g.total/g.items.length, [word]=ratingFor(avg);
  $('play').classList.add('hidden'); $('hud').classList.add('hidden'); $('final').classList.remove('hidden');
  $('final').innerHTML = `<p class="place">Game over</p><h2>${word}</h2><div class="tot">${fmt(g.total)} <small>of ${fmt(max)}</small></div>
   <p class="muted">${LEVELS[g.level].label} level. ${fresh?'A new best score for this choice.':'Best for this choice: '+fmt(prev)+'.'}</p>
   <table><tr><th>Place</th><th class="n">Guess</th><th class="n">Actual</th><th class="n">Points</th><th></th></tr>${g.log.map(r=>`<tr><td>${esc(r.rec.name)}<div class="muted">${esc(r.rec.point)}</div></td><td class="n">${fmtL(r.guess)} ${U()}</td><td class="n">${fmtL(r.rec.m)} ${U()}</td><td class="n">${fmt(r.pts)}</td><td style="width:90px"><div class="bar"><i style="width:${r.pts/10}%"></i></div></td></tr>`).join('')}</table>
   <div class="row"><button class="go" id="again">Play again</button><button class="ghost" id="tomenu">Change mode</button><a class="ghost" href="${import.meta.env.BASE_URL}higher-lower/">Try higher or lower</a></div>`;
  $('again').onclick=start; $('tomenu').onclick=toMenu; $('again').focus({preventScroll:true});
}
function start(){ g.items=buildGame(); g.idx=0; g.total=0; g.log=[]; ask(); }
function toMenu(){ stopAnim(); g.locked=true; ['hud','play','final'].forEach(i=>$(i).classList.add('hidden')); $('setup').classList.remove('hidden'); poolNote(); }

$('start').onclick=start; $('lock').onclick=lock; $('next').onclick=nextRound; $('menu').onclick=toMenu;
document.querySelectorAll('#mode button').forEach(b=>b.onclick=()=>{g.mode=b.dataset.m;document.querySelectorAll('#mode button').forEach(x=>x.classList.toggle('on',x===b));poolNote();});
document.querySelectorAll('#level button').forEach(b=>b.onclick=()=>{g.level=b.dataset.l;document.querySelectorAll('#level button').forEach(x=>x.classList.toggle('on',x===b));poolNote();});
document.querySelectorAll('#units button').forEach(b=>b.onclick=()=>{ IMP=b.dataset.u==='imperial'; try{ localStorage.setItem('country-extremes-units',IMP?'imperial':'metric'); }catch(e){} syncUnits(); poolNote(); });
syncUnits();
$('region').onchange=()=>{g.region=$('region').value;poolNote();};
document.addEventListener('keydown',e=>{ if(e.key!=='Enter'||e.target.tagName==='SELECT'||e.target.tagName==='BUTTON') return;
  if(!$('play').classList.contains('hidden')) g.locked?nextRound():lock(); });
poolNote();
window.__guess={g,scoreFor,ratingFor,buildGame,RANGE,f,finv,setValue,lock,start};
