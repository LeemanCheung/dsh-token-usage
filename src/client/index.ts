/** Token usage dashboard registered into Web Settings. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '../types.ts'
import { TokenUsageSection } from './TokenUsageSection.tsx'
import { en, NS, zh, type TokenUsageLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Token usage dashboard copy. */
    'settings.tokenUsage': TokenUsageLocaleKey
  }
}

/** Client services required by the Settings contribution. */
export const inject = ['slots', 'locale']

/** Contribute a localized Token usage page to Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'token-usage: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'token-usage',
    order: 30,
    label: () => t('nav'),
    locale: NS,
  }, TokenUsageSection))
}
