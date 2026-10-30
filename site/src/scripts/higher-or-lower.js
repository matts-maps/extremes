import POOL from '../data/game-pool.json';
import { $, clamp01, easeIO, easeOut, wrap2, esc, niceStep, createUnits, createAnimator } from './game-common.js';
import { createCompare } from './compare-core.js';

const HI = POOL.extremes.highest, LO = POOL.extremes.lowest, AX = POOL.avgextremes;
const MIN_REL = 0.05, MIN_ABS = 10;   // pairs closer than this are never asked
// every figure is held in metres; the display can switch to feet
const FT = 3.28084;
const units = createUnits(() => game.poolNote());
const U = () => units.imp ? 'ft' : 'm';
const fmt = v => Math.round(units.imp ? v*FT : v).toLocaleString('en-GB');
// nice round tick values in the display unit, returned in metres
function niceTicks(lo,hi,n){ const k=units.imp?FT:1, st=niceStep((hi-lo)*k,n), out=[]; for(let d=Math.ceil(lo*k/st)*st; d<=hi*k+1e-9; d+=st) out.push(d/k); return out; }

// share of the way from sea level to the dataset extreme
function pct(v,kind){ if(kind==='average') return Math.min(100, v/AX.max.m*100); return v===0 ? 0 : Math.min(100, v>0 ? v/HI.m*100 : v/LO.m*100); }
function share(v,kind){ if(kind==='average'){ const p=pct(v,kind); return `${p<10?p.toFixed(1):Math.round(p)} per cent of the highest national average (${AX.max.name}, ${fmt(AX.max.m)} ${U()})`; }
  if(v===0) return '0 per cent'; const p = pct(v); const t = p<10 ? p.toFixed(1) : Math.round(p).toString(); return `${t} per cent of the way ${v>0?'up to':'down to'} ${v>0?'the highest':'the lowest'} point`; }
function above(v){ return v===0 ? 'at sea level' : `${fmt(Math.abs(v))} ${U()} ${v>0?'above':'below'} sea level`; }

// Reveal chart, drawn as a function of time t (seconds) so the view can zoom.
// 0.2-2.3 s: both bars grow from sea level in a zoomed-in view (wrong answer first); to 3.4 s: pause; 3.4-5.4 s: zoom out to the dataset extremes.
const T_END = 5.4;
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

const anim = createAnimator(chart, T_END);

function showReveal(q,ok){
  const kindWord=q.kind;
  game.verdictBanner(ok);
  const d=Math.abs(q.pair[0].m-q.pair[1].m);
  $('gap').textContent = q.kind==='average' ? `The two averages are ${fmt(d)} ${U()} apart.` : `The two ${kindWord} points are ${fmt(d)} ${U()} apart.`;
  $('cmp').innerHTML = q.pair.map((r,i)=>`<div class="c ${i?'b':''} ${i===q.win?'win':''}"><div class="who">${esc(r.name)}${i===q.win?'<em>answer</em>':''}</div><div class="big">${fmt(r.m)}<i>${U()}</i></div><div>${esc(r.point)}</div><div class="meter ${r.m<0?'neg':''}"><i style="width:${Math.max(pct(r.m,q.kind),1.5).toFixed(1)}%"></i></div><div class="muted">${q.kind==='average'?'Average elevation; '+share(r.m,q.kind):above(r.m)+'; '+share(r.m)}.</div></div>`).join('');
  anim.run(q);
  game.revealTail();
}

const game = createCompare({
  POOL,
  kinds: ['highest','lowest','average'],
  defaultKind: 'highest',
  startMode: 'highest',
  bestKey: 'country-extremes-best',
  value: r => r.m,
  lowWins: kind => kind==='lowest',
  apart: (kind,a,b) => Math.abs(a.m-b.m) >= MIN_ABS && Math.abs(a.m-b.m)/Math.max(Math.abs(a.m),Math.abs(b.m),1) >= MIN_REL,
  question: kind => ({highest:'Which country has the highest point?', lowest:'Which country has the lowest point?', average:'Which country has the higher average elevation?'}[kind]),
  poolLabel: k => k+(k==='average'?' elevations':' points'),
  emptyText: 'Not enough records with a clean figure for this choice. Pick another region or mode.',
  idleTheme: mode => mode==='lowest' ? 'lowest' : mode==='average' ? 'average' : 'highest',
  cardValue: (q,rec) => `${fmt(rec.m)}<i>${U()}</i>`,
  showReveal,
  stopAnim: () => anim.stop(),
  next: {slug:'guess', label:'Guess the height'},
});
window.__game={state:game.state,makePair:game.makePair,validPairs:game.validPairs,poolFor:game.poolFor,apart:game.apart,POOL};
