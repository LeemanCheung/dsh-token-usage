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
		//#region \0dsh-css:C:\Users\zhanglimin202307\Desktop\dsh\dsh-token-usage\src\client\TokenUsageSection.module.css.mjs
		const css = ".hGAOSW_section{width:100%;max-width:960px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:22px;display:flex}.hGAOSW_header{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.hGAOSW_header h2,.hGAOSW_header p,.hGAOSW_block h3,.hGAOSW_status{margin:0}.hGAOSW_header h2{font-size:18px;font-weight:600;line-height:26px}.hGAOSW_header p{max-width:720px;color:var(--dsw-alias-label-tertiary);margin-top:5px;font-size:13px;line-height:20px}.hGAOSW_metrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;display:grid}.hGAOSW_metric{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:7px;min-width:0;padding:13px 14px;display:flex}.hGAOSW_metric span{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.hGAOSW_metric strong{font-variant-numeric:tabular-nums;text-overflow:ellipsis;font-size:20px;line-height:26px;overflow:hidden}.hGAOSW_activity{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:10px;min-width:0;padding:14px;display:flex}.hGAOSW_activityHead{justify-content:space-between;align-items:flex-end;gap:14px;display:flex}.hGAOSW_activityHead h3,.hGAOSW_activityHead p{margin:0}.hGAOSW_activityHead h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_activityHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.hGAOSW_activityGrid{box-sizing:border-box;grid-template-rows:repeat(7,minmax(0,1fr));grid-template-columns:repeat(30,minmax(0,1fr));grid-auto-flow:column;gap:3px;width:100%;min-width:0;padding:2px;display:grid}.hGAOSW_activityCell,.hGAOSW_activityLegend i{background:var(--dsw-alias-bg-module-platform);border:0;border-radius:2px;flex:none;display:block}.hGAOSW_activityCell{aspect-ratio:1;cursor:pointer;width:100%;min-width:0;padding:0}.hGAOSW_activityCell:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_activityCell[data-selected=true]{box-shadow:0 0 0 2px var(--dsw-alias-label-primary)}.hGAOSW_activityLegend i{width:10px;height:10px}.hGAOSW_activityCell[data-future=true]{cursor:default;background:0 0}.hGAOSW_activityCell[data-level=\"1\"],.hGAOSW_activityLegend i[data-level=\"1\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityCell[data-level=\"2\"],.hGAOSW_activityLegend i[data-level=\"2\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 42%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityCell[data-level=\"3\"],.hGAOSW_activityLegend i[data-level=\"3\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 64%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityCell[data-level=\"4\"],.hGAOSW_activityLegend i[data-level=\"4\"]{background:var(--dsw-alias-state-business-primary)}.hGAOSW_activityLegend{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:4px;font-size:10px;line-height:14px;display:flex}.hGAOSW_insights,.hGAOSW_budget,.hGAOSW_dayDrilldown{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}.hGAOSW_insights h3,.hGAOSW_budget h3,.hGAOSW_dayDrilldown h3,.hGAOSW_insights p,.hGAOSW_budget p,.hGAOSW_dayDrilldown p{margin:0}.hGAOSW_insights h3,.hGAOSW_budget h3,.hGAOSW_dayDrilldown h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_insights .hGAOSW_blockHead p,.hGAOSW_budget .hGAOSW_blockHead p,.hGAOSW_dayDrilldown .hGAOSW_blockHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.hGAOSW_detailMetrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;display:grid}.hGAOSW_rangeTabs,.hGAOSW_exportControls{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.hGAOSW_rangeTabs button,.hGAOSW_exportControls button,.hGAOSW_quietButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-height:30px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}.hGAOSW_rangeTabs button[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-business-primary)}.hGAOSW_rangeTabs button:focus-visible,.hGAOSW_exportControls button:focus-visible,.hGAOSW_quietButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_exportControls{justify-content:flex-end}.hGAOSW_exportControls>span{color:var(--dsw-alias-label-tertiary);font-size:11px}.hGAOSW_insightNote{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.hGAOSW_budgetInput{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:7px;font-size:11px;display:flex}.hGAOSW_budgetInput input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:128px;height:30px;color:var(--dsw-alias-label-primary);font:inherit;font-variant-numeric:tabular-nums;border-radius:7px;outline:none;padding:0 8px;font-size:12px}.hGAOSW_budgetInput input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.hGAOSW_budgetProgress{align-items:center;gap:10px;display:flex}.hGAOSW_budgetProgress progress{width:min(320px,55%);height:8px;accent-color:var(--dsw-alias-state-business-primary)}.hGAOSW_budgetProgress strong{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:12px}.hGAOSW_budgetWarning{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.hGAOSW_contributors{flex-direction:column;gap:7px;display:flex}.hGAOSW_contributors>strong{color:var(--dsw-alias-label-secondary);font-size:12px}.hGAOSW_contributors ol{gap:5px;margin:0;padding:0;list-style:none;display:grid}.hGAOSW_contributors li{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:7px;justify-content:space-between;align-items:center;gap:12px;padding:7px 9px;font-size:12px;display:flex}.hGAOSW_contributors li>span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.hGAOSW_block{flex-direction:column;gap:10px;min-width:0;display:flex}.hGAOSW_block h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_blockHead{justify-content:space-between;align-items:center;gap:16px;display:flex}.hGAOSW_blockHead input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:min(280px,45%);height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 11px;font-size:12px}.hGAOSW_blockHead input::placeholder{color:var(--dsw-alias-label-tertiary)}.hGAOSW_blockHead input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.hGAOSW_tableWrap{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;min-width:0;overflow:auto}.hGAOSW_tableWrap table{border-collapse:collapse;width:100%;min-width:0;font-size:12px;line-height:18px}.hGAOSW_tableWrap .hGAOSW_modelTable{table-layout:fixed;min-width:580px}.hGAOSW_tableWrap .hGAOSW_sessionTable{min-width:780px}.hGAOSW_modelTable th:first-child,.hGAOSW_modelTable td:first-child{width:30%}.hGAOSW_modelTable th:nth-child(2),.hGAOSW_modelTable td:nth-child(2){width:18%}.hGAOSW_tableWrap th,.hGAOSW_tableWrap td{border-bottom:1px solid var(--dsw-alias-border-l1);text-align:right;vertical-align:middle;white-space:nowrap;padding:10px 12px}.hGAOSW_tableWrap th{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500}.hGAOSW_tableWrap th:first-child,.hGAOSW_tableWrap td:first-child{text-align:left;max-width:270px}.hGAOSW_tableWrap tbody tr:last-child td{border-bottom:0}.hGAOSW_tableWrap tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}.hGAOSW_tableWrap td{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.hGAOSW_tableWrap td strong,.hGAOSW_tableWrap td span{text-overflow:ellipsis;max-width:260px;display:block;overflow:hidden}.hGAOSW_tableWrap td strong{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}.hGAOSW_tableWrap td span{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}.hGAOSW_tableWrap td .hGAOSW_tokenValue{max-width:none;color:inherit;font-size:inherit;line-height:inherit;display:inline}.hGAOSW_tableWrap td .hGAOSW_cacheDetail{margin-top:2px}.hGAOSW_analysisEmpty,.hGAOSW_analysisError,.hGAOSW_analysisPanel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}.hGAOSW_analysisEmpty{border-style:dashed}.hGAOSW_analysisError{border-color:var(--dsw-alias-state-error-primary)}.hGAOSW_analysisEmpty h3,.hGAOSW_analysisEmpty p,.hGAOSW_analysisError h3,.hGAOSW_analysisError p,.hGAOSW_analysisPanel h3,.hGAOSW_analysisPanel p{margin:0}.hGAOSW_analysisEmpty h3,.hGAOSW_analysisError h3,.hGAOSW_analysisPanel h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_analysisEmpty p,.hGAOSW_analysisError p,.hGAOSW_analysisPanel .hGAOSW_blockHead p,.hGAOSW_analysisPrivacy{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.hGAOSW_analysisError p,.hGAOSW_analysisWarning{color:var(--dsw-alias-state-error-primary)}.hGAOSW_analysisCost{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;padding:5px 9px;font-size:11px}.hGAOSW_analysisMetrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;display:grid}.hGAOSW_analysisReport{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform);max-height:640px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;border-radius:10px;margin:0;padding:14px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:19px;overflow:auto}.hGAOSW_analysisWarning{font-size:11px;line-height:18px}.hGAOSW_analysisButton{border:1px solid var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));min-height:28px;color:var(--dsw-alias-state-business-primary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}.hGAOSW_analysisButton:disabled{cursor:wait;opacity:.65}.hGAOSW_analysisButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_analysisModelSelect{min-width:180px;color:var(--dsw-alias-label-tertiary);gap:4px;font-size:11px;line-height:16px;display:grid}.hGAOSW_analysisModelSelect select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:5px 7px;font-size:12px}.hGAOSW_analysisModelSelect select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_analysisScope{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.hGAOSW_analysisErrorText{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:18px}.hGAOSW_status{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);border-radius:10px;padding:16px;font-size:13px;line-height:20px}@media (width<=860px){.hGAOSW_metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.hGAOSW_detailMetrics,.hGAOSW_analysisMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (width<=580px){.hGAOSW_metrics,.hGAOSW_detailMetrics,.hGAOSW_analysisMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.hGAOSW_header,.hGAOSW_activityHead,.hGAOSW_blockHead{flex-direction:column;align-items:stretch;gap:8px}.hGAOSW_exportControls{justify-content:flex-start}.hGAOSW_budgetInput{justify-content:space-between}.hGAOSW_budgetProgress{flex-direction:column;align-items:flex-start}.hGAOSW_budgetProgress progress,.hGAOSW_blockHead input{width:100%}}";
		const tagId = "dsh-token-usage/TokenUsageSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-token-usage";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TokenUsageSection_module_css_default = {
			"activityGrid": "hGAOSW_activityGrid",
			"analysisCost": "hGAOSW_analysisCost",
			"analysisScope": "hGAOSW_analysisScope",
			"status": "hGAOSW_status",
			"section": "hGAOSW_section",
			"tableWrap": "hGAOSW_tableWrap",
			"analysisEmpty": "hGAOSW_analysisEmpty",
			"analysisModelSelect": "hGAOSW_analysisModelSelect",
			"activityHead": "hGAOSW_activityHead",
			"block": "hGAOSW_block",
			"metrics": "hGAOSW_metrics",
			"metric": "hGAOSW_metric",
			"rangeTabs": "hGAOSW_rangeTabs",
			"blockHead": "hGAOSW_blockHead",
			"modelTable": "hGAOSW_modelTable",
			"analysisWarning": "hGAOSW_analysisWarning",
			"analysisMetrics": "hGAOSW_analysisMetrics",
			"sessionTable": "hGAOSW_sessionTable",
			"activityCell": "hGAOSW_activityCell",
			"detailMetrics": "hGAOSW_detailMetrics",
			"contributors": "hGAOSW_contributors",
			"budgetProgress": "hGAOSW_budgetProgress",
			"analysisPrivacy": "hGAOSW_analysisPrivacy",
			"analysisButton": "hGAOSW_analysisButton",
			"insights": "hGAOSW_insights",
			"exportControls": "hGAOSW_exportControls",
			"budgetWarning": "hGAOSW_budgetWarning",
			"insightNote": "hGAOSW_insightNote",
			"dayDrilldown": "hGAOSW_dayDrilldown",
			"cacheDetail": "hGAOSW_cacheDetail",
			"quietButton": "hGAOSW_quietButton",
			"analysisErrorText": "hGAOSW_analysisErrorText",
			"analysisReport": "hGAOSW_analysisReport",
			"tokenValue": "hGAOSW_tokenValue",
			"budget": "hGAOSW_budget",
			"analysisPanel": "hGAOSW_analysisPanel",
			"budgetInput": "hGAOSW_budgetInput",
			"activity": "hGAOSW_activity",
			"header": "hGAOSW_header",
			"analysisError": "hGAOSW_analysisError",
			"activityLegend": "hGAOSW_activityLegend"
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
								value: metrics.turnCount
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisTools"),
								value: `${metrics.toolCalls} / ${metrics.toolErrors}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisRetries"),
								value: metrics.retries
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisRate"),
								value: metrics.tokensPerMinute === 0 ? "—" : `${formatCompactTokens(metrics.tokensPerMinute)}/min`
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
		//#region src/client/budget-controller.ts
		/** RPC channel dedicated to user-owned Token usage preferences. */
		const TOKEN_USAGE_RPC_CHANNEL = "/token-usage";
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
					const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, "budget/read", {});
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
			/** Persist one whole-token rolling budget. Zero disables the budget. */
			async setBudget(rolling30DayBudget) {
				if (!Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) return;
				const generation = ++this.generation;
				if (!this.connection.isLoopback) {
					this.publish(generation, {
						status: "unavailable",
						budget: 0
					});
					return;
				}
				try {
					const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, "budget/write", { rolling30DayBudget });
					const settings = result.ok ? settingsOf(result.value) : void 0;
					this.publish(generation, settings === void 0 ? {
						status: "unavailable",
						budget: 0
					} : {
						status: "ready",
						budget: settings.rolling30DayBudget
					});
				} catch (_budgetWriteFailure) {
					this.publish(generation, {
						status: "unavailable",
						budget: 0
					});
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
		/** Decode deterministic analysis metrics returned by the Host. */
		function metricsOf(value) {
			if (!isRecord$1(value)) return void 0;
			const numericKeys = [
				"eventCount",
				"includedEventCount",
				"omittedChunkEvents",
				"turnCount",
				"completedTurns",
				"failedTurns",
				"stepCount",
				"assistantRequests",
				"toolCalls",
				"toolErrors",
				"retries",
				"compactions",
				"approvalsAsked",
				"approvalsRejected",
				"subagents",
				"durationMs",
				"eventsPerMinute",
				"tokensPerMinute"
			];
			if (!numericKeys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0)) return;
			const usage = bucketsOf$1(value.usage);
			if (usage === void 0) return void 0;
			return {
				...Object.fromEntries(numericKeys.map((key) => [key, value[key]])),
				usage
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
			const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, "trajectory/analyze", {
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
			const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, "analysis/models", {}, signal);
			if (!result.ok) throw new Error(result.error.message);
			const catalog = analysisModelCatalogOf(result.value);
			if (catalog === void 0) throw new Error("The Host returned an invalid integrated-model catalog.");
			return catalog;
		}
		/** Analyze aggregate-only Token usage through the manually selected integrated model. */
		async function requestTokenUsageAnalysis(connection, input, model, language, signal) {
			if (!connection.isLoopback) throw new Error("AI analysis is available only from the local DSH page.");
			const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, "usage/analyze", {
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
			usageAnalysisPrivacy: "隐私提示：仅发送总量、模型路由、请求次数和 UTC 每日 Token bucket；不会发送会话 ID、标题、提示词或回复。",
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
			trajectoryAnalysis: "会话轨迹智能分析",
			trajectoryAnalysisIntro: "在会话记录中选择“分析轨迹”，使用上方手动选择的已接入模型审查调用链、合规性、异常、速率、性能、可靠性和 Token 效率。分析按需运行，不持久化报告。",
			analysisRunning: "正在分析“{title}”的完整会话轨迹…",
			analysisFailed: "分析失败：{message}",
			analysisFor: "轨迹分析 · {title}",
			analysisMeta: "{provider}/{model} · {time}",
			analysisCost: "本次分析 {total} Token",
			analysisTurns: "回合",
			analysisTools: "工具 / 错误",
			analysisRetries: "模型重试",
			analysisRate: "Token 速率",
			analysisApprovals: "审批 / 非允许",
			analysisTruncated: "会话轨迹过长，模型收到首尾有界样本；报告中的截断区域不可作为合规结论依据。",
			analysisPrivacy: "隐私提示：分析会将经过长度限制和常见凭据脱敏的会话轨迹发送给手动选择的模型提供方。",
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
			usageAnalysisPrivacy: "Privacy: only totals, model routes, request counts, and UTC daily Token buckets are sent. No session IDs, titles, prompts, or responses are sent.",
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
			trajectoryAnalysis: "AI trajectory analysis",
			trajectoryAnalysisIntro: "Select Analyze trajectory on a session to use the manually selected integrated model above for call-chain, compliance, anomaly, rate, performance, reliability, and token-efficiency review. Reports run on demand and are not persisted.",
			analysisRunning: "Analyzing the complete trajectory for “{title}”…",
			analysisFailed: "Analysis failed: {message}",
			analysisFor: "Trajectory analysis · {title}",
			analysisMeta: "{provider}/{model} · {time}",
			analysisCost: "{total} tokens for this analysis",
			analysisTurns: "Turns",
			analysisTools: "Tools / errors",
			analysisRetries: "Model retries",
			analysisRate: "Token rate",
			analysisApprovals: "Approvals / not allowed",
			analysisTruncated: "The trajectory was too long, so the model received a bounded head-and-tail sample. Omitted regions cannot support compliance conclusions.",
			analysisPrivacy: "Privacy: analysis sends a length-bounded trajectory with common credential patterns redacted to the manually selected model provider.",
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