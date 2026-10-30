import POOL from '../data/climate-pool.json';
import MAPS from '../data/map-data.json';
import { $, clamp01, easeOut, ringPath, rnd, wrap2 } from './game-common.js';


const KINDS = ['hottest','coldest','avghigh','avglow','avgmean'];
const LINE_AVG = [['max','Highest national average'],['min','Lowest national average']];
const CFG = {
  hottest:{unit:'°C', dec:1, minAbs:1.5, lowWins:false, pos:true, dir:1, q:'Which country has the higher record temperature?', noun:'record highs', pool:'record highs', zero:'Freezing point, 0 °C', lines:[['max','Hottest record in the dataset']], far:'hottest record'},
  coldest:{unit:'°C', dec:1, minAbs:1.5, lowWins:true, dir:-1, q:'Which country has the colder record low?', noun:'record lows', pool:'record lows', zero:'Freezing point, 0 °C', lines:[['min','Coldest record in the dataset']], far:'coldest record'},
  avghigh:{unit:'°C', dec:1, minAbs:1, lowWins:false, dir:1, q:'Which country has the higher average daily high?', noun:'average daily highs', pool:'average daily highs', zero:'Freezing point, 0 °C', lines:LINE_AVG, far:'highest national average'},
  avglow:{unit:'°C', dec:1, minAbs:1, lowWins:false, dir:1, q:'Which country has the higher average daily low?', noun:'average daily lows', pool:'average daily lows', zero:'Freezing point, 0 °C', lines:LINE_AVG, far:'highest national average'},
  avgmean:{unit:'°C', dec:1, minAbs:1, lowWins:false, dir:1, q:'Which country has the higher average temperature?', noun:'average temperatures', pool:'average temperatures', zero:'Freezing point, 0 °C', lines:LINE_AVG, far:'highest national average'}
};
Object.assign(CFG.hottest,{lo:0,hi:60}); Object.assign(CFG.coldest,{lo:-90,hi:25}); Object.assign(CFG.avghigh,{lo:-20,hi:40}); Object.assign(CFG.avglow,{lo:-30,hi:30}); Object.assign(CFG.avgmean,{lo:-25,hi:35});
// every temperature figure held for a country, and which one each question asks for
const ASK = {hottest:'rh', coldest:'rl', avghigh:'ah', avglow:'al', avgmean:'am'};
const ROWS = [['rh','Record high','rhp','rhd'],['ah','Average daily high'],['am','Average temperature'],['al','Average daily low'],['rl','Record low','rlp','rld']];
const fmtI = v => Math.round(v).toLocaleString('en-GB').replace('-','−');
// ---- units: figures are held in degrees Celsius and millimetres; the display can switch to Fahrenheit and inches (kept in localStorage, shared by all the games)
let IMP = false; try{ IMP = localStorage.getItem('country-extremes-units')==='imperial'; }catch(e){}
const isRain = k => !!CFG[k].rain;
const dv = (k,v) => IMP ? (isRain(k) ? v/25.4 : v*9/5+32) : v;      // an absolute value, for display
const dd = (k,d) => IMP ? (isRain(k) ? d/25.4 : d*1.8) : d;         // a difference, for display
const toBase = (k,x) => IMP ? (isRain(k) ? x*25.4 : (x-32)/1.8) : x;
const UN = k => isRain(k) ? (IMP?'in':'mm') : (IMP?'°F':'°C');
const decs = k => isRain(k) ? (IMP?1:0) : 1;
const fmtNum = (x,d) => (d ? x.toFixed(d) : Math.round(x).toLocaleString('en-GB')).replace('-','−');
const fmtV = (k,v) => fmtNum(dv(k,v),decs(k));
const fmtD = (k,d) => fmtNum(dd(k,d),decs(k));
function syncUnits(){ document.querySelectorAll('#units button').forEach(b=>b.classList.toggle('on',(b.dataset.u==='imperial')===IMP)); }

const state = {mode:'hottest', region:'', streak:0, best:{}, cur:null, used:{}, over:false};
KINDS.forEach(k=>state.used[k]=new Set());

[...new Set(KINDS.flatMap(k=>POOL[k].map(r=>r.region)))].filter(x=>x!=='Antarctica').sort().forEach(x=>$('region').add(new Option(x,x)));
try{ state.best = JSON.parse(localStorage.getItem('country-extremes-hotter-best')||'{}'); }catch(e){ state.best={}; }
function saveBest(){ try{ localStorage.setItem('country-extremes-hotter-best',JSON.stringify(state.best)); }catch(e){} }

const poolFor = kind => POOL[kind].filter(r=>!state.region||r.region===state.region);
const apart = (kind,a,b) => { const c=CFG[kind], d=Math.abs(a.v-b.v); return d>=c.minAbs && d/Math.max(Math.abs(a.v),Math.abs(b.v),1)>=(c.minRel||0); };
function validPairs(kind){ const p=poolFor(kind); let n=0; for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++) if(apart(kind,p[i],p[j])) n++; return n; }

function makePair(kind){
  const p=poolFor(kind); let fresh=p.filter(r=>!state.used[kind].has(r.id));
  if(fresh.length<1){ state.used[kind].clear(); fresh=p; }
  for(let tries=0;tries<200;tries++){
    const a=fresh[rnd(fresh.length)], cands=p.filter(b=>b.id!==a.id && apart(kind,a,b)); if(!cands.length) continue;
    const b=cands[rnd(cands.length)]; state.used[kind].add(a.id); state.used[kind].add(b.id);
    const pair=Math.random()<.5?[a,b]:[b,a];
    const win = CFG[kind].lowWins ? (pair[0].v<pair[1].v?0:1) : (pair[0].v>pair[1].v?0:1);
    return {kind,pair,win};
  }
  return null;
}
function nextKind(){ if(state.mode!=='mixed') return state.mode; const ok=KINDS.filter(k=>validPairs(k)>0); return ok[rnd(ok.length)]||'hottest'; }

function poolNote(){
  const kinds = state.mode==='mixed'?KINDS:[state.mode];
  const n = kinds.map(k=>poolFor(k).length), ok = kinds.some(k=>validPairs(k)>0);
  $('poolnote').textContent = ok ? `${kinds.map((k,i)=>n[i]+' '+CFG[k].pool).join(' and ')} in the question pool.` : 'Not enough records for this choice. Pick another region or mode.';
  $('start').disabled = !ok;
  $('best').textContent = state.best[state.mode+'|'+state.region] || 0;
  if(!state.cur || state.over) document.body.dataset.kind = state.mode==='mixed' ? 'hottest' : state.mode;
}

const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function mapMarkup(rec, reveal){
  const row=MAPS.rows[String(rec.id)]; if(!row) return '';
  let [x0,y0,x1,y1]=row.view.map(v=>v/1000);
  { const p=Math.max(x1-x0,y1-y0)*.12/1.24; x0+=p; x1-=p; y0+=p; y1-=p; const q=Math.max(x1-x0,y1-y0)*.04; x0-=q; x1+=q; y0-=q; y1+=q; }
  // the place of a record, when it is known, is marked once the answer is shown (the view widens to include it)
  const pts=reveal?(rec.pts||(rec.lat!=null&&rec.lon!=null?[[rec.lat,rec.lon]]:[])):[];
  if(pts.length){ const pd=Math.max(x1-x0,y1-y0)*.08; pts.forEach(([la,lo])=>{ x0=Math.min(x0,lo-pd); x1=Math.max(x1,lo+pd); y0=Math.min(y0,la-pd); y1=Math.max(y1,la+pd); }); }
  const k=Math.max(.2,Math.cos(((y0+y1)/2)*Math.PI/180)), rr=Math.max(x1-x0,y1-y0)*.03;
  let cd=''; row.parts.forEach(p=>p[1].forEach(q=>cd+=ringPath(q,k)));
  const pin=pts.map(([la,lo])=>`<g class="mp-pin"><circle class="r" cx="${lo*k}" cy="${-la}" r="${rr*2.2}" vector-effect="non-scaling-stroke"/><circle class="d" cx="${lo*k}" cy="${-la}" r="${rr}" vector-effect="non-scaling-stroke"/></g>`).join('');
  return `<svg class="cardmap" viewBox="${(x0*k).toFixed(3)} ${(-y1).toFixed(3)} ${((x1-x0)*k).toFixed(3)} ${(y1-y0).toFixed(3)}" role="img" aria-label="Map of ${esc(rec.name)}"><path class="mp-c${reveal?' shown':''}" d="${cd}" fill-rule="evenodd" vector-effect="non-scaling-stroke"/>${pin}</svg>`;
}
function setCardMap(i, rec, reveal){ const b=$('c'+i), old=b.querySelector('svg.cardmap'), tmp=document.createElement('div'); tmp.innerHTML=mapMarkup(rec,reveal); const n=tmp.firstChild; if(!n) return; if(old) old.replaceWith(n); else b.appendChild(n); }

function ask(){
  stopAnim();
  const kind = nextKind(), q = makePair(kind); if(!q){ poolNote(); return; }
  state.cur=q; document.body.dataset.kind = kind;
  $('setup').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('reveal').classList.add('hidden'); $('play').classList.remove('hidden');
  $('question').textContent = CFG[kind].q;
  q.pair.forEach((r,i)=>{ const b=$('c'+i); b.disabled=false; b.className='choice';
    b.style.animation='none'; void b.offsetWidth; b.style.animation='';
    b.innerHTML=`<span class="top"><span class="key">${i+1}</span><span class="nm">${esc(r.name)}</span><small>${esc(r.type==='State'?r.region:r.type)}</small></span><span class="tick"></span>${mapMarkup(r,false)}`; });
}

function answer(i){
  const q=state.cur; if(!q||q.done) return; q.done=true;
  const ok = i===q.win; [0,1].forEach(k=>{const b=$('c'+k); b.disabled=true; if(k===q.win){ b.classList.add('right'); b.querySelector('.tick').textContent='✓'; } else if(k===i){ b.classList.add('wrong'); b.querySelector('.tick').textContent='✗'; }});
  q.pair.forEach((rec,k)=>{ setCardMap(k,rec,true); const b=$('c'+k); b.classList.add('shown'); b.insertAdjacentHTML('beforeend',`<span class="val">${fmtV(q.kind,rec.v)}<i>${UN(q.kind)}</i></span>`); });
  if(ok){ state.streak++; } else { state.over=true; }
  const key=state.mode+'|'+state.region; if(state.streak>(state.best[key]||0)){ state.best[key]=state.streak; saveBest(); }
  const sEl=$('streak'); sEl.textContent=state.streak; sEl.classList.remove('pop'); void sEl.offsetWidth; if(ok) sEl.classList.add('pop');
  showReveal(q,ok);
}

// where a value sits between the mildest and the most extreme figure in the dataset, 0 to 100
function pct(kind,v){ const e=POOL.ext[kind], lo=e.min.v, hi=e.max.v;
  if(CFG[kind].rain) return clamp01(v/hi)*100;
  if(kind==='hottest') return clamp01(v/hi)*100;   // the thermometer starts at 0 °C, so the bar does too
  return clamp01(CFG[kind].dir>0 ? (v-lo)/(hi-lo) : (hi-v)/(hi-lo))*100; }
function share(kind,v){ const C=CFG[kind], e=POOL.ext[kind], p=pct(kind,v), t=p<10?p.toFixed(1):Math.round(p);
  if(C.rain) return `${t} per cent of the wettest national average (${e.max.name}, ${fmtV(kind,e.max.v)} ${UN(kind)})`;
  const far = C.dir>0 ? e.max : e.min, near = C.dir>0 ? e.min : e.max;
  if(kind==='hottest') return `${t} per cent of the way from ${fmtV(kind,0)} ${UN(kind)} to the ${C.far} (${far.name}, ${fmtV(kind,far.v)} ${UN(kind)})`;
  return `${t} per cent of the way from ${fmtV(kind,near.v)} ${UN(kind)} (${near.name}) to the ${C.far} (${far.name}, ${fmtV(kind,far.v)} ${UN(kind)})`; }
// every temperature figure for a country, with the one the question asked for highlighted
function numsTable(kind,rec){ if(!ASK[kind]) return ''; const d=POOL.detail[rec.id]||{};
  return '<table class="nums">'+ROWS.map(([k,label,pk,dk])=>{ const place=pk&&d[pk]?esc(d[pk])+(d[dk]&&d[dk]!=='?'&&d[dk]!=='N/A'?', '+esc(d[dk]):''):'';
    return `<tr class="${k===ASK[kind]?'ask':''}"><td>${label}${place?`<small>${place}</small>`:''}</td><td class="v">${d[k]==null?'no figure':fmtV('hottest',d[k])+' '+UN('hottest')}</td></tr>`; }).join('')+'</table>'; }

// Reveal graphic: a thermometer (or a rain gauge) for each country, both on the same fixed scale.
// The instrument for the wrong answer fills first from the bottom of the scale, there is a one second pause, then the instrument for the correct answer fills.
const T_START = 0.2, T_FILL = 1.2, T_PAUSE = 1.0, T_END = T_START + 2*T_FILL + T_PAUSE + 0.2;
function niceTicksK(kind,lo,hi,n){ const a=dv(kind,lo), b=dv(kind,hi), st=niceStep(b-a,n), out=[]; for(let d=Math.ceil(a/st)*st; d<=b+1e-9; d+=st) out.push([toBase(kind,d), Math.round(d*100)/100]); return out; }
function niceStep(span,n){ const raw=span/(n||5), mag=Math.pow(10,Math.floor(Math.log10(raw))); return [1,2,5,10].map(k=>k*mag).find(s=>s>=raw); }
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
function chart(q, t){
  const kind=q.kind, C=CFG[kind], E=POOL.ext[kind], rain=!!C.rain, W=560, H=400, top=52, L=240, bot=top+L, xs=[250,430], bands=[];
  const y=v=>top+(C.hi-Math.max(C.lo,Math.min(C.hi,v)))/(C.hi-C.lo)*L;
  const ticks=niceTicksK(kind,C.lo,C.hi,7);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${rain?'Rain gauges':'Thermometers'} filling to each country's figure">`;
  // the extremes in the dataset, and freezing point for temperatures
  C.lines.forEach(([w,label])=>{ const x=E[w], yy=y(x.v);
    bands.push(yy); s+=`<line x1="24" x2="${W-24}" y1="${yy}" y2="${yy}" stroke="var(--mute)" stroke-dasharray="4 4" opacity=".7"/><text class="m" x="26" y="${yy-5}" style="font-size:11px">${esc(label.replace(' in the dataset','').replace(' national',''))}: ${fmtV(kind,x.v)} ${UN(kind)}</text>`; });
  if(!rain && C.lo<0 && C.hi>0) bands.push(y(0)+19);
  if(!rain && C.lo<0 && C.hi>0) s+=`<line x1="24" x2="${W-24}" y1="${y(0)}" y2="${y(0)}" stroke="var(--sea)" stroke-width="2" opacity=".7"/><text x="26" y="${y(0)+14}" style="fill:var(--sea);font-weight:700;font-size:11px">${IMP?'Freezing point, 32 °F':C.zero}</text>`;
  { const GA=POOL.global[kind], yw=y(GA.v); bands.push(yw); const ly=(!rain && Math.abs(yw-y(0))<14) ? yw+15 : yw-5;
    s+=`<line x1="24" x2="${W-24}" y1="${yw}" y2="${yw}" stroke="#fff" stroke-opacity=".6" stroke-dasharray="2 4"/><text x="26" y="${yw-5}" style="font-size:11px;fill:#fff;opacity:.9">${GA.label}: ${fmtV(kind,GA.v)} ${UN(kind)}</text>`; }
  q.pair.forEach((r,i)=>{
    const x=xs[i], win=i===q.win, start=win?T_START+T_FILL+T_PAUSE:T_START, p=easeOut(clamp01((t-start)/T_FILL));
    const base=rain?C.lo:Math.max(C.lo,Math.min(C.hi,0)), v=base+(r.v-base)*p, yv=y(v), col=`var(--${i?'b':'a'})`, stroke=(win&&p>=1)?'#fff':'rgba(255,255,255,.4)', glass='#15293b';
    let hw;
    if(rain){
      // rain gauge: funnel and tube on a stand; the water rises in the channel
      hw=26; s+=rainGauge(x,hw,top,bot,yv,stroke,glass);
    } else {
      // thermometer with a bulb; the mercury rises (or falls) from the freezing line to the reading
      hw=14; s+=thermo(x,hw,top-12,bot+30,25,yv,mercury(v),stroke,glass);
    }
    // scale marks on the right of each instrument
    ticks.forEach(([tv,lab])=>{ const yy=y(tv); s+=`<line x1="${x-hw-9}" x2="${x-hw-2}" y1="${yy}" y2="${yy}" stroke="var(--mute)"/><text class="m" x="${x-hw-13}" y="${yy+4}" text-anchor="end" style="font-size:10px">${fmtNum(lab,0)}</text>`; });
    if(!rain){ ticks.forEach(([tv],k)=>{ if(k<ticks.length-1){ const ym=(y(tv)+y(ticks[k+1][0]))/2; s+=`<line x1="${x-hw-6}" x2="${x-hw-2}" y1="${ym}" y2="${ym}" stroke="var(--mute)" opacity=".6"/>`; } }); s+=`<text class="m" x="${x-hw-13}" y="${top-16}" text-anchor="end" style="font-size:11px">${UN(kind)}</text>`; }
    // the reading follows the top of the liquid
    // the reading follows the liquid, on the right of the instrument (the scale is on the left)
    const ry=yv+5;
    if(p>0) s+=`<text x="${x+hw+10}" y="${ry}" style="font-weight:800;font-size:15px;paint-order:stroke;stroke:rgba(10,20,30,.85);stroke-width:4px;stroke-linejoin:round">${fmtV(kind,v)} ${UN(kind)}</text>`;
    const ln=wrap2(r.name,20);
    s+=`<text class="m" text-anchor="middle" style="font-weight:700">${ln.map((l,k)=>`<tspan x="${x}" y="${H-8-(ln.length-1-k)*16}">${esc(l)}</tspan>`).join('')}</text>`;
  });
  s+='</svg>'; return s;
}

let animId=0;
function stopAnim(){ cancelAnimationFrame(animId); animId=0; }
function animateChart(q){
  stopAnim(); const box=$('chart');
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){ box.innerHTML=chart(q,99); return; }
  const t0=performance.now();
  const frame=now=>{ const t=(now-t0)/1000; box.innerHTML=chart(q,Math.min(t,T_END)); if(t<T_END) animId=requestAnimationFrame(frame); else animId=0; };
  animId=requestAnimationFrame(frame);
}

function showReveal(q,ok){
  const C=CFG[q.kind];
  $('verdict').textContent = ok ? 'Correct!' : 'Not this time.';
  $('banner').className='banner '+(ok?'ok':'no'); $('badge').textContent = ok ? '✓' : '✗';
  const d=Math.abs(q.pair[0].v-q.pair[1].v);
  $('gap').textContent = `The two ${C.noun} are ${fmtD(q.kind,d)} ${UN(q.kind)} apart.`;
  $('cmp').innerHTML = q.pair.map((r,i)=>`<div class="c ${i?'b':''} ${i===q.win?'win':''}"><div class="who">${esc(r.name)}${i===q.win?'<em>answer</em>':''}</div><div class="big">${fmtV(q.kind,r.v)}<i>${UN(q.kind)}${C.rain?' a year':''}</i></div><div>${esc(r.point)}${r.date&&r.date!=='?'&&r.date!=='N/A'?', '+esc(r.date):''}</div><div class="meter"><i style="width:${Math.max(pct(q.kind,r.v),1.5).toFixed(1)}%"></i></div><div class="muted">${share(q.kind,r.v)}.</div>${numsTable(q.kind,r)}</div>`).join('');
  animateChart(q);
  $('next').textContent = state.over ? 'Play again' : 'Next';
  $('endnote').innerHTML = state.over ? `Run over: streak of ${state.streak}${(state.best[state.mode+'|'+state.region]||0)>state.streak?` (best ${state.best[state.mode+'|'+state.region]})`:state.streak?' - a new best':''}. Next: <a href="${import.meta.env.BASE_URL}climate-guess/">Guess the figure</a> or <a href="${import.meta.env.BASE_URL}">all games</a>.` : '';
  $('reveal').classList.remove('hidden');
  { const d=Math.max(0,$('banner').getBoundingClientRect().bottom+34-innerHeight); if(d) scrollBy({top:d,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'}); }   // keep the question, the answer figures and Next in view; the chart sits below
}

function start(){ state.streak=0; state.over=false; KINDS.forEach(k=>state.used[k]=new Set()); $('streak').textContent=0; ask(); }
$('start').onclick=start;
$('menu').onclick=()=>{ stopAnim(); state.cur=null; state.over=true; ['hud','play','reveal'].forEach(i=>$(i).classList.add('hidden')); $('setup').classList.remove('hidden'); poolNote(); };
$('next').onclick=()=>{ if(state.over) start(); else ask(); };
$('c0').onclick=()=>answer(0); $('c1').onclick=()=>answer(1);
document.querySelectorAll('#mode button').forEach(b=>b.onclick=()=>{state.mode=b.dataset.m;document.querySelectorAll('#mode button').forEach(x=>x.classList.toggle('on',x===b));poolNote();});
document.querySelectorAll('#units button').forEach(b=>b.onclick=()=>{ IMP=b.dataset.u==='imperial'; try{ localStorage.setItem('country-extremes-units',IMP?'imperial':'metric'); }catch(e){} syncUnits(); poolNote(); });
syncUnits();
$('region').onchange=()=>{state.region=$('region').value;poolNote();};
document.addEventListener('keydown',e=>{ if(e.target.tagName==='SELECT') return;
  if(e.key==='1'||e.key==='ArrowLeft') answer(0); else if(e.key==='2'||e.key==='ArrowRight') answer(1);
  else if(e.key==='Enter' && !$('reveal').classList.contains('hidden') && e.target.tagName!=='BUTTON') $('next').click(); });
$('foot').innerHTML = `Source: <a href="https://en.wikipedia.org/wiki/List_of_weather_records" target="_blank" rel="noopener">Wikipedia, List of weather records</a> (revision 1382542755) for record highs and lows, fetched 29 October 2026, and the <a href="https://climateknowledgeportal.worldbank.org/" target="_blank" rel="noopener">World Bank Climate Change Knowledge Portal</a>, 1991 to 2020, for average daily highs, lows and temperatures, for the countries and territories of the <a href="https://en.wikipedia.org/wiki/ISO_3166-1" target="_blank" rel="noopener">ISO 3166-1</a> list and Kosovo.`;
$('foot').querySelectorAll('a').forEach(a=>{a.style.color='inherit';a.style.textDecoration='underline';});
poolNote();
window.__game={state,makePair,validPairs,poolFor,apart,POOL,CFG,chart};
