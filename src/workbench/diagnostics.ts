import { findingSchema, type Finding, type LocalSnapshot } from './schema.ts'

const actions: Record<string, [string, string]> = {
  'retry-share': ['展开重试节点，核对之前的失败事件；先区分提供方限流、网络错误和任务自身重试，再调整策略。', 'Open retry nodes and inspect preceding failures. Distinguish provider throttling, transport failures and task retries before changing policy.'],
  'compaction-share': ['检查压缩节点和上下文增长，比较相同任务的压缩频率；高占比本身不能证明浪费。', 'Inspect compaction nodes and context growth, then compare equivalent tasks. A high share alone does not prove waste.'],
  'tool-errors': ['在原会话检查工具错误与恢复结果，不要仅凭同名工具反复出现判断死循环。', 'Inspect tool failures and recovery in the original session. Repeated tool names alone do not prove a loop.'],
  'orphan-tools': ['核对事件是否完整、工具调用与返回是否成对；缺少一侧时不要补造耗时。', 'Check event coverage and tool call/result pairing. Do not infer duration from a missing counterpart.'],
  'open-lifecycle': ['会话仍在运行时重新读取；已经结束则检查是否缺失终态事件。', 'Re-inspect an active session; for a finished session, check for missing terminal events.'],
  'unresolved-approvals': ['在宿主审批界面确认待处理请求；体检不会代替你批准或拒绝。', 'Review pending requests in the Host approval interface. Diagnostics never approve or reject them.'],
  reconciliation: ['检查事件重放、临时用量替换和旧投影覆盖；对账恢复前不要据此认定完整费用。', 'Inspect replay, provisional-usage replacement and legacy projection coverage. Do not treat pricing as complete until reconciliation matches.'],
  'usage-unavailable': ['等待提供方上报 usage，或检查模型适配器；未观测用量不是零消耗。', 'Wait for provider usage or inspect the model adapter. Unobserved usage is not zero consumption.'],
  'time-coverage': ['部分节点没有有效时间戳；补齐事件后重读，不把未知时刻用于峰谷定价。', 'Some nodes lack valid timestamps. Re-read after repairing event coverage; do not assign unknown times to tariffs.'],
  'route-coverage': ['部分节点缺少精确模型路由；核对请求上下文，不借用其他模型费率。', 'Some nodes lack an exact model route. Inspect request context; do not borrow another model’s rates.'],
  'budget-pressure': ['核对完整项目范围与当前费率；需要调整预算或运行方式时由你显式操作，插件不会拦截任务。', 'Verify the complete budget scope and current rates. Any budget or scheduling change remains an explicit user action; tasks are never blocked.'],
  'budget-coverage': ['日期或定价覆盖不足，不能判断预算内；先核对未归因会话与缺失价卡。', 'Incomplete dates or pricing prevent an “within budget” conclusion. Inspect undated sessions and missing price cards first.'],
}

export function finding(ruleId: string, severity: Finding['severity'], value: number, evidence: string[], coverage: Finding['coverage'] = 'complete', scope: Finding['scope'] = 'session', threshold?: number): Finding {
  const [zh, en] = actions[ruleId] ?? ['核对证据与数据覆盖。', 'Verify the evidence and data coverage.']
  return findingSchema.parse({ ruleId, ruleVersion: '1', severity, value, evidence, coverage, scope, suggestedAction: { zh, en }, nodes: [], ...(threshold === undefined ? {} : { threshold }) })
}

/** References are metadata only, scoped to the same immutable snapshot. */
export function withNodeEvidence(findings: readonly Finding[], nodes: LocalSnapshot['nodes']): Finding[] {
  return findings.map(item => ({ ...item, nodes: nodes.flatMap((node, index) => {
    const relevant = item.ruleId === 'retry-share' ? node.status === 'retried'
      : item.ruleId === 'compaction-share' ? node.kind === 'compaction'
      : item.ruleId === 'route-coverage' ? node.provider === 'unknown' || node.model === 'unknown'
      : item.ruleId === 'time-coverage' ? !node.time : false
    return relevant ? [{ id: node.id, seq: node.seq, index }] : []
  }).slice(0, 16) }))
}
