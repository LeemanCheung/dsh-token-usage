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
		function totalTokens$4(usage) {
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
			})).filter((record) => totalTokens$4(record.usage) > 0);
			const peak = active.reduce((highest, record) => highest === void 0 || totalTokens$4(record.usage) > totalTokens$4(highest.usage) ? record : highest, void 0);
			return {
				days,
				usage: aggregateDates(byDate, currentDates),
				previousUsage: aggregateDates(byDate, previousDates),
				activeDays: active.length,
				peak
			};
		}
		/** Return the median of a non-empty numeric list without retaining a source reference. */
		function median(values) {
			const sorted = values.slice().sort((left, right) => left - right);
			const middle = Math.floor(sorted.length / 2);
			return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
		}
		/** Aggregate one complete UTC day range ending before the current partial day. */
		function completeDaysEndingBefore(now, length) {
			return datesEndingOn(now - 864e5, length);
		}
		/** Project a 30-day run rate from the latest seven complete UTC calendar days. */
		function runRateInsight(records, now = Date.now()) {
			const byDate = new Map(records.map((record) => [record.date, record.usage]));
			const dates = completeDaysEndingBefore(now, 7);
			const averageDailyTokens = dates.reduce((sum, date) => sum + totalTokens$4(byDate.get(date) ?? zeroBuckets$1()), 0) / dates.length;
			return {
				observedDays: dates.length,
				averageDailyTokens,
				projectedThirtyDayTokens: Math.round(averageDailyTokens * 30)
			};
		}
		/** Detect an elevated latest complete UTC day using the preceding 28 days' active-day median and MAD. */
		function dailyAnomalyInsight(records, now = Date.now()) {
			const byDate = new Map(records.map((record) => [record.date, record.usage]));
			const [date] = completeDaysEndingBefore(now, 1);
			if (date === void 0) return void 0;
			const tokens = totalTokens$4(byDate.get(date) ?? zeroBuckets$1());
			const activeBaseline = datesEndingOn(now - 2 * 864e5, 28).map((baselineDate) => totalTokens$4(byDate.get(baselineDate) ?? zeroBuckets$1())).filter((value) => value > 0);
			if (tokens === 0 || activeBaseline.length < 5) return void 0;
			const baselineMedianTokens = median(activeBaseline);
			const baselineMadTokens = median(activeBaseline.map((value) => Math.abs(value - baselineMedianTokens)));
			const robustThreshold = baselineMadTokens === 0 ? baselineMedianTokens * 3 : baselineMedianTokens + 3 * 1.4826 * baselineMadTokens;
			const ratio = baselineMedianTokens === 0 ? 0 : tokens / baselineMedianTokens;
			const excessTokens = Math.max(0, tokens - baselineMedianTokens);
			return {
				date,
				tokens,
				baselineMedianTokens,
				baselineMadTokens,
				activeBaselineDays: activeBaseline.length,
				ratio,
				excessTokens,
				status: tokens > robustThreshold ? "elevated" : "normal"
			};
		}
		/** List sessions contributing usage to one UTC day, highest usage first. */
		function dailyContributors(sessions, date) {
			return sessions.flatMap((session) => {
				const record = session.days.find((day) => day.date === date);
				if (record === void 0 || totalTokens$4(record.usage) === 0) return [];
				return [{
					id: session.id,
					title: session.title,
					usage: { ...record.usage }
				}];
			}).sort((left, right) => totalTokens$4(right.usage) - totalTokens$4(left.usage) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
		}
		//#endregion
		//#region src/client/efficiency.ts
		/** Return one full disjoint-bucket total. */
		function totalTokens$3(usage) {
			return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Return the prompt-side total across uncached and cache buckets. */
		function inputTokens$1(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Identify legacy fallback rows with no source route attribution. */
		function isUnattributed$1(model) {
			return model.provider === "" && model.model === "";
		}
		/** Derive request efficiency, compaction overhead, and stable top-route shares. */
		function usageEfficiencyInsight(usage, compactionUsage, models, assistantAttempts, compactionAttempts) {
			const total = totalTokens$3(usage);
			const input = inputTokens$1(usage);
			const attributed = models.filter((model) => !isUnattributed$1(model));
			const unattributedTokens = models.filter(isUnattributed$1).reduce((sum, model) => sum + totalTokens$3(model.usage), 0);
			const assistantTokens = Math.max(0, total - totalTokens$3(compactionUsage));
			const topRoutes = attributed.map((model) => ({
				provider: model.provider,
				model: model.model,
				tokens: totalTokens$3(model.usage)
			})).sort((left, right) => right.tokens - left.tokens || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)).slice(0, 3).map((route) => ({
				...route,
				share: total === 0 ? 0 : route.tokens / total
			}));
			return {
				assistantAttempts,
				compactionAttempts,
				assistantTokens,
				tokensPerAssistantAttempt: assistantAttempts === 0 || unattributedTokens > 0 ? void 0 : assistantTokens / assistantAttempts,
				compactionsPerHundredAssistantAttempts: assistantAttempts === 0 ? void 0 : compactionAttempts / assistantAttempts * 100,
				compactionTokenShare: total === 0 ? void 0 : totalTokens$3(compactionUsage) / total,
				cacheReadInputShare: input === 0 ? void 0 : usage.cacheReadTokens / input,
				cacheWriteInputShare: input === 0 ? void 0 : usage.cacheWriteTokens / input,
				uncachedInputShare: input === 0 ? void 0 : usage.uncachedInputTokens / input,
				outputToInputRatio: input === 0 ? void 0 : usage.outputTokens / input,
				unattributedTokenShare: total === 0 ? 0 : unattributedTokens / total,
				topRoutes
			};
		}
		//#endregion
		//#region src/pricing.ts
		const TOKENS_PER_MILLION = 1e6;
		const PUBLIC_PRICE_CATALOG_URL = "https://developers.openai.com/api/docs/pricing";
		/**
		* OpenAI public USD API rates per million Tokens, retrieved from the official price page on 2025-08-07.
		*
		* Cache writes use the ordinary input price because these routes publish no separate cache-write tariff.
		* The catalog intentionally requires an exact provider/model label match and never borrows a superficially
		* similar rate. A matching label does not verify the configured endpoint, reseller, contract, or invoice.
		*/
		const PUBLIC_USD_RATES = [
			{
				provider: "openai",
				model: "gpt-5",
				currency: "USD",
				inputPerMillion: 1.25,
				cacheReadPerMillion: .125,
				cacheWritePerMillion: 1.25,
				outputPerMillion: 10,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-08-07"
			},
			{
				provider: "openai",
				model: "gpt-5-2025-08-07",
				currency: "USD",
				inputPerMillion: 1.25,
				cacheReadPerMillion: .125,
				cacheWritePerMillion: 1.25,
				outputPerMillion: 10,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-08-07"
			},
			{
				provider: "openai",
				model: "gpt-5-mini",
				currency: "USD",
				inputPerMillion: .25,
				cacheReadPerMillion: .025,
				cacheWritePerMillion: .25,
				outputPerMillion: 2,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-08-07"
			},
			{
				provider: "openai",
				model: "gpt-5-mini-2025-08-07",
				currency: "USD",
				inputPerMillion: .25,
				cacheReadPerMillion: .025,
				cacheWritePerMillion: .25,
				outputPerMillion: 2,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-08-07"
			},
			{
				provider: "openai",
				model: "gpt-5-nano",
				currency: "USD",
				inputPerMillion: .05,
				cacheReadPerMillion: .005,
				cacheWritePerMillion: .05,
				outputPerMillion: .4,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-08-07"
			},
			{
				provider: "openai",
				model: "gpt-5-nano-2025-08-07",
				currency: "USD",
				inputPerMillion: .05,
				cacheReadPerMillion: .005,
				cacheWritePerMillion: .05,
				outputPerMillion: .4,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-08-07"
			},
			{
				provider: "openai",
				model: "gpt-4.1",
				currency: "USD",
				inputPerMillion: 2,
				cacheReadPerMillion: .5,
				cacheWritePerMillion: 2,
				outputPerMillion: 8,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-04-14"
			},
			{
				provider: "openai",
				model: "gpt-4.1-mini",
				currency: "USD",
				inputPerMillion: .4,
				cacheReadPerMillion: .1,
				cacheWritePerMillion: .4,
				outputPerMillion: 1.6,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-04-14"
			},
			{
				provider: "openai",
				model: "gpt-4.1-nano",
				currency: "USD",
				inputPerMillion: .1,
				cacheReadPerMillion: .025,
				cacheWritePerMillion: .1,
				outputPerMillion: .4,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-04-14"
			},
			{
				provider: "openai",
				model: "gpt-4o",
				currency: "USD",
				inputPerMillion: 2.5,
				cacheReadPerMillion: 1.25,
				cacheWritePerMillion: 2.5,
				outputPerMillion: 10,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-04-14"
			},
			{
				provider: "openai",
				model: "gpt-4o-mini",
				currency: "USD",
				inputPerMillion: .15,
				cacheReadPerMillion: .075,
				cacheWritePerMillion: .15,
				outputPerMillion: .6,
				sourceUrl: PUBLIC_PRICE_CATALOG_URL,
				asOf: "2025-04-14"
			}
		];
		/** Version marker displayed with every estimate, not a live pricing feed. */
		const PUBLIC_PRICE_CATALOG_AS_OF = "2025-08-07";
		/** Return a detached public rate for one exact catalog label; this does not verify its billing endpoint. */
		function publicPriceFor(provider, model) {
			const rate = PUBLIC_USD_RATES.find((entry) => entry.provider === provider && entry.model === model);
			return rate === void 0 ? void 0 : {
				currency: rate.currency,
				inputPerMillion: rate.inputPerMillion,
				outputPerMillion: rate.outputPerMillion,
				cacheReadPerMillion: rate.cacheReadPerMillion,
				cacheWritePerMillion: rate.cacheWritePerMillion,
				sourceUrl: rate.sourceUrl,
				asOf: rate.asOf
			};
		}
		/** Return complete Tokens across the four disjoint provider-reported buckets. */
		function totalTokens$2(usage) {
			return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Calculate one exact-route USD estimate from a fully published four-bucket rate. */
		function estimateCostUSD(usage, rate) {
			return (usage.uncachedInputTokens * rate.inputPerMillion + usage.outputTokens * rate.outputPerMillion + usage.cacheReadTokens * rate.cacheReadPerMillion + usage.cacheWriteTokens * rate.cacheWritePerMillion) / TOKENS_PER_MILLION;
		}
		/** Add built-in public USD pricing to model aggregates without pricing unknown routes. */
		function tokenUsageCostSummary(models) {
			let totalCostUSD = 0;
			let cacheReadSavingsUSD = 0;
			let coveredTokens = 0;
			let totalTokensCount = 0;
			let coveredModels = 0;
			const pricedModels = models.map((model) => {
				const usage = { ...model.usage };
				const total = totalTokens$2(usage);
				totalTokensCount += total;
				const rate = publicPriceFor(model.provider, model.model);
				if (rate === void 0) return {
					provider: model.provider,
					model: model.model,
					assistantRequests: model.assistantRequests,
					compactionRequests: model.compactionRequests,
					usage
				};
				const totalCost = estimateCostUSD(usage, rate);
				const cacheReadSavings = usage.cacheReadTokens * Math.max(0, rate.inputPerMillion - rate.cacheReadPerMillion) / TOKENS_PER_MILLION;
				totalCostUSD += totalCost;
				cacheReadSavingsUSD += cacheReadSavings;
				coveredTokens += total;
				if (total > 0) coveredModels += 1;
				return {
					provider: model.provider,
					model: model.model,
					assistantRequests: model.assistantRequests,
					compactionRequests: model.compactionRequests,
					usage,
					totalCostUSD: totalCost,
					cacheReadSavingsUSD: cacheReadSavings,
					rate
				};
			});
			return {
				currency: "USD",
				totalCostUSD,
				cacheReadSavingsUSD,
				coveredTokens,
				totalTokens: totalTokensCount,
				coveredModels,
				totalModels: models.filter((model) => totalTokens$2(model.usage) > 0).length,
				models: pricedModels
			};
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
		/** Return a detached public-price estimate that never retains source aggregates. */
		function copiedPricing(models) {
			const summary = tokenUsageCostSummary(models);
			return {
				...summary,
				models: summary.models.map((model) => ({
					provider: model.provider,
					model: model.model,
					assistantRequests: model.assistantRequests,
					compactionRequests: model.compactionRequests,
					usage: copyBuckets(model.usage),
					...model.totalCostUSD === void 0 ? {} : { totalCostUSD: model.totalCostUSD },
					...model.cacheReadSavingsUSD === void 0 ? {} : { cacheReadSavingsUSD: model.cacheReadSavingsUSD },
					...model.rate === void 0 ? {} : { rate: { ...model.rate } }
				}))
			};
		}
		/** Stable aggregate-only document that never accepts session data. */
		function tokenUsageExport(source, generatedAt) {
			const pricing = copiedPricing(source.models);
			return {
				schema: "dsh-token-usage/export-v2",
				generatedAt,
				timezone: "UTC",
				totals: copyBuckets(source.usage),
				compactionUsage: copyBuckets(source.compactionUsage),
				pricingCatalogAsOf: PUBLIC_PRICE_CATALOG_AS_OF,
				pricing,
				models: pricing.models.slice().sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
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
			const models = tokenUsageCostSummary(source.models).models;
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
				"totalTokens",
				"estimatedCostUSD",
				"cacheReadSavingsUSD",
				"pricingCatalogAsOf"
			], ...models.slice().sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)).map((model) => [
				model.provider,
				model.model,
				model.assistantRequests,
				model.compactionRequests,
				model.usage.uncachedInputTokens,
				model.usage.outputTokens,
				model.usage.cacheReadTokens,
				model.usage.cacheWriteTokens,
				model.usage.uncachedInputTokens + model.usage.cacheReadTokens + model.usage.cacheWriteTokens,
				model.usage.uncachedInputTokens + model.usage.cacheReadTokens + model.usage.cacheWriteTokens + model.usage.outputTokens,
				model.totalCostUSD ?? "",
				model.cacheReadSavingsUSD ?? "",
				model.rate?.asOf ?? ""
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
		const css = ".hGAOSW_section{width:100%;max-width:960px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:22px;display:flex}.hGAOSW_header{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.hGAOSW_header h2,.hGAOSW_header p,.hGAOSW_block h3,.hGAOSW_status{margin:0}.hGAOSW_header h2{font-size:18px;font-weight:600;line-height:26px}.hGAOSW_header p{max-width:720px;color:var(--dsw-alias-label-tertiary);margin-top:5px;font-size:13px;line-height:20px}.hGAOSW_metrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;display:grid}.hGAOSW_metric{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:7px;min-width:0;padding:13px 14px;display:flex}.hGAOSW_metric span{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.hGAOSW_metric strong{font-variant-numeric:tabular-nums;text-overflow:ellipsis;font-size:20px;line-height:26px;overflow:hidden}.hGAOSW_activity{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:10px;min-width:0;padding:14px;display:flex}.hGAOSW_activityHead{justify-content:space-between;align-items:flex-end;gap:14px;display:flex}.hGAOSW_activityHead h3,.hGAOSW_activityHead p{margin:0}.hGAOSW_activityHead h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_activityHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.hGAOSW_activityGrid{box-sizing:border-box;grid-template-rows:repeat(7,minmax(0,1fr));grid-template-columns:repeat(30,minmax(0,1fr));grid-auto-flow:column;gap:3px;width:100%;min-width:0;padding:2px;display:grid}.hGAOSW_activityCell,.hGAOSW_activityLegend i{background:var(--dsw-alias-bg-module-platform);border:0;border-radius:2px;flex:none;display:block}.hGAOSW_activityCell{aspect-ratio:1;cursor:pointer;width:100%;min-width:0;padding:0}.hGAOSW_activityCell:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_activityCell[data-selected=true]{box-shadow:0 0 0 2px var(--dsw-alias-label-primary)}.hGAOSW_activityLegend i{width:10px;height:10px}.hGAOSW_activityCell[data-future=true]{cursor:default;background:0 0}.hGAOSW_activityCell[data-level=\"1\"],.hGAOSW_activityLegend i[data-level=\"1\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityCell[data-level=\"2\"],.hGAOSW_activityLegend i[data-level=\"2\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 42%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityCell[data-level=\"3\"],.hGAOSW_activityLegend i[data-level=\"3\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 64%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityCell[data-level=\"4\"],.hGAOSW_activityLegend i[data-level=\"4\"]{background:var(--dsw-alias-state-business-primary)}.hGAOSW_activityLegend{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:4px;font-size:10px;line-height:14px;display:flex}.hGAOSW_insights,.hGAOSW_budget,.hGAOSW_dayDrilldown{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}.hGAOSW_insights h3,.hGAOSW_budget h3,.hGAOSW_dayDrilldown h3,.hGAOSW_insights p,.hGAOSW_budget p,.hGAOSW_dayDrilldown p{margin:0}.hGAOSW_insights h3,.hGAOSW_budget h3,.hGAOSW_dayDrilldown h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_insights .hGAOSW_blockHead p,.hGAOSW_budget .hGAOSW_blockHead p,.hGAOSW_dayDrilldown .hGAOSW_blockHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.hGAOSW_detailMetrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;display:grid}.hGAOSW_rangeTabs,.hGAOSW_exportControls{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.hGAOSW_rangeTabs button,.hGAOSW_exportControls button,.hGAOSW_quietButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-height:30px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}.hGAOSW_rangeTabs button[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-business-primary)}.hGAOSW_rangeTabs button:focus-visible,.hGAOSW_exportControls button:focus-visible,.hGAOSW_quietButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_exportControls{justify-content:flex-end}.hGAOSW_exportControls>span{color:var(--dsw-alias-label-tertiary);font-size:11px}.hGAOSW_insightNote{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.hGAOSW_anomalyNotice{color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:center;gap:10px;font-size:11px;line-height:17px;display:flex}.hGAOSW_anomalyNotice p{margin:0}.hGAOSW_budgetInput{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:7px;font-size:11px;display:flex}.hGAOSW_budgetInput input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:128px;height:30px;color:var(--dsw-alias-label-primary);font:inherit;font-variant-numeric:tabular-nums;border-radius:7px;outline:none;padding:0 8px;font-size:12px}.hGAOSW_budgetInput input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.hGAOSW_budgetProgress{align-items:center;gap:10px;display:flex}.hGAOSW_budgetProgress progress{width:min(320px,55%);height:8px;accent-color:var(--dsw-alias-state-business-primary)}.hGAOSW_budgetProgress strong{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:12px}.hGAOSW_budgetWarning{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.hGAOSW_contributors{flex-direction:column;gap:7px;display:flex}.hGAOSW_contributors>strong{color:var(--dsw-alias-label-secondary);font-size:12px}.hGAOSW_contributors ol{gap:5px;margin:0;padding:0;list-style:none;display:grid}.hGAOSW_contributors li{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:7px;justify-content:space-between;align-items:center;gap:12px;padding:7px 9px;font-size:12px;display:flex}.hGAOSW_contributors li>span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.hGAOSW_block{flex-direction:column;gap:10px;min-width:0;display:flex}.hGAOSW_block h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_blockHead{justify-content:space-between;align-items:center;gap:16px;display:flex}.hGAOSW_blockHead input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:min(280px,45%);height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 11px;font-size:12px}.hGAOSW_blockHead input::placeholder{color:var(--dsw-alias-label-tertiary)}.hGAOSW_blockHead input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.hGAOSW_tableWrap{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;min-width:0;overflow:auto}.hGAOSW_tableWrap table{border-collapse:collapse;width:100%;min-width:0;font-size:12px;line-height:18px}.hGAOSW_tableWrap .hGAOSW_modelTable{table-layout:fixed;min-width:580px}.hGAOSW_tableWrap .hGAOSW_sessionTable{min-width:780px}.hGAOSW_modelTable th:first-child,.hGAOSW_modelTable td:first-child{width:30%}.hGAOSW_modelTable th:nth-child(2),.hGAOSW_modelTable td:nth-child(2){width:18%}.hGAOSW_tableWrap th,.hGAOSW_tableWrap td{border-bottom:1px solid var(--dsw-alias-border-l1);text-align:right;vertical-align:middle;white-space:nowrap;padding:10px 12px}.hGAOSW_tableWrap th{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500}.hGAOSW_tableWrap th:first-child,.hGAOSW_tableWrap td:first-child{text-align:left;max-width:270px}.hGAOSW_tableWrap tbody tr:last-child td{border-bottom:0}.hGAOSW_tableWrap tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}.hGAOSW_tableWrap td{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.hGAOSW_tableWrap td strong,.hGAOSW_tableWrap td span{text-overflow:ellipsis;max-width:260px;display:block;overflow:hidden}.hGAOSW_tableWrap td strong{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}.hGAOSW_tableWrap td span{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}.hGAOSW_tableWrap td .hGAOSW_tokenValue{max-width:none;color:inherit;font-size:inherit;line-height:inherit;display:inline}.hGAOSW_tableWrap td .hGAOSW_cacheDetail{margin-top:2px}.hGAOSW_analysisEmpty,.hGAOSW_analysisError,.hGAOSW_analysisPanel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}.hGAOSW_analysisEmpty{border-style:dashed}.hGAOSW_analysisError{border-color:var(--dsw-alias-state-error-primary)}.hGAOSW_analysisEmpty h3,.hGAOSW_analysisEmpty p,.hGAOSW_analysisError h3,.hGAOSW_analysisError p,.hGAOSW_analysisPanel h3,.hGAOSW_analysisPanel p{margin:0}.hGAOSW_analysisEmpty h3,.hGAOSW_analysisError h3,.hGAOSW_analysisPanel h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_analysisEmpty p,.hGAOSW_analysisError p,.hGAOSW_analysisPanel .hGAOSW_blockHead p,.hGAOSW_analysisPrivacy{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.hGAOSW_analysisError p,.hGAOSW_analysisWarning{color:var(--dsw-alias-state-error-primary)}.hGAOSW_analysisCost{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;padding:5px 9px;font-size:11px}.hGAOSW_analysisMetrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;display:grid}.hGAOSW_analysisReport{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform);max-height:640px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;border-radius:10px;margin:0;padding:14px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:19px;overflow:auto}.hGAOSW_analysisWarning{font-size:11px;line-height:18px}.hGAOSW_modelSort{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:11px;display:flex}.hGAOSW_modelSort select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:116px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:5px 7px;font-size:12px}.hGAOSW_modelSort select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_sessionLink{max-width:240px;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;background:0 0;border:0;padding:0;font-weight:600;text-decoration:underline #0000;display:block;overflow:hidden}.hGAOSW_sessionLink:hover{text-decoration-color:currentColor}.hGAOSW_sessionLink:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px}.hGAOSW_analysisButton{border:1px solid var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));min-height:28px;color:var(--dsw-alias-state-business-primary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}.hGAOSW_analysisButton:disabled{cursor:wait;opacity:.65}.hGAOSW_analysisButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_pricingNotice{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);border-radius:10px;align-items:baseline;gap:8px;padding:10px 12px;font-size:11px;line-height:18px;display:flex}.hGAOSW_pricingNotice strong{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-weight:600}.hGAOSW_pricingNotice p{margin:0}.hGAOSW_priceUnknown{color:var(--dsw-alias-label-tertiary)}.hGAOSW_priceValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}.hGAOSW_analysisModelSelect{min-width:180px;color:var(--dsw-alias-label-tertiary);gap:4px;font-size:11px;line-height:16px;display:grid}.hGAOSW_analysisModelSelect select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:5px 7px;font-size:12px}.hGAOSW_analysisModelSelect select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.hGAOSW_analysisScope{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.hGAOSW_analysisErrorText{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:18px}.hGAOSW_status{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);border-radius:10px;padding:16px;font-size:13px;line-height:20px}@media (width<=860px){.hGAOSW_metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.hGAOSW_detailMetrics,.hGAOSW_analysisMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (width<=580px){.hGAOSW_metrics,.hGAOSW_detailMetrics,.hGAOSW_analysisMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.hGAOSW_header,.hGAOSW_activityHead,.hGAOSW_blockHead{flex-direction:column;align-items:stretch;gap:8px}.hGAOSW_exportControls{justify-content:flex-start}.hGAOSW_budgetInput{justify-content:space-between}.hGAOSW_pricingNotice{flex-direction:column;align-items:flex-start;gap:2px}.hGAOSW_budgetProgress{flex-direction:column;align-items:flex-start}.hGAOSW_budgetProgress progress,.hGAOSW_blockHead input{width:100%}}";
		const tagId = "dsh-token-usage/TokenUsageSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-token-usage";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TokenUsageSection_module_css_default = {
			"activityHead": "hGAOSW_activityHead",
			"sessionLink": "hGAOSW_sessionLink",
			"detailMetrics": "hGAOSW_detailMetrics",
			"activityLegend": "hGAOSW_activityLegend",
			"modelSort": "hGAOSW_modelSort",
			"activity": "hGAOSW_activity",
			"rangeTabs": "hGAOSW_rangeTabs",
			"contributors": "hGAOSW_contributors",
			"analysisPrivacy": "hGAOSW_analysisPrivacy",
			"analysisButton": "hGAOSW_analysisButton",
			"activityGrid": "hGAOSW_activityGrid",
			"section": "hGAOSW_section",
			"priceUnknown": "hGAOSW_priceUnknown",
			"analysisModelSelect": "hGAOSW_analysisModelSelect",
			"priceValue": "hGAOSW_priceValue",
			"cacheDetail": "hGAOSW_cacheDetail",
			"block": "hGAOSW_block",
			"metrics": "hGAOSW_metrics",
			"budget": "hGAOSW_budget",
			"header": "hGAOSW_header",
			"blockHead": "hGAOSW_blockHead",
			"modelTable": "hGAOSW_modelTable",
			"insightNote": "hGAOSW_insightNote",
			"analysisMetrics": "hGAOSW_analysisMetrics",
			"pricingNotice": "hGAOSW_pricingNotice",
			"analysisError": "hGAOSW_analysisError",
			"insights": "hGAOSW_insights",
			"analysisWarning": "hGAOSW_analysisWarning",
			"tokenValue": "hGAOSW_tokenValue",
			"dayDrilldown": "hGAOSW_dayDrilldown",
			"analysisErrorText": "hGAOSW_analysisErrorText",
			"sessionTable": "hGAOSW_sessionTable",
			"analysisPanel": "hGAOSW_analysisPanel",
			"quietButton": "hGAOSW_quietButton",
			"tableWrap": "hGAOSW_tableWrap",
			"anomalyNotice": "hGAOSW_anomalyNotice",
			"budgetInput": "hGAOSW_budgetInput",
			"budgetProgress": "hGAOSW_budgetProgress",
			"budgetWarning": "hGAOSW_budgetWarning",
			"exportControls": "hGAOSW_exportControls",
			"analysisEmpty": "hGAOSW_analysisEmpty",
			"analysisReport": "hGAOSW_analysisReport",
			"analysisScope": "hGAOSW_analysisScope",
			"metric": "hGAOSW_metric",
			"activityCell": "hGAOSW_activityCell",
			"analysisCost": "hGAOSW_analysisCost",
			"status": "hGAOSW_status"
		};
		//#endregion
		//#region src/client/TokenUsageSection.tsx
		const SESSION_PAGE_SIZE = 50;
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
		function totalTokens$1(usage) {
			return inputTokens(usage) + usage.outputTokens;
		}
		/** Locale-aware exact integer formatting. */
		function formatTokens(value) {
			return new Intl.NumberFormat().format(value);
		}
		/** Format one public-rate estimate in USD without implying accounting precision. */
		function formatUSD(value) {
			return new Intl.NumberFormat(void 0, {
				style: "currency",
				currency: "USD",
				minimumFractionDigits: value < 1 ? 4 : 2,
				maximumFractionDigits: value < 1 ? 4 : 2
			}).format(value);
		}
		/** Format a ratio without implying fractional measurement precision. */
		function formatPercent(value) {
			return `${Math.round(value * 100)}%`;
		}
		/** Format partial price coverage without ever rounding an incomplete estimate to 100%. */
		function formatCoveragePercent(covered, total) {
			if (total <= 0 || covered <= 0) return "0";
			if (covered >= total) return "100";
			const percent = covered / total * 100;
			if (percent < .1) return "<0.1";
			return new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(Math.floor(percent * 10) / 10);
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
		/** Count every provider-recorded assistant or compaction attempt for one route. */
		function recordedAttempts(model) {
			return model.assistantRequests + model.compactionRequests;
		}
		/** Return the selected stable sort value for one model hotspot row. */
		function modelSortValue(model, sort) {
			switch (sort) {
				case "total": return totalTokens$1(model.usage);
				case "cost": return model.totalCostUSD ?? -1;
				case "tokensPerAttempt": {
					const attempts = recordedAttempts(model);
					return attempts === 0 ? -1 : totalTokens$1(model.usage) / attempts;
				}
				case "cacheReadShare": {
					const input = inputTokens(model.usage);
					return input === 0 ? -1 : model.usage.cacheReadTokens / input;
				}
			}
		}
		/** Sort model hotspot rows deterministically without mutating cost-summary data. */
		function sortedModelHotspots(models, sort) {
			return models.slice().sort((left, right) => modelSortValue(right, sort) - modelSortValue(left, sort) || totalTokens$1(right.usage) - totalTokens$1(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
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
			const assistantRequests = recorded?.assistantRequests ?? 0;
			const compactionRequests = recorded?.compactionRequests ?? 0;
			if (usage === void 0 || totalTokens$1(usage) === 0 && assistantRequests === 0 && compactionRequests === 0) return null;
			return {
				id: summary.id,
				title: summary.displayTitle,
				updatedAt: summary.updatedAt,
				assistantRequests,
				compactionRequests,
				compactionUsage: recorded?.compactionUsage === void 0 ? zeroBuckets() : { ...recorded.compactionUsage },
				usage,
				models: recorded?.models ?? [unattributedModel(usage)],
				days: recorded?.days ?? [{
					date: dayKey(summary.updatedAt),
					usage
				}],
				dailyUsageReliable: recorded?.days !== void 0
			};
		}
		/** Aggregate session summaries into totals and provider/model records. */
		function aggregateUsage(summaries) {
			const sessions = [];
			const models = /* @__PURE__ */ new Map();
			const days = /* @__PURE__ */ new Map();
			const operationalDays = /* @__PURE__ */ new Map();
			let usage = zeroBuckets();
			let assistantRequests = 0;
			let compactionRequests = 0;
			let compactionUsage = zeroBuckets();
			let reliableDailySessions = 0;
			for (const summary of summaries) {
				const row = sessionRow(summary);
				if (row === null) continue;
				sessions.push(row);
				usage = addBuckets(usage, row.usage);
				assistantRequests += row.assistantRequests;
				compactionRequests += row.compactionRequests;
				compactionUsage = addBuckets(compactionUsage, row.compactionUsage);
				if (row.dailyUsageReliable) reliableDailySessions += 1;
				for (const day of row.days) {
					days.set(day.date, addBuckets(days.get(day.date) ?? zeroBuckets(), day.usage));
					if (row.dailyUsageReliable) operationalDays.set(day.date, addBuckets(operationalDays.get(day.date) ?? zeroBuckets(), day.usage));
				}
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
				assistantRequests,
				compactionRequests,
				compactionUsage,
				sessions,
				models: [...models.values()].sort((left, right) => totalTokens$1(right.usage) - totalTokens$1(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
				days: [...days.entries()].map(([date, usage]) => ({
					date,
					usage
				})).sort((left, right) => left.date.localeCompare(right.date)),
				operationalDays: [...operationalDays.entries()].map(([date, usage]) => ({
					date,
					usage
				})).sort((left, right) => left.date.localeCompare(right.date)),
				dailyCoverage: reliableDailySessions === 0 ? "unavailable" : reliableDailySessions === sessions.length ? "complete" : "partial"
			};
		}
		/** Return only detached aggregate buckets, route records, and UTC dates for AI usage analysis. */
		function usageAnalysisInput(data) {
			return {
				usage: { ...data.usage },
				assistantRequests: data.assistantRequests,
				compactionRequests: data.compactionRequests,
				compactionUsage: { ...data.compactionUsage },
				models: data.models.map((model) => ({
					provider: model.provider,
					model: model.model,
					assistantRequests: model.assistantRequests,
					compactionRequests: model.compactionRequests,
					usage: { ...model.usage }
				})),
				days: data.dailyCoverage === "complete" ? data.operationalDays.map((day) => ({
					date: day.date,
					usage: { ...day.usage }
				})) : []
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
			const maximum = Math.max(0, ...dates.filter((date) => date <= today).map((date) => totalTokens$1(byDate.get(date) ?? zeroBuckets())));
			return dates.map((date) => {
				const future = date > today;
				const usage = byDate.get(date) ?? zeroBuckets();
				const tokens = future ? 0 : totalTokens$1(usage);
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
								value: totalTokens$1(day.usage)
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
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: contributor.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens$1(contributor.usage) })]
						}, contributor.id)) })]
					})
				]
			});
		}
		/** Render period-aware trend and activity summaries from daily records. */
		function PeriodInsights({ days, range, onRangeChange, t }) {
			const insight = (0, react.useMemo)(() => periodInsight(days, range), [days, range]);
			const current = totalTokens$1(insight.usage);
			const previous = totalTokens$1(insight.previousUsage);
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
								value: peak === void 0 ? "—" : formatCompactTokens(totalTokens$1(peak.usage))
							})
						]
					}),
					peak === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("peakDayNote", {
							date: peak.date,
							total: formatTokens(totalTokens$1(peak.usage))
						})
					})
				]
			});
		}
		/** Render the persistent trailing-30-day budget setting and progress. */
		function BudgetPanel({ operationalDays, dailyCoverage, snapshot, setBudget, t }) {
			const insight = (0, react.useMemo)(() => periodInsight(operationalDays, 30), [operationalDays]);
			const runRate = (0, react.useMemo)(() => runRateInsight(operationalDays), [operationalDays]);
			const runRateAvailable = dailyCoverage === "complete";
			const used = totalTokens$1(insight.usage);
			const budget = snapshot.budget;
			const enabled = budget > 0;
			const durableValue = enabled ? String(budget) : "";
			const [draft, setDraft] = (0, react.useState)(durableValue);
			const editGeneration = (0, react.useRef)(0);
			const dirtyDraft = (0, react.useRef)(false);
			const ratio = enabled ? used / budget : 0;
			(0, react.useEffect)(() => {
				if (!dirtyDraft.current) setDraft(durableValue);
			}, [durableValue, snapshot.status]);
			const save = (value) => {
				const next = value.trim() === "" ? 0 : Number(value);
				if (!Number.isSafeInteger(next) || next < 0) {
					dirtyDraft.current = false;
					setDraft(durableValue);
					return;
				}
				const generation = editGeneration.current + 1;
				editGeneration.current = generation;
				setBudget(next).then((saved) => {
					if (editGeneration.current !== generation) return;
					dirtyDraft.current = false;
					setDraft(saved > 0 ? String(saved) : "");
				}, () => {
					if (editGeneration.current !== generation) return;
					dirtyDraft.current = false;
					setDraft(durableValue);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.budget,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("budget") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("budgetIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: TokenUsageSection_module_css_default.budgetInput,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("budgetInput") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								inputMode: "numeric",
								min: "0",
								step: "1",
								value: draft,
								placeholder: "0",
								"aria-label": t("budgetInput"),
								disabled: snapshot.status !== "ready",
								onChange: (event) => {
									editGeneration.current += 1;
									dirtyDraft.current = true;
									setDraft(event.currentTarget.value);
								},
								onBlur: (event) => {
									save(event.currentTarget.value);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter") event.currentTarget.blur();
								}
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: runRateAvailable ? t("budgetRunRate", {
							average: formatCompactTokens(Math.round(runRate.averageDailyTokens)),
							projected: formatCompactTokens(runRate.projectedThirtyDayTokens)
						}) : t(dailyCoverage === "partial" ? "dailyCoveragePartial" : "dailyCoverageUnavailable")
					}),
					snapshot.status !== "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("budgetUnavailable")
					}) : !enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("budgetDisabled")
					}) : !runRateAvailable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: TokenUsageSection_module_css_default.budgetProgress,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
								value: Math.min(used, budget),
								max: budget
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("budgetProgress", {
								used: formatCompactTokens(used),
								budget: formatCompactTokens(budget),
								percent: Math.round(ratio * 100)
							}) })]
						}),
						ratio > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: TokenUsageSection_module_css_default.budgetWarning,
							children: t("budgetExceeded", { excess: formatCompactTokens(used - budget) })
						}) : null,
						runRateAvailable && ratio <= 1 && runRate.projectedThirtyDayTokens > budget ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: TokenUsageSection_module_css_default.budgetWarning,
							children: t("budgetForecastExceeded", {
								projected: formatCompactTokens(runRate.projectedThirtyDayTokens),
								budget: formatCompactTokens(budget)
							})
						}) : null
					] })
				]
			});
		}
		/** Render aggregate request efficiency, compaction overhead, and route concentration. */
		function EfficiencyPanel({ usage, compactionUsage, models, assistantAttempts, compactionAttempts, t }) {
			const insight = (0, react.useMemo)(() => usageEfficiencyInsight(usage, compactionUsage, models, assistantAttempts, compactionAttempts), [
				usage,
				compactionUsage,
				models,
				assistantAttempts,
				compactionAttempts
			]);
			const top = insight.topRoutes[0];
			const topThreeShare = insight.topRoutes.reduce((sum, route) => sum + route.share, 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.insights,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("efficiency") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("efficiencyIntro") })] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.detailMetrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("assistantAttempts"),
								value: insight.assistantAttempts === 0 ? "—" : insight.assistantAttempts
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("tokensPerAssistantAttempt"),
								value: insight.tokensPerAssistantAttempt === void 0 ? "—" : insight.tokensPerAssistantAttempt
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("compactionRate"),
								value: insight.compactionsPerHundredAssistantAttempts === void 0 ? "—" : `${new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(insight.compactionsPerHundredAssistantAttempts)} / 100`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("compactionTokenShare"),
								value: insight.compactionTokenShare === void 0 ? "—" : formatPercent(insight.compactionTokenShare)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("cacheReadShare"),
								value: insight.cacheReadInputShare === void 0 ? "—" : formatPercent(insight.cacheReadInputShare)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("topRouteShare"),
								value: top === void 0 ? "—" : formatPercent(top.share)
							})
						]
					}),
					top === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("noRouteAttribution")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("routeConcentration", {
							route: `${top.provider}/${top.model}`,
							topOne: formatPercent(top.share),
							topThree: formatPercent(topThreeShare)
						})
					}),
					insight.unattributedTokenShare > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("unattributedShare", { share: formatPercent(insight.unattributedTokenShare) })
					}) : null
				]
			});
		}
		/** Render complete-day burn rate and robust recent spike signals. */
		function OperationsPanel({ days, dailyCoverage, onSelectDate, t }) {
			const runRate = (0, react.useMemo)(() => runRateInsight(days), [days]);
			const anomaly = (0, react.useMemo)(() => dailyCoverage === "complete" ? dailyAnomalyInsight(days) : void 0, [days, dailyCoverage]);
			const dailyCoverageAvailable = dailyCoverage === "complete";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.insights,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageSignals") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("usageSignalsIntro") })] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.detailMetrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("dailyRunRate"),
								value: dailyCoverageAvailable ? Math.round(runRate.averageDailyTokens) : "—"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("projectedThirtyDayUsage"),
								value: dailyCoverageAvailable ? runRate.projectedThirtyDayTokens : "—"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("anomalyRatio"),
								value: anomaly === void 0 ? "—" : `${new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(anomaly.ratio)}×`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("anomalyExcess"),
								value: anomaly === void 0 ? "—" : anomaly.excessTokens
							})
						]
					}),
					!dailyCoverageAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t(dailyCoverage === "partial" ? "dailyCoveragePartial" : "dailyCoverageUnavailable")
					}) : anomaly === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("anomalyInsufficient")
					}) : anomaly.status === "normal" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("anomalyNormal", {
							date: anomaly.date,
							baseline: formatCompactTokens(anomaly.baselineMedianTokens),
							active: anomaly.activeBaselineDays
						})
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.anomalyNotice,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("anomalyElevated", {
							date: anomaly.date,
							tokens: formatCompactTokens(anomaly.tokens),
							baseline: formatCompactTokens(anomaly.baselineMedianTokens),
							ratio: new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(anomaly.ratio),
							excess: formatCompactTokens(anomaly.excessTokens),
							active: anomaly.activeBaselineDays
						}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: TokenUsageSection_module_css_default.quietButton,
							type: "button",
							onClick: () => {
								onSelectDate(anomaly.date);
							},
							children: t("inspectAnomalyDay")
						})]
					})
				]
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
		function UsageAnalysisPanel({ catalog, selectedModel, state, onSelectModel, onRefreshCatalog, onAnalyze, t }) {
			if (catalog.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsLoading") })]
			});
			if (catalog.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisError,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsFailed", { message: catalog.message }) })]
			});
			const catalogFailures = catalog.value.failures ?? [];
			if (catalog.value.models.length === 0 || selectedModel === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsUnavailable") }),
					catalogFailures.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisWarning,
						children: t("analysisModelsAllFailed", { providers: catalogFailures.map((failure) => failure.providerName).join(", ") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: TokenUsageSection_module_css_default.quietButton,
						type: "button",
						onClick: onRefreshCatalog,
						children: t("refreshAnalysisModels")
					})
				]
			});
			const report = state.status === "ready" ? state.value : void 0;
			const analysisTokens = report?.analysisUsage === void 0 ? void 0 : totalTokens$1(report.analysisUsage);
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: TokenUsageSection_module_css_default.quietButton,
						type: "button",
						disabled: state.status === "loading",
						onClick: onRefreshCatalog,
						children: t("refreshAnalysisModels")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisPrivacy,
						children: t("usageAnalysisPrivacy")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisScope,
						children: t("analysisModelScope")
					}),
					catalogFailures.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisWarning,
						children: t("analysisModelsPartial", { providers: catalogFailures.map((failure) => failure.providerName).join(", ") })
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
			const analysisTokens = analysis.analysisUsage === void 0 ? void 0 : totalTokens$1(analysis.analysisUsage);
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
								value: totalTokens$1(metrics.retryUsage)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisLargest"),
								value: largestSpan === void 0 ? "—" : `${largestSpan.id} · ${formatTokens(totalTokens$1(largestSpan.usage))}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("analysisReconciliation"),
								value: metrics.reconciliation.status === "matched" ? t("analysisMatched") : metrics.reconciliation.status === "unavailable" ? t("analysisUnavailable") : t("analysisMismatch", { count: formatTokens(reconciliationDelta) })
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
		function TokenUsageSection({ close, useSessions, useBudget, setBudget, download, openSession, listAnalysisModels, analyzeTokenUsage, analyzeTrajectory, t }) {
			const phase = useSessions((state) => state.phase);
			const ids = useSessions((state) => state.ids);
			const byId = useSessions((state) => state.byId);
			const budget = useBudget((snapshot) => snapshot);
			const [query, setQuery] = (0, react.useState)("");
			const [modelSort, setModelSort] = (0, react.useState)("total");
			const [sessionLimit, setSessionLimit] = (0, react.useState)(SESSION_PAGE_SIZE);
			const [range, setRange] = (0, react.useState)(30);
			const [selectedDate, setSelectedDate] = (0, react.useState)();
			const [operationalDrilldown, setOperationalDrilldown] = (0, react.useState)(false);
			const [sessionOpenError, setSessionOpenError] = (0, react.useState)();
			const [analysis, setAnalysis] = (0, react.useState)({ status: "idle" });
			const [analysisCatalog, setAnalysisCatalog] = (0, react.useState)({ status: "loading" });
			const [selectedAnalysisModel, setSelectedAnalysisModel] = (0, react.useState)();
			const [usageReport, setUsageReport] = (0, react.useState)({ status: "idle" });
			const trajectoryController = (0, react.useRef)();
			const usageController = (0, react.useRef)();
			const catalogController = (0, react.useRef)();
			(0, react.useEffect)(() => () => {
				trajectoryController.current?.abort();
				usageController.current?.abort();
				catalogController.current?.abort();
			}, []);
			const refreshAnalysisModels = (0, react.useCallback)(() => {
				catalogController.current?.abort();
				const controller = new AbortController();
				catalogController.current = controller;
				setAnalysisCatalog({ status: "loading" });
				listAnalysisModels(controller.signal).then((catalog) => {
					if (catalogController.current !== controller || controller.signal.aborted) return;
					setAnalysisCatalog({
						status: "ready",
						value: catalog
					});
					setSelectedAnalysisModel((current) => current !== void 0 && catalog.models.some((model) => model.provider === current.provider && model.model === current.model) ? current : catalog.default ?? catalog.models[0]);
				}, (error) => {
					if (catalogController.current === controller && !controller.signal.aborted) setAnalysisCatalog({
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				});
			}, [listAnalysisModels]);
			(0, react.useEffect)(() => {
				refreshAnalysisModels();
			}, [refreshAnalysisModels]);
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
			const openUsageSession = (row) => {
				try {
					openSession(row.id);
					close();
				} catch (error) {
					setSessionOpenError(error instanceof Error ? error.message : String(error));
				}
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
			const costSummary = (0, react.useMemo)(() => tokenUsageCostSummary(data.models), [data.models]);
			const priceCoverage = formatCoveragePercent(costSummary.coveredTokens, costSummary.totalTokens);
			const sortedModels = (0, react.useMemo)(() => sortedModelHotspots(costSummary.models, modelSort), [costSummary.models, modelSort]);
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const filteredSessions = (0, react.useMemo)(() => data.sessions.filter((row) => {
				if (normalizedQuery.length === 0) return true;
				return row.title.toLocaleLowerCase().includes(normalizedQuery) || row.id.toLocaleLowerCase().includes(normalizedQuery) || row.models.some((model) => routeLabel(model).toLocaleLowerCase().includes(normalizedQuery));
			}), [data.sessions, normalizedQuery]);
			const visibleSessions = (0, react.useMemo)(() => filteredSessions.slice(0, sessionLimit), [filteredSessions, sessionLimit]);
			const selectedDay = (0, react.useMemo)(() => selectedDate === void 0 ? void 0 : (operationalDrilldown ? data.operationalDays : data.days).find((day) => day.date === selectedDate), [
				data.days,
				data.operationalDays,
				operationalDrilldown,
				selectedDate
			]);
			const selectedDaySessions = (0, react.useMemo)(() => operationalDrilldown ? data.sessions.filter((row) => row.dailyUsageReliable) : data.sessions, [data.sessions, operationalDrilldown]);
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
								value: totalTokens$1(data.usage)
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
								label: t("estimatedCost"),
								value: costSummary.coveredTokens === 0 ? "—" : formatUSD(costSummary.totalCostUSD)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("cacheReadSavings"),
								value: costSummary.coveredTokens === 0 ? "—" : formatUSD(costSummary.cacheReadSavingsUSD)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("priceCoverage"),
								value: `${priceCoverage}%`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("sessions"),
								value: data.sessions.length
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityHeatmap, {
						days: data.days,
						selectedDate,
						onSelectDate: (date) => {
							setOperationalDrilldown(false);
							setSelectedDate(date);
						},
						t
					}),
					selectedDay === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DayDrilldown, {
						day: selectedDay,
						sessions: selectedDaySessions,
						t,
						onClose: () => {
							setSelectedDate(void 0);
							setOperationalDrilldown(false);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PeriodInsights, {
						days: data.days,
						range,
						onRangeChange: setRange,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EfficiencyPanel, {
						usage: data.usage,
						compactionUsage: data.compactionUsage,
						models: data.models,
						assistantAttempts: data.assistantRequests,
						compactionAttempts: data.compactionRequests,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OperationsPanel, {
						days: data.operationalDays,
						dailyCoverage: data.dailyCoverage,
						onSelectDate: (date) => {
							setOperationalDrilldown(true);
							setSelectedDate(date);
						},
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BudgetPanel, {
						operationalDays: data.operationalDays,
						dailyCoverage: data.dailyCoverage,
						snapshot: budget,
						setBudget,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.pricingNotice,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("pricingTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("pricingIntro", {
								asOf: PUBLIC_PRICE_CATALOG_AS_OF,
								covered: formatTokens(costSummary.coveredTokens),
								total: formatTokens(costSummary.totalTokens),
								routes: costSummary.coveredModels,
								allRoutes: costSummary.totalModels
							}) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: PUBLIC_PRICE_CATALOG_URL,
								target: "_blank",
								rel: "noreferrer",
								children: t("pricingSource")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageAnalysisPanel, {
						catalog: analysisCatalog,
						selectedModel: selectedAnalysisModel,
						state: usageReport,
						onSelectModel: setSelectedAnalysisModel,
						onRefreshCatalog: refreshAnalysisModels,
						onAnalyze: runUsageAnalysis,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.block,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: TokenUsageSection_module_css_default.blockHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("modelBreakdown") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: TokenUsageSection_module_css_default.modelSort,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("modelSort") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t("modelSort"),
									value: modelSort,
									onChange: (event) => {
										setModelSort(event.currentTarget.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "total",
											children: t("modelSortTotal")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "cost",
											children: t("modelSortCost")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "tokensPerAttempt",
											children: t("modelSortTokensPerAttempt")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "cacheReadShare",
											children: t("modelSortCacheRead")
										})
									]
								})]
							})]
						}), data.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
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
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("output") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("estimatedCost") })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: sortedModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: isUnattributed(model) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("unattributed") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: model.model }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.provider })] }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: isUnattributed(model) ? "—" : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("assistantCalls", { count: model.assistantRequests }) }), model.compactionRequests > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("compactionCalls", { count: model.compactionRequests }) }) : null] }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens$1(model.usage) }) }),
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
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: model.usage.outputTokens }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: model.totalCostUSD === void 0 || model.rate === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: TokenUsageSection_module_css_default.priceUnknown,
										title: t("priceUnavailable"),
										children: "—"
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: TokenUsageSection_module_css_default.priceValue,
										title: t("priceRate", {
											input: model.rate.inputPerMillion,
											output: model.rate.outputPerMillion,
											cacheRead: model.rate.cacheReadPerMillion,
											cacheWrite: model.rate.cacheWritePerMillion,
											asOf: model.rate.asOf
										}),
										children: formatUSD(model.totalCostUSD)
									}) })
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
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: TokenUsageSection_module_css_default.blockHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("recentSessions") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "search",
									value: query,
									placeholder: t("search"),
									"aria-label": t("search"),
									onChange: (event) => {
										setQuery(event.currentTarget.value);
										setSessionLimit(SESSION_PAGE_SIZE);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: TokenUsageSection_module_css_default.analysisPrivacy,
								children: t("analysisPrivacy")
							}),
							sessionOpenError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: TokenUsageSection_module_css_default.analysisErrorText,
								children: t("openSessionFailed", { message: sessionOpenError })
							}),
							filteredSessions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
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
									] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: visibleSessions.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: TokenUsageSection_module_css_default.sessionLink,
											type: "button",
											title: row.id,
											onClick: () => {
												openUsageSession(row);
											},
											children: row.title
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: row.id })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: new Intl.DateTimeFormat(void 0, {
											dateStyle: "medium",
											timeStyle: "short"
										}).format(row.updatedAt) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.models.length === 0 || row.models.every(isUnattributed) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("unknownRoute") }) : row.models.filter((model) => !isUnattributed(model)).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: routeLabel(model) }, modelKey(model))) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens$1(row.usage) }) }),
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
							}),
							filteredSessions.length > visibleSessions.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: TokenUsageSection_module_css_default.quietButton,
								type: "button",
								onClick: () => {
									setSessionLimit((current) => current + SESSION_PAGE_SIZE);
								},
								children: t("showMoreSessions", {
									shown: visibleSessions.length,
									total: filteredSessions.length
								})
							}) : null
						]
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
			/** Persist one whole-token rolling budget and return the value that remains durable. */
			setBudget(rolling30DayBudget) {
				if (!Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) return Promise.resolve(this.store.getSnapshot().budget);
				const operation = this.writeQueue.then(() => this.writeBudget(rolling30DayBudget));
				this.writeQueue = operation.then(() => void 0, () => void 0);
				return operation;
			}
			/** Execute one queued budget write against the latest published durable value. */
			async writeBudget(rolling30DayBudget) {
				if (this.disposed) return this.store.getSnapshot().budget;
				const previous = this.store.getSnapshot();
				const fallback = previous.status === "ready" ? previous : {
					status: "unavailable",
					budget: 0
				};
				const generation = ++this.generation;
				if (!this.connection.isLoopback) {
					this.publish(generation, fallback);
					return fallback.budget;
				}
				try {
					const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetWrite, { rolling30DayBudget });
					const settings = result.ok ? settingsOf(result.value) : void 0;
					const next = settings === void 0 ? fallback : {
						status: "ready",
						budget: settings.rolling30DayBudget
					};
					this.publish(generation, next);
					return next.budget;
				} catch (_budgetWriteFailure) {
					this.publish(generation, fallback);
					return fallback.budget;
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
		const TOKEN_BUCKET_KEYS = [
			"uncachedInputTokens",
			"outputTokens",
			"cacheReadTokens",
			"cacheWriteTokens"
		];
		/** Decode the plugin's four disjoint buckets. */
		function bucketsOf$1(value) {
			if (!isRecord$1(value)) return void 0;
			if (!TOKEN_BUCKET_KEYS.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0)) return void 0;
			return Object.fromEntries(TOKEN_BUCKET_KEYS.map((key) => [key, value[key]]));
		}
		/** Decode a signed bucket delta. */
		function signedBucketsOf(value) {
			if (!isRecord$1(value)) return void 0;
			if (!TOKEN_BUCKET_KEYS.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]))) return void 0;
			return Object.fromEntries(TOKEN_BUCKET_KEYS.map((key) => [key, value[key]]));
		}
		/** Compare bucket sets without collapsing cache categories. */
		function sameBuckets(left, right) {
			return TOKEN_BUCKET_KEYS.every((key) => left[key] === right[key]);
		}
		/** Sum the four provider buckets for largest-node validation. */
		function totalTokens(usage) {
			return TOKEN_BUCKET_KEYS.reduce((total, key) => total + usage[key], 0);
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
			if (providerUsage === void 0 || attributedUsage === void 0 || delta === void 0) return void 0;
			const expectedDelta = Object.fromEntries(TOKEN_BUCKET_KEYS.map((key) => [key, providerUsage[key] - attributedUsage[key]]));
			const matched = TOKEN_BUCKET_KEYS.every((key) => expectedDelta[key] === 0);
			if (!TOKEN_BUCKET_KEYS.every((key) => delta[key] === expectedDelta[key]) || value.status === "matched" !== matched) return void 0;
			return {
				status: value.status,
				providerUsage,
				attributedUsage,
				delta
			};
		}
		const BASE_METRIC_KEYS = [
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
		const ADDITIVE_METRIC_KEYS = [
			"omittedContentEvents",
			"toolResults",
			"orphanToolCalls",
			"orphanToolResults",
			"averageToolLatencyMs",
			"maxToolLatencyMs",
			"modelSwitches",
			"openTurns",
			"openSteps",
			"activeDurationMs",
			"activeTokensPerMinute"
		];
		/** Decode deterministic analysis metrics while tolerating older v1 additive fields. */
		function metricsOf(value, legacy) {
			if (!isRecord$1(value)) return void 0;
			const validNumber = (candidate) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0;
			if (!BASE_METRIC_KEYS.every((key) => validNumber(value[key]))) return void 0;
			const additive = {};
			for (const key of ADDITIVE_METRIC_KEYS) if (value[key] === void 0 && legacy) additive[key] = 0;
			else if (validNumber(value[key])) additive[key] = value[key];
			else return void 0;
			const usage = bucketsOf$1(value.usage);
			if (usage === void 0) return void 0;
			const retryUsage = value.retryUsage === void 0 && legacy ? {
				uncachedInputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0
			} : bucketsOf$1(value.retryUsage);
			if (retryUsage === void 0) return void 0;
			const rawSpans = value.spans === void 0 && legacy ? [] : value.spans;
			if (!Array.isArray(rawSpans)) return void 0;
			const spans = rawSpans.map(spanOf);
			if (spans.some((span) => span === void 0) || value.largestSpanId !== void 0 && typeof value.largestSpanId !== "string") return void 0;
			const decodedSpans = spans;
			if (decodedSpans.length > 0 && value.largestSpanId === void 0) return void 0;
			if (value.largestSpanId !== void 0) {
				const largest = decodedSpans.find((span) => span.id === value.largestSpanId);
				const maximumTokens = decodedSpans.reduce((maximum, span) => Math.max(maximum, totalTokens(span.usage)), 0);
				if (largest === void 0 || totalTokens(largest.usage) !== maximumTokens) return void 0;
			}
			const reconciliation = value.reconciliation === void 0 && legacy ? {
				status: "unavailable",
				providerUsage: usage,
				attributedUsage: {
					uncachedInputTokens: 0,
					outputTokens: 0,
					cacheReadTokens: 0,
					cacheWriteTokens: 0
				},
				delta: { ...usage }
			} : reconciliationOf(value.reconciliation);
			if (reconciliation === void 0) return void 0;
			if (reconciliation.status !== "unavailable") {
				const attributedUsage = decodedSpans.reduce((total, span) => ({
					uncachedInputTokens: total.uncachedInputTokens + span.usage.uncachedInputTokens,
					outputTokens: total.outputTokens + span.usage.outputTokens,
					cacheReadTokens: total.cacheReadTokens + span.usage.cacheReadTokens,
					cacheWriteTokens: total.cacheWriteTokens + span.usage.cacheWriteTokens
				}), {
					uncachedInputTokens: 0,
					outputTokens: 0,
					cacheReadTokens: 0,
					cacheWriteTokens: 0
				});
				if (!sameBuckets(usage, reconciliation.providerUsage) || !sameBuckets(attributedUsage, reconciliation.attributedUsage)) return void 0;
			}
			return {
				...Object.fromEntries(BASE_METRIC_KEYS.map((key) => [key, value[key]])),
				...additive,
				usage,
				retryUsage,
				spans: decodedSpans,
				...value.largestSpanId === void 0 ? {} : { largestSpanId: value.largestSpanId },
				reconciliation
			};
		}
		/** Decode one complete versioned trajectory report. */
		function trajectoryAnalysisOf(value) {
			if (!isRecord$1(value) || value.schema !== "dsh-token-usage/trajectory-analysis-v1" && value.schema !== "dsh-token-usage/trajectory-analysis-v2" || typeof value.sessionId !== "string" || typeof value.generatedAt !== "string" || typeof value.truncated !== "boolean" || typeof value.report !== "string" || !isRecord$1(value.model) || typeof value.model.provider !== "string" || typeof value.model.model !== "string") return void 0;
			const metrics = metricsOf(value.metrics, value.schema === "dsh-token-usage/trajectory-analysis-v1");
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
		/** Decode one safe provider identifier whose model list was unavailable. */
		function failureOf(value) {
			if (!isRecord(value) || typeof value.provider !== "string" || typeof value.providerName !== "string" || value.provider.length === 0 || value.providerName.length === 0) return void 0;
			return {
				provider: value.provider,
				providerName: value.providerName
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
			const rawFailures = value.failures === void 0 ? [] : value.failures;
			if (!Array.isArray(rawFailures)) return void 0;
			const failures = rawFailures.map(failureOf);
			if (failures.some((failure) => failure === void 0)) return void 0;
			const defaultSelection = selectionOf(value.default, available);
			return defaultSelection === void 0 ? {
				models: available,
				failures
			} : {
				models: available,
				failures,
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
			cacheHit: "缓存读取占输入",
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
			budgetRunRate: "按最近 7 个完整 UTC 日：日均 {average} Token，预计滚动 30 日 {projected} Token。",
			budgetForecastExceeded: "按当前运行率预计 30 日 {projected} Token，将超过预算 {budget} Token。",
			estimatedCost: "估算费用（USD）",
			cacheReadSavings: "缓存读取避免费用（USD）",
			priceCoverage: "费率覆盖",
			pricingTitle: "公开费率估算",
			pricingIntro: "内置 USD 费率表截至 {asOf}，可能已经变化；覆盖 {covered}/{total} Token、{routes}/{allRoutes} 个有用量路由。仅按路由标签匹配，不能验证端点、合同或账单。",
			pricingSource: "查看官方费率来源",
			priceUnavailable: "该 route 不在内置公开 USD 费率表中。",
			priceRate: "每 1M Token：输入 ${input} · 输出 ${output} · 缓存读 ${cacheRead} · 缓存写 ${cacheWrite}（公开费率 {asOf}）",
			efficiency: "Agent 效率与归因",
			efficiencyIntro: "仅基于已记录的聚合 Token、调用次数与上下文压缩统计，不推断任务质量。",
			assistantAttempts: "模型尝试次数",
			tokensPerAssistantAttempt: "每次模型尝试 Token",
			compactionRate: "每 100 次尝试的压缩",
			compactionTokenShare: "压缩 Token 占比",
			cacheReadShare: "缓存读取占输入",
			topRouteShare: "Top 路由占比",
			noRouteAttribution: "当前没有可归因的模型路由。",
			routeConcentration: "Top 路由 {route} 占全部 Token 的 {topOne}；Top 3 合计 {topThree}。",
			unattributedShare: "未归因用量占全部 Token 的 {share}；其调用次数与路由效率未知。",
			usageSignals: "用量信号",
			usageSignalsIntro: "运行率和突增检测只使用完整 UTC 日；不对每日用量归因模型。",
			dailyRunRate: "7 日日均 Token",
			projectedThirtyDayUsage: "预计 30 日 Token",
			anomalyRatio: "昨日相对基线",
			anomalyExcess: "昨日超出中位数",
			anomalyInsufficient: "突增检测需要昨日有用量，以及此前 28 日至少 5 个活跃完整 UTC 日。",
			dailyCoverageUnavailable: "旧版回退记录没有真实逐日 bucket，因此不用于运行率、预测或异常信号。",
			dailyCoveragePartial: "部分历史记录缺少真实逐日 bucket；为避免低估，运行率、预测和异常信号暂不显示。",
			anomalyNormal: "{date} 未超过稳健基线（活跃日中位数 {baseline} Token，样本 {active} 日）。",
			anomalyElevated: "{date} 使用 {tokens} Token，是活跃日中位数 {baseline} Token 的 {ratio}×，超出 {excess} Token（样本 {active} 日）。",
			inspectAnomalyDay: "查看异常日会话",
			usageAnalysis: "AI Token 用量分析",
			usageAnalysisIntro: "使用手动选择的已接入模型，基于聚合 Token 数据生成多维分析与优化建议。",
			analysisModel: "分析模型",
			analysisModelsLoading: "正在读取已接入模型…",
			analysisModelsFailed: "无法读取已接入模型：{message}",
			analysisModelsUnavailable: "没有可用于分析的已接入模型。请先在 DSH 的模型设置中接入模型。",
			analysisModelsPartial: "以下提供方暂时无法列出模型，但其他可用模型仍可分析：{providers}。",
			analysisModelsAllFailed: "暂时无法从以下提供方读取模型：{providers}。请稍后刷新目录。",
			refreshAnalysisModels: "刷新模型目录",
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
			openSessionFailed: "无法打开会话：{message}",
			showMoreSessions: "显示更多会话（已显示 {shown}/{total}）",
			providerModel: "提供方 / 模型",
			modelSort: "排序方式",
			modelSortTotal: "总 Token",
			modelSortCost: "估算费用",
			modelSortTokensPerAttempt: "每次记录调用 Token",
			modelSortCacheRead: "缓存读取占输入",
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
			analysisUnavailable: "旧版报告不可用",
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
			cacheHit: "Cache-read share of input",
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
			budgetRunRate: "Latest 7 complete UTC days: {average} tokens/day; projected rolling 30 days: {projected} tokens.",
			budgetForecastExceeded: "At the current run rate, the projected 30-day usage of {projected} tokens exceeds the {budget}-token budget.",
			estimatedCost: "Estimated cost (USD)",
			cacheReadSavings: "Cache-read avoided cost (USD)",
			priceCoverage: "Rate coverage",
			pricingTitle: "Public-rate estimate",
			pricingIntro: "Built-in USD rates as of {asOf} may have changed; coverage is {covered}/{total} tokens across {routes}/{allRoutes} active routes. Label matching cannot verify the endpoint, contract, or invoice.",
			pricingSource: "View official pricing source",
			priceUnavailable: "This route is not in the built-in public USD rate catalog.",
			priceRate: "Per 1M tokens: input ${input} · output ${output} · cache read ${cacheRead} · cache write ${cacheWrite} (public rate {asOf})",
			efficiency: "Agent efficiency and attribution",
			efficiencyIntro: "Uses only recorded aggregate Tokens, attempt counts, and context-compaction statistics; it does not infer task quality.",
			assistantAttempts: "Model attempts",
			tokensPerAssistantAttempt: "Tokens per model attempt",
			compactionRate: "Compactions per 100 attempts",
			compactionTokenShare: "Compaction Token share",
			cacheReadShare: "Cache-read share of input",
			topRouteShare: "Top route share",
			noRouteAttribution: "No attributable model route is available.",
			routeConcentration: "Top route {route} accounts for {topOne} of all Tokens; Top 3 account for {topThree}.",
			unattributedShare: "Unattributed usage is {share} of all Tokens; its attempt count and route efficiency are unknown.",
			usageSignals: "Usage signals",
			usageSignalsIntro: "Run rate and spike detection use complete UTC days only; daily usage is not attributed to a model.",
			dailyRunRate: "7-day daily Tokens",
			projectedThirtyDayUsage: "Projected 30-day Tokens",
			anomalyRatio: "Yesterday versus baseline",
			anomalyExcess: "Yesterday above median",
			anomalyInsufficient: "Spike detection needs usage yesterday and at least five active complete UTC days in the prior 28 days.",
			dailyCoverageUnavailable: "Legacy fallback records lack true daily buckets, so they are excluded from run rate, forecast, and anomaly signals.",
			dailyCoveragePartial: "Some historical records lack true daily buckets; run rate, forecast, and anomaly signals are hidden to avoid undercounting.",
			anomalyNormal: "{date} is within the robust baseline (active-day median {baseline} tokens; {active} days).",
			anomalyElevated: "{date} used {tokens} tokens, {ratio}× the active-day median of {baseline} tokens, exceeding it by {excess} tokens ({active} days).",
			inspectAnomalyDay: "Inspect spike-day sessions",
			usageAnalysis: "AI Token usage analysis",
			usageAnalysisIntro: "Use a manually selected integrated model to generate a multi-dimensional usage review and optimization recommendations from aggregate Token data.",
			analysisModel: "Analysis model",
			analysisModelsLoading: "Reading integrated models…",
			analysisModelsFailed: "Unable to read integrated models: {message}",
			analysisModelsUnavailable: "No integrated model is available for analysis. Add one in DSH Model settings first.",
			analysisModelsPartial: "Models could not be listed for {providers}; other available models can still run analysis.",
			analysisModelsAllFailed: "Models could not be read for {providers}. Refresh the catalog later.",
			refreshAnalysisModels: "Refresh model catalog",
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
			openSessionFailed: "Unable to open session: {message}",
			showMoreSessions: "Show more sessions ({shown}/{total} shown)",
			providerModel: "Provider / model",
			modelSort: "Sort by",
			modelSortTotal: "Total Tokens",
			modelSortCost: "Estimated cost",
			modelSortTokensPerAttempt: "Tokens per recorded call",
			modelSortCacheRead: "Cache-read share of input",
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
			analysisUnavailable: "Unavailable in legacy report",
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
			"connection",
			"sessions"
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
					openSession: (sessionId) => {
						ctx.sessions.open(sessionId);
					},
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