import POOL from '../data/game-pool.json';
import MAPS from '../data/map-data.json';
import { $, clamp01, easeIO, easeOut, ringPath, rnd, wrap2 } from './game-common.js';


const HI = POOL.extremes.highest, LO = POOL.extremes.lowest, AX = POOL.avgextremes;
const KINDS = ['highest','lowest','average'];
const KWORD = {highest:'highest points', lowest:'lowest points', average:'average elevations'};
const MIN_REL = 0.05, MIN_ABS = 10;   // pairs closer than this are never asked
// ---- units: every figure is held in metres; the display can switch to feet (the choice is kept in localStorage and shared by all the games)
const FT = 3.28084; let IMP = false; try{ IMP = localStorage.getItem('country-extremes-units')==='imperial'; }catch(e){}
const U = () => IMP ? 'ft' : 'm';
const fmtL = v => Math.round(IMP ? v*FT : v).toLocaleString('en-GB');
function syncUnits(){ document.querySelectorAll('#units button').forEach(b=>b.classList.toggle('on',(b.dataset.u==='imperial')===IMP)); }
// nice round tick values in the display unit, returned in metres
function niceTicks(lo,hi,n){ const k=IMP?FT:1, st=niceStep((hi-lo)*k,n), out=[]; for(let d=Math.ceil(lo*k/st)*st; d<=hi*k+1e-9; d+=st) out.push(d/k); return out; }
const fmt = fmtL;
const state = {mode:'highest', region:'', streak:0, best:{}, cur:null, used:{highest:new Set(),lowest:new Set(),average:new Set()}, over:false};

[...new Set([...POOL.highest,...POOL.lowest,...POOL.average].map(r=>r.region))].filter(x=>x!=='Antarctica').sort().forEach(x=>$('region').add(new Option(x,x)));
try{ state.best = JSON.parse(localStorage.getItem('country-extremes-best')||'{}'); }catch(e){ state.best={}; }
function saveBest(){ try{ localStorage.setItem('country-extremes-best',JSON.stringify(state.best)); }catch(e){} }

const poolFor = kind => POOL[kind].filter(r=>!state.region||r.region===state.region);
const apart = (a,b) => Math.abs(a.m-b.m) >= MIN_ABS && Math.abs(a.m-b.m)/Math.max(Math.abs(a.m),Math.abs(b.m),1) >= MIN_REL;
function validPairs(kind){ const p=poolFor(kind); let n=0; for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++) if(apart(p[i],p[j])) n++; return n; }

// one question: two records, never too close in value, preferring records not yet used this run
function makePair(kind){
  const p=poolFor(kind); let fresh=p.filter(r=>!state.used[kind].has(r.id));
  if(fresh.length<1){ state.used[kind].clear(); fresh=p; }
  for(let tries=0;tries<200;tries++){
    const a=fresh[rnd(fresh.length)], cands=p.filter(b=>b.id!==a.id && apart(a,b)); if(!cands.length) continue;
    const b=cands[rnd(cands.length)]; state.used[kind].add(a.id); state.used[kind].add(b.id);
    const pair=Math.random()<.5?[a,b]:[b,a];
    const win = kind==='lowest' ? (pair[0].m<pair[1].m?0:1) : (pair[0].m>pair[1].m?0:1);
    return {kind,pair,win};
  }
  return null;
}
function nextKind(){ if(state.mode!=='mixed') return state.mode; const ok=KINDS.filter(k=>validPairs(k)>0); return ok[rnd(ok.length)]||'highest'; }

function poolNote(){
  const kinds = state.mode==='mixed'?KINDS:[state.mode];
  const n = kinds.map(k=>poolFor(k).length), ok = kinds.some(k=>validPairs(k)>0);
  $('poolnote').textContent = ok ? `${kinds.map((k,i)=>n[i]+' '+k+(k==='average'?' elevations':' points')).join(' and ')} in the question pool.` : 'Not enough records with a clean figure for this choice. Pick another region or mode.';
  $('start').disabled = !ok;
  $('best').textContent = state.best[state.mode+'|'+state.region] || 0;
  if(!state.cur || state.over) document.body.dataset.kind = state.mode==='lowest' ? 'lowest' : state.mode==='average' ? 'average' : 'highest';
}

const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---- map (Natural Earth outlines drawn as SVG; no tiles, works offline) ----
const WORLD = {}; MAPS.world.forEach(w=>WORLD[w[0]]=w);
const SVGNS='http://www.w3.org/2000/svg';
function mapMarkup(rec, reveal){
  const row=MAPS.rows[String(rec.id)]; if(!row) return '';
  let [x0,y0,x1,y1]=row.view.map(v=>v/1000);
  { const p=Math.max(x1-x0,y1-y0)*.12/1.24; x0+=p; x1-=p; y0+=p; y1-=p; const q=Math.max(x1-x0,y1-y0)*.04; x0-=q; x1+=q; y0-=q; y1+=q; } // tighter frame so the outline fills the card
  const hasPt=rec.lat!=null&&rec.lon!=null;
  if(reveal&&hasPt){ const pd=Math.max(x1-x0,y1-y0)*.08; x0=Math.min(x0,rec.lon-pd); x1=Math.max(x1,rec.lon+pd); y0=Math.min(y0,rec.lat-pd); y1=Math.max(y1,rec.lat+pd); }
  const k=Math.max(.2,Math.cos(((y0+y1)/2)*Math.PI/180)), own=new Set(row.parts.map(p=>p[0])), mn=[x0*1000,y0*1000,x1*1000,y1*1000];
  let cd=''; row.parts.forEach(p=>p[1].forEach(q=>cd+=ringPath(q,k)));
  const rr=Math.max(x1-x0,y1-y0)*.03, cx=hasPt?rec.lon*k:0, cy=hasPt?-rec.lat:0;
  const pin = reveal&&hasPt ? `<g class="mp-pin"><circle class="r" cx="${cx}" cy="${cy}" r="${rr*2.2}" vector-effect="non-scaling-stroke"/><circle class="d" cx="${cx}" cy="${cy}" r="${rr}" vector-effect="non-scaling-stroke"/></g>` : '';
  return `<svg class="cardmap" viewBox="${(x0*k).toFixed(3)} ${(-y1).toFixed(3)} ${((x1-x0)*k).toFixed(3)} ${(y1-y0).toFixed(3)}" role="img" aria-label="Map of ${esc(rec.name)}"><path class="mp-c${reveal?' shown':''}" d="${cd}" fill-rule="evenodd" vector-effect="non-scaling-stroke"/>${pin}</svg>`;
}
function setCardMap(i, rec, reveal){ const b=$('c'+i), old=b.querySelector('svg.cardmap'), tmp=document.createElement('div'); tmp.innerHTML=mapMarkup(rec,reveal); const n=tmp.firstChild; if(!n) return; if(old) old.replaceWith(n); else b.appendChild(n); }

function ask(){
  stopAnim();
  const kind = nextKind(), q = makePair(kind); if(!q){ poolNote(); return; }
  state.cur=q; document.body.dataset.kind = kind;
  $('setup').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('reveal').classList.add('hidden'); $('play').classList.remove('hidden');
  $('question').textContent = {highest:'Which country has the highest point?', lowest:'Which country has the lowest point?', average:'Which country has the higher average elevation?'}[kind];
  q.pair.forEach((r,i)=>{ const b=$('c'+i); b.disabled=false; b.className='choice';
    b.style.animation='none'; void b.offsetWidth; b.style.animation='';
    b.innerHTML=`<span class="top"><span class="key">${i+1}</span><span class="nm">${esc(r.name)}</span><small>${esc(r.type==='State'?r.region:r.type)}</small></span><span class="tick">${''}</span>${mapMarkup(r,false)}`; });
}

function answer(i){
  const q=state.cur; if(!q||q.done) return; q.done=true;
  const ok = i===q.win; [0,1].forEach(k=>{const b=$('c'+k); b.disabled=true; if(k===q.win){ b.classList.add('right'); b.querySelector('.tick').textContent='✓'; } else if(k===i){ b.classList.add('wrong'); b.querySelector('.tick').textContent='✗'; }});
  q.pair.forEach((rec,k)=>{ setCardMap(k,rec,true); const b=$('c'+k); b.classList.add('shown'); b.insertAdjacentHTML('beforeend',`<span class="val">${fmt(rec.m)}<i>${U()}</i></span>`); });
  if(ok){ state.streak++; } else { state.over=true; }
  const key=state.mode+'|'+state.region; if(state.streak>(state.best[key]||0)){ state.best[key]=state.streak; saveBest(); }
  const sEl=$('streak'); sEl.textContent=state.streak; sEl.classList.remove('pop'); void sEl.offsetWidth; if(ok) sEl.classList.add('pop');
  showReveal(q,ok);
}

// share of the way from sea level to the dataset extreme
function pct(v,kind){ if(kind==='average') return Math.min(100, v/AX.max.m*100); return v===0 ? 0 : Math.min(100, v>0 ? v/HI.m*100 : v/LO.m*100); }
function share(v,kind){ if(kind==='average'){ const p=pct(v,kind); return `${p<10?p.toFixed(1):Math.round(p)} per cent of the highest national average (${AX.max.name}, ${fmt(AX.max.m)} ${U()})`; }
  if(v===0) return '0 per cent'; const p = pct(v); const t = p<10 ? p.toFixed(1) : Math.round(p).toString(); return `${t} per cent of the way ${v>0?'up to':'down to'} ${v>0?'the highest':'the lowest'} point`; }
function above(v){ return v===0 ? 'at sea level' : `${fmt(Math.abs(v))} ${U()} ${v>0?'above':'below'} sea level`; }

// Reveal chart, drawn as a function of time t (seconds) so the view can zoom.
// 0.2-2.3 s: both bars grow from sea level in a zoomed-in view (wrong answer first); to 3.4 s: pause; 3.4-5.4 s: zoom out to the dataset extremes.
const T_END = 5.4;
function niceStep(span){ const raw=span/5, mag=Math.pow(10,Math.floor(Math.log10(raw))); return [1,2,5,10].map(k=>k*mag).find(s=>s>=raw); }

function chart(q, t){
  const W=560,H=362,top=28,bot=60,P=H-top-bot, cols=['A','B'], xs=[190,400];
  // zoomed-in range around the two values, then geometric interpolation out to the dataset extremes
  const vals=q.pair.map(r=>r.m), span=Math.max(...vals.map(Math.abs),10);
  const up0=Math.max(Math.max(...vals,0)*1.3, span*.35, 5), dn0=Math.max(-Math.min(...vals,0)*1.3, span*.35, 5);
  const avg=q.kind==='average', EH=avg?{m:AX.max.m,point:'Highest national average',name:AX.max.name}:HI;
  const e=easeIO(clamp01((t-3.4)/2));
  const up=up0*Math.pow(EH.m/up0,e), dn=avg?0:dn0*Math.pow(-LO.m/dn0,e);
  const y=v=>top+(up-v)/(up+dn)*P, y0=y(0), yHi=y(EH.m), yLo=avg?y0:y(LO.m);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Both values against sea level and the dataset extremes">`;
  s+=`<defs>
    <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--a)"/><stop offset="1" stop-color="var(--a)" stop-opacity=".55"/></linearGradient>
    <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--b)"/><stop offset="1" stop-color="var(--b)" stop-opacity=".55"/></linearGradient>
    <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".16"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient>
    <clipPath id="plotclip"><rect x="40" y="${top}" width="${W-60}" height="${P}"/></clipPath>
  </defs><g clip-path="url(#plotclip)">`;
  s+=`<rect x="40" y="${yHi}" width="${W-60}" height="${y0-yHi}" fill="url(#gSky)"/>`;
  s+=`<rect x="40" y="${y0}" width="${W-60}" height="${yLo-y0}" fill="var(--sea)" fill-opacity=".14"/>`;
  // scale ticks, so the zoom reads as a zoom
  const st=niceStep(up+dn);
  for(const v of niceTicks(-dn,up,5)){ if(v===0) continue; const yy=y(v);
    s+=`<line x1="40" x2="${W-20}" y1="${yy}" y2="${yy}" stroke="#fff" stroke-opacity=".07"/>`; }
  q.pair.forEach((r,i)=>{
    const delay = i===q.win ? 1.4 : 0.2;
    const p=easeOut(clamp01((t-delay)/.9)), v=r.m*p, yv=y(v), h=Math.max(Math.abs(yv-y0),2), yt=v>=0?y0-h:y0;
    const x=xs[i], hw=60, stroke = i===q.win ? 'stroke="#fff" stroke-width="2" stroke-linejoin="round"' : '';
    let shape;
    if(r.m>=0){
      // mountain: jagged ridge up to the apex, snow cap on taller ones
      const pt=(dx,f)=>`${x+dx},${(y0-h*f).toFixed(1)}`;
      shape=`<path d="M${x-hw},${y0} L${pt(-34,.42)} L${pt(-20,.34)} L${pt(-7,.7)} L${x},${yt} L${pt(10,.78)} L${pt(22,.45)} L${pt(36,.5)} L${x+hw},${y0}Z" fill="url(#g${cols[i]})" ${stroke}/>`;
      if(h>30) shape+=`<path d="M${x},${yt} L${x-9},${yt+h*.2} L${x-3},${yt+h*.17} L${x+2},${yt+h*.23} L${x+9},${yt+h*.2}Z" fill="#fff" opacity=".9"/>`;
    } else {
      // depression: a bowl cut into the ground below sea level
      shape=`<path d="M${x-hw},${y0} C${x-hw+16},${y0+h*1.05} ${x+hw-16},${y0+h*1.05} ${x+hw},${y0}Z" fill="url(#g${cols[i]})" ${stroke}/>`;
    }
    s+=shape;
  });
  s+=`</g>`;
  // tick labels, dataset extremes and sea level sit outside the clip so text is never cut
  for(const v of niceTicks(-dn,up,5)){ if(v===0) continue; const yy=y(v); if(Math.abs(yy-y0)<12) continue;
    s+=`<text class="m" x="36" y="${yy+4}" text-anchor="end" style="font-size:10px">${fmt(v)}</text>`; }
  if(yHi>=top-1) s+=`<line x1="40" x2="${W-20}" y1="${yHi}" y2="${yHi}" stroke="var(--mute)" stroke-dasharray="4 4"/><text class="m" x="44" y="${yHi-6}">${fmt(EH.m)} ${U()} - ${esc(EH.point)} - ${esc(EH.name)}</text>`;
  { const GA=POOL.global[q.kind], yw=y(GA.v);
    if(yw>=top && yw<=H-bot && Math.abs(yw-yHi)>14 && (avg || Math.abs(yw-yLo)>14)) s+=`<line x1="40" x2="${W-20}" y1="${yw}" y2="${yw}" stroke="#fff" stroke-opacity=".6" stroke-dasharray="2 4"/><text x="${W-22}" y="${Math.abs(yw-y0)<=14?y0+16:yw-6}" text-anchor="end" style="font-size:11px;fill:#fff;opacity:.9">${GA.label}: ${fmt(GA.v)} ${U()}</text>`; }
  if(!avg && yLo<=H-bot+1) s+=`<line x1="40" x2="${W-20}" y1="${yLo}" y2="${yLo}" stroke="var(--mute)" stroke-dasharray="4 4"/><text class="m" x="44" y="${yLo+15}">${fmt(LO.m)} ${U()} - ${esc(LO.point)} - ${esc(LO.name)}</text>`;
  q.pair.forEach((r,i)=>{
    const delay = i===q.win ? 1.4 : 0.2, x=xs[i];
    const v=r.m*easeOut(clamp01((t-delay)/.9)), yv=y(v), yt=v>=0?Math.min(yv,y0):y0;
    const ly = r.m>=0 ? Math.max(yt-8, top+14) : y0-8;   // below-sea-level values sit above the line: the area under it is too thin for a label
    const op = clamp01((t-delay-.9)/.3);
    s+=`<text x="${x}" y="${ly}" text-anchor="middle" opacity="${op}" style="font-weight:800;font-size:14px">${fmt(r.m)} ${U()}</text>`;
    const ln=wrap2(r.name,20);
    s+=`<text class="m" text-anchor="middle" style="font-weight:700">${ln.map((l,k)=>`<tspan x="${x}" y="${H-8-(ln.length-1-k)*16}">${esc(l)}</tspan>`).join('')}</text>`;
  });
  s+=`<line x1="40" x2="${W-20}" y1="${y0}" y2="${y0}" stroke="var(--sea)" stroke-width="2.5"/><text x="${W-22}" y="${y0-5}" text-anchor="end" style="fill:var(--sea);font-weight:700">Sea level, 0 ${U()}</text>`;
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
  const kindWord=q.kind;
  $('verdict').textContent = ok ? 'Correct!' : 'Not this time.';
  $('banner').className='banner '+(ok?'ok':'no'); $('badge').textContent = ok ? '✓' : '✗';
  const d=Math.abs(q.pair[0].m-q.pair[1].m);
  $('gap').textContent = q.kind==='average' ? `The two averages are ${fmt(d)} ${U()} apart.` : `The two ${kindWord} points are ${fmt(d)} ${U()} apart.`;
  $('cmp').innerHTML = q.pair.map((r,i)=>`<div class="c ${i?'b':''} ${i===q.win?'win':''}"><div class="who">${esc(r.name)}${i===q.win?'<em>answer</em>':''}</div><div class="big">${fmt(r.m)}<i>${U()}</i></div><div>${esc(r.point)}</div><div class="meter ${r.m<0?'neg':''}"><i style="width:${Math.max(pct(r.m,q.kind),1.5).toFixed(1)}%"></i></div><div class="muted">${q.kind==='average'?'Average elevation; '+share(r.m,q.kind):above(r.m)+'; '+share(r.m)}.</div></div>`).join('');
  animateChart(q);
  $('next').textContent = state.over ? 'Play again' : 'Next';
  $('endnote').innerHTML = state.over ? `Run over: streak of ${state.streak}${(state.best[state.mode+'|'+state.region]||0)>state.streak?` (best ${state.best[state.mode+'|'+state.region]})`:state.streak?' - a new best':''}. Next: <a href="${import.meta.env.BASE_URL}guess/">Guess the height</a> or <a href="${import.meta.env.BASE_URL}">all games</a>.` : '';
  $('reveal').classList.remove('hidden');
  { const d=Math.max(0,$('banner').getBoundingClientRect().bottom+34-innerHeight); if(d) scrollBy({top:d,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'}); }   // keep the question, the answer figures and Next in view; the chart sits below
}

function start(){ state.streak=0; state.over=false; state.used={highest:new Set(),lowest:new Set(),average:new Set()}; $('streak').textContent=0; ask(); }
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
$('foot').innerHTML = `Source: <a href="https://en.wikipedia.org/wiki/List_of_elevation_extremes_by_country" target="_blank" rel="noopener">Wikipedia, List of elevation extremes by country</a> (<a href="https://en.wikipedia.org/w/index.php?title=List_of_elevation_extremes_by_country&oldid=1381548721" target="_blank" rel="noopener">revision 1381548721</a>, fetched 29 October 2026), for the countries and territories of the <a href="https://en.wikipedia.org/wiki/ISO_3166-1" target="_blank" rel="noopener">ISO 3166-1</a> list (<a href="https://en.wikipedia.org/w/index.php?title=ISO_3166-1&oldid=1376647436" target="_blank" rel="noopener">Wikipedia, revision 1376647436</a>) and Kosovo. Average elevation: <a href="https://en.wikipedia.org/wiki/List_of_countries_by_average_elevation" target="_blank" rel="noopener">Wikipedia, List of countries by average elevation</a> (revision 1366634239).`;
$('foot').querySelectorAll('a').forEach(a=>{a.style.color='inherit';a.style.textDecoration='underline';});
poolNote();
window.__game={state,makePair,validPairs,poolFor,apart,POOL};
