// Helpers shared by the games. Moved here unchanged from the five original templates.

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


