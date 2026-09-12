/** Scoped CSS shipped in the client bundle; inherits the host's color scheme and fonts. */
export const workbenchCss = `
.wbRoot { --wb-line: color-mix(in srgb, currentColor 15%, transparent); --wb-surface: color-mix(in srgb, currentColor 4%, transparent); --wb-accent: #496ddd; box-sizing: border-box; width: 100%; max-width: 1240px; padding: 24px clamp(12px,3vw,36px); margin: 0 auto; color: inherit; font: inherit; line-height: 1.65; overflow-wrap: anywhere; }
.wbRoot *, .wbRoot *::before, .wbRoot *::after { box-sizing: border-box; }
.wbRoot h1 { font-size: clamp(25px,3vw,34px); font-weight: 650; letter-spacing: -.04em; margin: 4px 0; }
.wbRoot h2 { font-size: 22px; margin: 8px 0 12px; letter-spacing: -.025em; }
.wbRoot h3 { font-size: 17px; margin: 24px 0 10px; }
.wbRoot p { margin: 10px 0 18px; }
.wbRoot small { display: block; font-size: 12px; opacity: .72; font-variant-numeric: tabular-nums; }
.wbRoot .wbHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.wbRoot .wbEyebrow { color: var(--wb-accent); font-size: 11px; font-weight: 650; letter-spacing: .15em; }
.wbRoot .wbHeader p, .wbRoot .wbScope { opacity: .72; font-size: 13px; }
.wbRoot button { border: 1px solid var(--wb-line); background: var(--wb-surface); color: inherit; font: inherit; font-size: 13px; line-height: 1.5; min-height: 36px; border-radius: 7px; padding: 7px 12px; cursor: pointer; }
.wbRoot button:hover:not(:disabled) { border-color: var(--wb-accent); }
.wbRoot button:disabled { opacity: .45; cursor: not-allowed; }
.wbRoot button:focus-visible, .wbRoot input:focus-visible, .wbRoot select:focus-visible, .wbRoot textarea:focus-visible, .wbRoot summary:focus-visible { outline: 2px solid var(--wb-accent); outline-offset: 3px; }
.wbRoot .wbTabs { display: flex; gap: 5px; flex-wrap: wrap; padding: 12px 0; border-top: 1px solid var(--wb-line); border-bottom: 1px solid var(--wb-line); margin-bottom: 18px; }
.wbRoot .wbTabs button { background: transparent; border-color: transparent; }
.wbRoot .wbTabs button[aria-pressed=true] { color: var(--wb-accent); background: color-mix(in srgb, var(--wb-accent) 10%, transparent); border-color: color-mix(in srgb, var(--wb-accent) 30%, transparent); font-weight: 650; }
.wbRoot .wbToolbar, .wbRoot .wbGrid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 14px; }
.wbRoot .wbField { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; margin: 8px 0; font-size: 12px; }
.wbRoot .wbField > span { opacity: .78; }
.wbRoot input:not([type=checkbox]):not([type=range]), .wbRoot select, .wbRoot textarea { width: 100%; min-width: 0; border: 1px solid var(--wb-line); border-radius: 6px; color: inherit; background: var(--wb-surface); padding: 9px 10px; font: inherit; font-size: 13px; }
.wbRoot select option { color: CanvasText; background: Canvas; }
.wbRoot input[type=checkbox] { align-self: flex-start; width: 18px; height: 18px; accent-color: var(--wb-accent); }
.wbRoot input[type=range] { width: 100%; accent-color: var(--wb-accent); }
.wbRoot textarea { resize: vertical; min-height: 120px; font-family: ui-monospace,monospace; }
.wbRoot .wbActions, .wbRoot .wbInline { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin: 12px 0; }
.wbRoot .wbInline .wbField { flex: 1 1 180px; }
.wbRoot .wbInline button { margin-bottom: 8px; }
.wbRoot section { padding: 18px 0; }
.wbRoot .wbMetricGrid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,175px),1fr)); gap: 12px; margin: 18px 0; }
.wbRoot .wbMetricGrid > div, .wbRoot .wbQuote { padding: 18px; border: 1px solid var(--wb-line); border-radius: 10px; background: var(--wb-surface); }
.wbRoot .wbMetricGrid strong { display: block; font-size: 25px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.4; margin-top: 6px; }
.wbRoot .wbQuote { display: flex; gap: 7px; flex-direction: column; margin: 12px 0; }
.wbRoot .wbQuote strong { font-size: 24px; font-variant-numeric: tabular-nums; }
.wbRoot .wbTable { max-width: 100%; overflow-x: auto; margin: 16px 0; border: 1px solid var(--wb-line); border-radius: 8px; }
.wbRoot table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.wbRoot th { padding: 11px 13px; background: var(--wb-surface); font-weight: 600; white-space: nowrap; }
.wbRoot td { padding: 12px 13px; border-top: 1px solid var(--wb-line); font-variant-numeric: tabular-nums; vertical-align: top; min-width: 70px; }
.wbRoot details { border: 1px solid var(--wb-line); border-radius: 7px; padding: 10px 13px; margin: 12px 0; }
.wbRoot summary { cursor: pointer; font-size: 13px; }
.wbRoot pre { max-width: 100%; overflow-x: auto; white-space: pre-wrap; font: 12px/1.7 ui-monospace,monospace; padding: 12px; background: var(--wb-surface); border-radius: 6px; }
.wbRoot .wbPill { display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 7px; border-radius: 4px; background: var(--wb-surface); margin-right: 6px; }
.wbRoot .wbError { border: 1px solid #d67255; border-radius: 8px; padding: 13px; margin-bottom: 14px; background: color-mix(in srgb,#d67255 7%,transparent); }
.wbRoot .wbWeekly { padding: 30px; border-radius: 12px; background: var(--wb-surface); border: 1px solid var(--wb-line); }
.wbRoot .wbWeekly h3 { font-size: clamp(28px,6vw,46px); margin: 16px 0; }
.wbRoot footer { border-top: 1px solid var(--wb-line); padding: 20px 0 0; margin-top: 28px; font-size: 12px; opacity: .65; }
@media(max-width:600px) { .wbRoot { padding: 16px 12px; } .wbRoot .wbHeader { flex-direction: column; gap: 6px; } .wbRoot .wbTabs { gap: 3px; } .wbRoot .wbTabs button { font-size: 12px; padding: 7px 9px; } .wbRoot td { max-width: 240px; } }
@media(prefers-reduced-motion:reduce) { .wbRoot * { scroll-behavior: auto; } }
`
