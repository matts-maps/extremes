import POOL from '../data/climate-pool.json';
import { initClimateCompare } from './climate-compare.js';

const KINDS = ['hottest','coldest','avghigh','avglow','avgmean'];
const LINE_AVG = [['max','Highest national average'],['min','Lowest national average']];
const CFG = {
  hottest:{unit:'°C', dec:1, minAbs:1.5, lowWins:false, pos:true, dir:1, q:'Which country has the higher record temperature?', noun:'record highs', pool:'record highs', zero:'Freezing point, 0 °C', lines:[['max','Hottest record in the dataset']], far:'hottest record'},
  coldest:{unit:'°C', dec:1, minAbs:1.5, lowWins:true, dir:-1, q:'Which country has the colder record low?', noun:'record lows', pool:'record lows', zero:'Freezing point, 0 °C', lines:[['min','Coldest record in the dataset']], far:'coldest record'},
  avghigh:{unit:'°C', dec:1, minAbs:1, lowWins:false, dir:1, q:'Which country has the higher average daily high?', noun:'average daily highs', pool:'average daily highs', zero:'Freezing point, 0 °C', lines:LINE_AVG, far:'highest national average'},
  avglow:{unit:'°C', dec:1, minAbs:1, lowWins:false, dir:1, q:'Which country has the higher average daily low?', noun:'average daily lows', pool:'average daily lows', zero:'Freezing point, 0 °C', lines:LINE_AVG, far:'highest national average'},
  avgmean:{unit:'°C', dec:1, minAbs:1, lowWins:false, dir:1, q:'Which country has the higher average temperature?', noun:'average temperatures', pool:'average temperatures', zero:'Freezing point, 0 °C', lines:LINE_AVG, far:'highest national average'}
};
Object.assign(CFG.hottest,{lo:0,hi:60}); Object.assign(CFG.coldest,{lo:-90,hi:25}); Object.assign(CFG.avghigh,{lo:-20,hi:40}); Object.assign(CFG.avglow,{lo:-30,hi:30}); Object.assign(CFG.avgmean,{lo:-25,hi:35});

initClimateCompare({
  POOL, KINDS, CFG,
  bestKey: 'country-extremes-hotter-best',
  startMode: 'hottest',
  defaultKind: 'hottest',
  next: {slug:'climate-guess', label:'Guess the figure'},
});
