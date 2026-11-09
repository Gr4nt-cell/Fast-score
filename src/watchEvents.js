const score=value=>value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
export function matchEvents(previous,match) {
  if(!previous || !match)return [];
  const [state,oldScore]=previous.split('|');
  const [ph,pa]=(oldScore||'').split('-').map(score);
  const h=score(match.home?.score),a=score(match.away?.score),out=[];
  if(state==='pre'&&match.state==='in')out.push({kind:'start',title:match.sport==='soccer'?'Kick-off':'Started',match});
  if(h!=null&&a!=null&&(match.state==='in'||match.state==='post')){
    const known=ph!=null&&pa!=null;
    const changed=known?(h!==ph||a!==pa):state==='pre'&&(h>0||a>0);
    if(changed){
      const up=h>(ph??0)||a>(pa??0);
      const scorer=h>(ph??0)?match.home:a>(pa??0)?match.away:null;
      out.push({kind:'score',title:!up?'Score correction':match.sport==='soccer'?'GOAL!':'Score update',scorer,match});
    }
  }
  if(state==='in'&&match.state==='post')out.push({kind:'end',title:match.sport==='soccer'?'Full time':'Final',match});
  return out;
}
