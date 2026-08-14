window.__ModuleLoader__.load({
	id: "dsh-token-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/analytics.ts
		/** Detached zero buckets for analytics calculations. */
		function zeroBuckets$1() {
			return {
				uncachedInputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0
			};
		}
		/** Add two disjoint Token bucket sets. */
		function addBuckets$1(left, right) {
			return {
				uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
				outputTokens: left.outputTokens + right.outputTokens,
				cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
				cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens
			};
		}
		/** Full request/response total without counting reasoning output twice. */
		function totalTokens$1(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
		}
		/** Stable UTC day key shared with the durable projection. */
		function dayKey$1(time) {
			return new Date(time).toISOString().slice(0, 10);
		}
		/** Build a newest-inclusive UTC date range. */
		function datesEndingOn(now, length) {
			const end = /* @__PURE__ */ new Date(`${dayKey$1(now)}T00:00:00.000Z`);
			end.setUTCDate(end.getUTCDate() - length + 1);
			const dates = [];
			for (let offset = 0; offset < length; offset += 1) {
				const date = new Date(end);
				date.setUTCDate(date.getUTCDate() + offset);
				dates.push(dayKey$1(date.getTime()));
			}
			return dates;
		}
		/** Aggregate a fixed sequence of UTC dates from a daily bucket lookup. */
		function aggregateDates(byDate, dates) {
			return dates.reduce((usage, date) => addBuckets$1(usage, byDate.get(date) ?? zeroBuckets$1()), zeroBuckets$1());
		}
		/** Derive period totals, comparison totals, activity, and the highest-use day. */
		function periodInsight(records, days, now = Date.now()) {
			const byDate = new Map(records.map((record) => [record.date, record.usage]));
			const currentDates = datesEndingOn(now, days);
			const previousDates = datesEndingOn(now - days * 864e5, days);
			const active = currentDates.map((date) => ({
				date,
				usage: { ...byDate.get(date) ?? zeroBuckets$1() }
			})).filter((record) => totalTokens$1(record.usage) > 0);
			const peak = active.reduce((highest, record) => highest === void 0 || totalTokens$1(record.usage) > totalTokens$1(highest.usage) ? record : highest, void 0);
			return {
				days,
				usage: aggregateDates(byDate, currentDates),
				previousUsage: aggregateDates(byDate, previousDates),
				activeDays: active.length,
				peak
			};
		}
		/** List sessions contributing usage to one UTC day, highest usage first. */
		function dailyContributors(sessions, date) {
			return sessions.flatMap((session) => {
				const record = session.days.find((day) => day.date === date);
				if (record === void 0 || totalTokens$1(record.usage) === 0) return [];
				return [{
					id: session.id,
					title: session.title,
					usage: { ...record.usage }
				}];
			}).sort((left, right) => totalTokens$1(right.usage) - totalTokens$1(left.usage) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
		}
		//#endregion
		//#region src/client/export.ts
		/** Detached copy of one bucket object. */
		function copyBuckets(usage) {
			return {
				uncachedInputTokens: usage.uncachedInputTokens,
				outputTokens: usage.outputTokens,
				cacheReadTokens: usage.cacheReadTokens,
				cacheWriteTokens: usage.cacheWriteTokens
			};
		}
		/** Stable aggregate-only document that never accepts session data. */
		function tokenUsageExport(source, generatedAt) {
			return {
				schema: "dsh-token-usage/export-v1",
				generatedAt,
				timezone: "UTC",
				totals: copyBuckets(source.usage),
				models: source.models.map((model) => ({
					provider: model.provider,
					model: model.model,
					assistantRequests: model.assistantRequests,
					compactionRequests: model.compactionRequests,
					usage: copyBuckets(model.usage)
				})).sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
				days: source.days.map((day) => ({
					date: day.date,
					usage: copyBuckets(day.usage)
				})).sort((left, right) => left.date.localeCompare(right.date))
			};
		}
		/** Serialize the versioned aggregate-only export document. */
		function tokenUsageJson(source, generatedAt) {
			return `${JSON.stringify(tokenUsageExport(source, generatedAt), null, 2)}\n`;
		}
		/** Prevent spreadsheet applications from interpreting an untrusted cell as a formula. */
		function spreadsheetText(value) {
			return /^[=+\-@]/.test(value) ? `'${value}` : value;
		}
		/** Escape one scalar value as a CSV cell. */
		function csvCell(value) {
			const text = typeof value === "string" ? spreadsheetText(value) : String(value);
			return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
		}
		/** Encode a complete CSV table with a stable CRLF delimiter. */
		function csv(rows) {
			return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
		}
		/** Export the daily aggregate buckets without session identity or conversation content. */
		function dailyUsageCsv(source) {
			return csv([[
				"date",
				"uncachedInputTokens",
				"outputTokens",
				"cacheReadTokens",
				"cacheWriteTokens",
				"inputTokens",
				"totalTokens"
			], ...source.days.slice().sort((left, right) => left.date.localeCompare(right.date)).map((day) => [
				day.date,
				day.usage.uncachedInputTokens,
				day.usage.outputTokens,
				day.usage.cacheReadTokens,
				day.usage.cacheWriteTokens,
				day.usage.uncachedInputTokens + day.usage.cacheReadTokens + day.usage.cacheWriteTokens,
				day.usage.uncachedInputTokens + day.usage.cacheReadTokens + day.usage.cacheWriteTokens + day.usage.outputTokens
			])]);
		}
		/** Export model aggregate buckets without session identity or conversation content. */
		function modelUsageCsv(source) {
			return csv([[
				"provider",
				"model",
				"assistantRequests",
				"compactionRequests",
				"uncachedInputTokens",
				"outputTokens",
				"cacheReadTokens",
				"cacheWriteTokens",
				"inputTokens",
				"totalTokens"
			], ...source.models.slice().sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)).map((model) => [
				model.provider,
				model.model,
				model.assistantRequests,
				model.compactionRequests,
				model.usage.uncachedInputTokens,
				model.usage.outputTokens,
				model.usage.cacheReadTokens,
				model.usage.cacheWriteTokens,
				model.usage.uncachedInputTokens + model.usage.cacheReadTokens + model.usage.cacheWriteTokens,
				model.usage.uncachedInputTokens + model.usage.cacheReadTokens + model.usage.cacheWriteTokens + model.usage.outputTokens
			])]);
		}
		/** Save text content through browser-native download primitives. */
		const browserDownload = { save(name, mime, content) {
			const url = URL.createObjectURL(new Blob([content], { type: mime }));
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = name;
			anchor.click();
			URL.revokeObjectURL(url);
		} };
		//#endregion
		//#region \0dsh-css:C:\Users\zhanglimin202307\Desktop\dsh\dsh-token-usage-agent\src\client\TokenUsageSection.module.css.mjs
		const css = "._3Hb-wa_section{width:100%;max-width:960px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:22px;display:flex}._3Hb-wa_header{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}._3Hb-wa_header h2,._3Hb-wa_header p,._3Hb-wa_block h3,._3Hb-wa_status{margin:0}._3Hb-wa_header h2{font-size:18px;font-weight:600;line-height:26px}._3Hb-wa_header p{max-width:720px;color:var(--dsw-alias-label-tertiary);margin-top:5px;font-size:13px;line-height:20px}._3Hb-wa_metrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;display:grid}._3Hb-wa_metric{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:7px;min-width:0;padding:13px 14px;display:flex}._3Hb-wa_metric span{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}._3Hb-wa_metric strong{font-variant-numeric:tabular-nums;text-overflow:ellipsis;font-size:20px;line-height:26px;overflow:hidden}._3Hb-wa_activity{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:10px;min-width:0;padding:14px;display:flex}._3Hb-wa_activityHead{justify-content:space-between;align-items:flex-end;gap:14px;display:flex}._3Hb-wa_activityHead h3,._3Hb-wa_activityHead p{margin:0}._3Hb-wa_activityHead h3{font-size:14px;font-weight:600;line-height:22px}._3Hb-wa_activityHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}._3Hb-wa_activityGrid{box-sizing:border-box;grid-template-rows:repeat(7,minmax(0,1fr));grid-template-columns:repeat(30,minmax(0,1fr));grid-auto-flow:column;gap:3px;width:100%;min-width:0;padding:2px;display:grid}._3Hb-wa_activityCell,._3Hb-wa_activityLegend i{background:var(--dsw-alias-bg-module-platform);border:0;border-radius:2px;flex:none;display:block}._3Hb-wa_activityCell{aspect-ratio:1;cursor:pointer;width:100%;min-width:0;padding:0}._3Hb-wa_activityCell:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._3Hb-wa_activityCell[data-selected=true]{box-shadow:0 0 0 2px var(--dsw-alias-label-primary)}._3Hb-wa_activityLegend i{width:10px;height:10px}._3Hb-wa_activityCell[data-future=true]{cursor:default;background:0 0}._3Hb-wa_activityCell[data-level=\"1\"],._3Hb-wa_activityLegend i[data-level=\"1\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, var(--dsw-alias-bg-module-platform))}._3Hb-wa_activityCell[data-level=\"2\"],._3Hb-wa_activityLegend i[data-level=\"2\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 42%, var(--dsw-alias-bg-module-platform))}._3Hb-wa_activityCell[data-level=\"3\"],._3Hb-wa_activityLegend i[data-level=\"3\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 64%, var(--dsw-alias-bg-module-platform))}._3Hb-wa_activityCell[data-level=\"4\"],._3Hb-wa_activityLegend i[data-level=\"4\"]{background:var(--dsw-alias-state-business-primary)}._3Hb-wa_activityLegend{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:4px;font-size:10px;line-height:14px;display:flex}._3Hb-wa_insights,._3Hb-wa_budget,._3Hb-wa_dayDrilldown{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}._3Hb-wa_insights h3,._3Hb-wa_budget h3,._3Hb-wa_dayDrilldown h3,._3Hb-wa_insights p,._3Hb-wa_budget p,._3Hb-wa_dayDrilldown p{margin:0}._3Hb-wa_insights h3,._3Hb-wa_budget h3,._3Hb-wa_dayDrilldown h3{font-size:14px;font-weight:600;line-height:22px}._3Hb-wa_insights ._3Hb-wa_blockHead p,._3Hb-wa_budget ._3Hb-wa_blockHead p,._3Hb-wa_dayDrilldown ._3Hb-wa_blockHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}._3Hb-wa_detailMetrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;display:grid}._3Hb-wa_rangeTabs,._3Hb-wa_exportControls{flex-wrap:wrap;align-items:center;gap:6px;display:flex}._3Hb-wa_rangeTabs button,._3Hb-wa_exportControls button,._3Hb-wa_quietButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-height:30px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}._3Hb-wa_rangeTabs button[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-business-primary)}._3Hb-wa_rangeTabs button:focus-visible,._3Hb-wa_exportControls button:focus-visible,._3Hb-wa_quietButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._3Hb-wa_exportControls{justify-content:flex-end}._3Hb-wa_exportControls>span{color:var(--dsw-alias-label-tertiary);font-size:11px}._3Hb-wa_insightNote{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}._3Hb-wa_budgetInput{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:7px;font-size:11px;display:flex}._3Hb-wa_budgetInput input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:128px;height:30px;color:var(--dsw-alias-label-primary);font:inherit;font-variant-numeric:tabular-nums;border-radius:7px;outline:none;padding:0 8px;font-size:12px}._3Hb-wa_budgetInput input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}._3Hb-wa_budgetProgress{align-items:center;gap:10px;display:flex}._3Hb-wa_budgetProgress progress{width:min(320px,55%);height:8px;accent-color:var(--dsw-alias-state-business-primary)}._3Hb-wa_budgetProgress strong{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:12px}._3Hb-wa_budgetWarning{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}._3Hb-wa_contributors{flex-direction:column;gap:7px;display:flex}._3Hb-wa_contributors>strong{color:var(--dsw-alias-label-secondary);font-size:12px}._3Hb-wa_contributors ol{gap:5px;margin:0;padding:0;list-style:none;display:grid}._3Hb-wa_contributors li{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:7px;justify-content:space-between;align-items:center;gap:12px;padding:7px 9px;font-size:12px;display:flex}._3Hb-wa_contributors li>span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._3Hb-wa_block{flex-direction:column;gap:10px;min-width:0;display:flex}._3Hb-wa_block h3{font-size:14px;font-weight:600;line-height:22px}._3Hb-wa_blockHead{justify-content:space-between;align-items:center;gap:16px;display:flex}._3Hb-wa_blockHead input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:min(280px,45%);height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 11px;font-size:12px}._3Hb-wa_blockHead input::placeholder{color:var(--dsw-alias-label-tertiary)}._3Hb-wa_blockHead input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}._3Hb-wa_tableWrap{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;min-width:0;overflow:auto}._3Hb-wa_tableWrap table{border-collapse:collapse;width:100%;min-width:0;font-size:12px;line-height:18px}._3Hb-wa_tableWrap ._3Hb-wa_modelTable{table-layout:fixed;min-width:580px}._3Hb-wa_tableWrap ._3Hb-wa_sessionTable{min-width:780px}._3Hb-wa_modelTable th:first-child,._3Hb-wa_modelTable td:first-child{width:30%}._3Hb-wa_modelTable th:nth-child(2),._3Hb-wa_modelTable td:nth-child(2){width:18%}._3Hb-wa_tableWrap th,._3Hb-wa_tableWrap td{border-bottom:1px solid var(--dsw-alias-border-l1);text-align:right;vertical-align:middle;white-space:nowrap;padding:10px 12px}._3Hb-wa_tableWrap th{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500}._3Hb-wa_tableWrap th:first-child,._3Hb-wa_tableWrap td:first-child{text-align:left;max-width:270px}._3Hb-wa_tableWrap tbody tr:last-child td{border-bottom:0}._3Hb-wa_tableWrap tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}._3Hb-wa_tableWrap td{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}._3Hb-wa_tableWrap td strong,._3Hb-wa_tableWrap td span{text-overflow:ellipsis;max-width:260px;display:block;overflow:hidden}._3Hb-wa_tableWrap td strong{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}._3Hb-wa_tableWrap td span{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}._3Hb-wa_tableWrap td ._3Hb-wa_tokenValue{max-width:none;color:inherit;font-size:inherit;line-height:inherit;display:inline}._3Hb-wa_tableWrap td ._3Hb-wa_cacheDetail{margin-top:2px}._3Hb-wa_analysisEmpty,._3Hb-wa_analysisError,._3Hb-wa_analysisPanel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}._3Hb-wa_analysisEmpty{border-style:dashed}._3Hb-wa_analysisError{border-color:var(--dsw-alias-state-error-primary)}._3Hb-wa_analysisEmpty h3,._3Hb-wa_analysisEmpty p,._3Hb-wa_analysisError h3,._3Hb-wa_analysisError p,._3Hb-wa_analysisPanel h3,._3Hb-wa_analysisPanel p{margin:0}._3Hb-wa_analysisEmpty h3,._3Hb-wa_analysisError h3,._3Hb-wa_analysisPanel h3{font-size:14px;font-weight:600;line-height:22px}._3Hb-wa_analysisEmpty p,._3Hb-wa_analysisError p,._3Hb-wa_analysisPanel ._3Hb-wa_blockHead p,._3Hb-wa_analysisPrivacy{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}._3Hb-wa_analysisError p,._3Hb-wa_analysisWarning{color:var(--dsw-alias-state-error-primary)}._3Hb-wa_analysisCost{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;padding:5px 9px;font-size:11px}._3Hb-wa_analysisMetrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;display:grid}._3Hb-wa_analysisReport{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform);max-height:640px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;border-radius:10px;margin:0;padding:14px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:19px;overflow:auto}._3Hb-wa_analysisWarning{font-size:11px;line-height:18px}._3Hb-wa_analysisButton{border:1px solid var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));min-height:28px;color:var(--dsw-alias-state-business-primary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}._3Hb-wa_analysisButton:disabled{cursor:wait;opacity:.65}._3Hb-wa_analysisButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._3Hb-wa_analysisModelSelect{min-width:180px;color:var(--dsw-alias-label-tertiary);gap:4px;font-size:11px;line-height:16px;display:grid}._3Hb-wa_analysisModelSelect select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:5px 7px;font-size:12px}._3Hb-wa_analysisModelSelect select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}._3Hb-wa_analysisScope{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}._3Hb-wa_analysisErrorText{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:18px}._3Hb-wa_status{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);border-radius:10px;padding:16px;font-size:13px;line-height:20px}@media (width<=860px){._3Hb-wa_metrics{grid-template-columns:repeat(3,minmax(0,1fr))}._3Hb-wa_detailMetrics,._3Hb-wa_analysisMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (width<=580px){._3Hb-wa_metrics,._3Hb-wa_detailMetrics,._3Hb-wa_analysisMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}._3Hb-wa_header,._3Hb-wa_activityHead,._3Hb-wa_blockHead{flex-direction:column;align-items:stretch;gap:8px}._3Hb-wa_exportControls{justify-content:flex-start}._3Hb-wa_budgetInput{justify-content:space-between}._3Hb-wa_budgetProgress{flex-direction:column;align-items:flex-start}._3Hb-wa_budgetProgress progress,._3Hb-wa_blockHead input{width:100%}}";
		const tagId = "dsh-token-usage/TokenUsageSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-token-usage";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TokenUsageSection_module_css_default = {
			"analysisError": "_3Hb-wa_analysisError",
			"block": "_3Hb-wa_block",
			"budgetWarning": "_3Hb-wa_budgetWarning",
			"blockHead": "_3Hb-wa_blockHead",
			"analysisButton": "_3Hb-wa_analysisButton",
			"header": "_3Hb-wa_header",
			"budgetProgress": "_3Hb-wa_budgetProgress",
			"activityGrid": "_3Hb-wa_activityGrid",
			"tableWrap": "_3Hb-wa_tableWrap",
			"analysisWarning": "_3Hb-wa_analysisWarning",
			"tokenValue": "_3Hb-wa_tokenValue",
			"analysisPrivacy": "_3Hb-wa_analysisPrivacy",
			"analysisCost": "_3Hb-wa_analysisCost",
			"quietButton": "_3Hb-wa_quietButton",
			"modelTable": "_3Hb-wa_modelTable",
			"detailMetrics": "_3Hb-wa_detailMetrics",
			"analysisEmpty": "_3Hb-wa_analysisEmpty",
			"analysisModelSelect": "_3Hb-wa_analysisModelSelect",
			"dayDrilldown": "_3Hb-wa_dayDrilldown",
			"analysisPanel": "_3Hb-wa_analysisPanel",
			"contributors": "_3Hb-wa_contributors",
			"activityLegend": "_3Hb-wa_activityLegend",
			"budget": "_3Hb-wa_budget",
			"analysisMetrics": "_3Hb-wa_analysisMetrics",
			"activityHead": "_3Hb-wa_activityHead",
			"insights": "_3Hb-wa_insights",
			"cacheDetail": "_3Hb-wa_cacheDetail",
			"section": "_3Hb-wa_section",
			"activityCell": "_3Hb-wa_activityCell",
			"metrics": "_3Hb-wa_metrics",
			"analysisReport": "_3Hb-wa_analysisReport",
			"budgetInput": "_3Hb-wa_budgetInput",
			"analysisErrorText": "_3Hb-wa_analysisErrorText",
			"exportControls": "_3Hb-wa_exportControls",
			"activity": "_3Hb-wa_activity",
			"sessionTable": "_3Hb-wa_sessionTable",
			"insightNote": "_3Hb-wa_insightNote",
			"metric": "_3Hb-wa_metric",
			"rangeTabs": "_3Hb-wa_rangeTabs",
			"status": "_3Hb-wa_status",
			"analysisScope": "_3Hb-wa_analysisScope"
		};
		//#endregion
		//#region src/client/TokenUsageSection.tsx
		/** Detached zero buckets for dashboard folds. */
		function zeroBuckets() {
			return {
				uncachedInputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0
			};
		}
		/** Add four disjoint token buckets. */
		function addBuckets(left, right) {
			return {
				uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
				outputTokens: left.outputTokens + right.outputTokens,
				cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
				cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens
			};
		}
		/** Stable UTC day key used by durable Host records and legacy fallbacks. */
		function dayKey(time) {
			return new Date(time).toISOString().slice(0, 10);
		}
		/** Prompt-side total across uncached input and cache traffic. */
		function inputTokens(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Complete request/response total without double-counting reasoning output. */
		function totalTokens(usage) {
			return inputTokens(usage) + usage.outputTokens;
		}
		/** Locale-aware exact integer formatting. */
		function formatTokens(value) {
			return new Intl.NumberFormat().format(value);
		}
		/** Compact a token count with a stable K/M/B suffix for dense dashboard cells. */
		function formatCompactTokens(value) {
			const unit = [
				{
					divisor: 1e9,
					suffix: "B"
				},
				{
					divisor: 1e6,
					suffix: "M"
				},
				{
					divisor: 1e3,
					suffix: "K"
				}
			].find((candidate) => value >= candidate.divisor);
			if (unit === void 0) return formatTokens(value);
			return `${new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(value / unit.divisor)}${unit.suffix}`;
		}
		/** Format deterministic tool latency for one compact metric card. */
		function formatLatency(value) {
			if (value < 1e3) return `${Math.round(value)}ms`;
			return `${new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(value / 1e3)}s`;
		}
		/** Whether a dashboard-only row contains usage whose model route is unavailable. */
		function isUnattributed(model) {
			return model.provider === "" && model.model === "";
		}
		/** Stable provider/model identity for React lists and aggregation. */
		function modelKey(model) {
			return JSON.stringify([model.provider, model.model]);
		}
		/** Compact route label retained in the session table. */
		function routeLabel(model) {
			return `${model.provider}/${model.model}`;
		}
		/** Attribute a built-in projection fallback to an explicit dashboard remainder row. */
		function unattributedModel(usage) {
			return {
				provider: "",
				model: "",
				assistantRequests: 0,
				compactionRequests: 0,
				usage: { ...usage }
			};
		}
		/** Built-in projection fallback for a cache created before this plugin was installed. */
		function fallbackUsage(value) {
			return {
				uncachedInputTokens: value.uncachedInputTokens,
				outputTokens: value.outputTokens,
				cacheReadTokens: value.cacheReadTokens,
				cacheWriteTokens: value.cacheWriteTokens
			};
		}
		/** One session summary projected into a usage row, or null when it has no usage. */
		function sessionRow(summary) {
			const recorded = summary.projectionValues?.tokenUsageRecorder;
			const builtIn = summary.projectionValues?.tokenUsage;
			const usage = recorded?.usage ?? (builtIn === void 0 ? void 0 : fallbackUsage(builtIn));
			if (usage === void 0 || totalTokens(usage) === 0) return null;
			return {
				id: String(summary.id),
				title: summary.displayTitle,
				updatedAt: summary.updatedAt,
				usage,
				models: recorded?.models ?? [unattributedModel(usage)],
				days: recorded?.days ?? [{
					date: dayKey(summary.updatedAt),
					usage
				}]
			};
		}
		/** Aggregate session summaries into totals and provider/model records. */
		function aggregateUsage(summaries) {
			const sessions = [];
			const models = /* @__PURE__ */ new Map();
			const days = /* @__PURE__ */ new Map();
			let usage = zeroBuckets();
			for (const summary of summaries) {
				const row = sessionRow(summary);
				if (row === null) continue;
				sessions.push(row);
				usage = addBuckets(usage, row.usage);
				for (const day of row.days) days.set(day.date, addBuckets(days.get(day.date) ?? zeroBuckets(), day.usage));
				for (const model of row.models) {
					const key = modelKey(model);
					const current = models.get(key);
					models.set(key, current === void 0 ? {
						...model,
						usage: { ...model.usage }
					} : {
						...current,
						assistantRequests: current.assistantRequests + model.assistantRequests,
						compactionRequests: current.compactionRequests + model.compactionRequests,
						usage: addBuckets(current.usage, model.usage)
					});
				}
			}
			sessions.sort((left, right) => right.updatedAt - left.updatedAt);
			return {
				usage,
				sessions,
				models: [...models.values()].sort((left, right) => totalTokens(right.usage) - totalTokens(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
				days: [...days.entries()].map(([date, usage]) => ({
					date,
					usage
				})).sort((left, right) => left.date.localeCompare(right.date))
			};
		}
		/** Return only detached aggregate buckets, route records, and UTC dates for AI usage analysis. */
		function usageAnalysisInput(data) {
			return {
				usage: { ...data.usage },
				models: data.models.map((model) => ({
					provider: model.provider,
					model: model.model,
					assistantRequests: model.assistantRequests,
					compactionRequests: model.compactionRequests,
					usage: { ...model.usage }
				})),
				days: data.days.map((day) => ({
					date: day.date,
					usage: { ...day.usage }
				}))
			};
		}
		/** Render a summary metric card with exact token counts available on hover. */
		function Metric({ label, value }) {
			const display = typeof value === "number" ? formatCompactTokens(value) : value;
			const exact = typeof value === "number" ? formatTokens(value) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.metric,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
					...exact === void 0 ? {} : { title: exact },
					children: display
				})]
			});
		}
		/** Render a compact table count with an exact-count tooltip. */
		function TokenValue({ value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: TokenUsageSection_module_css_default.tokenValue,
				title: formatTokens(value),
				children: formatCompactTokens(value)
			});
		}
		/** Build exactly 30 Monday-first calendar weeks, including blank future days this week. */
		function activityCalendar(days, now = Date.now()) {
			const byDate = new Map(days.map((day) => [day.date, day.usage]));
			const today = dayKey(now);
			const end = /* @__PURE__ */ new Date(`${today}T00:00:00.000Z`);
			const start = new Date(end);
			start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7 - 203);
			const dates = [];
			for (const cursor = new Date(start); dates.length < 210; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(dayKey(cursor.getTime()));
			const maximum = Math.max(0, ...dates.filter((date) => date <= today).map((date) => totalTokens(byDate.get(date) ?? zeroBuckets())));
			return dates.map((date) => {
				const future = date > today;
				const usage = byDate.get(date) ?? zeroBuckets();
				const tokens = future ? 0 : totalTokens(usage);
				return {
					date,
					usage,
					tokens,
					level: tokens === 0 || maximum === 0 ? 0 : Math.ceil(tokens / maximum * 4),
					future
				};
			});
		}
		/** Render a GitHub-style calendar heatmap of daily Token activity. */
		function ActivityHeatmap({ days, selectedDate, onSelectDate, t }) {
			const calendar = (0, react.useMemo)(() => activityCalendar(days), [days]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.activity,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: TokenUsageSection_module_css_default.activityHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("activity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("activityIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.activityLegend,
						"aria-label": t("activity"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("less") }),
							[
								0,
								1,
								2,
								3,
								4
							].map((level) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { "data-level": level }, level)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("more") })
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: TokenUsageSection_module_css_default.activityGrid,
					role: "grid",
					"aria-label": t("activity"),
					children: calendar.map((day) => {
						const details = day.future ? void 0 : t("activityTooltip", {
							date: day.date,
							total: formatTokens(day.tokens),
							input: formatTokens(inputTokens(day.usage)),
							output: formatTokens(day.usage.outputTokens),
							cacheRead: formatTokens(day.usage.cacheReadTokens),
							cacheWrite: formatTokens(day.usage.cacheWriteTokens)
						});
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: TokenUsageSection_module_css_default.activityCell,
							type: "button",
							role: "gridcell",
							"data-level": day.level,
							"data-future": day.future ? "true" : void 0,
							"data-selected": selectedDate === day.date ? "true" : void 0,
							disabled: day.future,
							"aria-selected": selectedDate === day.date,
							...details === void 0 ? {} : {
								title: details,
								"aria-label": details
							},
							onClick: () => {
								onSelectDate(day.date);
							}
						}, day.date);
					})
				})]
			});
		}
		/** Render a selected day's exact totals and contributing sessions. */
		function DayDrilldown({ day, sessions, t, onClose }) {
			const contributors = (0, react.useMemo)(() => dailyContributors(sessions, day.date), [day.date, sessions]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.dayDrilldown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("dayDetails", { date: day.date }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("dayDetailsIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: TokenUsageSection_module_css_default.quietButton,
							type: "button",
							onClick: onClose,
							children: t("closeDayDetails")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.detailMetrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("total"),
								value: totalTokens(day.usage)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("input"),
								value: inputTokens(day.usage)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("output"),
								value: day.usage.outputTokens
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("cacheHit"),
								value: inputTokens(day.usage) === 0 ? "—" : `${Math.round(day.usage.cacheReadTokens / inputTokens(day.usage) * 100)}%`
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.contributors,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("contributors", { count: contributors.length }) }), contributors.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noContributors") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", { children: contributors.slice(0, 5).map((contributor) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							title: contributor.id,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: contributor.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens(contributor.usage) })]
						}, contributor.id)) })]
					})
				]
			});
		}
		/** Render period-aware trend and activity summaries from daily records. */
		function PeriodInsights({ days, range, onRangeChange, t }) {
			const insight = (0, react.useMemo)(() => periodInsight(days, range), [days, range]);
			const current = totalTokens(insight.usage);
			const previous = totalTokens(insight.previousUsage);
			const delta = previous === 0 ? void 0 : Math.round((current - previous) / previous * 100);
			const peak = insight.peak;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.insights,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("trend") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("trendIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: TokenUsageSection_module_css_default.rangeTabs,
							"aria-label": t("trend"),
							children: [
								7,
								30,
								90
							].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-pressed": range === value,
								onClick: () => {
									onRangeChange(value);
								},
								children: t("rangeDays", { count: value })
							}, value))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.detailMetrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("periodTokens", { count: range }),
								value: current
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("periodChange"),
								value: delta === void 0 ? "—" : `${delta > 0 ? "+" : ""}${delta}%`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("activeDays"),
								value: `${insight.activeDays}/${range}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("peakDay"),
								value: peak === void 0 ? "—" : formatCompactTokens(totalTokens(peak.usage))
							})
						]
					}),
					peak === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("peakDayNote", {
							date: peak.date,
							total: formatTokens(totalTokens(peak.usage))
						})
					})
				]
			});
		}
		/** Render the persistent trailing-30-day budget setting and progress. */
		function BudgetPanel({ days, snapshot, setBudget, t }) {
			const used = totalTokens((0, react.useMemo)(() => periodInsight(days, 30), [days]).usage);
			const budget = snapshot.budget;
			const enabled = budget > 0;
			const ratio = enabled ? used / budget : 0;
			const save = (value) => {
				const next = value.trim() === "" ? 0 : Number(value);
				if (!Number.isSafeInteger(next) || next < 0) return;
				setBudget(next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.budget,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: TokenUsageSection_module_css_default.blockHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("budget") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("budgetIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: TokenUsageSection_module_css_default.budgetInput,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("budgetInput") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "number",
							inputMode: "numeric",
							min: "0",
							step: "1",
							defaultValue: enabled ? String(budget) : "",
							placeholder: "0",
							"aria-label": t("budgetInput"),
							disabled: snapshot.status !== "ready",
							onBlur: (event) => {
								save(event.currentTarget.value);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter") event.currentTarget.blur();
							}
						}, `${snapshot.status}:${budget}`)]
					})]
				}), snapshot.status !== "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: TokenUsageSection_module_css_default.insightNote,
					children: t("budgetUnavailable")
				}) : !enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: TokenUsageSection_module_css_default.insightNote,
					children: t("budgetDisabled")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: TokenUsageSection_module_css_default.budgetProgress,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
						value: Math.min(used, budget),
						max: budget
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("budgetProgress", {
						used: formatCompactTokens(used),
						budget: formatCompactTokens(budget),
						percent: Math.round(ratio * 100)
					}) })]
				}), ratio > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: TokenUsageSection_module_css_default.budgetWarning,
					children: t("budgetExceeded", { excess: formatCompactTokens(used - budget) })
				}) : null] })]
			});
		}
		/** Render export controls that only receive aggregate, privacy-safe dashboard data. */
		function ExportControls({ data, download, t }) {
			const save = (kind) => {
				const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
				const date = generatedAt.slice(0, 10);
				switch (kind) {
					case "json":
						download.save(`dsh-token-usage-${date}.json`, "application/json;charset=utf-8", tokenUsageJson(data, generatedAt));
						return;
					case "daily":
						download.save(`dsh-token-usage-daily-${date}.csv`, "text/csv;charset=utf-8", dailyUsageCsv(data));
						return;
					case "models": download.save(`dsh-token-usage-models-${date}.csv`, "text/csv;charset=utf-8", modelUsageCsv(data));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.exportControls,
				"aria-label": t("export"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("export") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							save("json");
						},
						children: t("exportJson")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							save("daily");
						},
						children: t("exportDaily")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							save("models");
						},
						children: t("exportModels")
					})
				]
			});
		}
		/** Encode one provider/model route for the native selector without displaying an opaque id. */
		function analysisModelKey(model) {
			return `${model.provider}\u0000${model.model}`;
		}
		/** Render a manual integrated-model picker and one aggregate-only Token optimization report. */
		function UsageAnalysisPanel({ catalog, selectedModel, state, onSelectModel, onAnalyze, t }) {
			if (catalog.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsLoading") })]
			});
			if (catalog.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisError,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsFailed", { message: catalog.message }) })]
			});
			if (catalog.value.models.length === 0 || selectedModel === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsUnavailable") })]
			});
			const report = state.status === "ready" ? state.value : void 0;
			const analysisTokens = report?.analysisUsage === void 0 ? void 0 : totalTokens(report.analysisUsage);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisPanel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("usageAnalysisIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: TokenUsageSection_module_css_default.analysisModelSelect,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("analysisModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								value: analysisModelKey(selectedModel),
								"aria-label": t("analysisModel"),
								disabled: state.status === "loading",
								onChange: (event) => {
									const model = catalog.value.models.find((entry) => analysisModelKey(entry) === event.currentTarget.value);
									if (model !== void 0) onSelectModel({
										provider: model.provider,
										model: model.model
									});
								},
								children: catalog.value.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
									value: analysisModelKey(model),
									children: [
										model.providerName,
										" · ",
										model.modelName
									]
								}, analysisModelKey(model)))
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisPrivacy,
						children: t("usageAnalysisPrivacy")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisScope,
						children: t("analysisModelScope")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: TokenUsageSection_module_css_default.analysisButton,
						type: "button",
						disabled: state.status === "loading",
						onClick: onAnalyze,
						children: state.status === "loading" ? t("usageAnalyzing") : t("analyzeUsage")
					}),
					state.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisErrorText,
						children: t("usageAnalysisFailed", { message: state.message })
					}) : null,
					report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysisReport") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisMeta", {
							provider: report.model.provider,
							model: report.model.model,
							time: new Intl.DateTimeFormat(void 0, {
								dateStyle: "medium",
								timeStyle: "short"
							}).format(new Date(report.generatedAt))
						}) })] }), analysisTokens === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TokenUsageSection_module_css_default.analysisCost,
							children: t("analysisCost", { total: formatTokens(analysisTokens) })
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: TokenUsageSection_module_css_default.analysisReport,
						children: report.report
					})] })
				]
			});
		}
		/** Render one ephemeral model-generated review and its deterministic measurements. */
		function TrajectoryAnalysisPanel({ state, t }) {
			if (state.status === "idle") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("trajectoryAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("trajectoryAnalysisIntro") })]
			});
			if (state.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("trajectoryAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisRunning", { title: state.title }) })]
			});
			if (state.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisError,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("trajectoryAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisFailed", { message: state.message }) })]
			});
			const analysis = state.value;
			const metrics = analysis.metrics;
			const analysisTokens = analysis.analysisUsage === void 0 ? void 0 : totalTokens(analysis.analysisUsage);
			const largestSpan = metrics.largestSpanId === void 0 ? void 0 : metrics.spans.find((span) => span.id === metrics.largestSpanId);
			const reconciliationDelta = Object.values(metrics.reconciliation.delta).reduce((total, value) => total + Math.abs(value), 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisPanel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("analysisFor", { title: state.title }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisMeta", {
							provider: analysis.model.provider,
							model: analysis.model.model,
							time: new Intl.DateTimeFormat(void 0, {
								dateStyle: "medium",
								timeStyle: "short"
							}).format(new Date(analysis.generatedAt))
						}) })] }), analysisTokens === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TokenUsageSection_module_css_default.analysisCost,
							children: t("analysisCost", { total: formatTokens(analysisTokens) })
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.analysisMetrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisTurns"),
								value: `${metrics.turnCount} / ${metrics.openTurns}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisTools"),
								value: `${metrics.toolCalls} / ${metrics.toolResults} / ${metrics.toolErrors}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisIntegrity"),
								value: `${metrics.orphanToolCalls + metrics.orphanToolResults} / ${metrics.openSteps}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisToolLatency"),
								value: metrics.averageToolLatencyMs === 0 ? "—" : `${formatLatency(metrics.averageToolLatencyMs)} / ${formatLatency(metrics.maxToolLatencyMs)}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisRetries"),
								value: metrics.retries
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisRetryTokens"),
								value: totalTokens(metrics.retryUsage)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisLargest"),
								value: largestSpan === void 0 ? "—" : `${largestSpan.id} · ${formatTokens(totalTokens(largestSpan.usage))}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisReconciliation"),
								value: metrics.reconciliation.status === "matched" ? t("analysisMatched") : t("analysisMismatch", { count: formatTokens(reconciliationDelta) })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisRate"),
								value: metrics.activeTokensPerMinute === 0 ? "—" : `${formatCompactTokens(metrics.activeTokensPerMinute)}/min`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisApprovals"),
								value: `${metrics.approvalsAsked} / ${metrics.approvalsRejected}`
							})
						]
					}),
					analysis.truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisWarning,
						children: t("analysisTruncated")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: TokenUsageSection_module_css_default.analysisReport,
						children: analysis.report
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisPrivacy,
						children: t("analysisPrivacy")
					})
				]
			});
		}
		/** Render durable Token usage across all listed sessions. */
		function TokenUsageSection({ useSessions, useBudget, setBudget, download, listAnalysisModels, analyzeTokenUsage, analyzeTrajectory, t }) {
			const phase = useSessions((state) => state.phase);
			const ids = useSessions((state) => state.ids);
			const byId = useSessions((state) => state.byId);
			const budget = useBudget((snapshot) => snapshot);
			const [query, setQuery] = (0, react.useState)("");
			const [range, setRange] = (0, react.useState)(30);
			const [selectedDate, setSelectedDate] = (0, react.useState)();
			const [analysis, setAnalysis] = (0, react.useState)({ status: "idle" });
			const [analysisCatalog, setAnalysisCatalog] = (0, react.useState)({ status: "loading" });
			const [selectedAnalysisModel, setSelectedAnalysisModel] = (0, react.useState)();
			const [usageReport, setUsageReport] = (0, react.useState)({ status: "idle" });
			const trajectoryController = (0, react.useRef)();
			const usageController = (0, react.useRef)();
			(0, react.useEffect)(() => () => {
				trajectoryController.current?.abort();
				usageController.current?.abort();
			}, []);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				listAnalysisModels(controller.signal).then((catalog) => {
					if (controller.signal.aborted) return;
					setAnalysisCatalog({
						status: "ready",
						value: catalog
					});
					setSelectedAnalysisModel((current) => current !== void 0 && catalog.models.some((model) => model.provider === current.provider && model.model === current.model) ? current : catalog.default ?? catalog.models[0]);
				}, (error) => {
					if (!controller.signal.aborted) setAnalysisCatalog({
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				});
				return () => {
					controller.abort();
				};
			}, []);
			const runAnalysis = (row) => {
				if (selectedAnalysisModel === void 0) return;
				trajectoryController.current?.abort();
				const controller = new AbortController();
				trajectoryController.current = controller;
				setAnalysis({
					status: "loading",
					sessionId: row.id,
					title: row.title
				});
				analyzeTrajectory(row.id, selectedAnalysisModel, controller.signal).then((value) => {
					if (trajectoryController.current === controller && !controller.signal.aborted) setAnalysis({
						status: "ready",
						title: row.title,
						value
					});
				}, (error) => {
					if (trajectoryController.current === controller && !controller.signal.aborted) setAnalysis({
						status: "error",
						sessionId: row.id,
						title: row.title,
						message: error instanceof Error ? error.message : String(error)
					});
				});
			};
			const data = (0, react.useMemo)(() => aggregateUsage(ids.map((id) => byId[id]).filter((value) => value !== void 0)), [byId, ids]);
			const runUsageAnalysis = () => {
				if (selectedAnalysisModel === void 0) return;
				usageController.current?.abort();
				const controller = new AbortController();
				usageController.current = controller;
				setUsageReport({ status: "loading" });
				analyzeTokenUsage(usageAnalysisInput(data), selectedAnalysisModel, controller.signal).then((value) => {
					if (usageController.current === controller && !controller.signal.aborted) setUsageReport({
						status: "ready",
						value
					});
				}, (error) => {
					if (usageController.current === controller && !controller.signal.aborted) setUsageReport({
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				});
			};
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const filteredSessions = (0, react.useMemo)(() => data.sessions.filter((row) => {
				if (normalizedQuery.length === 0) return true;
				return row.title.toLocaleLowerCase().includes(normalizedQuery) || row.id.toLocaleLowerCase().includes(normalizedQuery) || row.models.some((model) => routeLabel(model).toLocaleLowerCase().includes(normalizedQuery));
			}), [data.sessions, normalizedQuery]);
			const selectedDay = (0, react.useMemo)(() => selectedDate === void 0 ? void 0 : data.days.find((day) => day.date === selectedDate), [data.days, selectedDate]);
			const billedInput = inputTokens(data.usage);
			const cacheHit = billedInput === 0 ? "—" : `${Math.round(data.usage.cacheReadTokens / billedInput * 100)}%`;
			if (phase !== "ready" && ids.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: TokenUsageSection_module_css_default.status,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: TokenUsageSection_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: TokenUsageSection_module_css_default.header,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("intro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExportControls, {
						data,
						download,
						t
					})]
				}), data.sessions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: TokenUsageSection_module_css_default.status,
					children: t("empty")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.metrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("totalTokens"),
								value: totalTokens(data.usage)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("inputTokens"),
								value: billedInput
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("outputTokens"),
								value: data.usage.outputTokens
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("cacheHit"),
								value: cacheHit
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("sessions"),
								value: data.sessions.length
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PeriodInsights, {
						days: data.days,
						range,
						onRangeChange: setRange,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BudgetPanel, {
						days: data.days,
						snapshot: budget,
						setBudget,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageAnalysisPanel, {
						catalog: analysisCatalog,
						selectedModel: selectedAnalysisModel,
						state: usageReport,
						onSelectModel: setSelectedAnalysisModel,
						onAnalyze: runUsageAnalysis,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityHeatmap, {
						days: data.days,
						selectedDate,
						onSelectDate: setSelectedDate,
						t
					}),
					selectedDay === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DayDrilldown, {
						day: selectedDay,
						sessions: data.sessions,
						t,
						onClose: () => {
							setSelectedDate(void 0);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.block,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("modelBreakdown") }), data.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: TokenUsageSection_module_css_default.status,
							children: t("unknownRoute")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: TokenUsageSection_module_css_default.tableWrap,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
								className: TokenUsageSection_module_css_default.modelTable,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("providerModel") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("calls") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("total") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("input") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("output") })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: data.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: isUnattributed(model) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("unattributed") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: model.model }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.provider })] }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: isUnattributed(model) ? "—" : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("assistantCalls", { count: model.assistantRequests }) }), model.compactionRequests > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("compactionCalls", { count: model.compactionRequests }) }) : null] }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens(model.usage) }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: inputTokens(model.usage) }), model.usage.cacheReadTokens > 0 || model.usage.cacheWriteTokens > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: TokenUsageSection_module_css_default.cacheDetail,
										title: t("cacheDetail", {
											read: formatTokens(model.usage.cacheReadTokens),
											write: formatTokens(model.usage.cacheWriteTokens)
										}),
										children: t("cacheDetail", {
											read: formatCompactTokens(model.usage.cacheReadTokens),
											write: formatCompactTokens(model.usage.cacheWriteTokens)
										})
									}) : null] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: model.usage.outputTokens }) })
								] }, modelKey(model))) })]
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrajectoryAnalysisPanel, {
						state: analysis,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.block,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: TokenUsageSection_module_css_default.blockHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("recentSessions") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "search",
								value: query,
								placeholder: t("search"),
								"aria-label": t("search"),
								onChange: (event) => {
									setQuery(event.currentTarget.value);
								}
							})]
						}), filteredSessions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: TokenUsageSection_module_css_default.status,
							children: t("emptySearch")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: TokenUsageSection_module_css_default.tableWrap,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
								className: TokenUsageSection_module_css_default.sessionTable,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("session") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("updated") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("routes") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("total") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("input") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("output") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("analysis") })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: filteredSessions.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										title: row.id,
										children: row.title
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: row.id })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: new Intl.DateTimeFormat(void 0, {
										dateStyle: "medium",
										timeStyle: "short"
									}).format(row.updatedAt) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.models.length === 0 || row.models.every(isUnattributed) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("unknownRoute") }) : row.models.filter((model) => !isUnattributed(model)).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: routeLabel(model) }, modelKey(model))) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens(row.usage) }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: inputTokens(row.usage) }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: row.usage.outputTokens }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: TokenUsageSection_module_css_default.analysisButton,
										type: "button",
										disabled: selectedAnalysisModel === void 0 || analysis.status === "loading" && analysis.sessionId === row.id,
										onClick: () => {
											runAnalysis(row);
										},
										children: analysis.status === "loading" && analysis.sessionId === row.id ? t("analyzing") : t("analyze")
									}) })
								] }, row.id)) })]
							})
						})]
					})
				] })]
			});
		}
		//#endregion
		//#region src/rpc.ts
		/** Shared private RPC names used by the Host and browser halves. */
		const TOKEN_USAGE_RPC_CHANNEL = "/token-usage";
		/** Version-stable endpoint names for Token usage preferences and analysis. */
		const TOKEN_USAGE_RPC_ENDPOINT = {
			budgetRead: "budget/read",
			budgetWrite: "budget/write",
			analysisModels: "analysis/models",
			usageAnalyze: "usage/analyze",
			trajectoryAnalyze: "trajectory/analyze"
		};
		//#endregion
		//#region src/client/budget-controller.ts
		const INITIAL = {
			status: "loading",
			budget: 0
		};
		/** Minimal stable observable source consumed by the Settings slot hook binder. */
		var BudgetStore = class {
			snapshot = INITIAL;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return this.snapshot;
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			set(next) {
				if (this.snapshot.status === next.status && this.snapshot.budget === next.budget) return;
				this.snapshot = next;
				for (const listener of [...this.listeners]) listener();
			}
		};
		/** Decode the one numeric setting returned by the private Host RPC. */
		function settingsOf(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const budget = value.rolling30DayBudget;
			if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget < 0) return void 0;
			return { rolling30DayBudget: budget };
		}
		/** Mirror the private Host settings endpoint onto one HMR-safe observable source. */
		var TokenUsageBudgetController = class {
			connection;
			/** Observable snapshot supplied through the settings section's hooks compartment. */
			store = new BudgetStore();
			generation = 0;
			disposed = false;
			writeQueue = Promise.resolve();
			/** @param connection - client connection carrying the loopback RPC channel. */
			constructor(connection) {
				this.connection = connection;
			}
			/** Fetch the durable budget unless the current page cannot call loopback-only endpoints. */
			async load() {
				const generation = ++this.generation;
				if (!this.connection.isLoopback) {
					this.publish(generation, {
						status: "unavailable",
						budget: 0
					});
					return;
				}
				try {
					const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetRead, {});
					const settings = result.ok ? settingsOf(result.value) : void 0;
					this.publish(generation, settings === void 0 ? {
						status: "unavailable",
						budget: 0
					} : {
						status: "ready",
						budget: settings.rolling30DayBudget
					});
				} catch (_budgetReadFailure) {
					this.publish(generation, {
						status: "unavailable",
						budget: 0
					});
				}
			}
			/** Persist one whole-token rolling budget. Writes are serialized so failures retain the latest durable value. */
			setBudget(rolling30DayBudget) {
				if (!Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) return Promise.resolve();
				const operation = this.writeQueue.then(() => this.writeBudget(rolling30DayBudget));
				this.writeQueue = operation.catch(() => {});
				return operation;
			}
			/** Execute one queued budget write against the latest published durable value. */
			async writeBudget(rolling30DayBudget) {
				if (this.disposed) return;
				const previous = this.store.getSnapshot();
				const fallback = previous.status === "ready" ? previous : {
					status: "unavailable",
					budget: 0
				};
				const generation = ++this.generation;
				if (!this.connection.isLoopback) {
					this.publish(generation, fallback);
					return;
				}
				try {
					const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetWrite, { rolling30DayBudget });
					const settings = result.ok ? settingsOf(result.value) : void 0;
					this.publish(generation, settings === void 0 ? fallback : {
						status: "ready",
						budget: settings.rolling30DayBudget
					});
				} catch (_budgetWriteFailure) {
					this.publish(generation, fallback);
				}
			}
			/** Stop all late asynchronous publications after the owning Client fiber disposes. */
			dispose() {
				this.disposed = true;
				this.generation += 1;
			}
			/** Publish only the latest request result while this controller remains owned. */
			publish(generation, next) {
				if (this.disposed || generation !== this.generation) return;
				this.store.set(next);
			}
		};
		//#endregion
		//#region src/client/trajectory-analysis-client.ts
		/** Return whether a wire value is an object. */
		function isRecord$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Decode the plugin's four disjoint buckets. */
		function bucketsOf$1(value) {
			if (!isRecord$1(value)) return void 0;
			const keys = [
				"uncachedInputTokens",
				"outputTokens",
				"cacheReadTokens",
				"cacheWriteTokens"
			];
			if (!keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0)) return void 0;
			return Object.fromEntries(keys.map((key) => [key, value[key]]));
		}
		/** Decode a signed bucket delta. */
		function signedBucketsOf(value) {
			if (!isRecord$1(value)) return void 0;
			const keys = [
				"uncachedInputTokens",
				"outputTokens",
				"cacheReadTokens",
				"cacheWriteTokens"
			];
			if (!keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))) return void 0;
			return Object.fromEntries(keys.map((key) => [key, value[key]]));
		}
		/** Decode one metadata-only provider usage span. */
		function spanOf(value) {
			if (!isRecord$1(value) || typeof value.id !== "string" || value.kind !== "model" && value.kind !== "compaction" || typeof value.seq !== "number" || !Number.isSafeInteger(value.seq) || value.seq < 0 || typeof value.provider !== "string" || typeof value.model !== "string" || ![
				"open",
				"completed",
				"retried"
			].includes(String(value.status)) || value.valueKind !== "actual" || value.finality !== "provisional" && value.finality !== "authoritative") return void 0;
			const usage = bucketsOf$1(value.usage);
			if (usage === void 0) return void 0;
			const optionalNumber = (key) => {
				const candidate = value[key];
				return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : void 0;
			};
			if ([
				"turn",
				"step",
				"attempt"
			].some((key) => value[key] !== void 0 && optionalNumber(key) === void 0)) return;
			const turn = optionalNumber("turn");
			const step = optionalNumber("step");
			const attempt = optionalNumber("attempt");
			return {
				id: value.id,
				kind: value.kind,
				seq: value.seq,
				...turn === void 0 ? {} : { turn },
				...step === void 0 ? {} : { step },
				...attempt === void 0 ? {} : { attempt },
				provider: value.provider,
				model: value.model,
				status: value.status,
				valueKind: "actual",
				finality: value.finality,
				usage
			};
		}
		/** Decode the explicit provider-ledger reconciliation result. */
		function reconciliationOf(value) {
			if (!isRecord$1(value) || value.status !== "matched" && value.status !== "mismatch") return void 0;
			const providerUsage = bucketsOf$1(value.providerUsage);
			const attributedUsage = bucketsOf$1(value.attributedUsage);
			const delta = signedBucketsOf(value.delta);
			return providerUsage === void 0 || attributedUsage === void 0 || delta === void 0 ? void 0 : {
				status: value.status,
				providerUsage,
				attributedUsage,
				delta
			};
		}
		/** Decode deterministic analysis metrics returned by the Host. */
		function metricsOf(value) {
			if (!isRecord$1(value)) return void 0;
			const numericKeys = [
				"eventCount",
				"includedEventCount",
				"omittedChunkEvents",
				"omittedContentEvents",
				"turnCount",
				"completedTurns",
				"failedTurns",
				"stepCount",
				"assistantRequests",
				"toolCalls",
				"toolResults",
				"toolErrors",
				"orphanToolCalls",
				"orphanToolResults",
				"averageToolLatencyMs",
				"maxToolLatencyMs",
				"retries",
				"compactions",
				"approvalsAsked",
				"approvalsRejected",
				"subagents",
				"modelSwitches",
				"openTurns",
				"openSteps",
				"durationMs",
				"activeDurationMs",
				"eventsPerMinute",
				"tokensPerMinute",
				"activeTokensPerMinute"
			];
			if (!numericKeys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0)) return;
			const usage = bucketsOf$1(value.usage);
			const retryUsage = bucketsOf$1(value.retryUsage);
			const reconciliation = reconciliationOf(value.reconciliation);
			if (usage === void 0 || retryUsage === void 0 || reconciliation === void 0 || !Array.isArray(value.spans)) return void 0;
			const spans = value.spans.map(spanOf);
			if (spans.some((span) => span === void 0) || value.largestSpanId !== void 0 && typeof value.largestSpanId !== "string") return void 0;
			return {
				...Object.fromEntries(numericKeys.map((key) => [key, value[key]])),
				usage,
				retryUsage,
				spans,
				...value.largestSpanId === void 0 ? {} : { largestSpanId: value.largestSpanId },
				reconciliation
			};
		}
		/** Decode one complete versioned trajectory report. */
		function trajectoryAnalysisOf(value) {
			if (!isRecord$1(value) || value.schema !== "dsh-token-usage/trajectory-analysis-v1" || typeof value.sessionId !== "string" || typeof value.generatedAt !== "string" || typeof value.truncated !== "boolean" || typeof value.report !== "string" || !isRecord$1(value.model) || typeof value.model.provider !== "string" || typeof value.model.model !== "string") return void 0;
			const metrics = metricsOf(value.metrics);
			const auxiliary = value.analysisUsage === void 0 ? void 0 : bucketsOf$1(value.analysisUsage);
			if (metrics === void 0 || value.analysisUsage !== void 0 && auxiliary === void 0) return void 0;
			return {
				schema: value.schema,
				sessionId: value.sessionId,
				generatedAt: value.generatedAt,
				model: {
					provider: value.model.provider,
					model: value.model.model
				},
				truncated: value.truncated,
				metrics,
				...auxiliary === void 0 ? {} : { analysisUsage: auxiliary },
				report: value.report
			};
		}
		/** Request an ephemeral report from the Host through the loopback-only plugin channel. */
		async function requestTrajectoryAnalysis(connection, sessionId, model, language, signal) {
			if (!connection.isLoopback) throw new Error("Trajectory analysis is available only from the local DSH page.");
			const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.trajectoryAnalyze, {
				sessionId,
				model,
				language
			}, signal);
			if (!result.ok) throw new Error(result.error.message);
			const analysis = trajectoryAnalysisOf(result.value);
			if (analysis === void 0) throw new Error("The Host returned an invalid trajectory analysis report.");
			return analysis;
		}
		//#endregion
		//#region src/client/usage-analysis-client.ts
		/** Return whether a wire value is a JSON record. */
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Decode the plugin's four disjoint buckets. */
		function bucketsOf(value) {
			if (!isRecord(value)) return void 0;
			const keys = [
				"uncachedInputTokens",
				"outputTokens",
				"cacheReadTokens",
				"cacheWriteTokens"
			];
			if (!keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0)) return void 0;
			return Object.fromEntries(keys.map((key) => [key, value[key]]));
		}
		/** Decode one provider/model selector row owned by the Host catalog. */
		function modelOf(value) {
			if (!isRecord(value) || typeof value.provider !== "string" || typeof value.providerName !== "string" || typeof value.model !== "string" || typeof value.modelName !== "string" || value.provider.length === 0 || value.model.length === 0) return void 0;
			return {
				provider: value.provider,
				providerName: value.providerName,
				model: value.model,
				modelName: value.modelName
			};
		}
		/** Decode a server-selected default only when it belongs to the model catalog. */
		function selectionOf(value, models) {
			if (!isRecord(value) || typeof value.provider !== "string" || typeof value.model !== "string") return void 0;
			return models.some((entry) => entry.provider === value.provider && entry.model === value.model) ? {
				provider: value.provider,
				model: value.model
			} : void 0;
		}
		/** Decode the Host's selectable integrated-model catalog. */
		function analysisModelCatalogOf(value) {
			if (!isRecord(value) || !Array.isArray(value.models)) return void 0;
			const models = value.models.map(modelOf);
			if (models.some((model) => model === void 0)) return void 0;
			const available = models;
			const defaultSelection = selectionOf(value.default, available);
			return defaultSelection === void 0 ? { models: available } : {
				models: available,
				default: defaultSelection
			};
		}
		/** Decode one complete versioned aggregate Token usage report. */
		function tokenUsageAnalysisOf(value) {
			if (!isRecord(value) || value.schema !== "dsh-token-usage/usage-analysis-v1" || typeof value.generatedAt !== "string" || typeof value.report !== "string" || !isRecord(value.model) || typeof value.model.provider !== "string" || typeof value.model.model !== "string") return void 0;
			const auxiliary = value.analysisUsage === void 0 ? void 0 : bucketsOf(value.analysisUsage);
			if (value.analysisUsage !== void 0 && auxiliary === void 0) return void 0;
			return {
				schema: value.schema,
				generatedAt: value.generatedAt,
				model: {
					provider: value.model.provider,
					model: value.model.model
				},
				...auxiliary === void 0 ? {} : { analysisUsage: auxiliary },
				report: value.report
			};
		}
		/** Read every currently registered model route eligible for a manual analysis selection. */
		async function requestAnalysisModels(connection, signal) {
			if (!connection.isLoopback) throw new Error("AI analysis is available only from the local DSH page.");
			const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.analysisModels, {}, signal);
			if (!result.ok) throw new Error(result.error.message);
			const catalog = analysisModelCatalogOf(result.value);
			if (catalog === void 0) throw new Error("The Host returned an invalid integrated-model catalog.");
			return catalog;
		}
		/** Analyze aggregate-only Token usage through the manually selected integrated model. */
		async function requestTokenUsageAnalysis(connection, input, model, language, signal) {
			if (!connection.isLoopback) throw new Error("AI analysis is available only from the local DSH page.");
			const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.usageAnalyze, {
				input,
				model,
				language
			}, signal);
			if (!result.ok) throw new Error(result.error.message);
			const analysis = tokenUsageAnalysisOf(result.value);
			if (analysis === void 0) throw new Error("The Host returned an invalid Token usage analysis report.");
			return analysis;
		}
		//#endregion
		//#region src/client/locales.ts
		/** Dictionary namespace owned by the Token usage dashboard. */
		const NS = "settings.tokenUsage";
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			nav: "Token 用量",
			title: "Token 使用记录",
			intro: "基于 DSH 持久会话日志统计模型请求与上下文压缩用量，不保存提示词或回复正文。",
			totalTokens: "总 Token",
			inputTokens: "输入 Token",
			outputTokens: "输出 Token",
			cacheHit: "缓存命中率",
			sessions: "有用量会话",
			modelBreakdown: "模型用量",
			activity: "Token 活跃度",
			activityIntro: "最近 30 周，颜色越深表示当日 Token 使用量越高。悬停查看明细，点击查看当天会话。",
			activityTooltip: "{date}\n总计 {total} Token\n输入 {input} · 输出 {output}\n缓存：读 {cacheRead} · 写 {cacheWrite}",
			less: "少",
			more: "多",
			trend: "用量趋势",
			trendIntro: "按 UTC 日期比较当前周期与前一等长周期。",
			rangeDays: "{count} 天",
			periodTokens: "最近 {count} 天",
			periodChange: "较前一周期",
			activeDays: "活跃天数",
			peakDay: "峰值日",
			peakDayNote: "峰值：{date} · {total} Token",
			budget: "30 日 Token 预算",
			budgetIntro: "预算保存在本机 DSH 设置中，填 0 或清空即可关闭。",
			budgetInput: "30 日预算（Token）",
			budgetDisabled: "尚未设置预算。",
			budgetUnavailable: "当前连接无法读取或保存预算。",
			budgetProgress: "已用 {used} / {budget} Token（{percent}%）",
			budgetExceeded: "已超出预算 {excess} Token。",
			usageAnalysis: "AI Token 用量分析",
			usageAnalysisIntro: "使用手动选择的已接入模型，基于聚合 Token 数据生成多维分析与优化建议。",
			analysisModel: "分析模型",
			analysisModelsLoading: "正在读取已接入模型…",
			analysisModelsFailed: "无法读取已接入模型：{message}",
			analysisModelsUnavailable: "没有可用于分析的已接入模型。请先在 DSH 的模型设置中接入模型。",
			usageAnalysisPrivacy: "隐私提示：仅发送总量、路由别名、请求次数和 UTC 每日 Token bucket；不会发送原始 provider/model、会话 ID、标题、提示词或回复。",
			analysisModelScope: "此处选择的模型同样用于下方按会话运行的轨迹分析。报告只保存在当前页面内存中。",
			analyzeUsage: "生成用量分析",
			usageAnalyzing: "正在生成分析…",
			usageAnalysisFailed: "用量分析失败：{message}",
			usageAnalysisReport: "AI 用量分析报告",
			dayDetails: "{date} 用量明细",
			dayDetailsIntro: "仅显示该 UTC 日期内已记录的聚合用量与贡献会话。",
			closeDayDetails: "收起明细",
			contributors: "贡献会话（{count}）",
			noContributors: "当天没有可显示的会话贡献。",
			export: "导出",
			exportJson: "JSON 汇总",
			exportDaily: "每日 CSV",
			exportModels: "模型 CSV",
			recentSessions: "会话记录",
			providerModel: "提供方 / 模型",
			calls: "调用",
			total: "总量",
			input: "输入",
			output: "输出",
			cacheRead: "缓存读取",
			cacheWrite: "缓存写入",
			cacheDetail: "缓存：读 {read} · 写 {write}",
			session: "会话",
			updated: "最近活动",
			routes: "模型",
			search: "搜索会话或模型",
			empty: "暂无 Token 使用记录。",
			emptySearch: "没有匹配的使用记录。",
			assistantCalls: "对话 {count}",
			compactionCalls: "压缩 {count}",
			unknownRoute: "模型信息不可用",
			unattributed: "未归因用量",
			trajectoryAnalysis: "会话 Token 轨迹分析",
			trajectoryAnalysisIntro: "选择“分析轨迹”后，仅将内置事件类别、相对时间、路由别名、状态和 provider Token bucket 发送给上方手动选择的已接入模型；提示词、回复、工具参数与结果始终省略。报告按需运行且不持久化。",
			analysisRunning: "正在分析“{title}”的元数据轨迹…",
			analysisFailed: "分析失败：{message}",
			analysisFor: "轨迹分析 · {title}",
			analysisMeta: "{provider}/{model} · {time}",
			analysisCost: "本次分析 {total} Token",
			analysisTurns: "回合 / 未结束",
			analysisTools: "工具调用 / 结果 / 错误",
			analysisIntegrity: "孤立工具 / 未结束步骤",
			analysisToolLatency: "工具延迟（均值 / 最大）",
			analysisRetries: "模型重试",
			analysisRetryTokens: "重试 Token",
			analysisLargest: "最大用量节点",
			analysisReconciliation: "Token 对账",
			analysisMatched: "一致",
			analysisMismatch: "差异 {count}",
			analysisRate: "活跃时段 Token 速率",
			analysisApprovals: "审批 / 拒绝",
			analysisTruncated: "元数据轨迹过长，模型仅收到首尾有界样本；报告会将中段标为不可用证据。",
			analysisPrivacy: "隐私：手动选择的模型只接收白名单元数据和 provider 上报 Token；不发送提示词、回复、原始 provider/model、工具名称/参数/结果、会话标题/ID 或个人与组织字段。",
			analysis: "轨迹分析",
			analyze: "分析轨迹",
			analyzing: "分析中…",
			loading: "正在读取会话统计…"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			nav: "Token usage",
			title: "Token usage records",
			intro: "Counts model requests and context compactions from durable DSH session logs without storing prompt or response text.",
			totalTokens: "Total tokens",
			inputTokens: "Input tokens",
			outputTokens: "Output tokens",
			cacheHit: "Cache hit rate",
			sessions: "Sessions with usage",
			modelBreakdown: "Usage by model",
			activity: "Token activity",
			activityIntro: "Last 30 weeks. Darker cells represent higher daily Token usage. Hover for details or select a day for its sessions.",
			activityTooltip: "{date}\nTotal {total} tokens\nInput {input} · Output {output}\nCache: read {cacheRead} · write {cacheWrite}",
			less: "Less",
			more: "More",
			trend: "Usage trends",
			trendIntro: "Compares the current UTC period with the preceding period of equal length.",
			rangeDays: "{count} days",
			periodTokens: "Last {count} days",
			periodChange: "Previous period",
			activeDays: "Active days",
			peakDay: "Peak day",
			peakDayNote: "Peak: {date} · {total} tokens",
			budget: "30-day Token budget",
			budgetIntro: "The budget is stored in local DSH settings. Enter 0 or clear it to disable.",
			budgetInput: "30-day budget (tokens)",
			budgetDisabled: "No budget is set.",
			budgetUnavailable: "This connection cannot read or save the budget.",
			budgetProgress: "{used} / {budget} tokens used ({percent}%)",
			budgetExceeded: "{excess} tokens over budget.",
			usageAnalysis: "AI Token usage analysis",
			usageAnalysisIntro: "Use a manually selected integrated model to generate a multi-dimensional usage review and optimization recommendations from aggregate Token data.",
			analysisModel: "Analysis model",
			analysisModelsLoading: "Reading integrated models…",
			analysisModelsFailed: "Unable to read integrated models: {message}",
			analysisModelsUnavailable: "No integrated model is available for analysis. Add one in DSH Model settings first.",
			usageAnalysisPrivacy: "Privacy: only totals, route aliases, request counts, and UTC daily Token buckets are sent. No raw provider/model ids, session IDs, titles, prompts, or responses are sent.",
			analysisModelScope: "The selected model is also used by the per-session trajectory analysis below. Reports stay only in this page memory.",
			analyzeUsage: "Generate usage analysis",
			usageAnalyzing: "Generating analysis…",
			usageAnalysisFailed: "Usage analysis failed: {message}",
			usageAnalysisReport: "AI usage analysis report",
			dayDetails: "{date} usage details",
			dayDetailsIntro: "Shows aggregate usage and contributing sessions recorded for this UTC date.",
			closeDayDetails: "Hide details",
			contributors: "Contributing sessions ({count})",
			noContributors: "No session contribution is available for this day.",
			export: "Export",
			exportJson: "JSON summary",
			exportDaily: "Daily CSV",
			exportModels: "Model CSV",
			recentSessions: "Session records",
			providerModel: "Provider / model",
			calls: "Calls",
			total: "Total",
			input: "Input",
			output: "Output",
			cacheRead: "Cache read",
			cacheWrite: "Cache write",
			cacheDetail: "Cache: read {read} · write {write}",
			session: "Session",
			updated: "Last activity",
			routes: "Models",
			search: "Search sessions or models",
			empty: "No token usage has been recorded.",
			emptySearch: "No matching usage records.",
			assistantCalls: "Chat {count}",
			compactionCalls: "Compaction {count}",
			unknownRoute: "Model unavailable",
			unattributed: "Unattributed usage",
			trajectoryAnalysis: "Session Token trajectory analysis",
			trajectoryAnalysisIntro: "Analyze trajectory sends only built-in event categories, relative timing, route aliases, statuses, and provider Token buckets to the manually selected integrated model above. Prompts, replies, tool arguments, and results are always omitted. Reports run on demand and are not persisted.",
			analysisRunning: "Analyzing the metadata trajectory for “{title}”…",
			analysisFailed: "Analysis failed: {message}",
			analysisFor: "Trajectory analysis · {title}",
			analysisMeta: "{provider}/{model} · {time}",
			analysisCost: "{total} tokens for this analysis",
			analysisTurns: "Turns / open",
			analysisTools: "Tool calls / results / errors",
			analysisIntegrity: "Orphaned tools / open steps",
			analysisToolLatency: "Tool latency (avg / max)",
			analysisRetries: "Model retries",
			analysisRetryTokens: "Retry tokens",
			analysisLargest: "Largest usage node",
			analysisReconciliation: "Token reconciliation",
			analysisMatched: "Matched",
			analysisMismatch: "{count} difference",
			analysisRate: "Active-window Token rate",
			analysisApprovals: "Approvals / rejected",
			analysisTruncated: "The metadata trajectory was too long, so the model received a bounded head-and-tail sample and treats the middle as unavailable evidence.",
			analysisPrivacy: "Privacy: the manually selected model receives only allowlisted metadata and provider-reported Token buckets—never prompts, replies, raw provider/model ids, tool names/arguments/results, session titles/IDs, or personal and organization fields.",
			analysis: "Trajectory analysis",
			analyze: "Analyze trajectory",
			analyzing: "Analyzing…",
			loading: "Reading session usage…"
		};
		//#endregion
		//#region src/client/index.ts
		/** Client services required by the Settings contribution. */
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/** Contribute a localized Token usage page to Settings. */
		function apply(ctx) {
			const connection = ctx.get("connection");
			if (connection === void 0) throw new Error("dsh-token-usage requires the Client connection service");
			const budget = new TokenUsageBudgetController(connection);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "token-usage: dictionaries");
			ctx.effect(() => {
				budget.load();
				return () => {
					budget.dispose();
				};
			}, "token usage: load persistent budget");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "token-usage",
				order: 30,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					hooks: { budget: budget.store },
					setBudget: (value) => budget.setBudget(value),
					download: browserDownload,
					listAnalysisModels: (signal) => requestAnalysisModels(connection, signal),
					analyzeTokenUsage: (input, model, signal) => requestTokenUsageAnalysis(connection, input, model, ctx.locale.getLocale().active, signal),
					analyzeTrajectory: (sessionId, model, signal) => requestTrajectoryAnalysis(connection, sessionId, model, ctx.locale.getLocale().active, signal)
				})
			}, TokenUsageSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map