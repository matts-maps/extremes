import POOL from '../data/game-pool.json';
import { $, esc, createUnits } from './game-common.js';
import { createGuess, clamp, ratingFor, TOP_MARKS } from './guess-core.js';

const HI = POOL.extremes.highest, LO = POOL.extremes.lowest, AX = POOL.avgextremes;
const KINDS = ['highest','lowest','average'];
const fmt = v => Math.round(v).toLocaleString('en-GB');
// ---- units: every figure is held in metres; the display can switch to feet (the choice is kept in localStorage and shared by all the games)
const FT = 3.28084;
const units = createUnits(() => poolNote());
const U = () => units.imp ? 'ft' : 'm';
const fmtL = v => Math.round(units.imp ? v*FT : v).toLocaleString('en-GB');
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

// the gauge and slider scale is uniform: equal heights take equal space
const f = v => v;
const finv = s => s;
const RANGE = {highest:{lo:0, hi:HI.m}, lowest:{lo:LO.m, hi:Math.ceil(Math.max(...POOL.lowest.map(r=>r.m))/100)*100}, average:{lo:0, hi:Math.ceil(AX.max.m/500)*500}};

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

// ---- gauge ----
const GW=340, GH=330, GT=18, GB=18, GX0=64, GX1=GW-10;
function geom(kind){ const R=RANGE[kind], fl=f(R.lo), fh=f(R.hi), P=GH-GT-GB; const y=v=>GT+(fh-f(v))/(fh-fl)*P; return {R,fl,fh,P,y}; }
function ticksFor(kind,G){
  // evenly spaced ticks: the smallest round step that leaves at least 26 px between labels
  const k=units.imp?FT:1, pxPerM=G.P/((G.R.hi-G.R.lo)*k), step=[10,20,50,100,200,250,500,1000,2000,2500,5000,10000].find(st=>st*pxPerM>=26)||10000, out=[];
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
  const q=g.items[g.idx], R=RANGE[q.kind]; const stepL=units.imp?.1:1; g.v=+(Math.round(clamp(v,R.lo,R.hi)/stepL)*stepL).toFixed(1);
  $('read').textContent=fmtL(g.v); $('slider').value=f(g.v); if(!fromNum) $('num').value=Math.round(units.imp?g.v*FT:g.v);
  $('readsub').textContent = g.v===0?'At sea level':`${fmtL(Math.abs(g.v))} ${U()} ${g.v>0?'above':'below'} sea level`;
  drawGauge();
}
function gaugeToValue(e){
  const svg=$('gsvg'); if(!svg) return; const r=svg.getBoundingClientRect(), q=g.items[g.idx], G=geom(q.kind);
  const yy=(e.clientY-r.top)/r.height*GH; const fv=G.fh-clamp((yy-GT)/G.P,0,1)*(G.fh-G.fl); setValue(finv(fv));
}

// ---- flow ----
function ask(){
  stopAnim(); g.locked=false;
  const q=g.items[g.idx], R=RANGE[q.kind]; document.body.dataset.kind=q.kind;
  $('setup').classList.add('hidden'); $('final').classList.add('hidden'); $('hud').classList.remove('hidden'); $('play').classList.remove('hidden');
  $('rn').textContent=g.idx+1; $('rof').textContent='of '+g.items.length; $('total').textContent=fmt(g.total); dots();
  $('kindword').textContent = {highest:'Highest point of', lowest:'Lowest point of', average:'Average elevation of'}[q.kind];
  $('country').textContent = q.rec.name; $('point').innerHTML = q.kind==='average' ? 'The mean height of all the land, <b>not</b> the peak' : `${q.kind==='highest'?'Peak':'Spot'}: <b>${esc(q.rec.point)}</b>`;
  const sl=$('slider'); sl.min=f(R.lo); sl.max=f(R.hi); sl.step=units.imp?.1:1; sl.disabled=false;
  const nm=$('num'); nm.min=Math.round(units.imp?R.lo*FT:R.lo); nm.max=Math.round(units.imp?R.hi*FT:R.hi); nm.disabled=false;
  $('unit').textContent=U(); $('unit2').textContent=U();
  drawMap(q,false); $('cmp').classList.add('hidden');
  $('guessui').classList.remove('hidden'); $('resui').classList.add('hidden');
  setValue(finv((f(R.lo)+f(R.hi))/2));
  // no preset guess: the scale, slider and Lock in stay idle until the player places one
  g.touched=false; $('read').textContent='–'; $('readsub').textContent='Drag the scale, use the slider or type a figure to place your guess'; $('num').value=''; $('lock').disabled=true; $('guessui').classList.add('untouched'); drawGauge();
  $('slider').focus({preventScroll:true});
}

function lock(){
  if(g.locked||!g.touched) return; g.locked=true; endDrag();
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
function finish(){
  const {max,prev,fresh,word}=finishPrep();
  $('final').innerHTML = `<p class="place">Game over</p><h2>${word}</h2><div class="tot">${fmt(g.total)} <small>of ${fmt(max)}</small></div>
   <p class="muted">${LEVELS[g.level].label} level. ${fresh?'A new best score for this choice.':'Best for this choice: '+fmt(prev)+'.'}</p>
   <table><tr><th>Place</th><th class="n">Guess</th><th class="n">Actual</th><th class="n">Points</th><th></th></tr>${g.log.map(r=>`<tr><td>${esc(r.rec.name)}<div class="muted">${esc(r.rec.point)}</div></td><td class="n">${fmtL(r.guess)} ${U()}</td><td class="n">${fmtL(r.rec.m)} ${U()}</td><td class="n">${fmt(r.pts)}</td><td style="width:90px"><div class="bar"><i style="width:${r.pts/10}%"></i></div></td></tr>`).join('')}</table>
   <div class="row"><button class="go" id="again">Play again</button><button class="ghost" id="tomenu">Change mode</button><a class="ghost" href="${import.meta.env.BASE_URL}higher-lower/">Try higher or lower</a></div>`;
  wireFinal();
}

const core = createGuess({
  POOL,
  kinds: KINDS,
  startMode: 'highest',
  bestKey: 'country-extremes-guess-best',
  poolLabel: k => k+(k==='average'?' elevations':' points'),
  idleTheme: mode => mode==='lowest' ? 'lowest' : mode==='average' ? 'average' : 'highest',
  levelNote: () => levelNote(),
  mapCaption: (q,reveal) => q.kind==='average' ? (reveal?'Average over the whole country.':'Find your bearings: the outlined country is the one to guess for.') : !reveal ? 'Find your bearings: the outlined country is the one to guess for.' : `${q.rec.point}.`,
  ask: () => ask(),
  lock: () => lock(),
  finish: () => finish(),
  setValue: (v,fromNum) => setValue(v,fromNum),
  gaugeToValue: e => gaugeToValue(e),
  numToValue: x => x/(units.imp?FT:1),
});
const { g, buildGame, poolNote, drawMap, stopAnim, dots, endDrag, start, finishPrep, wireFinal } = core;
poolNote();
window.__guess={g,scoreFor,ratingFor,buildGame,RANGE,f,finv,setValue,lock,start};
