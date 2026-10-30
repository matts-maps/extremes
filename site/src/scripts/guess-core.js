// The flow shared by the two "guess the figure" games (guess the elevation, climate guess): game state and best scores,
// the question pool, rounds, map, input wiring, menu and keyboard. Each game supplies its own scale, scoring, gauge,
// wording and result screens through the options below.
import MAPS from '../data/map-data.json';
import { $, rnd, ringPath, bestStore } from './game-common.js';

export const ROUNDS = 10, TOP_MARKS = 1000;
export const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export function ratingFor(p){ return p>=950?['Spot on',4]:p>=800?['Very close',3]:p>=550?['Close',2]:p>=250?['Off target',1]:['Way off',0]; }

const WORLD = {}; MAPS.world.forEach(w=>WORLD[w[0]]=w);
const OWNED = new Set(); Object.values(MAPS.rows).forEach(r=>r.parts.forEach(p=>OWNED.add(p[0])));
const SVGNS='http://www.w3.org/2000/svg';

// o.POOL, o.kinds, o.startMode, o.bestKey
// o.poolLabel(kind), o.idleTheme(mode), o.levelNote(), o.mapCaption(q,reveal)
// o.ask(), o.lock(), o.finish()           the three screens of a round
// o.setValue(v,fromNum), o.gaugeToValue(event), o.numToValue(typedNumber)   placing a guess
export function createGuess(o){
  const { POOL, kinds: KINDS } = o;
  const store = bestStore(o.bestKey);
  const g = {mode:o.startMode, level:'intermediate', region:'', best:store.load(), items:[], idx:0, total:0, log:[], v:0, locked:false, anim:0};
  [...new Set(KINDS.flatMap(k=>POOL[k].map(r=>r.region)))].filter(x=>x!=='Antarctica').sort().forEach(x=>$('region').add(new Option(x,x)));

  const poolFor = kind => POOL[kind].filter(r=>!g.region||r.region===g.region);
  const bestKey = () => g.mode+'|'+g.region+'|'+g.level;
  const kindsFor = () => g.mode==='mixed' ? KINDS : [g.mode];
  const needed = () => Math.min(ROUNDS, kindsFor().reduce((n,k)=>n+poolFor(k).length,0));

  function poolNote(){
    const ks=kindsFor(), n=ks.map(k=>poolFor(k).length), total=n.reduce((a,b)=>a+b,0), ok=total>=3;
    $('poolnote').textContent = ok ? `${ks.map((k,i)=>n[i]+' '+o.poolLabel(k)).join(' and ')} in the question pool; ${Math.min(ROUNDS,total)} rounds per game.` : 'Not enough records for this choice. Pick another region or mode.';
    $('start').disabled = !ok;
    $('levelnote').textContent = o.levelNote();
    $('best').textContent = g.best[bestKey()] || 0;
    if(!$('hud').classList.contains('hidden')) return; document.body.dataset.kind = o.idleTheme(g.mode);
  }

  function buildGame(){
    const ks=kindsFor(), pools={}; ks.forEach(k=>pools[k]=poolFor(k).slice());
    const items=[], n=needed();
    while(items.length<n){
      const avail=ks.filter(k=>pools[k].length); if(!avail.length) break;
      const k=avail[rnd(avail.length)], r=pools[k].splice(rnd(pools[k].length),1)[0]; items.push({kind:k,rec:r});
    }
    return items;
  }

  // ---- map (Natural Earth outlines, drawn as SVG; no tiles, works offline) ----
  // The place of a record, when it is known, is marked once the answer is shown (the view widens to include it).
  function drawMap(q, reveal){
    const svg=$('map'), row=MAPS.rows[String(q.rec.id)], cap=$('mapcap'); svg.innerHTML='';
    if(!row){ cap.textContent='No map for this place.'; svg.style.visibility='hidden'; return; }
    svg.style.visibility='visible';
    let [x0,y0,x1,y1]=row.view.map(v=>v/1000);
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
    cap.textContent = o.mapCaption(q,reveal);
  }

  function stopAnim(){ cancelAnimationFrame(g.anim); g.anim=0; }
  function dots(){ $('dots').innerHTML=g.items.map((_,i)=>`<i class="${i<g.idx?'done':i===g.idx?'now':''}"></i>`).join(''); }

  // ---- input handling: drag the scale, use the slider, or type a figure ----
  let dragging=false;
  const endDrag = () => { dragging=false; };
  $('gauge').addEventListener('pointerdown',e=>{ if(g.locked) return; dragging=true; $('gauge').setPointerCapture(e.pointerId); o.gaugeToValue(e); });
  $('gauge').addEventListener('pointermove',e=>{ if(dragging&&!g.locked) o.gaugeToValue(e); });
  $('gauge').addEventListener('pointerup',()=>dragging=false);
  $('slider').addEventListener('input',e=>{ if(!g.locked) o.setValue(parseFloat(e.target.value)); });
  $('num').addEventListener('input',e=>{ if(g.locked||e.target.value===''||e.target.value==='-') return; o.setValue(o.numToValue(parseFloat(e.target.value)),true); });

  // ---- flow ----
  function nextRound(){ if(!g.locked) return; g.idx++; if(g.idx>=g.items.length) o.finish(); else o.ask(); }
  function start(){ g.items=buildGame(); g.idx=0; g.total=0; g.log=[]; o.ask(); }
  function toMenu(){ stopAnim(); g.locked=true; ['hud','play','final'].forEach(i=>$(i).classList.add('hidden')); $('setup').classList.remove('hidden'); poolNote(); }
  // the start of the final screen: stops the animation, records the best score and shows the panel; the game then fills it and calls wireFinal
  function finishPrep(){
    stopAnim(); document.body.dataset.kind=o.idleTheme(g.mode);
    const max=g.items.length*TOP_MARKS, key=bestKey(), prev=g.best[key]||0, fresh=g.total>prev;
    if(fresh){ g.best[key]=g.total; store.save(g.best); }
    const avg=g.total/g.items.length, [word]=ratingFor(avg);
    $('play').classList.add('hidden'); $('hud').classList.add('hidden'); $('final').classList.remove('hidden');
    return {max,prev,fresh,word};
  }
  function wireFinal(){ $('again').onclick=start; $('tomenu').onclick=toMenu; $('again').focus({preventScroll:true}); }

  $('start').onclick=start; $('lock').onclick=()=>o.lock(); $('next').onclick=nextRound; $('menu').onclick=toMenu;
  document.querySelectorAll('#mode button').forEach(b=>b.onclick=()=>{g.mode=b.dataset.m;document.querySelectorAll('#mode button').forEach(x=>x.classList.toggle('on',x===b));poolNote();});
  document.querySelectorAll('#level button').forEach(b=>b.onclick=()=>{g.level=b.dataset.l;document.querySelectorAll('#level button').forEach(x=>x.classList.toggle('on',x===b));poolNote();});
  $('region').onchange=()=>{g.region=$('region').value;poolNote();};
  document.addEventListener('keydown',e=>{ if(e.key!=='Enter'||e.target.tagName==='SELECT'||e.target.tagName==='BUTTON') return;
    if(!$('play').classList.contains('hidden')) g.locked?nextRound():o.lock(); });

  return {g, poolFor, bestKey, kindsFor, buildGame, poolNote, drawMap, stopAnim, dots, endDrag, nextRound, start, toMenu, finishPrep, wireFinal};
}
