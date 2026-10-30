import POOL from '../data/climate-pool.json';
import { initClimateCompare } from './climate-compare.js';

const KINDS = ['wettest'];
const CFG = {
  wettest:{lo:0, hi:3500, unit:'mm', dec:0, minAbs:50, minRel:.05, lowWins:false, rain:true, q:'Which country is wetter?', noun:'average annual rainfall figures', pool:'average rainfall figures', zero:'0 mm', lines:[['max','Wettest national average']]}
};

initClimateCompare({
  POOL, KINDS, CFG,
  bestKey: 'country-extremes-wetter-best',
  startMode: 'wettest',
  defaultKind: 'wettest',
  next: {slug:'climate-guess', label:'Guess the figure'},
});
