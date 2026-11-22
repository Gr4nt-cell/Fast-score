// Versioned, deterministic statistical inference. No generated team ratings or result leakage.
export const MODEL_VERSION = 5;
export const HISTORY_LIMIT = 20;
const DAY = 86400000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export function validScore(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null;
}

export function summarizeHistory(games, home, cutoff) {
  const seen = new Set();
  const rows = (Array.isArray(games) ? games : []).filter(g => {
    const t = new Date(g?.date).getTime();
    const key = g?.key || `${t}|${g?.home}|${g?.opponent}|${g?.gf}|${g?.ga}`;
    if (!g || !Number.isFinite(t) || t >= cutoff || cutoff - t > 365 * DAY || validScore(g.gf) == null || validScore(g.ga) == null || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, HISTORY_LIMIT);
  let weight=0, squares=0, gf=0, ga=0, win=0, margin2=0;
  const rec={W:0,D:0,L:0}, venue={W:0,D:0,L:0,n:0};
  for(const g of rows) {
    const scored=validScore(g.gf), conceded=validScore(g.ga);
    const result=scored>conceded?'W':scored<conceded?'L':'D';
    const w=2 ** (-(cutoff-new Date(g.date).getTime())/(45*DAY)) * (g.home===home?1.25:1);
    weight+=w;squares+=w*w;gf+=w*scored;ga+=w*conceded;win+=w*(result==='W'?1:result==='D'?.5:0);
    margin2+=w*(scored-conceded)**2;rec[result]++;
    if(g.home===home){venue[result]++;venue.n++;}
  }
  const eff=weight?weight*weight/squares:0;
  return {n:rows.length,eff,gf:weight?gf/weight:0,ga:weight?ga/weight:0,win:weight?win/weight:.5,
    marginVariance:weight?Math.max(1,margin2/weight-((gf-ga)/weight)**2):1,
    rec,venue,rows,form:rows.map(g=>validScore(g.gf)>validScore(g.ga)?'W':validScore(g.gf)<validScore(g.ga)?'L':'D').reverse().join(''),
    ageDays:rows.length?(cutoff-new Date(rows[0].date).getTime())/DAY:Infinity};
}

function pmf(lambda, max) {
  const out=[Math.exp(-lambda)];
  for(let k=1;k<=max;k++)out[k]=out[k-1]*lambda/k;
  return out;
}

// Normalize the whole grid, so 1X2, totals and BTTS refer to the same distribution.
export function goalDistribution(lh, la, uncertainty=.12, rho=-.06) {
  const max=18, grid=Array.from({length:max+1},()=>new Array(max+1).fill(0));
  const scenarios=[[-1,.25],[0,.5],[1,.25]];
  for(const [h,hw] of scenarios)for(const [a,aw] of scenarios){
    const home=lh*Math.exp(h*uncertainty),away=la*Math.exp(a*uncertainty);
    const H=pmf(home,max),A=pmf(away,max);
    for(let i=0;i<=max;i++)for(let j=0;j<=max;j++){
      const tau=i===0&&j===0?1-home*away*rho:i===0&&j===1?1+home*rho:i===1&&j===0?1+away*rho:i===1&&j===1?1-rho:1;
      grid[i][j]+=H[i]*A[j]*Math.max(.05,tau)*hw*aw;
    }
  }
  const total=grid.reduce((s,row)=>s+row.reduce((a,b)=>a+b,0),0);
  const out={home:0,draw:0,away:0,over:0,over15:0,under35:0,btts:0,
    over05:0,over35:0,over45:0,homeOver05:0,homeOver15:0,awayOver05:0,awayOver15:0,homeWinToNil:0,awayWinToNil:0};
  for(let i=0;i<=max;i++)for(let j=0;j<=max;j++){
    const p=grid[i][j]/total,totalGoals=i+j;out[i>j?'home':i===j?'draw':'away']+=p;
    if(totalGoals>=3)out.over+=p;if(totalGoals>=2)out.over15+=p;if(totalGoals<=3)out.under35+=p;
    if(totalGoals>=1)out.over05+=p;if(totalGoals>=4)out.over35+=p;if(totalGoals>=5)out.over45+=p;
    if(i>=1)out.homeOver05+=p;if(i>=2)out.homeOver15+=p;if(j>=1)out.awayOver05+=p;if(j>=2)out.awayOver15+=p;
    if(i>j&&j===0)out.homeWinToNil+=p;if(j>i&&i===0)out.awayWinToNil+=p;
    if(i&&j)out.btts+=p;
  }
  out.under05=1-out.over05;out.under15=1-out.over15;out.under=1-out.over;
  out.over35=Math.max(0,Math.min(1,out.over35));out.under35=1-out.over35;
  out.under45=1-out.over45;out.bttsNo=1-out.btts;
  out.homeUnder05=1-out.homeOver05;out.homeUnder15=1-out.homeOver15;
  out.awayUnder05=1-out.awayOver05;out.awayUnder15=1-out.awayOver15;
  return out;
}

const MARGIN_SCALE={basketball:12,football:14,hockey:1.6,baseball:2.5,rugby:14,volleyball:1};
export function buildPrediction(match, homeGames, awayGames, {asOf=Date.now(),contextAdjustment=0}={}) {
  if(!match?.home?.id || !match?.away?.id || String(match.home.id)===String(match.away.id))return null;
  const kickoff=new Date(match.date).getTime();
  if(!Number.isFinite(kickoff))return null;
  const cutoff=Math.min(kickoff,asOf);
  const H=summarizeHistory(homeGames,match.neutral?null:true,cutoff), A=summarizeHistory(awayGames,match.neutral?null:false,cutoff);
  if(Math.min(H.n,A.n)<5 || Math.min(H.eff,A.eff)<3.5 || Math.max(H.ageDays,A.ageDays)>100)return null;
  const support=clamp(Math.min(H.eff,A.eff)/(Math.min(H.eff,A.eff)+8)*Math.exp(-Math.max(H.ageDays,A.ageDays)/120),0,1);
  let model,xg;
  if(match.sport==='soccer'){
    const avg=clamp(((H.gf+H.ga+A.gf+A.ga)/4*support+1.35*(1-support)),.9,1.9);
    const steady=(v,n)=>(v*n+avg*6)/(n+6);
    const context=clamp(Number(contextAdjustment)||0,-.18,.18)*support;
    const lh=clamp(Math.sqrt(steady(H.gf,H.eff)*steady(A.ga,A.eff))*(match.neutral?1:1.1)*Math.exp(context),.2,4);
    const la=clamp(Math.sqrt(steady(A.gf,A.eff)*steady(H.ga,H.eff))*(match.neutral?1:.94)*Math.exp(-context),.2,4);
    xg={home:lh,away:la};model=goalDistribution(lh,la,.12+.18*(1-support));
  }else{
    if(!MARGIN_SCALE[match.sport])return null;
    const homeWin=(H.win*H.eff+3)/(H.eff+6),awayWin=(A.win*A.eff+3)/(A.eff+6);
    const logit=p=>Math.log(p/(1-p));
    const scale=Math.max(MARGIN_SCALE[match.sport],Math.sqrt((H.marginVariance+A.marginVariance)/2));
    const strength=.5*(logit(homeWin)-logit(awayWin))+.5*((H.gf-H.ga)-(A.gf-A.ga))/scale;
    const conditional=clamp(1/(1+Math.exp(-strength*support-(match.neutral?0:.12))),.1,.9);
    const draw=match.sport==='rugby'?.06:0;
    model={home:conditional*(1-draw),draw,away:(1-conditional)*(1-draw)};
  }
  const probs={home:model.home,draw:model.draw,away:model.away};
  const hn=match.home.short||match.home.name,an=match.away.short||match.away.name;
  const candidates=[{market:'1X2',label:`${hn} to win`,short:'1',side:'home',prob:probs.home},
    {market:'1X2',label:`${an} to win`,short:'2',side:'away',prob:probs.away}];
  if(probs.draw>0)candidates.push({market:'1X2',label:'Draw',short:'X',side:'draw',prob:probs.draw});
  if(match.sport==='soccer'){
    const noDraw=Math.max(1e-9,probs.home+probs.away);
    candidates.push(
      {market:'Double chance',label:`${hn} or draw`,short:'1X',side:'dc1x',prob:probs.home+probs.draw},
      {market:'Double chance',label:`${hn} or ${an}`,short:'12',side:'dc12',prob:probs.home+probs.away},
      {market:'Double chance',label:`${an} or draw`,short:'X2',side:'dcx2',prob:probs.away+probs.draw},
      {market:'Draw no bet',label:`${hn} · draw no bet`,short:'DNB1',side:'dnbHome',prob:probs.home/noDraw},
      {market:'Draw no bet',label:`${an} · draw no bet`,short:'DNB2',side:'dnbAway',prob:probs.away/noDraw},
      {market:'Total goals',label:'Over 0.5 goals',short:'O0.5',side:'over05',prob:model.over05},
      {market:'Total goals',label:'Under 0.5 goals',short:'U0.5',side:'under05',prob:model.under05},
      {market:'Total goals',label:'Over 1.5 goals',short:'O1.5',side:'over15',prob:model.over15},
      {market:'Total goals',label:'Under 1.5 goals',short:'U1.5',side:'under15',prob:model.under15},
      {market:'Total goals',label:'Over 2.5 goals',short:'O2.5',side:'over',prob:model.over},
      {market:'Total goals',label:'Under 2.5 goals',short:'U2.5',side:'under',prob:model.under},
      {market:'Total goals',label:'Over 3.5 goals',short:'O3.5',side:'over35',prob:model.over35},
      {market:'Total goals',label:'Under 3.5 goals',short:'U3.5',side:'under35',prob:model.under35},
      {market:'Total goals',label:'Over 4.5 goals',short:'O4.5',side:'over45',prob:model.over45},
      {market:'Total goals',label:'Under 4.5 goals',short:'U4.5',side:'under45',prob:model.under45},
      {market:'BTTS',label:'Both teams to score · Yes',short:'GG',side:'btts',prob:model.btts},
      {market:'BTTS',label:'Both teams to score · No',short:'NG',side:'bttsNo',prob:model.bttsNo},
      {market:'Home team total',label:`${hn} over 0.5`,short:'H O0.5',side:'homeOver05',prob:model.homeOver05},
      {market:'Home team total',label:`${hn} under 0.5`,short:'H U0.5',side:'homeUnder05',prob:model.homeUnder05},
      {market:'Home team total',label:`${hn} over 1.5`,short:'H O1.5',side:'homeOver15',prob:model.homeOver15},
      {market:'Home team total',label:`${hn} under 1.5`,short:'H U1.5',side:'homeUnder15',prob:model.homeUnder15},
      {market:'Away team total',label:`${an} over 0.5`,short:'A O0.5',side:'awayOver05',prob:model.awayOver05},
      {market:'Away team total',label:`${an} under 0.5`,short:'A U0.5',side:'awayUnder05',prob:model.awayUnder05},
      {market:'Away team total',label:`${an} over 1.5`,short:'A O1.5',side:'awayOver15',prob:model.awayOver15},
      {market:'Away team total',label:`${an} under 1.5`,short:'A U1.5',side:'awayUnder15',prob:model.awayUnder15},
      {market:'Win to nil',label:`${hn} to win to nil`,short:'H WTN',side:'homeWinToNil',prob:model.homeWinToNil},
      {market:'Win to nil',label:`${an} to win to nil`,short:'A WTN',side:'awayWinToNil',prob:model.awayWinToNil});
  }else if(probs.draw>0){
    const noDraw=Math.max(1e-9,probs.home+probs.away);
    candidates.push(
      {market:'Draw no bet',label:`${hn} · draw no bet`,short:'DNB1',side:'dnbHome',prob:probs.home/noDraw},
      {market:'Draw no bet',label:`${an} · draw no bet`,short:'DNB2',side:'dnbAway',prob:probs.away/noDraw});
  }
  for(const c of candidates)c.evidenceScore=c.prob-.12*(1-support);
  candidates.sort((a,b)=>b.evidenceScore-a.evidenceScore);
  const quality=Math.min(H.n,A.n)<10||support<.5?'low':Math.max(H.ageDays,A.ageDays)>30?'medium':'high';
  const safe=candidates.find(c=>c.prob>=.62&&c.evidenceScore>=.55&&quality!=='low')||null;
  const rec=r=>`${r.W}W ${r.D}D ${r.L}L`;
  return {modelVersion:MODEL_VERSION,probs,tip:candidates[0],safe,candidates,xg,over:model.over,btts:model.btts,quality,support,
    calibration:'unvalidated',sample:{home:H.n,away:A.n,effective:Math.min(H.eff,A.eff)},
    reasons:[`${hn}: ${rec(H.rec)} in ${H.n} prior games; ${H.gf.toFixed(1)} scored / ${H.ga.toFixed(1)} conceded`,
      `${an}: ${rec(A.rec)} in ${A.n} prior games; ${A.gf.toFixed(1)} scored / ${A.ga.toFixed(1)} conceded`,
      'Recent dates and venue weighted; sparse samples shrunk toward conservative priors',
      ...(xg?[`Expected goals ${xg.home.toFixed(2)} – ${xg.away.toFixed(2)}; low-score and uncertainty adjustment`]:[]),
      'Model estimate; calibration has not yet been measured'],
    last:{home:H.rows,away:A.rows,homeForm:H.form,awayForm:A.form}};
}

/** Settle a supported selection from regulation-time scores. Draw-no-bet returns void on a draw. */
export function judgeScore(side, h, a) {
  if (validScore(h) == null || validScore(a) == null) return null;
  h = Number(h); a = Number(a);
  switch (side) {
    case 'home': return h > a; case 'away': return a > h; case 'draw': return h === a;
    case 'over05': return h + a >= 1; case 'under05': return h + a === 0;
    case 'over15': return h + a >= 2; case 'under15': return h + a <= 1;
    case 'over': return h + a >= 3; case 'under': return h + a <= 2;
    case 'over35': return h + a >= 4; case 'under35': return h + a <= 3;
    case 'over45': return h + a >= 5; case 'under45': return h + a <= 4;
    case 'btts': return h > 0 && a > 0; case 'bttsNo': return !(h > 0 && a > 0);
    case 'dc1x': return h >= a; case 'dc12': return h !== a; case 'dcx2': return a >= h;
    case 'dnbHome': return h === a ? 'void' : h > a; case 'dnbAway': return h === a ? 'void' : a > h;
    case 'homeOver05': return h >= 1; case 'homeUnder05': return h === 0;
    case 'homeOver15': return h >= 2; case 'homeUnder15': return h <= 1;
    case 'awayOver05': return a >= 1; case 'awayUnder05': return a === 0;
    case 'awayOver15': return a >= 2; case 'awayUnder15': return a <= 1;
    case 'homeWinToNil': return h > a && a === 0; case 'awayWinToNil': return a > h && h === 0;
    default: return null;
  }
}

export function isForecastArchive(day) {
  if(!Array.isArray(day?.picks) || !day.picks.length || day.picks.some(p=>!p||!Number.isFinite(new Date(p.date).getTime())))return false;
  const first=Math.min(...day.picks.map(p=>new Date(p.date).getTime()));
  return !!day?.picks?.length && Number.isFinite(day.generatedAt) && day.generatedAt<first && day.provenance!=='simulation';
}

export function forecastMetrics(days,version=MODEL_VERSION) {
  const picks=days.filter(isForecastArchive).flatMap(d=>d.picks.map(p=>({...p,modelVersion:p.modelVersion||d.modelVersion}))).filter(p=>(version==null||p.modelVersion===version)&&typeof p.result==='boolean'&&Number.isFinite(p.tip?.prob));
  if(!picks.length)return {count:0,hits:0,brier:null};
  return {count:picks.length,hits:picks.filter(p=>p.result).length,brier:picks.reduce((s,p)=>s+(p.tip.prob-Number(p.result))**2,0)/picks.length};
}

// ---------- daily pick selection: conservative probability first ----------
// Rank by uncertainty-adjusted likelihood, with price only a small tie-breaker. Real MSport prices
// are used when known; otherwise the model's fair price less a typical bookmaker margin. These are
// still uncalibrated estimates: no threshold can guarantee a winning rate.
export const PICK_RULES = { minProb: 0.60, minPrice: 1.05, maxPrice: 3.0, minValue: 0.92, margin: 0.94 };
// used only to fill the list to five when too few matches clear the main rules
export const PICK_RULES_RELAXED = { minProb: 0.56, minPrice: 1.03, maxPrice: 3.5, minValue: 0.90, margin: 0.94, lowSampleMin: 8 };

const num = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? Number(x) : null);
function findMarket(odds, re) {
  return (odds?.markets || []).find((m) => re.test(m.name || ''));
}
function outcomePrice(market, re) {
  const o = market && (market.outcomes || []).find((x) => re.test(String(x.label || '')));
  return o ? num(o.odds) : null;
}
/** MSport decimal price for a model candidate, or null. */
export function marketPrice(c, odds) {
  if (!odds) return null;
  const dec = odds.dec || {};
  switch (c.side) {
    case 'home': return num(dec.home);
    case 'draw': return num(dec.draw);
    case 'away': return num(dec.away);
    case 'over05': return outcomePrice(findMarket(odds, /over\/under 0\.5|total.*0\.5/i), /^over/i);
    case 'under05': return outcomePrice(findMarket(odds, /over\/under 0\.5|total.*0\.5/i), /^under/i);
    case 'over15': return outcomePrice(findMarket(odds, /over\/under 1\.5|total.*1\.5/i), /^over/i);
    case 'under15': return outcomePrice(findMarket(odds, /over\/under 1\.5|total.*1\.5/i), /^under/i);
    case 'over': return outcomePrice(findMarket(odds, /over\/under 2\.5|total.*2\.5/i), /^over/i);
    case 'under': return outcomePrice(findMarket(odds, /over\/under 2\.5|total.*2\.5/i), /^under/i);
    case 'over35': return outcomePrice(findMarket(odds, /over\/under 3\.5|total.*3\.5/i), /^over/i);
    case 'under35': return outcomePrice(findMarket(odds, /over\/under 3\.5|total.*3\.5/i), /^under/i);
    case 'over45': return outcomePrice(findMarket(odds, /over\/under 4\.5|total.*4\.5/i), /^over/i);
    case 'under45': return outcomePrice(findMarket(odds, /over\/under 4\.5|total.*4\.5/i), /^under/i);
    case 'btts': return outcomePrice(findMarket(odds, /both teams|gg\/ng|btts/i), /^(yes|gg)$/i);
    case 'bttsNo': return outcomePrice(findMarket(odds, /both teams|gg\/ng|btts/i), /^(no|ng)$/i);
    case 'dc1x': return outcomePrice(findMarket(odds, /double chance/i), /home.*draw|^1x$|1 or x/i);
    case 'dc12': return outcomePrice(findMarket(odds, /double chance/i), /home.*away|^12$|1 or 2/i);
    case 'dcx2': return outcomePrice(findMarket(odds, /double chance/i), /draw.*away|^x2$|x or 2/i);
    case 'dnbHome': return outcomePrice(findMarket(odds, /draw no bet/i), /home|^1$/i);
    case 'dnbAway': return outcomePrice(findMarket(odds, /draw no bet/i), /away|^2$/i);
    case 'homeOver05': case 'homeUnder05': case 'homeOver15': case 'homeUnder15':
      return outcomePrice(findMarket(odds, /home.*total|1st team.*total/i), new RegExp(`^${c.side.includes('Over') ? 'over' : 'under'}.*${c.side.includes('05') ? '0\\.5' : '1\\.5'}`, 'i'));
    case 'awayOver05': case 'awayUnder05': case 'awayOver15': case 'awayUnder15':
      return outcomePrice(findMarket(odds, /away.*total|2nd team.*total/i), new RegExp(`^${c.side.includes('Over') ? 'over' : 'under'}.*${c.side.includes('05') ? '0\\.5' : '1\\.5'}`, 'i'));
    case 'homeWinToNil': return outcomePrice(findMarket(odds, /home.*win to nil|win to nil/i), /home.*yes|^home$/i);
    case 'awayWinToNil': return outcomePrice(findMarket(odds, /away.*win to nil|win to nil/i), /away.*yes|^away$/i);
    default: return null;
  }
}

/** Best rewarding-but-reasonable pick for one match, or null. */
export function choosePick(prediction, odds, rules = PICK_RULES) {
  if (!prediction) return null;
  // thin evidence is only accepted by the relaxed rules, and only with 8+ recent results per team
  const sample = Math.min(prediction.sample?.home || 0, prediction.sample?.away || 0);
  if (prediction.quality === 'low' && !(rules.lowSampleMin && sample >= rules.lowSampleMin)) return null;
  const support = Number(prediction.support) || 0;
  let best = null;
  for (const c of prediction.candidates || []) {
    const p = c.prob;
    if (!(p >= rules.minProb)) continue;
    const adjusted = p - 0.12 * (1 - support);
    if (adjusted < rules.minProb - 0.03) continue; // thin evidence
    const market = marketPrice(c, odds);
    const price = market || (1 / p) * rules.margin;
    if (price < rules.minPrice || price > rules.maxPrice) continue;
    const value = p * price;
    if (market && value < rules.minValue) continue; // the bookmaker's price is clearly too short
    // Probability dominates; a modest price/value bonus breaks near-ties without chasing long odds.
    const score = adjusted + Math.min(0.04, Math.max(0, Math.log(price)) * 0.03) + (market ? Math.min(0.02, Math.max(0, value - 1) * 0.1) : 0);
    if (!best || score > best.rewardScore) best = { ...c, adjustedProb: adjusted, price: Math.round(price * 100) / 100, priceSource: market ? 'MSport' : 'model', value, rewardScore: score };
  }
  return best;
}
