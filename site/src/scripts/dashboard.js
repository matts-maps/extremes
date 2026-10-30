import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Chart from 'chart.js/auto';
import DATA from '../data/dashboard-data.json';


const REC = DATA.records, BYID = {}; REC.forEach(r => BYID[r.id] = r);
const STATUS_COL = {clean:'#2f8f6b',unnamed:'#c28a1e',disputed:'#c0504d','span mismatch':'#d27a2c',shared:'#3c7fb1'};
const STATUS_ORDER = ['clean','shared','span mismatch','unnamed','disputed'];
let metric='highest', view='countries', sel=null, sortKey='name', sortDir=1;
const fmt = v => v==null ? 'no figure' : Math.round(v).toLocaleString('en-GB') + ' m';
const val = (r,m) => m==='span' ? r.span_m : r[m].m;
const stat = (r,m) => m==='span' ? (r.highest.status) : r[m].status;

// bins
const BINS = {
  highest:{cuts:[100,300,1000,2000,3000,4000,5000],cols:['#f3efe6','#e5dcc3','#d2c28f','#b9a063','#9a7c45','#7b5e35','#5c4528','#3d2c1a']},
  span:{cuts:[100,300,1000,2000,3000,4000,5000],cols:['#e8f1f4','#c9e0e6','#a3ccd7','#7bb3c3','#5497ac','#3a7b92','#285d73','#173f52']},
  lowest:{cuts:[-100,-1,50,200,500,1000,2000],cols:['#2b6aa3','#8fbadc','#eef0e6','#e0dbc0','#cdbf92','#b3a06a','#8f7a48','#6b5733']}
};
function colourFor(v,m){ if(v==null) return '#c9ced3'; const b=BINS[m]; let i=0; while(i<b.cuts.length && v>=b.cuts[i]) i++; return b.cols[i]; }
function labelsFor(m){ const b=BINS[m],c=b.cuts,out=[]; const f=x=>x.toLocaleString('en-GB');
  out.push('below '+f(c[0])); for(let i=1;i<c.length;i++) out.push(f(c[i-1])+' to '+f(c[i])); out.push(f(c[c.length-1])+' and above'); return out; }

// filters
const fRegion=document.getElementById('fRegion'), fType=document.getElementById('fType'), fStatus=document.getElementById('fStatus');
[...new Set(REC.map(r=>r.region))].sort().forEach(x=>fRegion.add(new Option(x,x)));
[...new Set(REC.map(r=>r.type))].sort().forEach(x=>fType.add(new Option(x,x)));
STATUS_ORDER.forEach(x=>fStatus.add(new Option(x,x)));
function passes(r){
  if(fRegion.value && r.region!==fRegion.value) return false;
  if(fType.value && r.type!==fType.value) return false;
  if(fStatus.value){ const t = metric==='lowest' ? r.lowest.tags : r.highest.tags; if(!t.includes(fStatus.value)) return false; }
  const q=document.getElementById('fSearch').value.trim().toLowerCase();
  if(q && !(r.name.toLowerCase().includes(q) || (r.highest.name||'').toLowerCase().includes(q) || (r.lowest.name||'').toLowerCase().includes(q))) return false;
  if(document.getElementById('fShown').checked && val(r,metric)==null) return false;
  return true;
}
let F=[];

// map
const map = L.map('map',{worldCopyJump:true,minZoom:1}).setView([20,10],2);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{attribution:'Esri, HERE, Garmin',maxZoom:10}).addTo(map);
const layers = {};
const gj = L.geoJSON(DATA.geojson,{style:()=>({weight:.6,color:'#6b7680',fillOpacity:.85}),onEachFeature:(f,l)=>{
  layers[f.properties.id]=l;
  l.on('click',()=>select(f.properties.id));
  l.bindTooltip(()=>{const r=BYID[f.properties.id];return `<b>${r.name}</b><br>${metric==='span'?'Span':metric==='highest'?'Highest':'Lowest'}: ${fmt(val(r,metric))}`;},{sticky:true});
}}).addTo(map);
const markers = L.layerGroup().addTo(map);
const legend = L.control({position:'bottomleft'});
legend.onAdd = () => { const d=L.DomUtil.create('div','legend'); d.id='legend'; return d; };
legend.addTo(map);
const pointsLayer = L.layerGroup().addTo(map), PT_COL={highest:'#b3402f',lowest:'#2b6aa3'};
function drawPoints(){
  pointsLayer.clearLayers(); if(view!=='points') return;
  const sides = metric==='span' ? ['highest','lowest'] : [metric];
  F.forEach(r=>sides.forEach(s=>{ const p=r[s]; if(p.lat==null||p.lon==null) return;
    const cm=L.circleMarker([p.lat,p.lon],{radius:5,weight:1,color:'#fff',fillColor:PT_COL[s],fillOpacity:.9});
    cm.bindTooltip(`<b>${p.name||'Unnamed point'}</b> (${r.name})<br>${s==='highest'?'Highest':'Lowest'}: ${fmt(p.m)}`);
    cm.on('click',()=>select(r.id)); cm.addTo(pointsLayer); }));
}
function drawLegend(){
  if(view==='points'){ const n={highest:0,lowest:0}; F.forEach(r=>['highest','lowest'].forEach(s=>{if(r[s].lat!=null)n[s]++;}));
    document.getElementById('legend').innerHTML='<b>Point locations</b><br>'+
      (metric!=='lowest'?`<i style="background:${PT_COL.highest};border-radius:5px;width:10px"></i>highest points (${n.highest})<br>`:'')+
      (metric!=='highest'?`<i style="background:${PT_COL.lowest};border-radius:5px;width:10px"></i>lowest points (${n.lowest})<br>`:'')+
      '<span class="muted">Records with no coordinates are not shown.</span>'; return; }
  const b=BINS[metric], lab=labelsFor(metric);
  document.getElementById('legend').innerHTML = '<b>'+({highest:'Highest point (m)',lowest:'Lowest point (m)',span:'Elevation span (m)'})[metric]+'</b><br>'+
    b.cols.map((c,i)=>`<i style="background:${c}"></i>${lab[i]}`).join('<br>')+'<br><i style="background:#c9ced3"></i>no figure';
}
function styleMap(){
  const set = new Set(F.map(r=>r.id));
  for(const id in layers){ const r=BYID[id], on=set.has(r.id);
    if(view==='points') layers[id].setStyle({fillColor:'#000',fillOpacity:0,opacity:on?.7:.25,weight:sel===r.id?2.5:.6,color:sel===r.id?'#000':'#8a949e'});
    else layers[id].setStyle({fillColor:colourFor(val(r,metric),metric),fillOpacity:on?.85:.12,opacity:on?1:.3,weight:sel===r.id?2.5:.6,color:sel===r.id?'#000':'#6b7680'});
    if(sel===r.id) layers[id].bringToFront();
  }
}
function drawMarkers(){
  markers.clearLayers(); if(sel==null) return; const r=BYID[sel];
  [['highest','▲','#b3402f'],['lowest','▼','#2b6aa3']].forEach(([s,sym,col])=>{
    const p=r[s]; if(p.lat==null) return;
    L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:`<div style="color:${col};font-size:18px;text-shadow:0 0 3px #fff">${sym}</div>`,iconSize:[18,18],iconAnchor:[9,9]})})
      .bindTooltip((p.name||'Unnamed point')+': '+fmt(p.m)).addTo(markers);
  });
}

// KPIs
function kpis(){
  const all=REC.filter(r=>r.highest.m!=null), hi=all.reduce((a,b)=>b.highest.m>a.highest.m?b:a);
  const lo=REC.filter(r=>r.lowest.m!=null).reduce((a,b)=>b.lowest.m<a.lowest.m?b:a);
    const k=[[REC.length,'countries and territories'],[all.length,'with a highest point'],[`${fmt(hi.highest.m)}`,'highest: '+hi.name],[`${fmt(lo.lowest.m)}`,'lowest: '+lo.name],[REC.filter(r=>r.lowest.m!=null).length,'with a lowest point']];
  document.getElementById('kpis').innerHTML = k.map(([v,l])=>`<div class="kpi"><div class="v">${typeof v==='number'?v.toLocaleString('en-GB'):v}</div><div class="l">${l}</div></div>`).join('');
}

// charts (no gridlines, value labels at bar end)
const endLabels = {id:'endLabels',afterDatasetsDraw(c){const ctx=c.ctx;ctx.save();ctx.fillStyle=getComputedStyle(document.body).color;ctx.font='11px Arial';ctx.textBaseline='middle';
  c.getDatasetMeta(0).data.forEach((b,i)=>{const v=c.data.datasets[0].data[i]; ctx.fillText(Math.round(v).toLocaleString('en-GB'), Math.max(b.x,b.base)+4, b.y);});ctx.restore();}};
let barChart, statChart;
function charts(){
  const m=metric, title={highest:'Highest points',lowest:'Lowest points',span:'Elevation span'}[m];
  const ranked=F.filter(r=>val(r,m)!=null).sort((a,b)=> m==='lowest' ? val(a,m)-val(b,m) : val(b,m)-val(a,m)).slice(0,15);
  document.getElementById('barTitle').textContent = (m==='lowest'?'Fifteen deepest ':'Fifteen highest ')+title.toLowerCase()+' in the current selection (metres)';
  const d={labels:ranked.map(r=>r.name),datasets:[{data:ranked.map(r=>val(r,m)),backgroundColor:ranked.map(r=>STATUS_COL[stat(r,m)]||'#8a8f98')}]};
  if(barChart){barChart.data=d;barChart.update();} else barChart=new Chart(document.getElementById('barChart'),{type:'bar',data:d,plugins:[endLabels],
    options:{indexAxis:'y',maintainAspectRatio:false,layout:{padding:{right:46}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>fmt(c.parsed.x)}}},
      scales:{x:{grid:{display:false},ticks:{color:'#62707d'}},y:{grid:{display:false},ticks:{color:'#62707d',autoSkip:false}}},
      onClick:(e,els)=>{if(els.length) select(barChart._ids[els[0].index]);}}});
  barChart._ids=ranked.map(r=>r.id);
  const side = m==='lowest'?'lowest':'highest';
  document.getElementById('statTitle').textContent = 'Status of the '+side+' figure, records in the current selection';
  const cnt={}; STATUS_ORDER.forEach(s=>cnt[s]=0); let none=0;
  F.forEach(r=>{const s=r[side].status; if(s) cnt[s]++; else none++;});
  const labels=[...STATUS_ORDER,'no figure'], vals=[...STATUS_ORDER.map(s=>cnt[s]),none];
  const d2={labels,datasets:[{data:vals,backgroundColor:[...STATUS_ORDER.map(s=>STATUS_COL[s]),'#c9ced3']}]};
  if(statChart){statChart.data=d2;statChart.update();} else statChart=new Chart(document.getElementById('statChart'),{type:'bar',data:d2,plugins:[endLabels],
    options:{indexAxis:'y',maintainAspectRatio:false,layout:{padding:{right:36}},plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false},ticks:{color:'#62707d'}},y:{grid:{display:false},ticks:{color:'#62707d'}}}}});
}

// table
const COLS=[['name','Record',r=>r.name,false],['region','Region',r=>r.region,false],['type','Type',r=>r.type,false],
 ['hm','Highest (m)',r=>r.highest.m,true],['hp','Highest point',r=>r.highest.name||(r.highest.m!=null?'unnamed':''),false],['hs','Status',r=>r.highest.status||'',false],
 ['lm','Lowest (m)',r=>r.lowest.m,true],['lp','Lowest point',r=>r.lowest.name||'',false],['ls','Status',r=>r.lowest.status||'',false],['sp','Span (m)',r=>r.span_m,true]];
function table(){
  const th=document.querySelector('#tbl thead'); th.innerHTML='<tr>'+COLS.map(c=>`<th class="${c[3]?'n':''}" data-k="${c[0]}">${c[1]}${sortKey===c[0]?(sortDir>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>';
  const col=COLS.find(c=>c[0]===sortKey), rows=[...F].sort((a,b)=>{const x=col[2](a),y=col[2](b); if(x==null||x==='') return 1; if(y==null||y==='') return -1; return (x>y?1:x<y?-1:0)*sortDir;});
  document.querySelector('#tbl tbody').innerHTML = rows.map(r=>`<tr data-id="${r.id}" class="${sel===r.id?'sel':''}">`+COLS.map(c=>{const v=c[2](r);
    return `<td class="${c[3]?'n':''}">${c[3]?(v==null?'':Math.round(v).toLocaleString('en-GB')):(v||'')}</td>`;}).join('')+'</tr>').join('');
  document.getElementById('tcount').textContent='('+F.length+' shown)';
}
document.querySelector('#tbl thead').addEventListener('click',e=>{const k=e.target.dataset.k; if(!k) return; if(sortKey===k) sortDir*=-1; else {sortKey=k;sortDir=1;} table();});
document.querySelector('#tbl tbody').addEventListener('click',e=>{const tr=e.target.closest('tr'); if(tr) select(+tr.dataset.id,true);});

// detail
function chips(t){return t.map(x=>`<span class="chip" style="background:${STATUS_COL[x]}">${x}</span>`).join('');}
function ptBlock(label,p){
  if(p.m==null) return `<div class="pt"><div class="muted">${label}</div><div class="big">no figure</div><div class="muted">${p.why_blank==='no_wikipedia_row'?'Wikipedia has no row for this record.':p.why_blank==='other_piece'?'The point Wikipedia lists sits in another piece of this country.':'Not available.'}</div></div>`;
  const how = 'Wikipedia value.';
  return `<div class="pt"><div class="muted">${label}</div><div class="big">${fmt(p.m)}</div><div>${p.name||'<span class="muted">Unnamed point</span>'}</div>${chips(p.tags)}<div class="muted">${how}</div></div>`;
}
function detail(r){
  document.getElementById('detail').innerHTML = `<h2>${r.name}</h2><div class="muted">${r.type} · ${r.region}${r.iso3?' · '+r.iso3:''}${r.scope&&r.scope!=='single_record'?' · '+r.scope.replace(/_/g,' '):''}</div>`+
   ptBlock('Highest point',r.highest)+ptBlock('Lowest point',r.lowest)+
   `<div class="pt"><div class="muted">Elevation span</div><div class="big">${fmt(r.span_m)}</div>${r.flags?`<div class="muted">Flags: ${r.flags.replace(/;/g,', ').replace(/_/g,' ')}</div>`:''}</div>`+
   `<div class="muted">Row ${r.id+1}${r.source_url?` · <a href="${r.source_url}" target="_blank" rel="noopener">Wikipedia source</a>`:''}</div>`;
}
function select(id,fromTable){
  sel=id; detail(BYID[id]); styleMap(); drawMarkers();
  document.querySelectorAll('#tbl tbody tr').forEach(t=>t.classList.toggle('sel',+t.dataset.id===id));
  const l=layers[id]; if(l && fromTable) map.fitBounds(l.getBounds(),{maxZoom:6,padding:[30,30]});
}

function refresh(){ F=REC.filter(passes); drawLegend(); styleMap(); drawPoints(); charts(); table(); }
document.querySelectorAll('#metric button').forEach(b=>b.onclick=()=>{metric=b.dataset.m;document.querySelectorAll('#metric button').forEach(x=>x.classList.toggle('on',x===b));refresh();});
['fRegion','fType','fStatus','fSearch','fShown'].forEach(i=>document.getElementById(i).addEventListener('input',()=>{
  refresh(); const q=document.getElementById('fSearch').value; if(F.length && F.length<REC.length){const b=L.featureGroup(F.map(r=>layers[r.id]).filter(Boolean)).getBounds(); if(b.isValid()) map.fitBounds(b,{maxZoom:6,padding:[20,20]});}}));
document.querySelectorAll('#view button').forEach(b=>b.onclick=()=>{view=b.dataset.v;document.querySelectorAll('#view button').forEach(x=>x.classList.toggle('on',x===b));refresh();});
kpis(); refresh();
window.__ready = true;
