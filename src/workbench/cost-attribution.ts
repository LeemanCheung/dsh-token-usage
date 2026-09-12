import { bucketKeys, type Configuration } from './schema.ts'
import { changes, type InsightSession } from './insights.ts'
import { ratesAt, quote, zero, add, type Quote } from './prices.ts'

/** Ordered counterfactual decomposition, not a reconstruction of a provider invoice.
 * Route volume at old input mix -> current input mix -> new reference rates. */
export function costAttribution(sessions: readonly InsightSession[], config: Configuration, length: 7|30|90, currency: Quote['currency'], now = Date.now()) {
  const activity = changes(sessions,length,now)
  const beforeAt = new Date(Date.parse(activity.window.start)-1).toISOString(), afterAt = new Date(Date.parse(activity.window.end)-1).toISOString()
  const rows: { provider:string; model:string; before:number; after:number; volume:number; cacheMix:number; rate:number }[] = []
  let complete = activity.complete, missingRoutes = 0
  for (const row of activity.routes) {
    if (!row.current && !row.previous) continue
    const side = (start:string,end:string) => sessions.filter(session=>session.dailyUsageReliable&&session.modelDailyUsageReliable).flatMap(session=>session.modelDays)
      .filter(item=>item.provider===row.provider&&item.model===row.model&&item.date>=start&&item.date<end).reduce((sum,item)=>add(sum,item.usage),zero())
    const before = side(activity.window.previousStart,activity.window.start), after = side(activity.window.start,activity.window.end)
    const q1 = quote(config.cards,row,before,{ currency,mode:'revaluation',at:beforeAt,timingKnown:true,requestInputKnown:false })
    const q2 = quote(config.cards,row,after,{ currency,mode:'revaluation',at:afterAt,timingKnown:true,requestInputKnown:false })
    if (q1.status!=='complete'||q2.status!=='complete'||!row.model) { complete=false;missingRoutes++;continue }
    const card=config.cards.find(card=>card.id===q1.cards[0])!,rates=ratesAt(card,before,Date.parse(beforeAt))
    const inputKeys=bucketKeys.filter(key=>key!=='outputTokens')
    const inputBefore=inputKeys.reduce((sum,key)=>sum+before[key],0),inputAfter=inputKeys.reduce((sum,key)=>sum+after[key],0)
    // New routes use the current mix, assigning all introduction effects to volume.
    const mixed=Object.fromEntries(bucketKeys.map(key=>[key,key==='outputTokens'?after[key]:inputBefore?inputAfter*before[key]/inputBefore:after[key]])) as Record<typeof bucketKeys[number],number>
    if(bucketKeys.some(key=>(after[key]||mixed[key])&&rates[key]===null)){complete=false;missingRoutes++;continue}
    const cost=(b:Record<typeof bucketKeys[number],number>)=>bucketKeys.reduce((sum,key)=>sum+b[key]*(rates[key]??0)/1e6,0)
    const scaled=cost(mixed),samePrice=cost(after)
    rows.push({ provider:row.provider,model:row.model,before:q1.amount!,after:q2.amount!,volume:scaled-q1.amount!,cacheMix:samePrice-scaled,rate:q2.amount!-samePrice })
  }
  const sums=rows.reduce((sum,row)=>({before:sum.before+row.before,after:sum.after+row.after,volume:sum.volume+row.volume,cacheMix:sum.cacheMix+row.cacheMix,rate:sum.rate+row.rate}),{before:0,after:0,volume:0,cacheMix:0,rate:0})
  return {schema:'dsh-token-usage/cost-attribution-v1' as const,currency,beforeAt,afterAt,window:activity.window,complete,missingRoutes,rows,knownSubset:sums,
    totalDelta:complete?sums.after-sums.before:null,order:['route-volume','input-cache-mix','reference-rates'] as const,notAnInvoice:true as const}
}
