// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeExplorer, ExperimentDetails, LongScenario } from '../src/client/workbench/completion.tsx'
import { OfflineReceipts } from '../src/client/workbench/OfflineReceipts.tsx'
import { emptyConfiguration, emptyState } from '../src/workbench/schema.ts'
import { buildSnapshot, pageSnapshot } from '../src/workbench/snapshot.ts'
import { experimentComparison } from '../src/workbench/insights.ts'
import { workbenchEvents, fixtureNow } from './workbench.fixture.ts'

const t = (_zh:string,en:string)=>en
const snapshot=()=>pageSnapshot(buildSnapshot('session',workbenchEvents(),emptyConfiguration().thresholds,fixtureNow),0)
afterEach(()=>{cleanup();localStorage.clear()})
describe('0.5 accessible workspace controls',()=>{
  it('renders proportional nodes and disjoint full-snapshot views',()=>{
    const value=snapshot();render(<NodeExplorer snapshot={value} t={t}/>)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button',{name:/#4|#5/}))
    expect(screen.getByRole('region',{name:'Node evidence'})).toBeDefined()
    fireEvent.click(screen.getByRole('button',{name:'Buckets',exact:true}))
    expect(screen.getAllByRole('progressbar')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button',{name:'Routes',exact:true}))
    expect(screen.getByText('fixture-provider/fixture-model')).toBeDefined()
  })
  it('flags signed reconciliation residual instead of inventing ordinary usage',()=>{
    const value=snapshot();value.reconciliation='mismatch';value.totals.attributed.outputTokens+=1
    render(<NodeExplorer snapshot={value} t={t}/>);expect(screen.getByRole('status').textContent).toContain('-1')
  })
  it('saves and reads offline receipts without any port or Host object',()=>{
    render(<OfflineReceipts snapshot={snapshot()} t={t}/>);fireEvent.click(screen.getByRole('button',{name:'Save current page offline'}))
    fireEvent.click(screen.getByRole('button',{name:'Load offline cache'}))
    fireEvent.click(screen.getByRole('button',{name:/Page offset/}))
    expect(screen.getByRole('heading',{name:'Offline historical snapshot'})).toBeDefined()
  })
  it('requires confirmation before clearing offline data',()=>{
    render(<OfflineReceipts snapshot={snapshot()} t={t}/>);const clear=screen.getByRole('button',{name:'Clear offline receipts'}) as HTMLButtonElement
    expect(clear.disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));expect(clear.disabled).toBe(false)
  })
  it('presents an explicit unavailable interval state when no price card is configured',()=>{
    render(<LongScenario config={emptyConfiguration()} usage={snapshot().totals.usage} t={t}/>)
    expect(screen.getByText('Choose a valid card, ISO timestamps and duration no greater than seven days.')).toBeDefined()
    expect((screen.getByLabelText('Billing instant hypothesis') as HTMLSelectElement).value).toBe('unknown')
  })
  it('shows ratio samples as absent for a legacy experiment',()=>{
    const run={id:'a',experiment:'x',variant:'baseline' as const,pair:'1',task:'code',size:'small',conditions:'cold',configLabel:'v1',accepted:null,generatedAt:new Date(fixtureNow).toISOString(),revision:'r',usage:snapshot().totals.usage,retries:0,durationMs:1000,complete:true,costs:[]}
    render(<ExperimentDetails comparison={experimentComparison([run],'x')} t={t}/>)
    expect(screen.getByText('0 / 1')).toBeDefined();expect(screen.getByText('cold')).toBeDefined()
  })
})
