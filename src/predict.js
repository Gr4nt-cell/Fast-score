import { load, readPickArchiveDates, saveAndWait } from './store';
import { SPORTS, sportByKey } from './sports';
import { addDays, dayBoard, pool, recentGames, scoreboard, ymd } from './api/sportsData';
import { domesticProfile, contextAdjustment } from './competitionContext';
import { datesForPickHistory, getOrCreatePickDay } from './pickArchive';
import { buildPrediction, choosePick, PICK_RULES_RELAXED, HISTORY_LIMIT, MODEL_VERSION, validScore, isForecastArchive, judgeScore } from './prediction/model';
import { matchOdds } from './api/msport';

export const LAST_N=HISTORY_LIMIT;
export const PICK_THRESHOLD=.60;
export const PICKS_PER_DAY=5;
const recentCache=new Map();
const SUPPORTED=['soccer','basketball','hockey','football','baseball','rugby'];

/** Bounded, retryable feed cache; each caller applies its own strict time cutoff. */
export async function lastMatches(sport, league, teamId, before=new Date()) {
  const key=`${sport}/${league}/${teamId}`,now=Date.now();
  let entry=recentCache.get(key);
  if(!entry || entry.expires<=now){
    entry={expires:now+10*60000,promise:null};
    entry.promise=recentGames(sport,league,teamId).catch(error=>{entry.expires=0;throw error;});
    recentCache.set(key,entry);
    if(recentCache.size>250)recentCache.delete(recentCache.keys().next().value);
  }
  const games=await entry.promise,cutoff=Math.min(new Date(before).getTime(),now);
  return (Array.isArray(games)?games:[]).filter(g=>g?.state==='post' && g.home && g.away &&
    new Date(g.date).getTime()<cutoff && [g.home.id,g.away.id].some(id=>String(id)===String(teamId)) &&
    !(sport==='soccer' && /AET|PEN|W\/O|Awd|Ret/i.test(g.short||'')))
    .map(g=>{
      const home=String(g.home.id)===String(teamId),me=home?g.home:g.away,op=home?g.away:g.home;
      const gf=validScore(me.score),ga=validScore(op.score);
      if(gf==null || ga==null)return null;
      return {key:g.key,date:g.date,home,gf,ga,league:g.league,leagueName:g.leagueName,country:g.country,
        opponent:op.name,opponentId:op.id,opLogo:op.logo,result:gf>ga?'W':gf<ga?'L':'D'};
    }).filter(Boolean).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,LAST_N);
}

export async function predictMatch(match) {
  if(!match || match.kind!=='match' || !SUPPORTED.includes(match.sport) || sportByKey(match.sport).individual || !match.home?.id || !match.away?.id)return null;
  const [home,away]=await Promise.all([lastMatches(match.sport,match.league,match.home.id,match.date),lastMatches(match.sport,match.league,match.away.id,match.date)]);
  const hp=domesticProfile(match,'home',home),ap=domesticProfile(match,'away',away);
  const adjustment=match.sport==='soccer'?contextAdjustment(hp,ap,null,null):0;
  const prediction=buildPrediction(match,home,away,{contextAdjustment:adjustment});
  if(prediction && hp && ap)prediction.reasons.push(`Competition context: ${hp.name} / ${ap.name}; bounded prior adjustment`);
  return prediction;
}

function slim(match,prediction,tip=prediction.safe) {
  const side=s=>({id:s.id,name:s.name,short:s.short,logo:s.logo});
  return {key:match.key,id:match.id,eventId:match.eventId,sport:match.sport,league:match.league,leagueName:match.leagueName,date:match.date,
    home:side(match.home),away:side(match.away),tip,probs:prediction.probs,xg:prediction.xg,
    reasons:prediction.reasons,quality:prediction.quality,modelVersion:MODEL_VERSION,sample:prediction.sample,
    calibration:prediction.calibration,support:prediction.support,homeForm:prediction.last.homeForm,awayForm:prediction.last.awayForm};
}

export async function generatePicks(date=new Date(),onProgress,{past=false}={}) {
  const empty={modelVersion:MODEL_VERSION,date:ymd(date),generatedAt:Date.now(),provenance:'forecast',scanned:0,modelled:0,threshold:PICK_THRESHOLD,picks:[]};
  if(past || ymd(date)<ymd(new Date()))return {...empty,kind:'unrecorded'};
  const boards=[],seen=new Set(),scanErrors=[];
  for(const sport of SUPPORTED){
    onProgress?.(`Scanning ${sportByKey(sport).name.toLowerCase()}…`);
    try{
      const groups=await dayBoard(sport,date,{leagues:[],limit:40,ttl:120000});
      for(const group of groups)for(const match of group.items||[]){
        if(match.kind!=='match'||match.state!=='pre'||match.postponed||new Date(match.date).getTime()<=Date.now()+60000||seen.has(match.key))continue;
        seen.add(match.key);boards.push(match);
      }
    }catch(error){scanErrors.push(String(error?.message||error));}
  }
  if(!boards.length&&scanErrors.length)throw new Error('Could not load today’s fixtures. Check your connection and try again.');
  const candidates=boards.sort((a,b)=>(b.priority||0)-(a.priority||0)||new Date(a.date)-new Date(b.date)).slice(0,160);
  onProgress?.(`Checking evidence for ${candidates.length} matches…`);
  const preds=await pool(candidates,4,async match=>{
    try{
      const prediction=await predictMatch(match);
      if(!prediction)return null;
      // Real prices are useful for rejecting bad value, but never block a forecast.
      let odds=null;
      if(match.sport==='soccer' || match.sport==='basketball' || match.sport==='hockey'){
        try{odds=await Promise.race([matchOdds(match),new Promise(r=>setTimeout(()=>r(null),6000))]);}catch{}
      }
      const tip=choosePick(prediction,odds);
      const relaxed=tip?null:choosePick(prediction,odds,PICK_RULES_RELAXED);
      const fallback=prediction.safe||((prediction.tip?.prob>=.65&&Math.min(prediction.sample?.home||0,prediction.sample?.away||0)>=8)?prediction.tip:null);
      const safe=!tip&&!relaxed&&fallback?{...fallback,price:Math.round(100/fallback.prob)/100,priceSource:'model',rewardScore:0}:null;
      const best=tip||relaxed||safe;
      return best?{match,prediction,tip:best,tier:tip?0:relaxed?1:2}:null;
    }catch(error){return {error:String(error?.message||error)};}
  });
  const ranked=preds.filter(value=>value?.match).sort((a,b)=>a.tier-b.tier||b.tip.rewardScore-a.tip.rewardScore||b.tip.prob-a.tip.prob);
  const evidenceErrors=preds.filter(value=>value?.error);
  if(!ranked.length&&evidenceErrors.length)throw new Error('Could not load prior results for the prediction model. Check your connection and try again.');
  const picks=[],counts=new Map(),teams=new Set();
  for(const {match,prediction,tip} of ranked){
    if(new Date(match.date).getTime()<=Date.now()+60000)continue;
    const league=`${match.sport}/${match.league}`,home=`${match.sport}/${match.home.id}`,away=`${match.sport}/${match.away.id}`;
    if((counts.get(league)||0)>=2 || teams.has(home)||teams.has(away))continue;
    picks.push(slim(match,prediction,tip));teams.add(home);teams.add(away);counts.set(league,(counts.get(league)||0)+1);
    if(picks.length===PICKS_PER_DAY)break;
  }
  return {...empty,generatedAt:Date.now(),scanned:boards.length,modelled:ranked.length,candidateLimit:160,warnings:scanErrors.length?[`${scanErrors.length} sports could not be scanned`]:[],picks};
}

let pickIndexWrite=Promise.resolve();
function indexPickDate(dateKey){
  const write=pickIndexWrite.then(async()=>{
    const previous=await load('picks5:index',[]);
    const dates=[...new Set([...(Array.isArray(previous)?previous:[]),dateKey])].sort();
    await saveAndWait('picks5:index',dates);
  });
  pickIndexWrite=write.catch(()=>{});return write;
}
function archivedPicks(date,{onProgress}={}){
  return getOrCreatePickDay(ymd(date),{read:load,write:saveAndWait,ensureIndexed:indexPickDate,
    legacyKeys:[`picksf:${ymd(date)}`],create:()=>generatePicks(date,onProgress)});
}
export async function getDailyPicks(options={}){return (await archivedPicks(new Date(),options)).day;}

/** Today's list is rebuilt (once per couple of hours at most) when it came from an older model or has
 * fewer than five picks, as long as none of its matches has started. */
async function refreshOutdatedToday(){
  const key='picks5:'+ymd(new Date());
  const day=await load(key,null);
  if(!day)return;
  // older model, or a short list that is a couple of hours old (more matches may now qualify)
  const short=(day.picks||[]).length<PICKS_PER_DAY && Date.now()-(Number(day.generatedAt)||0)>2*3600000;
  if(!(Number(day.modelVersion)<MODEL_VERSION) && !short)return;
  const first=Math.min(...(day.picks||[]).map(p=>new Date(p.date).getTime()).filter(Number.isFinite));
  if(day.picks?.length && !(first>Date.now()))return;
  await saveAndWait(key,null);
}

export function judgePick(p,match){
  if(match.postponed)return 'void';
  // Regulation-time markets cannot be graded from an extra-time/penalty final alone.
  if(match.state!=='post'||(p.sport==='soccer'&&/AET|PEN|W\/O|Awd|Ret/i.test(match.short||'')))return null;
  const h=validScore(match.home?.score),a=validScore(match.away?.score);
  if(h==null||a==null)return null;
  return judgeScore(p.tip.side,h,a);
}
async function settle(key,day,date){
  let changed=false;
  const picks=await pool(day.picks,3,async original=>{
    const p={...original};
    if(p.result!=null||new Date(p.date)>new Date())return p;
    for(const dt of [new Date(p.date),addDays(new Date(p.date),1),date]){
      try{
        const board=await scoreboard(p.sport,p.league,dt,60000);
        const match=(board.items||[]).find(x=>x.key===p.key || (p.eventId && x.eventId===p.eventId));
        if(!match)continue;
        const result=judgePick(p,match);
        if(result!=null){p.result=result;p.final=result==='void'?'Void':`${match.home.score}-${match.away.score}`;changed=true;break;}
      }catch{}
    }
    return p;
  });
  const next={...day,picks:picks.map((p,i)=>p||day.picks[i])};
  if(changed)await saveAndWait(key,next);return next;
}
const parseYmd=d=>new Date(Number(d.slice(0,4)),Number(d.slice(4,6))-1,Number(d.slice(6,8)));
export async function pickHistory(days=14){
  const [index,archives]=await Promise.all([load('picks5:index',[]),readPickArchiveDates()]);
  const today=ymd(new Date()),earliest=ymd(addDays(parseYmd(today),-days));
  const out=[];
  for(const date of datesForPickHistory([...(Array.isArray(index)?index:[]),...archives],today,earliest)){
    const day=await load('picks5:'+date,null);
    if(isForecastArchive(day))out.push(await settle('picks5:'+date,day,parseYmd(date)));
  }
  return out;
}
export async function picksForDate(date,{onProgress}={}){
  const key=ymd(date),today=ymd(new Date());
  if(key===today)await refreshOutdatedToday().catch(()=>{});
  if(key<today){
    const saved=await load('picks5:'+key,null) || await load('picksbt:'+key,null);
    if(!saved?.picks?.length)return {date:key,picks:[],kind:'unrecorded',modelVersion:MODEL_VERSION};
    return {...await settle('picks5:'+key,saved,date),kind:isForecastArchive(saved)?'saved':'simulation'};
  }
  const {day}=await archivedPicks(date,{onProgress});
  return {...day,kind:key===today?'today':'preview'};
}
export { SPORTS };
