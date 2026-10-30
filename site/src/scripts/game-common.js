// Helpers shared by the games. The small ones were moved here unchanged from the five original templates;
// the units, best-score, map and animation helpers replace code that was copied into every script.
import MAPS from '../data/map-data.json';

export const $ = id => document.getElementById(id);

export const rnd = n => Math.floor(Math.random()*n);

export function ringPath(flat,k){ let d=''; for(let i=0;i<flat.length;i+=2){ d+=(i?'L':'M')+(flat[i]/1000*k).toFixed(3)+' '+(-flat[i+1]/1000).toFixed(3); } return d+'Z'; }

export const clamp01 = x => Math.max(0, Math.min(1, x));

export const easeOut = x => 1 - Math.pow(1 - x, 3);

export const easeIO = x => x<.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2;

export function wrap2(name,max){
  if(name.length<=max) return [name];
  const words=name.split(' '); let a='',i=0;
  while(i<words.length && (a+' '+words[i]).trim().length<=max){ a=(a+' '+words[i]).trim(); i++; }
  if(!a){ a=words[0].slice(0,max-1)+'…'; return [a]; }
  let b=words.slice(i).join(' '); if(b.length>max) b=b.slice(0,max-1)+'…';
  return b?[a,b]:[a];
}

export const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function niceStep(span,n){ const raw=span/(n||5), mag=Math.pow(10,Math.floor(Math.log10(raw))); return [1,2,5,10].map(k=>k*mag).find(s=>s>=raw); }

// ---- best scores, kept in localStorage (the page works without it)
export function bestStore(key){
  return {
    load(){ try{ return JSON.parse(localStorage.getItem(key)||'{}'); }catch(e){ return {}; } },
    save(v){ try{ localStorage.setItem(key,JSON.stringify(v)); }catch(e){} },
  };
}

// ---- metric / imperial switch: one choice, kept in localStorage and shared by all the games.
// The returned object's `imp` is true while imperial units are showing; onChange runs after each switch.
export function createUnits(onChange){
  const u = {imp:false};
  try{ u.imp = localStorage.getItem('country-extremes-units')==='imperial'; }catch(e){}
  const sync = () => document.querySelectorAll('#units button').forEach(b=>b.classList.toggle('on',(b.dataset.u==='imperial')===u.imp));
  document.querySelectorAll('#units button').forEach(b=>b.onclick=()=>{ u.imp=b.dataset.u==='imperial'; try{ localStorage.setItem('country-extremes-units',u.imp?'imperial':'metric'); }catch(e){} sync(); onChange(); });
  sync();
  return u;
}

// ---- map (Natural Earth outlines drawn as SVG; no tiles, works offline) ----
// The place of a record, when it is known, is marked once the answer is shown (the view widens to include it).
export function mapMarkup(rec, reveal){
  const row=MAPS.rows[String(rec.id)]; if(!row) return '';
  let [x0,y0,x1,y1]=row.view.map(v=>v/1000);
  { const p=Math.max(x1-x0,y1-y0)*.12/1.24; x0+=p; x1-=p; y0+=p; y1-=p; const q=Math.max(x1-x0,y1-y0)*.04; x0-=q; x1+=q; y0-=q; y1+=q; } // tighter frame so the outline fills the card
  const pts=reveal?(rec.pts||(rec.lat!=null&&rec.lon!=null?[[rec.lat,rec.lon]]:[])):[];
  if(pts.length){ const pd=Math.max(x1-x0,y1-y0)*.08; pts.forEach(([la,lo])=>{ x0=Math.min(x0,lo-pd); x1=Math.max(x1,lo+pd); y0=Math.min(y0,la-pd); y1=Math.max(y1,la+pd); }); }
  const k=Math.max(.2,Math.cos(((y0+y1)/2)*Math.PI/180)), rr=Math.max(x1-x0,y1-y0)*.03;
  let cd=''; row.parts.forEach(p=>p[1].forEach(q=>cd+=ringPath(q,k)));
  const pin=pts.map(([la,lo])=>`<g class="mp-pin"><circle class="r" cx="${lo*k}" cy="${-la}" r="${rr*2.2}" vector-effect="non-scaling-stroke"/><circle class="d" cx="${lo*k}" cy="${-la}" r="${rr}" vector-effect="non-scaling-stroke"/></g>`).join('');
  return `<svg class="cardmap" viewBox="${(x0*k).toFixed(3)} ${(-y1).toFixed(3)} ${((x1-x0)*k).toFixed(3)} ${(y1-y0).toFixed(3)}" role="img" aria-label="Map of ${esc(rec.name)}"><path class="mp-c${reveal?' shown':''}" d="${cd}" fill-rule="evenodd" vector-effect="non-scaling-stroke"/>${pin}</svg>`;
}
export function setCardMap(i, rec, reveal){ const b=$('c'+i), old=b.querySelector('svg.cardmap'), tmp=document.createElement('div'); tmp.innerHTML=mapMarkup(rec,reveal); const n=tmp.firstChild; if(!n) return; if(old) old.replaceWith(n); else b.appendChild(n); }

// ---- the reveal chart is drawn as a function of time t (seconds); this plays it, or draws the end state at once with reduced motion
export function createAnimator(chartFn, tEnd, boxId='chart'){
  let id=0;
  const stop = () => { cancelAnimationFrame(id); id=0; };
  const run = q => {
    stop(); const box=$(boxId);
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){ box.innerHTML=chartFn(q,99); return; }
    const t0=performance.now();
    const frame=now=>{ const t=(now-t0)/1000; box.innerHTML=chartFn(q,Math.min(t,tEnd)); if(t<tEnd) id=requestAnimationFrame(frame); else id=0; };
    id=requestAnimationFrame(frame);
  };
  return {stop, run};
}
