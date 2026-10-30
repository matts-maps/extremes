// The flow shared by the three "pick one of two countries" games (higher or lower, hotter or colder, wetter or drier):
// question pool, pairing, asking, answering, streak and best score, menu, keyboard. Each game supplies its own figures,
// wording, reveal and chart through the options below.
import { $, rnd, esc, bestStore, mapMarkup, setCardMap } from './game-common.js';

// o.POOL, o.kinds, o.defaultKind, o.startMode, o.bestKey
// o.value(r)               the figure of a record
// o.lowWins(kind)          true when the lower figure is the answer
// o.apart(kind,a,b)        false for pairs too close to ask
// o.question(kind), o.poolLabel(kind), o.emptyText
// o.idleTheme(mode)        body theme while on the menu
// o.cardValue(q,rec)       HTML shown on a card once answered
// o.showReveal(q,ok)       fills the reveal panel; calls verdictBanner first and revealTail last
// o.stopAnim()             stops the reveal chart animation
// o.next                   {slug,label}: the game suggested after a run ends
export function createCompare(o){
  const { POOL, kinds: KINDS } = o;
  const store = bestStore(o.bestKey);
  const state = {mode:o.startMode, region:'', streak:0, best:store.load(), cur:null, used:{}, over:false};
  KINDS.forEach(k=>state.used[k]=new Set());

  [...new Set(KINDS.flatMap(k=>POOL[k].map(r=>r.region)))].filter(x=>x!=='Antarctica').sort().forEach(x=>$('region').add(new Option(x,x)));

  const poolFor = kind => POOL[kind].filter(r=>!state.region||r.region===state.region);
  const apart = o.apart;
  function validPairs(kind){ const p=poolFor(kind); let n=0; for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++) if(apart(kind,p[i],p[j])) n++; return n; }

  // one question: two records, never too close in value, preferring records not yet used this run
  function makePair(kind){
    const p=poolFor(kind); let fresh=p.filter(r=>!state.used[kind].has(r.id));
    if(fresh.length<1){ state.used[kind].clear(); fresh=p; }
    for(let tries=0;tries<200;tries++){
      const a=fresh[rnd(fresh.length)], cands=p.filter(b=>b.id!==a.id && apart(kind,a,b)); if(!cands.length) continue;
      const b=cands[rnd(cands.length)]; state.used[kind].add(a.id); state.used[kind].add(b.id);
      const pair=Math.random()<.5?[a,b]:[b,a];
      const win = o.lowWins(kind) ? (o.value(pair[0])<o.value(pair[1])?0:1) : (o.value(pair[0])>o.value(pair[1])?0:1);
      return {kind,pair,win};
    }
    return null;
  }
  function nextKind(){ if(state.mode!=='mixed') return state.mode; const ok=KINDS.filter(k=>validPairs(k)>0); return ok[rnd(ok.length)]||o.defaultKind; }

  function poolNote(){
    const kinds = state.mode==='mixed'?KINDS:[state.mode];
    const n = kinds.map(k=>poolFor(k).length), ok = kinds.some(k=>validPairs(k)>0);
    $('poolnote').textContent = ok ? `${kinds.map((k,i)=>n[i]+' '+o.poolLabel(k)).join(' and ')} in the question pool.` : o.emptyText;
    $('start').disabled = !ok;
    $('best').textContent = state.best[state.mode+'|'+state.region] || 0;
    if(!state.cur || state.over) document.body.dataset.kind = o.idleTheme(state.mode);
  }

  function ask(){
    o.stopAnim();
    const kind = nextKind(), q = makePair(kind); if(!q){ poolNote(); return; }
    state.cur=q; document.body.dataset.kind = kind;
    $('setup').classList.add('hidden'); $('hud').classList.remove('hidden');
    $('reveal').classList.add('hidden'); $('play').classList.remove('hidden');
    $('question').textContent = o.question(kind);
    q.pair.forEach((r,i)=>{ const b=$('c'+i); b.disabled=false; b.className='choice';
      b.style.animation='none'; void b.offsetWidth; b.style.animation='';
      b.innerHTML=`<span class="top"><span class="key">${i+1}</span><span class="nm">${esc(r.name)}</span><small>${esc(r.type==='State'?r.region:r.type)}</small></span><span class="tick"></span>${mapMarkup(r,false)}`; });
  }

  function answer(i){
    const q=state.cur; if(!q||q.done) return; q.done=true;
    const ok = i===q.win; [0,1].forEach(k=>{const b=$('c'+k); b.disabled=true; if(k===q.win){ b.classList.add('right'); b.querySelector('.tick').textContent='✓'; } else if(k===i){ b.classList.add('wrong'); b.querySelector('.tick').textContent='✗'; }});
    q.pair.forEach((rec,k)=>{ setCardMap(k,rec,true); const b=$('c'+k); b.classList.add('shown'); b.insertAdjacentHTML('beforeend',`<span class="val">${o.cardValue(q,rec)}</span>`); });
    if(ok){ state.streak++; } else { state.over=true; }
    const key=state.mode+'|'+state.region; if(state.streak>(state.best[key]||0)){ state.best[key]=state.streak; store.save(state.best); }
    const sEl=$('streak'); sEl.textContent=state.streak; sEl.classList.remove('pop'); void sEl.offsetWidth; if(ok) sEl.classList.add('pop');
    o.showReveal(q,ok);
  }

  // the parts of the reveal that every game does the same way
  function verdictBanner(ok){
    $('verdict').textContent = ok ? 'Correct!' : 'Not this time.';
    $('banner').className='banner '+(ok?'ok':'no'); $('badge').textContent = ok ? '✓' : '✗';
  }
  function revealTail(){
    $('next').textContent = state.over ? 'Play again' : 'Next';
    $('endnote').innerHTML = state.over ? `Run over: streak of ${state.streak}${(state.best[state.mode+'|'+state.region]||0)>state.streak?` (best ${state.best[state.mode+'|'+state.region]})`:state.streak?' - a new best':''}. Next: <a href="${import.meta.env.BASE_URL}${o.next.slug}/">${o.next.label}</a> or <a href="${import.meta.env.BASE_URL}">all games</a>.` : '';
    $('reveal').classList.remove('hidden');
    { const d=Math.max(0,$('banner').getBoundingClientRect().bottom+34-innerHeight); if(d) scrollBy({top:d,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'}); }   // keep the question, the answer figures and Next in view; the chart sits below
  }

  function start(){ state.streak=0; state.over=false; KINDS.forEach(k=>state.used[k]=new Set()); $('streak').textContent=0; ask(); }
  $('start').onclick=start;
  $('menu').onclick=()=>{ o.stopAnim(); state.cur=null; state.over=true; ['hud','play','reveal'].forEach(i=>$(i).classList.add('hidden')); $('setup').classList.remove('hidden'); poolNote(); };
  $('next').onclick=()=>{ if(state.over) start(); else ask(); };
  $('c0').onclick=()=>answer(0); $('c1').onclick=()=>answer(1);
  document.querySelectorAll('#mode button').forEach(b=>b.onclick=()=>{state.mode=b.dataset.m;document.querySelectorAll('#mode button').forEach(x=>x.classList.toggle('on',x===b));poolNote();});
  $('region').onchange=()=>{state.region=$('region').value;poolNote();};
  document.addEventListener('keydown',e=>{ if(e.target.tagName==='SELECT') return;
    if(e.key==='1'||e.key==='ArrowLeft') answer(0); else if(e.key==='2'||e.key==='ArrowRight') answer(1);
    else if(e.key==='Enter' && !$('reveal').classList.contains('hidden') && e.target.tagName!=='BUTTON') $('next').click(); });
  poolNote();

  return {state, poolFor, apart, validPairs, makePair, poolNote, ask, answer, start, verdictBanner, revealTail};
}
