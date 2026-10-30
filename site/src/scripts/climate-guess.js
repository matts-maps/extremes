import POOL from '../data/climate-pool.json';
import MAPS from '../data/map-data.json';
import { $, ringPath, rnd } from './game-common.js';


const KINDS = ['hottest','coldest','avghigh','avglow','avgmean','wettest'];
const ROUNDS = 10, TOP_MARKS = 1000;
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const fmtI = v => Math.round(v).toLocaleString('en-GB').replace('-','−');
// ---- units: figures are held in degrees Celsius and millimetres; the display can switch to Fahrenheit and inches (kept in localStorage, shared by all the games)
let IMP = false; try{ IMP = localStorage.getItem('country-extremes-units')==='imperial'; }catch(e){}
const isRain = k => k==='wettest';
const dv = (k,v) => IMP ? (isRain(k) ? v/25.4 : v*9/5+32) : v;      // an absolute value, for display
const dd = (k,d) => IMP ? (isRain(k) ? d/25.4 : d*1.8) : d;         // a difference, for display
const toBase = (k,x) => IMP ? (isRain(k) ? x*25.4 : (x-32)/1.8) : x;
const UN = k => isRain(k) ? (IMP?'in':'mm') : (IMP?'°F':'°C');
const decs = k => isRain(k) ? (IMP?1:0) : 1;
const fmtNum = (x,d) => (d ? x.toFixed(d) : Math.round(x).toLocaleString('en-GB')).replace('-','−');
const fmtV = (k,v) => fmtNum(dv(k,v),decs(k));
const fmtD = (k,d) => fmtNum(dd(k,d),decs(k));
function syncUnits(){ document.querySelectorAll('#units button').forEach(b=>b.classList.toggle('on',(b.dataset.u==='imperial')===IMP)); }

// per-measure settings. Gauge ranges are fixed so the range gives nothing away.
// Temperatures are scored on an absolute miss in degrees; rainfall on a share of the true figure with a floor in millimetres.
const TOL_REC = {beginner:10, intermediate:5, advanced:2.5, extreme:1.5};
const TOL_AVG = {beginner:6, intermediate:3, advanced:1.5, extreme:1};
const CFG = {
  hottest:{unit:'°C', dec:1, lo:0, hi:60, step:.5, label:'Record high', word:'Record high in', hint:'The hottest temperature ever recorded in the country', pool:'record highs', tol:TOL_REC},
  coldest:{unit:'°C', dec:1, lo:-90, hi:25, step:.5, label:'Record low', word:'Record low in', hint:'The coldest temperature ever recorded in the country', pool:'record lows', tol:TOL_REC},
  avghigh:{unit:'°C', dec:1, lo:-20, hi:40, step:.5, label:'Average daily high', word:'Average daily high in', hint:'The typical daytime high over the whole country, 1991 to 2020', pool:'average daily highs', tol:TOL_AVG},
  avglow:{unit:'°C', dec:1, lo:-30, hi:30, step:.5, label:'Average daily low', word:'Average daily low in', hint:'The typical night-time low over the whole country, 1991 to 2020', pool:'average daily lows', tol:TOL_AVG},
  avgmean:{unit:'°C', dec:1, lo:-25, hi:35, step:.5, label:'Average temperature', word:'Average temperature in', hint:'The yearly mean over the whole country, 1991 to 2020', pool:'average temperatures', tol:TOL_AVG},
  wettest:{unit:'mm', dec:0, lo:0, hi:3500, step:10, label:'Average rainfall', word:'Average annual rainfall in', hint:'The mean over the whole country, in millimetres a year', pool:'average rainfall figures', pct:{beginner:.4,intermediate:.2,advanced:.1,extreme:.05}, floor:{beginner:100,intermediate:50,advanced:25,extreme:10}}
};
// every temperature figure held for a country, and which one each question asks for
const ASK = {hottest:'rh', coldest:'rl', avghigh:'ah', avglow:'al', avgmean:'am'};
const ROWS = [['rh','Record high','rhp','rhd'],['ah','Average daily high'],['am','Average temperature'],['al','Average daily low'],['rl','Record low','rlp','rld']];
function numsTable(kind,rec){ if(!ASK[kind]) return ''; const d=POOL.detail[rec.id]||{};
  return '<table class="nums">'+ROWS.map(([k,label,pk,dk])=>{ const place=pk&&d[pk]?esc(d[pk])+(d[dk]&&d[dk]!=='?'&&d[dk]!=='N/A'?', '+esc(d[dk]):''):'';
    return `<tr class="${k===ASK[kind]?'ask':''}"><td>${label}${place?`<small>${place}</small>`:''}</td><td class="v">${d[k]==null?'no figure':fmtV('hottest',d[k])+' '+UN('hottest')}</td></tr>`; }).join('')+'</table>'; }
const LEVELNAMES = {beginner:'Beginner', intermediate:'Intermediate', advanced:'Advanced', extreme:'Extreme'};
function tolFor(kind,level,truth){ const C=CFG[kind]; return C.tol ? C.tol[level] : Math.max(C.floor[level], C.pct[level]*Math.abs(truth)); }

const g = {mode:'hottest', level:'intermediate', region:'', best:{}, items:[], idx:0, total:0, log:[], v:0, locked:false, anim:0};
[...new Set(KINDS.flatMap(k=>POOL[k].map(r=>r.region)))].filter(x=>x!=='Antarctica').sort().forEach(x=>$('region').add(new Option(x,x)));
try{ g.best = JSON.parse(localStorage.getItem('country-extremes-climate-guess-best')||'{}'); }catch(e){ g.best={}; }
const saveBest = () => { try{ localStorage.setItem('country-extremes-climate-guess-best',JSON.stringify(g.best)); }catch(e){} };

const poolFor = kind => POOL[kind].filter(r=>!g.region||r.region===g.region);
const bestKey = () => g.mode+'|'+g.region+'|'+g.level;
const kindsFor = () => g.mode==='mixed' ? KINDS : [g.mode];
const needed = () => Math.min(ROUNDS, kindsFor().reduce((n,k)=>n+poolFor(k).length,0));

function levelNote(){
  const L=g.level, ks=kindsFor(), parts=[], isRec=k=>k==='hottest'||k==='coldest', isAvg=k=>k==='avghigh'||k==='avglow'||k==='avgmean';
  const temp=(name,x)=>{ const t=`${fmtD('hottest',x)} ${UN('hottest')}`; return L==='extreme' ? `${name}: only guesses within ${t} score; exact scores 1,000, falling to 500 at the edge.` : `${name}: a miss of ${t} scores about 370; half that scores about 600.`; };
  if(ks.some(isRec)) parts.push(temp('Records',TOL_REC[L]));
  if(ks.some(isAvg)) parts.push(temp('Averages',TOL_AVG[L]));
  if(ks.includes('wettest')){ const p=CFG.wettest.pct[L]*100, fl=CFG.wettest.floor[L];
    parts.push(L==='extreme' ? `Rainfall: only guesses within ${p} per cent (at least ${fmtD('wettest',fl)} ${UN('wettest')}) score; exact scores 1,000, falling to 500 at the edge.` : `Rainfall: a miss of ${p} per cent of the true figure (at least ${fmtD('wettest',fl)} ${UN('wettest')}) scores about 370.`); }
  return parts.join(' ');
}
function poolNote(){
  const ks=kindsFor(), n=ks.map(k=>poolFor(k).length), total=n.reduce((a,b)=>a+b,0), ok=total>=3;
  $('poolnote').textContent = ok ? `${ks.map((k,i)=>n[i]+' '+CFG[k].pool).join(' and ')} in the question pool; ${Math.min(ROUNDS,total)} rounds per game.` : 'Not enough records for this choice. Pick another region or mode.';
  $('start').disabled = !ok;
  $('levelnote').textContent = levelNote();
  $('best').textContent = g.best[bestKey()] || 0;
  if(!$('hud').classList.contains('hidden')) return; document.body.dataset.kind = g.mode==='mixed'?'hottest':g.mode;
}

// score: 1,000 for an exact answer, falling as exp(-miss/allowance). Extreme: only guesses inside the allowance score, 1,000 falling in a straight line to 500 at the edge.
function scoreFor(kind,guess,truth,level){
  level=level||g.level; const miss=Math.abs(guess-truth), tol=tolFor(kind,level,truth);
  if(level==='extreme') return miss<=tol ? Math.round(TOP_MARKS*(1-.5*miss/tol)) : 0;
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
const GW=340, GH=372, GT=38, GB=40, GX0=64, GX1=GW-10;
const baseOf = R => clamp(0,R.lo,R.hi);
function geom(kind){ const R=CFG[kind], P=GH-GT-GB; const y=v=>GT+(R.hi-v)/(R.hi-R.lo)*P; return {R,P,y}; }
function ticksFor(G,kind){
  const a=dv(kind,G.R.lo), b=dv(kind,G.R.hi), pxPer=G.P/(b-a), step=[.5,1,2,5,10,20,25,50,100,200,250,500,1000].find(st=>st*pxPer>=26)||1000, out=[];
  for(let d=Math.ceil(a/step)*step; d<=b+1e-9; d+=step) out.push([toBase(kind,d), Math.round(d*100)/100]);
  return out;
}
// rain gauge: a funnel with a rim over a tube, on a small stand; the water rises in the channel inside the tube. top and bot are the y of the scale's ends, yv the water level.
const rainGauge=(x,hw,top,bot,yv,stroke,glass)=>{
  const tt=top-8, bb=bot+6, fh=Math.round(hw*.95+6), tf=tt-fh, fb=tt+8, ft=hw*2.1, fn=hw*.55, cw=hw*.94, rh=Math.max(6,hw*.4), bw=hw*1.88, bh=Math.max(8,hw*.7), cb=bb-6, rx=cw*.2;
  let s=`<rect x="${x-bw}" y="${bb}" width="${bw*2}" height="${bh}" rx="4" fill="#9aa6b2" opacity=".85"/><polygon points="${x-hw*.42},${bb+bh} ${x+hw*.42},${bb+bh} ${x},${bb+bh+hw*1.1}" fill="#7a8794"/>`;
  s+=`<rect x="${x-hw}" y="${tt}" width="${hw*2}" height="${bb-tt}" rx="${hw*.35}" fill="${glass}" stroke="${stroke}" stroke-width="2"/>`;
  s+=`<rect x="${x-cw/2}" y="${top-4}" width="${cw}" height="${cb-top+4}" rx="${rx}" fill="rgba(255,255,255,.1)"/>`;
  if(yv<cb) s+=`<rect x="${x-cw/2}" y="${yv}" width="${cw}" height="${cb-yv}" rx="${rx}" fill="#1f6fd1"/><rect x="${x-cw/2}" y="${yv}" width="${cw}" height="3" rx="1.5" fill="#fff" opacity=".45"/>`;
  s+=`<rect x="${x-hw+hw*.2}" y="${top+10}" width="${Math.max(2,hw*.17)}" height="${(bot-top)*.9}" rx="1.5" fill="#fff" opacity=".25"/>`;
  s+=`<polygon points="${x-ft},${tf} ${x+ft},${tf} ${x+fn},${fb} ${x-fn},${fb}" fill="${glass}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
  s+=`<polygon points="${x-ft*.73},${tf+3} ${x+ft*.73},${tf+3} ${x+fn*.4},${fb-5} ${x-fn*.4},${fb-5}" fill="rgba(255,255,255,.1)"/>`;
  s+=`<rect x="${x-ft*1.1}" y="${tf-rh*.9}" width="${ft*2.2}" height="${rh}" rx="${rh/2}" fill="${glass}" stroke="${stroke}" stroke-width="2"/>`;
  s+=`<line x1="${x-ft*.82}" y1="${tf+4}" x2="${x-hw*.9}" y2="${fb-6}" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>`;
  return s; };
// thermometer: a glass tube joined to a bulb; the mercury runs from the bulb up to the reading (ym is its top)
const thermo=(x,hw,ty,cy,br,ym,col,stroke,glass)=>{ const ch=Math.max(6,Math.round(hw*.7));
  return `<rect x="${x-hw}" y="${ty}" width="${hw*2}" height="${cy-ty}" rx="${hw}" fill="${glass}" stroke="${stroke}" stroke-width="2"/>`
   +`<circle cx="${x}" cy="${cy}" r="${br}" fill="${glass}" stroke="${stroke}" stroke-width="2"/>`
   +`<rect x="${x-hw+1}" y="${cy-br-6}" width="${hw*2-2}" height="${br}" fill="${glass}"/>`
   +`<rect x="${x-ch/2}" y="${ty+hw*.6}" width="${ch}" height="${cy-ty-hw*.6}" rx="${ch/2}" fill="rgba(255,255,255,.12)"/>`
   +(ym<cy?`<rect x="${x-ch/2}" y="${ym}" width="${ch}" height="${cy-ym}" rx="${ch/2}" fill="${col}"/>`:'')
   +`<circle cx="${x}" cy="${cy}" r="${br*.74}" fill="${col}"/>`
   +`<rect x="${x-hw+4}" y="${ty+hw*.9}" width="3" height="${(cy-ty)*.7}" rx="1.5" fill="#fff" opacity=".28"/><circle cx="${x-br*.4}" cy="${cy+br*.25}" r="${br*.18}" fill="#fff" opacity=".4"/>`; };
const mercury = v => v>=0 ? '#d6332a' : '#3b8be8';   // red above freezing, blue below
function drawGauge(extra){
  const q=g.items[g.idx], G=geom(q.kind), C=CFG[q.kind], yb=G.y(baseOf(C)), yg=G.y(g.v), ticks=ticksFor(G,q.kind), zero=C.lo<0&&C.hi>0;
  let s=`<svg viewBox="0 0 ${GW} ${GH}" id="gsvg" role="img" aria-label="Scale; your guess is marked">`;
  s+=`<defs>
   <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a)"/><stop offset="1" stop-color="var(--a)" stop-opacity=".5"/></linearGradient>
   <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--b)"/><stop offset="1" stop-color="var(--b)" stop-opacity=".5"/></linearGradient>
   <clipPath id="gclip"><rect x="${GX0}" y="0" width="${GX1-GX0}" height="${GH}"/></clipPath></defs>`;
  s+=`<g clip-path="url(#gclip)">`;
  if(zero) s+=`<rect x="${GX0}" y="${yb}" width="${GX1-GX0}" height="${GT+G.P-yb}" fill="var(--sea)" fill-opacity=".12"/>`;
  ticks.forEach(([v])=>{ if(v!==0) s+=`<line x1="${GX0}" x2="${GX1}" y1="${G.y(v)}" y2="${G.y(v)}" stroke="#fff" stroke-opacity=".08"/>`; });
  { const iv=extra?extra.value:(g.touched?g.v:baseOf(C));   // the instrument follows the guess while guessing, then the answer
    const x=GX0+(GX1-GX0)*.30, yt=G.y(iv), yb0=GT+G.P, col='var(--b)', glass='#15293b';
    if(q.kind==='wettest'){ s+=rainGauge(x,14,GT,GT+G.P,clamp(yt,GT,GT+G.P),'rgba(255,255,255,.5)',glass);
    } else { s+=thermo(x,9,GT-4,GT+G.P+12,16,clamp(yt,GT,GT+G.P),mercury(iv),'rgba(255,255,255,.5)',glass); }
  }
  s+=`</g>`;
  ticks.forEach(([v,lab])=>{ const yy=G.y(v); if(!zero||(v!==0&&Math.abs(yy-yb)>12)) s+=`<text class="m" x="${GX0-6}" y="${yy+4}" text-anchor="end" style="font-size:10px">${fmtNum(lab,0)}</text>`; });
  if(zero) s+=`<line x1="${GX0}" x2="${GX1}" y1="${yb}" y2="${yb}" stroke="var(--sea)" stroke-width="2.5"/><text x="${GX0-6}" y="${yb+4}" text-anchor="end" style="fill:var(--sea);font-weight:700;font-size:10px">${isRain(q.kind)?0:IMP?32:0}</text>`;
  if(extra){ const GA=POOL.global[q.kind], yg2=G.y(GA.v);
    s+=`<line x1="${GX0}" x2="${GX1}" y1="${yg2}" y2="${yg2}" stroke="#fff" stroke-opacity=".6" stroke-dasharray="2 4"/><text x="${GX1-3}" y="${yg2-4}" text-anchor="end" style="font-size:10px;fill:#fff;opacity:.9">${GA.label}: ${fmtV(q.kind,GA.v)} ${UN(q.kind)}</text>`; }
  const gy=clamp(yg,GT,GT+G.P), left=GX0+(GX1-GX0)*.62;
  if(extra&&extra.showGap){ const ya=G.y(extra.value); s+=`<line x1="${left+34}" x2="${left+34}" y1="${gy}" y2="${ya}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="3 3"/><line x1="${GX0}" x2="${GX1}" y1="${ya}" y2="${ya}" stroke="var(--b)" stroke-width="1.5" stroke-dasharray="5 4"/>`; }
  { const idle=!g.touched&&!g.locked;   // before a guess is placed the bar sits mid-scale as a faint 'drag me' handle
  s+=`<g opacity="${idle?.6:1}"><line x1="${GX0}" x2="${GX1}" y1="${gy}" y2="${gy}" stroke="var(--a)" stroke-width="2.5"${idle?' stroke-dasharray="6 5"':''}/>`;
  s+=`<g transform="translate(${left},${gy})"><rect x="-6" y="-13" width="84" height="26" rx="13" fill="var(--a)"/><text x="36" y="5" text-anchor="middle" style="fill:#06232a;font-weight:800;font-size:${idle?11:13}px">${idle?'Drag to guess':fmtV(q.kind,g.v)+' '+UN(q.kind)}</text></g></g>`; }
  s+=`</svg>`; $('gauge').innerHTML=s;
}

// ---- input handling ----
function sub(kind,v){ if(kind==='wettest') return v===0?'No rain':IMP?`About ${fmtNum(v/25.4,0)} in of rain in a year`:`About ${fmtI(v/10)} cm of rain in a year`; return v===0?'Exactly freezing':`${fmtD(kind,Math.abs(v))} ${UN(kind)} ${v>0?'above':'below'} freezing`; }
function setValue(v,fromNum){
  g.touched=true; $('lock').disabled=false; $('guessui').classList.remove('untouched');
  const q=g.items[g.idx], C=CFG[q.kind]; const st=IMP?(isRain(q.kind)?1:.1):C.step; g.v=+(Math.round(clamp(v,C.lo,C.hi)/st)*st).toFixed(2);
  $('read').textContent=fmtV(q.kind,g.v); $('slider').value=g.v; if(!fromNum) $('num').value=+dv(q.kind,g.v).toFixed(decs(q.kind));
  $('readsub').textContent = sub(q.kind,g.v);
  drawGauge();
}
function gaugeToValue(e){
  const svg=$('gsvg'); if(!svg) return; const r=svg.getBoundingClientRect(), q=g.items[g.idx], G=geom(q.kind);
  const yy=(e.clientY-r.top)/r.height*GH; setValue(G.R.hi-clamp((yy-GT)/G.P,0,1)*(G.R.hi-G.R.lo));
}
let dragging=false;
$('gauge').addEventListener('pointerdown',e=>{ if(g.locked) return; dragging=true; $('gauge').setPointerCapture(e.pointerId); gaugeToValue(e); });
$('gauge').addEventListener('pointermove',e=>{ if(dragging&&!g.locked) gaugeToValue(e); });
$('gauge').addEventListener('pointerup',()=>dragging=false);
$('slider').addEventListener('input',e=>{ if(!g.locked) setValue(parseFloat(e.target.value)); });
$('num').addEventListener('input',e=>{ if(g.locked||e.target.value===''||e.target.value==='-') return; setValue(toBase(g.items[g.idx].kind,parseFloat(e.target.value)),true); });

// ---- flow ----
function dots(){ $('dots').innerHTML=g.items.map((_,i)=>`<i class="${i<g.idx?'done':i===g.idx?'now':''}"></i>`).join(''); }
function ask(){
  stopAnim(); g.locked=false;
  const q=g.items[g.idx], C=CFG[q.kind]; document.body.dataset.kind=q.kind;
  $('setup').classList.add('hidden'); $('final').classList.add('hidden'); $('hud').classList.remove('hidden'); $('play').classList.remove('hidden');
  $('rn').textContent=g.idx+1; $('rof').textContent='of '+g.items.length; $('total').textContent=fmtI(g.total); dots();
  $('kindword').textContent = C.word; $('country').textContent = q.rec.name; $('point').innerHTML = esc(C.hint);
  $('unit').textContent=UN(q.kind); $('unit2').textContent=UN(q.kind);
  const sl=$('slider'); sl.min=C.lo; sl.max=C.hi; sl.step=IMP?(isRain(q.kind)?1:.1):C.step; sl.disabled=false;
  const nm=$('num'); nm.min=+dv(q.kind,C.lo).toFixed(1); nm.max=+dv(q.kind,C.hi).toFixed(1); nm.step='any'; nm.disabled=false;
  drawMap(q,false); $('cmp').classList.add('hidden');
  $('guessui').classList.remove('hidden'); $('resui').classList.add('hidden');
  setValue((C.lo+C.hi)/2);
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
  let [x0,y0,x1,y1]=row.view.map(v=>v/1000);
  // the place of a record, when it is known, is marked once the answer is shown (the view widens to include it)
  const pts=reveal?(q.rec.pts||(q.rec.lat!=null&&q.rec.lon!=null?[[q.rec.lat,q.rec.lon]]:[])):[];
  if(pts.length){ const pd=Math.max(x1-x0,y1-y0)*.08; pts.forEach(([la,lo])=>{ x0=Math.min(x0,lo-pd); x1=Math.max(x1,lo+pd); y0=Math.min(y0,la-pd); y1=Math.max(y1,la+pd); }); }
  const k=Math.max(.2,Math.cos(((y0+y1)/2)*Math.PI/180));
  svg.setAttribute('viewBox',`${(x0*k).toFixed(3)} ${(-y1).toFixed(3)} ${((x1-x0)*k).toFixed(3)} ${(y1-y0).toFixed(3)}`);
  let nd=''; const mn=[x0*1000,y0*1000,x1*1000,y1*1000];
  for(const id in WORLD){ if(OWNED.has(+id)&&row.parts.some(p=>p[0]===+id)) continue; const w=WORLD[id], b=w[1]; if(b[2]<mn[0]||b[0]>mn[2]||b[3]<mn[1]||b[1]>mn[3]) continue; w[2].forEach(r=>nd+=ringPath(r,k)); }
  const n=document.createElementNS(SVGNS,'path'); n.setAttribute('d',nd); n.setAttribute('class','mp-n'); n.setAttribute('fill-rule','evenodd'); svg.appendChild(n);
  let cd=''; row.parts.forEach(p=>p[1].forEach(r=>cd+=ringPath(r,k)));
  const c=document.createElementNS(SVGNS,'path'); c.setAttribute('d',cd); c.setAttribute('class','mp-c'+(reveal?' shown':'')); c.setAttribute('fill-rule','evenodd'); c.setAttribute('vector-effect','non-scaling-stroke'); svg.appendChild(c);
  if(pts.length){ const rr=Math.max(x1-x0,y1-y0)*.012; pts.forEach(([la,lo])=>{ const gp=document.createElementNS(SVGNS,'g'); gp.setAttribute('class','mp-pin'); const cx=lo*k, cy=-la;
    gp.innerHTML=`<circle class="r" cx="${cx}" cy="${cy}" r="${rr*2.2}" vector-effect="non-scaling-stroke"/><circle class="d" cx="${cx}" cy="${cy}" r="${rr}" vector-effect="non-scaling-stroke"/>`; svg.appendChild(gp); }); }
  const r=q.rec, when = r.date && r.date!=='?' && r.date!=='N/A' ? ', '+r.date : '';
  cap.textContent = !reveal ? 'Find your bearings: the outlined country is the one to guess for.' : (q.kind==='hottest'||q.kind==='coldest') ? `Recorded at ${r.point}${when}.` : 'Average over the whole country.';
}
function stopAnim(){ cancelAnimationFrame(g.anim); g.anim=0; }
function lock(){
  if(g.locked||!g.touched) return; g.locked=true; dragging=false;
  const q=g.items[g.idx], C=CFG[q.kind], truth=q.rec.v, pts=scoreFor(q.kind,g.v,truth), err=Math.abs(g.v-truth);
  g.total+=pts; g.log.push({kind:q.kind,rec:q.rec,guess:g.v,pts,err});
  $('total').textContent=fmtI(g.total); $('slider').disabled=true; $('num').disabled=true;
  $('guessui').classList.add('hidden');
  drawMap(q,true);
  const [word,tier]=ratingFor(pts), tol=tolFor(q.kind,g.level,truth), eps=q.kind==='wettest'?.5:.05;
  $('rating').className='rating'; $('rword').textContent=(g.level==='extreme'&&pts===0)?'Outside the allowance':word;
  $('rdetail').textContent = err<eps ? 'Exactly right.' : `You were ${fmtD(q.kind,err)} ${UN(q.kind)} too ${g.v>truth?'high':'low'}.`+(g.level==='extreme'&&pts===0?` Extreme needs a guess within ${fmtD(q.kind,tol)} ${UN(q.kind)}.`:'');
  $('cmp').innerHTML = `<div class="c"><div class="muted">Your guess</div><div class="big">${fmtV(q.kind,g.v)}<i>${UN(q.kind)}</i></div></div><div class="c b"><div class="muted">${(q.kind==='hottest'||q.kind==='coldest')?esc(q.rec.point):C.label}</div><div class="big">${fmtV(q.kind,truth)}<i>${UN(q.kind)}</i></div></div>${ASK[q.kind]?`<div class="c" style="grid-column:1/-1"><div class="muted">All the temperature figures for ${esc(q.rec.name)}</div>${numsTable(q.kind,q.rec)}</div>`:''}`;
  $('next').textContent = g.idx+1>=g.items.length ? 'See your score' : 'Next';
  $('resui').classList.remove('hidden'); $('cmp').classList.remove('hidden');
  // fill to your guess, pause for a second, then carry on to the true figure
  const t0=performance.now(), A=reduce?.01:.8, PA=reduce?0:.4, B=reduce?.01:.9, easeO=x=>1-Math.pow(1-x,3);
  const frame=now=>{ const t=(now-t0)/1000; let level, e=0;
    if(t<A) level=baseOf(C)+(g.v-baseOf(C))*easeO(t/A); else if(t<A+PA) level=g.v; else { e=easeO(Math.min(1,(t-A-PA)/B)); level=g.v+(truth-g.v)*e; }
    drawGauge({value:level, showGap:false}); $('pts').innerHTML=`${fmtI(pts*e)}<small>points</small>`;
    if(t<A+PA+B) g.anim=requestAnimationFrame(frame); else { g.anim=0; $('rating').className='rating t'+tier; drawGauge({value:truth,showGap:true}); $('pts').innerHTML=`${fmtI(pts)}<small>points</small>`; } };
  g.anim=requestAnimationFrame(frame);
  $('next').focus({preventScroll:true});
}
function nextRound(){ if(!g.locked) return; g.idx++; if(g.idx>=g.items.length) finish(); else ask(); }

function finish(){
  stopAnim(); document.body.dataset.kind=g.mode==='mixed'?'hottest':g.mode;
  const max=g.items.length*TOP_MARKS, key=bestKey(), prev=g.best[key]||0, fresh=g.total>prev;
  if(fresh){ g.best[key]=g.total; saveBest(); }
  const avg=g.total/g.items.length, [word]=ratingFor(avg);
  $('play').classList.add('hidden'); $('hud').classList.add('hidden'); $('final').classList.remove('hidden');
  $('final').innerHTML = `<p class="place">Game over</p><h2>${word}</h2><div class="tot">${fmtI(g.total)} <small>of ${fmtI(max)}</small></div>
   <p class="muted">${LEVELNAMES[g.level]} level. ${fresh?'A new best score for this choice.':'Best for this choice: '+fmtI(prev)+'.'}</p>
   <table><tr><th>Country</th><th class="n">Guess</th><th class="n">Actual</th><th class="n">Points</th><th></th></tr>${g.log.map(r=>`<tr><td>${esc(r.rec.name)}<div class="muted">${CFG[r.kind].label}</div></td><td class="n">${fmtV(r.kind,r.guess)} ${UN(r.kind)}</td><td class="n">${fmtV(r.kind,r.rec.v)} ${UN(r.kind)}</td><td class="n">${fmtI(r.pts)}</td><td style="width:90px"><div class="bar"><i style="width:${r.pts/10}%"></i></div></td></tr>`).join('')}</table>
   <div class="row"><button class="go" id="again">Play again</button><button class="ghost" id="tomenu">Change mode</button><a class="ghost" href="${import.meta.env.BASE_URL}hotter-or-colder/">Try hotter or colder</a></div>`;
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
$('foot').innerHTML = `Source: <a href="https://en.wikipedia.org/wiki/List_of_weather_records" target="_blank" rel="noopener">Wikipedia, List of weather records</a> (revision 1382542755) for record highs and lows, and <a href="https://en.wikipedia.org/wiki/List_of_countries_by_average_annual_precipitation" target="_blank" rel="noopener">Wikipedia, List of countries by average annual precipitation</a> (revision 1380108857), fetched 29 October 2026, for the countries and territories of the <a href="https://en.wikipedia.org/wiki/ISO_3166-1" target="_blank" rel="noopener">ISO 3166-1</a> list and Kosovo. Rainfall is a national average, not the wettest place in the country.`;
$('foot').querySelectorAll('a').forEach(a=>{a.style.color='inherit';a.style.textDecoration='underline';});
poolNote();
window.__guess={g,scoreFor,ratingFor,buildGame,CFG,setValue,lock,start};
