import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrediction,goalDistribution,summarizeHistory,validScore,isForecastArchive,forecastMetrics} from '../src/prediction/model.js';
const kickoff=Date.UTC(2026,10,10),day=86400000;
const match={sport:'soccer',kind:'match',home:{id:'h',name:'Home'},away:{id:'a',name:'Away'},date:new Date(kickoff).toISOString(),neutral:true};
const games=(gf=2,ga=1,n=20)=>Array.from({length:n},(_,i)=>({key:String(i),date:new Date(kickoff-(i+1)*day).toISOString(),gf,ga,home:i%2===0,opponent:'op'+i}));
test('a missing score is never interpreted as a clean sheet or 0–0 result',()=>{
 for(const value of [null,undefined,'',false,NaN,Infinity,-1,1.5])assert.equal(validScore(value),null);
 assert.equal(validScore('0'),0);assert.equal(validScore(3),3);
});
test('future, duplicate, invalid and year-old matches do not enter model evidence',()=>{
 const rows=games();rows.push(rows[0],{...rows[0],key:'future',date:new Date(kickoff+day).toISOString()},
 {...rows[0],key:'old',date:new Date(kickoff-400*day).toISOString()},{...rows[0],key:'missing',gf:null});
 const summary=summarizeHistory(rows,null,kickoff);assert.equal(summary.n,20);
 assert(summary.eff>15&&summary.eff<=20);
});
test('normalized score grids produce coherent result, totals and BTTS probabilities',()=>{
 for(const h of [.2,.8,1.35,2.5,4])for(const a of [.2,1,3,4]){
  const p=goalDistribution(h,a);assert(Math.abs(p.home+p.draw+p.away-1)<1e-10);
  for(const value of Object.values(p))assert(value>=0&&value<=1+1e-12);
  assert(p.over15>=p.over);assert(p.under35>=1-p.over);
  const swapped=goalDistribution(a,h);assert(Math.abs(p.home-swapped.away)<1e-10);
 }
});
test('neutral identical teams are symmetric; stronger scoring form moves the estimate',()=>{
 const equal=buildPrediction(match,games(),games(),{asOf:kickoff});assert(equal);
 assert(Math.abs(equal.probs.home-equal.probs.away)<1e-10);
 const strong=buildPrediction(match,games(3,0),games(0,3),{asOf:kickoff});
 assert(strong.probs.home>equal.probs.home);assert.equal(strong.calibration,'unvalidated');
});
test('sparse and stale data abstain; a future kickoff cannot admit results after asOf',()=>{
 assert.equal(buildPrediction(match,games(1,1,3),games(),{asOf:kickoff}),null);
 assert.equal(buildPrediction(match,games().map(g=>({...g,date:new Date(kickoff-200*day).toISOString()})),games(),{asOf:kickoff}),null);
 assert.equal(buildPrediction({...match,date:new Date(kickoff+30*day)},games(),games(),{asOf:kickoff-25*day}),null);
});
test('track record excludes hindsight simulations, invalid archives, voids and older models',()=>{
 const pick={date:new Date(kickoff).toISOString(),tip:{prob:.8},result:true,modelVersion:4};
  const archive={generatedAt:kickoff-day,modelVersion:4,picks:[pick]};
  assert(isForecastArchive(archive));assert(!isForecastArchive({...archive,generatedAt:kickoff+1}));assert(!isForecastArchive({...archive,picks:{}}));
  const result=forecastMetrics([archive,{...archive,provenance:'simulation'},{...archive,picks:[{...pick,result:'void'}]},
 {...archive,modelVersion:3,picks:[{...pick,modelVersion:3}]}]);
 assert.equal(result.count,1);assert.equal(result.hits,1);assert(Math.abs(result.brier-.04)<1e-12);
});
test('daily picks prefer a worthwhile price over the safest market, and stay reasonable',async()=>{
 const {choosePick,PICK_RULES}=await import('../src/prediction/model.js');
 const pred={quality:'high',support:.8,candidates:[
  {side:'over15',label:'Over 1.5 goals',prob:.86},
  {side:'home',label:'Home to win',prob:.66},
  {side:'btts',label:'Both teams to score',prob:.58},
  {side:'away',label:'Away to win',prob:.12}]};
 const tip=choosePick(pred,null);
 assert(tip&&tip.side!=='over15'&&tip.prob>=PICK_RULES.minProb);
 assert(tip.price>=PICK_RULES.minPrice&&tip.price<=PICK_RULES.maxPrice);
 // a real price far below the model's fair price is rejected
 const short=choosePick({...pred,candidates:[{side:'home',label:'Home',prob:.66}]},{dec:{home:1.3,away:9}});
 assert.equal(short,null);
 // a real price with value is used and labelled
 const priced=choosePick({...pred,candidates:[{side:'home',label:'Home',prob:.66}]},{dec:{home:1.72,away:5}});
 assert.equal(priced.priceSource,'MSport');assert.equal(priced.price,1.72);
 assert.equal(choosePick({...pred,quality:'low'},null),null);
});
test('relaxed rules accept a thin-evidence match only with enough recent results',async()=>{
 const {choosePick,PICK_RULES_RELAXED}=await import('../src/prediction/model.js');
 const pred={quality:'low',support:.45,sample:{home:12,away:9},candidates:[{side:'home',label:'Home',prob:.6}]};
 assert.equal(choosePick(pred,null),null);
 assert(choosePick(pred,null,PICK_RULES_RELAXED));
 assert.equal(choosePick({...pred,sample:{home:12,away:6}},null,PICK_RULES_RELAXED),null);
});
