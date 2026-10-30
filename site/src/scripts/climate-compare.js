// The "pick the hotter, colder or wetter country" games. hotter-or-colder.js and wetter-or-drier.js only supply the
// settings (kinds, scales, wording); everything else is here.
import { $, clamp01, easeOut, wrap2, esc, niceStep, createUnits, createAnimator } from './game-common.js';
import { createCompare } from './compare-core.js';

export function initClimateCompare({ POOL, KINDS, CFG, bestKey, startMode, defaultKind, next }){
  // every temperature figure held for a country, and which one each question asks for
  const ASK = {hottest:'rh', coldest:'rl', avghigh:'ah', avglow:'al', avgmean:'am'};
  const ROWS = [['rh','Record high','rhp','rhd'],['ah','Average daily high'],['am','Average temperature'],['al','Average daily low'],['rl','Record low','rlp','rld']];
  // ---- units: figures are held in degrees Celsius and millimetres; the display can switch to Fahrenheit and inches (kept in localStorage, shared by all the games)
  const units = createUnits(() => game.poolNote());
  const isRain = k => !!CFG[k].rain;
  const dv = (k,v) => units.imp ? (isRain(k) ? v/25.4 : v*9/5+32) : v;      // an absolute value, for display
  const dd = (k,d) => units.imp ? (isRain(k) ? d/25.4 : d*1.8) : d;         // a difference, for display
  const toBase = (k,x) => units.imp ? (isRain(k) ? x*25.4 : (x-32)/1.8) : x;
  const UN = k => isRain(k) ? (units.imp?'in':'mm') : (units.imp?'°F':'°C');
  const decs = k => isRain(k) ? (units.imp?1:0) : 1;
  const fmtNum = (x,d) => (d ? x.toFixed(d) : Math.round(x).toLocaleString('en-GB')).replace('-','−');
  const fmtV = (k,v) => fmtNum(dv(k,v),decs(k));
  const fmtD = (k,d) => fmtNum(dd(k,d),decs(k));
  const apart = (kind,a,b) => { const c=CFG[kind], d=Math.abs(a.v-b.v); return d>=c.minAbs && d/Math.max(Math.abs(a.v),Math.abs(b.v),1)>=(c.minRel||0); };

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
    const kind=q.kind, C=CFG[kind], E=POOL.ext[kind], rain=!!C.rain, W=560, H=rain?396:400, top=52, L=240, bot=top+L, xs=[250,430], bands=[];
    const y=v=>top+(C.hi-Math.max(C.lo,Math.min(C.hi,v)))/(C.hi-C.lo)*L;
    const ticks=niceTicksK(kind,C.lo,C.hi,7);
    let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${rain?'Rain gauges':'Thermometers'} filling to each country's figure">`;
    // the extremes in the dataset, and freezing point for temperatures
    C.lines.forEach(([w,label])=>{ const x=E[w], yy=y(x.v);
      bands.push(yy); s+=`<line x1="24" x2="${W-24}" y1="${yy}" y2="${yy}" stroke="var(--mute)" stroke-dasharray="4 4" opacity=".7"/><text class="m" x="26" y="${yy-5}" style="font-size:11px">${esc(label.replace(' in the dataset','').replace(' national',''))}: ${fmtV(kind,x.v)} ${UN(kind)}</text>`; });
    if(!rain && C.lo<0 && C.hi>0) bands.push(y(0)+19);
    if(!rain && C.lo<0 && C.hi>0) s+=`<line x1="24" x2="${W-24}" y1="${y(0)}" y2="${y(0)}" stroke="var(--sea)" stroke-width="2" opacity=".7"/><text x="26" y="${y(0)+14}" style="fill:var(--sea);font-weight:700;font-size:11px">${units.imp?'Freezing point, 32 °F':C.zero}</text>`;
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
      if(!rain){ ticks.forEach(([tv],k)=>{ if(k<ticks.length-1){ const ym=(y(tv)+y(ticks[k+1][0]))/2; s+=`<line x1="${x-hw-6}" x2="${x-hw-2}" y1="${ym}" y2="${ym}" stroke="var(--mute)" opacity=".6"/>`; } }); }
      s+=`<text class="m" x="${x-hw-13}" y="${top-16}" text-anchor="end" style="font-size:11px">${UN(kind)}</text>`;
      // the reading follows the top of the liquid
      // the reading follows the liquid, on the right of the instrument (the scale is on the left)
      const ry=yv+5;
      if(p>0) s+=`<text x="${x+hw+10}" y="${ry}" style="font-weight:800;font-size:15px;paint-order:stroke;stroke:rgba(10,20,30,.85);stroke-width:4px;stroke-linejoin:round">${fmtV(kind,v)} ${UN(kind)}</text>`;
      const ln=wrap2(r.name,20);
      s+=`<text class="m" text-anchor="middle" style="font-weight:700">${ln.map((l,k)=>`<tspan x="${x}" y="${H-8-(ln.length-1-k)*16}">${esc(l)}</tspan>`).join('')}</text>`;
    });
    s+='</svg>'; return s;
  }

  const anim = createAnimator(chart, T_END);

  function showReveal(q,ok){
    const C=CFG[q.kind];
    game.verdictBanner(ok);
    const d=Math.abs(q.pair[0].v-q.pair[1].v);
    $('gap').textContent = `The two ${C.noun} are ${fmtD(q.kind,d)} ${UN(q.kind)} apart.`;
    $('cmp').innerHTML = q.pair.map((r,i)=>`<div class="c ${i?'b':''} ${i===q.win?'win':''}"><div class="who">${esc(r.name)}${i===q.win?'<em>answer</em>':''}</div><div class="big">${fmtV(q.kind,r.v)}<i>${UN(q.kind)}${C.rain?' a year':''}</i></div><div>${esc(r.point)}${r.date&&r.date!=='?'&&r.date!=='N/A'?', '+esc(r.date):''}</div><div class="meter"><i style="width:${Math.max(pct(q.kind,r.v),1.5).toFixed(1)}%"></i></div><div class="muted">${share(q.kind,r.v)}.</div>${numsTable(q.kind,r)}</div>`).join('');
    anim.run(q);
    game.revealTail();
  }

  const game = createCompare({
    POOL,
    kinds: KINDS,
    defaultKind,
    startMode,
    bestKey,
    value: r => r.v,
    lowWins: kind => CFG[kind].lowWins,
    apart,
    question: kind => CFG[kind].q,
    poolLabel: k => CFG[k].pool,
    emptyText: 'Not enough records for this choice. Pick another region or mode.',
    idleTheme: mode => mode==='mixed' ? defaultKind : mode,
    cardValue: (q,rec) => `${fmtV(q.kind,rec.v)}<i>${UN(q.kind)}</i>`,
    showReveal,
    stopAnim: () => anim.stop(),
    next,
  });
  window.__game={state:game.state,makePair:game.makePair,validPairs:game.validPairs,poolFor:game.poolFor,apart:game.apart,POOL,CFG,chart};

}
