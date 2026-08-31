import { useEffect } from 'react'
import { IconDataOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { TokenUsageRecorderProjection } from '../types.ts'
import type { TokenThroughputSnapshot } from './throughput-controller.ts'
import { formatTokensPerSecond, THROUGHPUT_SAMPLE_INTERVAL_MS, THROUGHPUT_WINDOW_MS } from './throughput-controller.ts'
import { NS } from './locales.ts'
import css from './TokenThroughput.module.css'

interface TokenThroughputInjected {
  hooks: {
    throughput: ObservableSnapshot<TokenThroughputSnapshot>
  }
  observeProjection: (
    sessionId: string,
    recorded: TokenUsageRecorderProjection | undefined,
    builtIn: TokenUsageProjection | undefined,
  ) => () => void
}

/** Props supplied by the current-session header action slot. */
export type CurrentSessionThroughputProps = PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & InjectFace<TokenThroughputInjected>

/** Props supplied by the root sidebar footer-action slot. */
export type AllSessionsThroughputProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof NS>
  & InjectFace<TokenThroughputInjected>

function detailLabel(
  rate: number,
  activeSessions: number,
  t: CurrentSessionThroughputProps['t'],
): string {
  return t('throughputDetail', {
    rate: formatTokensPerSecond(rate),
    active: activeSessions,
    window: THROUGHPUT_WINDOW_MS / 1_000,
    interval: THROUGHPUT_SAMPLE_INTERVAL_MS / 1_000,
  })
}

/** Render the current session's shared recent confirmed-output rate in the title row. */
export function CurrentSessionThroughput({
  sessionId, useProjection, useThroughput, observeProjection, t,
}: CurrentSessionThroughputProps) {
  const recorded = useProjection('tokenUsageRecorder')
  const builtIn = useProjection('tokenUsage')
  useEffect(
    () => observeProjection(String(sessionId), recorded, builtIn),
    [builtIn, observeProjection, recorded, sessionId],
  )
  const throughput = useThroughput(snapshot => snapshot)
  const rate = throughput.bySession[String(sessionId)] ?? 0
  const sampling = throughput.statusBySession[String(sessionId)] !== 'ready'
  const detail = detailLabel(rate, rate > 0 ? 1 : 0, t)
  return (
    <div
      className={css.headerMetric}
      data-active={rate > 0 || undefined}
      aria-label={sampling ? t('throughputSamplingCurrent') : detail}
      title={sampling ? t('throughputSampling') : detail}
    >
      <span className={css.signal} aria-hidden />
      <span className={css.headerLabel}>{t('throughputCurrent')}</span>
      <strong>{sampling ? '—' : formatTokensPerSecond(rate)}</strong>
      <span className={css.unit}>tok/s</span>
    </div>
  )
}

/** Render the aggregate recent confirmed-output rate at the sidebar foot. */
export function AllSessionsThroughput({ wide, useThroughput, t }: AllSessionsThroughputProps) {
  const throughput = useThroughput(snapshot => snapshot)
  const sampling = throughput.status === 'sampling'
  const detail = detailLabel(throughput.allTokensPerSecond, throughput.activeSessions, t)
  const label = sampling ? t('throughputSamplingAll') : detail
  return (
    <Tooltip label={label} side="right" delayMs={400} disabled={wide}>
      <div
        className={`${css.sidebarMetric}${wide ? '' : ` ${css.rail}`}`}
        data-token-throughput="all"
        data-active={throughput.allTokensPerSecond > 0 || undefined}
        role="status"
        aria-live="off"
        aria-label={label}
        tabIndex={wide ? undefined : 0}
        title={wide ? label : undefined}
      >
        <span className={css.sidebarIcon} aria-hidden>
          <IconDataOutline16 size={wide ? 16 : 18} />
          <span className={css.signal} />
        </span>
        {wide && (
          <>
            <span className={css.sidebarLabel}>{t('throughputAll')}</span>
            <strong>{sampling ? '—' : formatTokensPerSecond(throughput.allTokensPerSecond)}</strong>
            <span className={css.unit}>tok/s</span>
            {!sampling && throughput.activeSessions > 0 && (
              <span className={css.activeCount}>{t('throughputActive', { count: throughput.activeSessions })}</span>
            )}
          </>
        )}
      </div>
    </Tooltip>
  )
}
