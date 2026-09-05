window.__ModuleLoader__.load({
	id: "dsh-token-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
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
		function totalTokens$5(usage) {
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
			})).filter((record) => totalTokens$5(record.usage) > 0);
			const peak = active.reduce((highest, record) => highest === void 0 || totalTokens$5(record.usage) > totalTokens$5(highest.usage) ? record : highest, void 0);
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
			const averageDailyTokens = dates.reduce((sum, date) => sum + totalTokens$5(byDate.get(date) ?? zeroBuckets$1()), 0) / dates.length;
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
			const tokens = totalTokens$5(byDate.get(date) ?? zeroBuckets$1());
			const activeBaseline = datesEndingOn(now - 2 * 864e5, 28).map((baselineDate) => totalTokens$5(byDate.get(baselineDate) ?? zeroBuckets$1())).filter((value) => value > 0);
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
				if (record === void 0 || totalTokens$5(record.usage) === 0) return [];
				return [{
					id: session.id,
					title: session.title,
					usage: { ...record.usage }
				}];
			}).sort((left, right) => totalTokens$5(right.usage) - totalTokens$5(left.usage) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
		}
		//#endregion
		//#region src/client/efficiency.ts
		/** Return one full disjoint-bucket total. */
		function totalTokens$4(usage) {
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
			const total = totalTokens$4(usage);
			const input = inputTokens$1(usage);
			const attributed = models.filter((model) => !isUnattributed$1(model));
			const unattributedTokens = models.filter(isUnattributed$1).reduce((sum, model) => sum + totalTokens$4(model.usage), 0);
			const assistantTokens = Math.max(0, total - totalTokens$4(compactionUsage));
			const topRoutes = attributed.map((model) => ({
				provider: model.provider,
				model: model.model,
				tokens: totalTokens$4(model.usage)
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
				compactionTokenShare: total === 0 ? void 0 : totalTokens$4(compactionUsage) / total,
				cacheReadInputShare: input === 0 ? void 0 : usage.cacheReadTokens / input,
				cacheWriteInputShare: input === 0 ? void 0 : usage.cacheWriteTokens / input,
				uncachedInputShare: input === 0 ? void 0 : usage.uncachedInputTokens / input,
				outputToInputRatio: input === 0 ? void 0 : usage.outputTokens / input,
				unattributedTokenShare: total === 0 ? 0 : unattributedTokens / total,
				topRoutes
			};
		}
		/** Sum all four disjoint provider Token buckets. */
		function totalTokens$3(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
		}
		/** Evaluate one route budget from exact date-by-model buckets. */
		function routeBudgetInsight(budget, records, now = Date.now()) {
			const days = records.filter((record) => record.provider === budget.provider && record.model === budget.model).map((record) => ({
				date: record.date,
				usage: { ...record.usage }
			}));
			const usedTokens = totalTokens$3(periodInsight(days, 30, now).usage);
			const projectedThirtyDayTokens = runRateInsight(days, now).projectedThirtyDayTokens;
			const ratio = usedTokens / budget.rolling30DayBudget;
			const status = usedTokens >= budget.rolling30DayBudget ? "exceeded" : projectedThirtyDayTokens > budget.rolling30DayBudget ? "forecast-exceeded" : ratio >= .8 ? "warning" : "healthy";
			return {
				...budget,
				usedTokens,
				projectedThirtyDayTokens,
				ratio,
				status
			};
		}
		const STATUS_PRIORITY = {
			exceeded: 3,
			"forecast-exceeded": 2,
			warning: 1,
			healthy: 0
		};
		/** Evaluate and risk-sort every persisted exact-route budget without mutating settings. */
		function routeBudgetInsights(budgets, records, now = Date.now()) {
			return budgets.map((budget) => routeBudgetInsight(budget, records, now)).sort((left, right) => STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status] || right.ratio - left.ratio || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
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
		//#region src/client/report-safety.ts
		/** Disable model-supplied Markdown images and raw HTML while preserving readable text and links. */
		function safeModelMarkdown(markdown) {
			return markdown.replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (_match, alt, destination) => `[${alt.length === 0 ? "image" : alt}](${destination})`).replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (_match, alt, reference) => `[${alt.length === 0 ? "image" : alt}][${reference}]`).replace(/!\[([^\]]*)\]/g, (_match, alt) => alt.length === 0 ? "image" : alt).replace(/!\[/g, "&#33;[").replace(/<(?=[A-Za-z/!?])/g, "&lt;");
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
				schema: "dsh-token-usage/export-v3",
				generatedAt,
				timezone: "UTC",
				totals: copyBuckets(source.usage),
				compactionUsage: copyBuckets(source.compactionUsage),
				pricingCatalogAsOf: PUBLIC_PRICE_CATALOG_AS_OF,
				pricing,
				coverage: {
					daily: source.dailyCoverage,
					modelDaily: source.modelDailyCoverage
				},
				models: pricing.models.slice().sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
				days: source.days.map((day) => ({
					date: day.date,
					usage: copyBuckets(day.usage)
				})).sort((left, right) => left.date.localeCompare(right.date)),
				modelDays: source.modelDays.map((modelDay) => ({
					provider: modelDay.provider,
					model: modelDay.model,
					date: modelDay.date,
					usage: copyBuckets(modelDay.usage)
				})).sort((left, right) => left.date.localeCompare(right.date) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
			};
		}
		/** Serialize the versioned aggregate-only export document. */
		function tokenUsageJson(source, generatedAt) {
			return `${JSON.stringify(tokenUsageExport(source, generatedAt), null, 2)}\n`;
		}
		/** Prevent spreadsheet applications from interpreting an untrusted cell as a formula. */
		function spreadsheetText(value) {
			return /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
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
		/** Export exact route-by-day buckets only when the source proves complete coverage. */
		function modelDailyUsageCsv(source) {
			if (source.modelDailyCoverage !== "complete") throw new Error("Date-by-model CSV requires complete and conserved route-day coverage.");
			return csv([[
				"date",
				"provider",
				"model",
				"uncachedInputTokens",
				"outputTokens",
				"cacheReadTokens",
				"cacheWriteTokens",
				"inputTokens",
				"totalTokens"
			], ...source.modelDays.slice().sort((left, right) => left.date.localeCompare(right.date) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)).map((modelDay) => [
				modelDay.date,
				modelDay.provider,
				modelDay.model,
				modelDay.usage.uncachedInputTokens,
				modelDay.usage.outputTokens,
				modelDay.usage.cacheReadTokens,
				modelDay.usage.cacheWriteTokens,
				modelDay.usage.uncachedInputTokens + modelDay.usage.cacheReadTokens + modelDay.usage.cacheWriteTokens,
				modelDay.usage.uncachedInputTokens + modelDay.usage.cacheReadTokens + modelDay.usage.cacheWriteTokens + modelDay.usage.outputTokens
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
		/** Create a filesystem-safe UTC suffix without embedding session identity. */
		function analysisReportFilename(kind, generatedAt) {
			return `dsh-${kind}-analysis-${generatedAt.replaceAll(/[^0-9A-Za-z]+/g, "-").replaceAll(/^-|-$/g, "")}.md`;
		}
		/** Serialize one aggregate analysis as a portable Markdown report. */
		function tokenUsageAnalysisMarkdown(analysis) {
			const auxiliary = analysis.analysisUsage === void 0 ? "Unavailable" : String(analysis.analysisUsage.uncachedInputTokens + analysis.analysisUsage.outputTokens + analysis.analysisUsage.cacheReadTokens + analysis.analysisUsage.cacheWriteTokens);
			const output = analysis.analysisUsage === void 0 ? "Unavailable" : String(analysis.analysisUsage.outputTokens);
			return [
				"# DSH Token Usage Analysis",
				"",
				`- Generated: ${analysis.generatedAt}`,
				`- Model: ${analysis.model.provider}/${analysis.model.model}`,
				`- Analysis tokens: ${auxiliary}`,
				`- Model output tokens: ${output}`,
				"",
				"## Model Report",
				"",
				safeModelMarkdown(analysis.report),
				""
			].join("\n");
		}
		/** Serialize one trajectory analysis with deterministic technical-control evidence. */
		function trajectoryAnalysisMarkdown(analysis) {
			const metrics = analysis.metrics;
			const auxiliary = analysis.analysisUsage === void 0 ? "Unavailable" : String(analysis.analysisUsage.uncachedInputTokens + analysis.analysisUsage.outputTokens + analysis.analysisUsage.cacheReadTokens + analysis.analysisUsage.cacheWriteTokens);
			const output = analysis.analysisUsage === void 0 ? "Unavailable" : String(analysis.analysisUsage.outputTokens);
			const approvalAuditRows = metrics.completeComplianceEvidenceAvailable ? [
				`| Approval closure | ${metrics.approvalsResolved}/${metrics.approvalsAsked} |`,
				`| Rejected/cancelled/unavailable | ${metrics.approvalsRejected + metrics.approvalsCancelled + metrics.approvalsUnavailable} |`,
				`| Unresolved/orphan approval records | ${metrics.unresolvedApprovals}/${metrics.orphanApprovalDecisions} |`,
				"| Persistent approval decisions | Not defined by ApprovalOutcome; session policy events excluded |"
			] : [
				`| Approval requests | ${metrics.approvalsAsked} |`,
				`| Rejected decisions | ${metrics.approvalsRejected} |`,
				"| v3 closure/categorized outcomes/audit gaps | Unavailable in this pre-v3 report |"
			];
			return [
				"# DSH Session Trajectory Analysis",
				"",
				`- Generated: ${analysis.generatedAt}`,
				`- Model: ${analysis.model.provider}/${analysis.model.model}`,
				`- Analysis tokens: ${auxiliary}`,
				`- Model output tokens: ${output}`,
				`- Evidence truncated: ${analysis.truncated ? "yes" : "no"}`,
				"",
				"## Deterministic Audit Summary",
				"",
				"| Control | Evidence |",
				"| --- | ---: |",
				...approvalAuditRows,
				`| Orphan tool calls/results | ${metrics.orphanToolCalls}/${metrics.orphanToolResults} |`,
				`| Open turns/steps | ${metrics.openTurns}/${metrics.openSteps} |`,
				`| Accounting reconciliation | ${metrics.reconciliation.status} |`,
				"",
				"> This is a metadata-based technical-control review, not legal advice or compliance certification.",
				"",
				"## Model Report",
				"",
				safeModelMarkdown(analysis.report),
				""
			].join("\n");
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
		//#region src/client/SafeMarkdownReport.tsx
		/** Render untrusted model Markdown semantically without activating remote images or raw HTML. */
		function SafeMarkdownReport({ report, className, copyLabel, copiedLabel, footnotesLabel }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
					text: (0, react.useMemo)(() => safeModelMarkdown(report), [report]),
					labels: (0, react.useMemo)(() => ({
						code: {
							copyLabel,
							copiedLabel
						},
						footnotes: footnotesLabel
					}), [
						copiedLabel,
						copyLabel,
						footnotesLabel
					])
				})
			});
		}
		//#endregion
		//#region \0dsh-token-usage-css:src/client/TokenUsageSection.module.css.mjs
		const css$1 = ".dsh-token-usage_section{width:100%;max-width:960px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:22px;display:flex}.dsh-token-usage_header{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}.dsh-token-usage_header h2,.dsh-token-usage_header p,.dsh-token-usage_block h3,.dsh-token-usage_status{margin:0}.dsh-token-usage_header h2{font-size:18px;font-weight:600;line-height:26px}.dsh-token-usage_header p{max-width:720px;color:var(--dsw-alias-label-tertiary);margin-top:5px;font-size:13px;line-height:20px}.dsh-token-usage_metrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;display:grid}.dsh-token-usage_metric{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:7px;min-width:0;padding:13px 14px;display:flex}.dsh-token-usage_metric span{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.dsh-token-usage_metric strong{font-variant-numeric:tabular-nums;text-overflow:ellipsis;font-size:20px;line-height:26px;overflow:hidden}.dsh-token-usage_activity{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:10px;min-width:0;padding:14px;display:flex}.dsh-token-usage_activityHead{justify-content:space-between;align-items:flex-end;gap:14px;display:flex}.dsh-token-usage_activityHead h3,.dsh-token-usage_activityHead p{margin:0}.dsh-token-usage_activityHead h3{font-size:14px;font-weight:600;line-height:22px}.dsh-token-usage_activityHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.dsh-token-usage_activityGrid{box-sizing:border-box;grid-template-rows:repeat(7,minmax(0,1fr));grid-template-columns:repeat(30,minmax(0,1fr));grid-auto-flow:column;gap:3px;width:100%;min-width:0;padding:2px;display:grid}.dsh-token-usage_activityCell,.dsh-token-usage_activityLegend i{background:var(--dsw-alias-bg-module-platform);border:0;border-radius:2px;flex:none;display:block}.dsh-token-usage_activityCell{aspect-ratio:1;cursor:pointer;width:100%;min-width:0;padding:0}.dsh-token-usage_activityCell:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.dsh-token-usage_activityCell[data-selected=true]{box-shadow:0 0 0 2px var(--dsw-alias-label-primary)}.dsh-token-usage_activityLegend i{width:10px;height:10px}.dsh-token-usage_activityCell[data-future=true]{cursor:default;background:0 0}.dsh-token-usage_activityCell[data-level=\"1\"],.dsh-token-usage_activityLegend i[data-level=\"1\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, var(--dsw-alias-bg-module-platform))}.dsh-token-usage_activityCell[data-level=\"2\"],.dsh-token-usage_activityLegend i[data-level=\"2\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 42%, var(--dsw-alias-bg-module-platform))}.dsh-token-usage_activityCell[data-level=\"3\"],.dsh-token-usage_activityLegend i[data-level=\"3\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 64%, var(--dsw-alias-bg-module-platform))}.dsh-token-usage_activityCell[data-level=\"4\"],.dsh-token-usage_activityLegend i[data-level=\"4\"]{background:var(--dsw-alias-state-business-primary)}.dsh-token-usage_activityLegend{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:4px;font-size:10px;line-height:14px;display:flex}.dsh-token-usage_insights,.dsh-token-usage_budget,.dsh-token-usage_dayDrilldown{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}.dsh-token-usage_insights h3,.dsh-token-usage_budget h3,.dsh-token-usage_dayDrilldown h3,.dsh-token-usage_insights p,.dsh-token-usage_budget p,.dsh-token-usage_dayDrilldown p{margin:0}.dsh-token-usage_insights h3,.dsh-token-usage_budget h3,.dsh-token-usage_dayDrilldown h3{font-size:14px;font-weight:600;line-height:22px}.dsh-token-usage_insights .dsh-token-usage_blockHead p,.dsh-token-usage_budget .dsh-token-usage_blockHead p,.dsh-token-usage_dayDrilldown .dsh-token-usage_blockHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.dsh-token-usage_detailMetrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;display:grid}.dsh-token-usage_trendControls,.dsh-token-usage_rangeTabs,.dsh-token-usage_exportControls{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.dsh-token-usage_trendControls{justify-content:flex-end}.dsh-token-usage_rangeTabs button,.dsh-token-usage_exportControls button,.dsh-token-usage_quietButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-height:30px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}.dsh-token-usage_rangeTabs button[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-business-primary)}.dsh-token-usage_rangeTabs button:focus-visible,.dsh-token-usage_exportControls button:focus-visible,.dsh-token-usage_quietButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.dsh-token-usage_exportControls{justify-content:flex-end}.dsh-token-usage_exportControls>span{color:var(--dsw-alias-label-tertiary);font-size:11px}.dsh-token-usage_exportControls>small{max-width:520px;color:var(--dsw-alias-label-tertiary);text-align:right;flex-basis:100%;font-size:10px;line-height:15px}.dsh-token-usage_exportControls button:disabled,.dsh-token-usage_quietButton:disabled{opacity:.5;cursor:not-allowed}.dsh-token-usage_insightNote{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.dsh-token-usage_anomalyNotice{color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:center;gap:10px;font-size:11px;line-height:17px;display:flex}.dsh-token-usage_anomalyNotice p{margin:0}.dsh-token-usage_budgetInput{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:7px;font-size:11px;display:flex}.dsh-token-usage_budgetInput input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:128px;height:30px;color:var(--dsw-alias-label-primary);font:inherit;font-variant-numeric:tabular-nums;border-radius:7px;outline:none;padding:0 8px;font-size:12px}.dsh-token-usage_budgetInput input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.dsh-token-usage_budgetProgress{align-items:center;gap:10px;display:flex}.dsh-token-usage_budgetProgress progress{width:min(320px,55%);height:8px;accent-color:var(--dsw-alias-state-business-primary)}.dsh-token-usage_budgetProgress strong{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:12px}.dsh-token-usage_budgetWarning{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.dsh-token-usage_routeBudgets{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:10px;padding-top:12px;display:flex}.dsh-token-usage_routeBudgetHead{justify-content:space-between;align-items:flex-end;gap:14px;display:flex}.dsh-token-usage_routeBudgetHead h4,.dsh-token-usage_routeBudgetHead p{margin:0}.dsh-token-usage_routeBudgetHead h4{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.dsh-token-usage_routeBudgetHead p{max-width:560px;color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.dsh-token-usage_routeBudgetEditor{grid-template-columns:minmax(160px,1fr) 132px auto;align-items:end;gap:7px;display:grid}.dsh-token-usage_routeBudgetEditor label{min-width:0;color:var(--dsw-alias-label-tertiary);flex-direction:column;gap:3px;font-size:10px;display:flex}.dsh-token-usage_routeBudgetEditor select,.dsh-token-usage_routeBudgetEditor input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:30px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:0 8px;font-size:11px}.dsh-token-usage_routeBudgetEditor select:focus-visible,.dsh-token-usage_routeBudgetEditor input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.dsh-token-usage_routeBudgetList{flex-direction:column;display:flex}.dsh-token-usage_routeBudgetRow{border-top:1px solid var(--dsw-alias-border-l2);grid-template-columns:minmax(170px,.8fr) minmax(260px,1.6fr) auto;align-items:center;gap:12px;padding:10px 0;display:grid}.dsh-token-usage_routeBudgetRow:last-child{padding-bottom:0}.dsh-token-usage_routeBudgetIdentity{flex-direction:column;gap:2px;min-width:0;display:flex}.dsh-token-usage_routeBudgetIdentity>strong{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.dsh-token-usage_routeBudgetStatus{color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:600;line-height:15px}.dsh-token-usage_routeBudgetStatus[data-status=warning],.dsh-token-usage_routeBudgetStatus[data-status=forecast-exceeded]{color:var(--dsw-alias-state-business-primary)}.dsh-token-usage_routeBudgetStatus[data-status=exceeded]{color:var(--dsw-alias-state-error-primary)}.dsh-token-usage_routeBudgetStatus[data-status=unavailable]{color:var(--dsw-alias-label-tertiary)}.dsh-token-usage_routeBudgetUsage{flex-direction:column;gap:3px;min-width:0;display:flex}.dsh-token-usage_routeBudgetRow>.dsh-token-usage_quietButton{justify-self:end}.dsh-token-usage_contributors{flex-direction:column;gap:7px;display:flex}.dsh-token-usage_contributors>strong{color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-token-usage_contributors ol{gap:5px;margin:0;padding:0;list-style:none;display:grid}.dsh-token-usage_contributors li{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:7px;justify-content:space-between;align-items:center;gap:12px;padding:7px 9px;font-size:12px;display:flex}.dsh-token-usage_contributors li>span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.dsh-token-usage_block{flex-direction:column;gap:10px;min-width:0;display:flex}.dsh-token-usage_block h3{font-size:14px;font-weight:600;line-height:22px}.dsh-token-usage_blockHead{justify-content:space-between;align-items:center;gap:16px;display:flex}.dsh-token-usage_blockHead input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:min(280px,45%);height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 11px;font-size:12px}.dsh-token-usage_blockHead input::placeholder{color:var(--dsw-alias-label-tertiary)}.dsh-token-usage_blockHead input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.dsh-token-usage_tableWrap{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;min-width:0;overflow:auto}.dsh-token-usage_tableWrap table{border-collapse:collapse;width:100%;min-width:0;font-size:12px;line-height:18px}.dsh-token-usage_tableWrap .dsh-token-usage_modelTable{table-layout:fixed;min-width:580px}.dsh-token-usage_tableWrap .dsh-token-usage_sessionTable{min-width:780px}.dsh-token-usage_modelTable th:first-child,.dsh-token-usage_modelTable td:first-child{width:30%}.dsh-token-usage_modelTable th:nth-child(2),.dsh-token-usage_modelTable td:nth-child(2){width:18%}.dsh-token-usage_tableWrap th,.dsh-token-usage_tableWrap td{border-bottom:1px solid var(--dsw-alias-border-l1);text-align:right;vertical-align:middle;white-space:nowrap;padding:10px 12px}.dsh-token-usage_tableWrap th{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500}.dsh-token-usage_tableWrap th:first-child,.dsh-token-usage_tableWrap td:first-child{text-align:left;max-width:270px}.dsh-token-usage_tableWrap tbody tr:last-child td{border-bottom:0}.dsh-token-usage_tableWrap tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}.dsh-token-usage_tableWrap td{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.dsh-token-usage_tableWrap td strong,.dsh-token-usage_tableWrap td span{text-overflow:ellipsis;max-width:260px;display:block;overflow:hidden}.dsh-token-usage_tableWrap td strong{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}.dsh-token-usage_tableWrap td span{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}.dsh-token-usage_tableWrap td .dsh-token-usage_tokenValue{max-width:none;color:inherit;font-size:inherit;line-height:inherit;display:inline}.dsh-token-usage_tableWrap td .dsh-token-usage_cacheDetail{margin-top:2px}.dsh-token-usage_analysisEmpty,.dsh-token-usage_analysisError,.dsh-token-usage_analysisPanel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:12px;min-width:0;padding:14px;display:flex}.dsh-token-usage_analysisEmpty{border-style:dashed}.dsh-token-usage_analysisError{border-color:var(--dsw-alias-state-error-primary)}.dsh-token-usage_analysisEmpty h3,.dsh-token-usage_analysisEmpty p,.dsh-token-usage_analysisError h3,.dsh-token-usage_analysisError p,.dsh-token-usage_analysisPanel h3,.dsh-token-usage_analysisPanel p{margin:0}.dsh-token-usage_analysisEmpty h3,.dsh-token-usage_analysisError h3,.dsh-token-usage_analysisPanel h3{font-size:14px;font-weight:600;line-height:22px}.dsh-token-usage_analysisEmpty p,.dsh-token-usage_analysisError p,.dsh-token-usage_analysisPanel .dsh-token-usage_blockHead p,.dsh-token-usage_analysisPrivacy{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.dsh-token-usage_analysisError p,.dsh-token-usage_analysisWarning{color:var(--dsw-alias-state-error-primary)}.dsh-token-usage_analysisCost{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;padding:5px 9px;font-size:11px}.dsh-token-usage_analysisReport{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-module-platform);max-height:640px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;border-radius:10px;margin:0;padding:18px 20px;font-size:13px;line-height:1.75;overflow:auto}.dsh-token-usage_analysisReport h1,.dsh-token-usage_analysisReport h2,.dsh-token-usage_analysisReport h3,.dsh-token-usage_analysisReport h4{color:var(--dsw-alias-label-primary);margin:1.25em 0 .55em;line-height:1.35}.dsh-token-usage_analysisReport h1:first-child,.dsh-token-usage_analysisReport h2:first-child,.dsh-token-usage_analysisReport h3:first-child,.dsh-token-usage_analysisReport p:first-child{margin-top:0}.dsh-token-usage_analysisReport p,.dsh-token-usage_analysisReport ul,.dsh-token-usage_analysisReport ol,.dsh-token-usage_analysisReport blockquote,.dsh-token-usage_analysisReport table{margin:.65em 0}.dsh-token-usage_analysisReport blockquote{border-left:3px solid var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-tertiary);padding-left:12px}.dsh-token-usage_analysisReport table{border-collapse:collapse;width:100%;font-size:12px}.dsh-token-usage_analysisReport th,.dsh-token-usage_analysisReport td{border:1px solid var(--dsw-alias-border-l2);text-align:left;vertical-align:top;padding:7px 9px}.dsh-token-usage_analysisReport th{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}.dsh-token-usage_analysisReport code{background:var(--dsw-alias-bg-layer-3);border-radius:4px;padding:1px 4px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}.dsh-token-usage_analysisHeaderActions{flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:8px;display:flex}.dsh-token-usage_analysisSummaryGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;display:grid}.dsh-token-usage_analysisSummaryGroup{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:9px;min-width:0;padding:10px 12px}.dsh-token-usage_analysisSummaryGroup h4{color:var(--dsw-alias-label-primary);margin:0 0 6px;font-size:12px;line-height:18px}.dsh-token-usage_analysisSummaryGroup dl{gap:4px;margin:0;display:grid}.dsh-token-usage_analysisSummaryGroup dl>div{justify-content:space-between;align-items:baseline;gap:10px;display:flex}.dsh-token-usage_analysisSummaryGroup dt{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.dsh-token-usage_analysisSummaryGroup dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;margin:0;font-size:12px;font-weight:600}.dsh-token-usage_analysisLoading{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;align-items:flex-start;gap:12px;padding:14px;display:flex}.dsh-token-usage_analysisSpinner{border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-state-business-primary);border-radius:50%;flex:none;width:18px;height:18px;margin-top:2px;animation:.85s linear infinite dsh-token-usage_token-analysis-spin}.dsh-token-usage_analysisLoadingBody{flex:1;gap:6px;min-width:0;display:grid}.dsh-token-usage_analysisLoadingBody h3,.dsh-token-usage_analysisLoadingBody p{margin:0}.dsh-token-usage_analysisLoadingBody h3{color:var(--dsw-alias-label-primary);font-size:14px}.dsh-token-usage_analysisLoadingBody p,.dsh-token-usage_analysisProgressMeta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.dsh-token-usage_analysisProgressMeta{flex-wrap:wrap;gap:10px;display:flex}.dsh-token-usage_analysisProgressMeta strong{color:var(--dsw-alias-state-business-primary)}.dsh-token-usage_analysisLoadingBody progress{width:100%;height:7px;accent-color:var(--dsw-alias-state-business-primary)}@keyframes dsh-token-usage_token-analysis-spin{to{transform:rotate(360deg)}}.dsh-token-usage_analysisWarning{font-size:11px;line-height:18px}.dsh-token-usage_modelSort{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:11px;display:flex}.dsh-token-usage_modelSort select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:116px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:5px 7px;font-size:12px}.dsh-token-usage_modelSort select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.dsh-token-usage_sessionLink{max-width:240px;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;background:0 0;border:0;padding:0;font-weight:600;text-decoration:underline #0000;display:block;overflow:hidden}.dsh-token-usage_sessionLink:hover{text-decoration-color:currentColor}.dsh-token-usage_sessionLink:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:2px}.dsh-token-usage_analysisButton{border:1px solid var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, var(--dsw-alias-bg-layer-1));min-height:28px;color:var(--dsw-alias-state-business-primary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}.dsh-token-usage_analysisButton:disabled{cursor:wait;opacity:.65}.dsh-token-usage_analysisButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.dsh-token-usage_pricingNotice{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary);border-radius:10px;align-items:baseline;gap:8px;padding:10px 12px;font-size:11px;line-height:18px;display:flex}.dsh-token-usage_pricingNotice strong{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-weight:600}.dsh-token-usage_pricingNotice p{margin:0}.dsh-token-usage_priceUnknown{color:var(--dsw-alias-label-tertiary)}.dsh-token-usage_priceValue{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}.dsh-token-usage_analysisModelSelect{min-width:180px;color:var(--dsw-alias-label-tertiary);gap:4px;font-size:11px;line-height:16px;display:grid}.dsh-token-usage_analysisModelSelect select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:7px;padding:5px 7px;font-size:12px}.dsh-token-usage_analysisModelSelect select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.dsh-token-usage_analysisScope{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}.dsh-token-usage_analysisErrorText{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:18px}.dsh-token-usage_conversationAnalysisButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);height:28px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:7px;padding:0 9px;font-size:11px}.dsh-token-usage_conversationAnalysisButton:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.dsh-token-usage_conversationAnalysisButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.dsh-token-usage_analysisDialog{width:min(820px,100%);max-height:min(84dvh,780px)}.dsh-token-usage_analysisDialogContent{overscroll-behavior:contain;min-height:0;overflow-y:auto}.dsh-token-usage_analysisDialog .dsh-token-usage_analysisReport{max-height:min(48dvh,460px)}.dsh-token-usage_conversationAnalysisControls{flex-wrap:wrap;align-items:end;gap:10px;margin-bottom:12px;display:flex}.dsh-token-usage_analysisHistory{border-top:1px solid var(--dsw-alias-border-l1);gap:9px;margin-top:16px;padding-top:14px;display:grid}.dsh-token-usage_analysisHistory h3,.dsh-token-usage_analysisHistory p{margin:0}.dsh-token-usage_analysisHistory .dsh-token-usage_blockHead>span{color:var(--dsw-alias-label-tertiary);font-size:11px}.dsh-token-usage_analysisHistory ul{gap:6px;max-height:210px;margin:0;padding:0;list-style:none;display:grid;overflow:auto}.dsh-token-usage_analysisHistory li{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:8px;align-items:stretch;display:flex}.dsh-token-usage_analysisHistory li>button:first-child{min-width:0;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;background:0 0;border:0;flex:1;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;display:flex}.dsh-token-usage_analysisHistory li>button:first-child:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-token-usage_analysisHistory li strong{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.dsh-token-usage_analysisHistory li span{color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-size:10px}.dsh-token-usage_historyDeleteButton{border:0;border-left:1px solid var(--dsw-alias-border-l1);width:34px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;font-size:18px}.dsh-token-usage_historyDeleteButton:hover{color:var(--dsw-alias-state-error-primary)}.dsh-token-usage_status{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);border-radius:10px;padding:16px;font-size:13px;line-height:20px}@media (prefers-reduced-motion:reduce){.dsh-token-usage_analysisSpinner{animation:none}}@media (width<=860px){.dsh-token-usage_metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.dsh-token-usage_detailMetrics,.dsh-token-usage_analysisSummaryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-token-usage_routeBudgetHead{flex-direction:column;align-items:stretch}.dsh-token-usage_routeBudgetRow{grid-template-columns:minmax(160px,.8fr) minmax(240px,1.4fr) auto}}@media (width<=580px){.dsh-token-usage_metrics,.dsh-token-usage_detailMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}.dsh-token-usage_analysisSummaryGrid{grid-template-columns:minmax(0,1fr)}.dsh-token-usage_header,.dsh-token-usage_activityHead,.dsh-token-usage_blockHead{flex-direction:column;align-items:stretch;gap:8px}.dsh-token-usage_exportControls{justify-content:flex-start}.dsh-token-usage_exportControls>small{text-align:left}.dsh-token-usage_routeBudgetEditor,.dsh-token-usage_routeBudgetRow{grid-template-columns:minmax(0,1fr)}.dsh-token-usage_routeBudgetRow{gap:8px}.dsh-token-usage_routeBudgetRow>.dsh-token-usage_quietButton{justify-self:start}.dsh-token-usage_budgetInput{justify-content:space-between}.dsh-token-usage_pricingNotice{flex-direction:column;align-items:flex-start;gap:2px}.dsh-token-usage_budgetProgress{flex-direction:column;align-items:flex-start}.dsh-token-usage_budgetProgress progress,.dsh-token-usage_blockHead input{width:100%}}";
		const tagId$1 = "dsh-token-usage/TokenUsageSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-token-usage";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var TokenUsageSection_module_css_default = {
			"activity": "dsh-token-usage_activity",
			"activityCell": "dsh-token-usage_activityCell",
			"activityGrid": "dsh-token-usage_activityGrid",
			"activityHead": "dsh-token-usage_activityHead",
			"activityLegend": "dsh-token-usage_activityLegend",
			"analysisButton": "dsh-token-usage_analysisButton",
			"analysisCost": "dsh-token-usage_analysisCost",
			"analysisDialog": "dsh-token-usage_analysisDialog",
			"analysisDialogContent": "dsh-token-usage_analysisDialogContent",
			"analysisEmpty": "dsh-token-usage_analysisEmpty",
			"analysisError": "dsh-token-usage_analysisError",
			"analysisErrorText": "dsh-token-usage_analysisErrorText",
			"analysisHeaderActions": "dsh-token-usage_analysisHeaderActions",
			"analysisHistory": "dsh-token-usage_analysisHistory",
			"analysisLoading": "dsh-token-usage_analysisLoading",
			"analysisLoadingBody": "dsh-token-usage_analysisLoadingBody",
			"analysisModelSelect": "dsh-token-usage_analysisModelSelect",
			"analysisPanel": "dsh-token-usage_analysisPanel",
			"analysisPrivacy": "dsh-token-usage_analysisPrivacy",
			"analysisProgressMeta": "dsh-token-usage_analysisProgressMeta",
			"analysisReport": "dsh-token-usage_analysisReport",
			"analysisScope": "dsh-token-usage_analysisScope",
			"analysisSpinner": "dsh-token-usage_analysisSpinner",
			"analysisSummaryGrid": "dsh-token-usage_analysisSummaryGrid",
			"analysisSummaryGroup": "dsh-token-usage_analysisSummaryGroup",
			"analysisWarning": "dsh-token-usage_analysisWarning",
			"anomalyNotice": "dsh-token-usage_anomalyNotice",
			"block": "dsh-token-usage_block",
			"blockHead": "dsh-token-usage_blockHead",
			"budget": "dsh-token-usage_budget",
			"budgetInput": "dsh-token-usage_budgetInput",
			"budgetProgress": "dsh-token-usage_budgetProgress",
			"budgetWarning": "dsh-token-usage_budgetWarning",
			"cacheDetail": "dsh-token-usage_cacheDetail",
			"contributors": "dsh-token-usage_contributors",
			"conversationAnalysisButton": "dsh-token-usage_conversationAnalysisButton",
			"conversationAnalysisControls": "dsh-token-usage_conversationAnalysisControls",
			"dayDrilldown": "dsh-token-usage_dayDrilldown",
			"detailMetrics": "dsh-token-usage_detailMetrics",
			"exportControls": "dsh-token-usage_exportControls",
			"header": "dsh-token-usage_header",
			"historyDeleteButton": "dsh-token-usage_historyDeleteButton",
			"insightNote": "dsh-token-usage_insightNote",
			"insights": "dsh-token-usage_insights",
			"metric": "dsh-token-usage_metric",
			"metrics": "dsh-token-usage_metrics",
			"modelSort": "dsh-token-usage_modelSort",
			"modelTable": "dsh-token-usage_modelTable",
			"priceUnknown": "dsh-token-usage_priceUnknown",
			"priceValue": "dsh-token-usage_priceValue",
			"pricingNotice": "dsh-token-usage_pricingNotice",
			"quietButton": "dsh-token-usage_quietButton",
			"rangeTabs": "dsh-token-usage_rangeTabs",
			"routeBudgetEditor": "dsh-token-usage_routeBudgetEditor",
			"routeBudgetHead": "dsh-token-usage_routeBudgetHead",
			"routeBudgetIdentity": "dsh-token-usage_routeBudgetIdentity",
			"routeBudgetList": "dsh-token-usage_routeBudgetList",
			"routeBudgetRow": "dsh-token-usage_routeBudgetRow",
			"routeBudgetStatus": "dsh-token-usage_routeBudgetStatus",
			"routeBudgetUsage": "dsh-token-usage_routeBudgetUsage",
			"routeBudgets": "dsh-token-usage_routeBudgets",
			"section": "dsh-token-usage_section",
			"sessionLink": "dsh-token-usage_sessionLink",
			"sessionTable": "dsh-token-usage_sessionTable",
			"status": "dsh-token-usage_status",
			"tableWrap": "dsh-token-usage_tableWrap",
			"token-analysis-spin": "dsh-token-usage_token-analysis-spin",
			"tokenValue": "dsh-token-usage_tokenValue",
			"trendControls": "dsh-token-usage_trendControls"
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
		/** Whether two detached provider bucket sets are exactly conserved. */
		function sameBuckets$1(left, right) {
			return left.uncachedInputTokens === right.uncachedInputTokens && left.outputTokens === right.outputTokens && left.cacheReadTokens === right.cacheReadTokens && left.cacheWriteTokens === right.cacheWriteTokens;
		}
		/** Sum detached bucket records without retaining projection-owned objects. */
		function summedUsage(records) {
			return records.reduce((sum, record) => addBuckets(sum, record.usage), zeroBuckets());
		}
		/** Compare two aggregate maps without accepting missing or extra keys. */
		function sameUsageMap(actual, expected) {
			return actual.size === expected.size && [...expected].every(([key, usage]) => {
				const value = actual.get(key);
				return value !== void 0 && sameBuckets$1(value, usage);
			});
		}
		/** Verify daily buckets conserve the session-level projection total. */
		function dailyUsageConserved(recorded) {
			return sameBuckets$1(summedUsage(recorded.days), recorded.usage);
		}
		/** Verify date-by-model buckets conserve totals across session, route, and UTC day dimensions. */
		function modelDailyUsageConserved(recorded) {
			if (!sameBuckets$1(summedUsage(recorded.modelDays), recorded.usage)) return false;
			const routeTotals = /* @__PURE__ */ new Map();
			const dayTotals = /* @__PURE__ */ new Map();
			for (const record of recorded.modelDays) {
				if (totalTokens$1(record.usage) === 0) continue;
				const route = modelKey(record);
				routeTotals.set(route, addBuckets(routeTotals.get(route) ?? zeroBuckets(), record.usage));
				dayTotals.set(record.date, addBuckets(dayTotals.get(record.date) ?? zeroBuckets(), record.usage));
			}
			const expectedRoutes = new Map(recorded.models.filter((model) => totalTokens$1(model.usage) > 0).map((model) => [modelKey(model), model.usage]));
			const expectedDays = new Map(recorded.days.filter((day) => totalTokens$1(day.usage) > 0).map((day) => [day.date, day.usage]));
			return sameUsageMap(routeTotals, expectedRoutes) && sameUsageMap(dayTotals, expectedDays);
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
		/** Stable provider/model/date identity for route-day aggregation. */
		function modelDayKey(model) {
			return JSON.stringify([
				model.provider,
				model.model,
				model.date
			]);
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
			const dailyUsageReliable = recorded?.days !== void 0 && dailyUsageConserved(recorded);
			const modelDailyUsageReliable = recorded?.modelDays !== void 0 && dailyUsageReliable && modelDailyUsageConserved(recorded);
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
				modelDays: recorded?.modelDays ?? [],
				dailyUsageReliable,
				modelDailyUsageReliable
			};
		}
		/** Aggregate session summaries into totals and provider/model records. */
		function aggregateUsage(summaries) {
			const sessions = [];
			const models = /* @__PURE__ */ new Map();
			const days = /* @__PURE__ */ new Map();
			const modelDays = /* @__PURE__ */ new Map();
			const operationalDays = /* @__PURE__ */ new Map();
			let usage = zeroBuckets();
			let assistantRequests = 0;
			let compactionRequests = 0;
			let compactionUsage = zeroBuckets();
			let reliableDailySessions = 0;
			let reliableModelDailySessions = 0;
			for (const summary of summaries) {
				const row = sessionRow(summary);
				if (row === null) continue;
				sessions.push(row);
				usage = addBuckets(usage, row.usage);
				assistantRequests += row.assistantRequests;
				compactionRequests += row.compactionRequests;
				compactionUsage = addBuckets(compactionUsage, row.compactionUsage);
				if (row.dailyUsageReliable) reliableDailySessions += 1;
				if (row.modelDailyUsageReliable) reliableModelDailySessions += 1;
				for (const day of row.days) {
					days.set(day.date, addBuckets(days.get(day.date) ?? zeroBuckets(), day.usage));
					if (row.dailyUsageReliable) operationalDays.set(day.date, addBuckets(operationalDays.get(day.date) ?? zeroBuckets(), day.usage));
				}
				for (const modelDay of row.modelDays) {
					const key = modelDayKey(modelDay);
					const current = modelDays.get(key);
					modelDays.set(key, current === void 0 ? {
						...modelDay,
						usage: { ...modelDay.usage }
					} : {
						...current,
						usage: addBuckets(current.usage, modelDay.usage)
					});
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
				modelDays: [...modelDays.values()].sort((left, right) => left.date.localeCompare(right.date) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
				operationalDays: [...operationalDays.entries()].map(([date, usage]) => ({
					date,
					usage
				})).sort((left, right) => left.date.localeCompare(right.date)),
				dailyCoverage: reliableDailySessions === 0 ? "unavailable" : reliableDailySessions === sessions.length ? "complete" : "partial",
				modelDailyCoverage: reliableModelDailySessions === 0 ? "unavailable" : reliableModelDailySessions === sessions.length ? "complete" : "partial"
			};
		}
		/** Return one exact route's reliable daily buckets from the aggregate route-day table. */
		function modelTrendDays(modelDays, route) {
			return modelDays.filter((modelDay) => modelKey(modelDay) === route).map((modelDay) => ({
				date: modelDay.date,
				usage: { ...modelDay.usage }
			}));
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
		/** Group related trajectory facts without promoting every number to a large card. */
		function AnalysisSummaryGroup({ title, rows }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: TokenUsageSection_module_css_default.analysisSummaryGroup,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", { children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: row.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
					title: row.title,
					children: row.value
				})] }, row.label)) })]
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
		function PeriodInsights({ days, range, models, selectedModel, modelDailyCoverage, onRangeChange, onModelChange, t }) {
			const insight = (0, react.useMemo)(() => periodInsight(days, range), [days, range]);
			const current = totalTokens$1(insight.usage);
			const previous = totalTokens$1(insight.previousUsage);
			const delta = previous === 0 ? void 0 : Math.round((current - previous) / previous * 100);
			const peak = insight.peak;
			const selectedRoute = models.find((model) => modelKey(model) === selectedModel);
			let modelCoverageNote = null;
			if (modelDailyCoverage !== "complete") modelCoverageNote = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: TokenUsageSection_module_css_default.insightNote,
				children: t(modelDailyCoverage === "partial" ? "modelDailyCoveragePartial" : "modelDailyCoverageUnavailable")
			});
			else if (selectedRoute !== void 0) modelCoverageNote = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: TokenUsageSection_module_css_default.insightNote,
				children: t("trendModelScope", { route: routeLabel(selectedRoute) })
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.insights,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.blockHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("trend") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("trendIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: TokenUsageSection_module_css_default.trendControls,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: TokenUsageSection_module_css_default.modelSort,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("trendModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t("trendModel"),
									value: selectedModel,
									disabled: modelDailyCoverage !== "complete",
									onChange: (event) => {
										onModelChange(event.currentTarget.value);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("allModels")
									}), models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: modelKey(model),
										children: routeLabel(model)
									}, modelKey(model)))]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
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
					}),
					modelCoverageNote
				]
			});
		}
		/** Render persistent global and exact-route rolling Token budgets. */
		function BudgetPanel({ operationalDays, dailyCoverage, models, modelDays, modelDailyCoverage, snapshot, setBudget, setRouteBudget, t }) {
			const insight = (0, react.useMemo)(() => periodInsight(operationalDays, 30), [operationalDays]);
			const runRate = (0, react.useMemo)(() => runRateInsight(operationalDays), [operationalDays]);
			const runRateAvailable = dailyCoverage === "complete";
			const used = totalTokens$1(insight.usage);
			const budget = snapshot.budget;
			const enabled = budget > 0;
			const durableValue = enabled ? String(budget) : "";
			const [draft, setDraft] = (0, react.useState)(durableValue);
			const [routeSelection, setRouteSelection] = (0, react.useState)("");
			const [routeDraft, setRouteDraft] = (0, react.useState)("");
			const editGeneration = (0, react.useRef)(0);
			const dirtyDraft = (0, react.useRef)(false);
			const ratio = enabled ? used / budget : 0;
			const configurableModels = (0, react.useMemo)(() => models.filter((model) => !isUnattributed(model) && totalTokens$1(model.usage) > 0), [models]);
			const persistedRouteBudgets = snapshot.routeBudgets ?? [];
			const routeInsights = (0, react.useMemo)(() => modelDailyCoverage === "complete" ? routeBudgetInsights(persistedRouteBudgets, modelDays) : [], [
				modelDailyCoverage,
				modelDays,
				persistedRouteBudgets
			]);
			const routeInsightByKey = (0, react.useMemo)(() => new Map(routeInsights.map((route) => [modelKey(route), route])), [routeInsights]);
			const routeRows = persistedRouteBudgets.map((route) => ({
				route,
				insight: routeInsightByKey.get(modelKey(route))
			})).sort((left, right) => {
				const insightOrder = routeInsights.findIndex((insight) => modelKey(insight) === modelKey(left.route)) - routeInsights.findIndex((insight) => modelKey(insight) === modelKey(right.route));
				return modelDailyCoverage === "complete" && insightOrder !== 0 ? insightOrder : left.route.provider.localeCompare(right.route.provider) || left.route.model.localeCompare(right.route.model);
			});
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
			const saveRoute = () => {
				const selected = configurableModels.find((model) => modelKey(model) === routeSelection);
				const next = Number(routeDraft);
				if (selected === void 0 || !Number.isSafeInteger(next) || next <= 0) return;
				setRouteBudget(selected.provider, selected.model, next).then(() => {
					setRouteDraft("");
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
						ratio >= 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: TokenUsageSection_module_css_default.budgetWarning,
							children: t("budgetExceeded", { excess: formatCompactTokens(Math.max(0, used - budget)) })
						}) : null,
						runRateAvailable && ratio < 1 && runRate.projectedThirtyDayTokens > budget ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: TokenUsageSection_module_css_default.budgetWarning,
							children: t("budgetForecastExceeded", {
								projected: formatCompactTokens(runRate.projectedThirtyDayTokens),
								budget: formatCompactTokens(budget)
							})
						}) : null
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: TokenUsageSection_module_css_default.routeBudgets,
						"aria-labelledby": "token-usage-route-budgets",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: TokenUsageSection_module_css_default.routeBudgetHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
									id: "token-usage-route-budgets",
									children: t("routeBudgets")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("routeBudgetsIntro") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: TokenUsageSection_module_css_default.routeBudgetEditor,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("routeBudgetModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											value: routeSelection,
											disabled: snapshot.status !== "ready" || configurableModels.length === 0,
											onChange: (event) => {
												const value = event.currentTarget.value;
												setRouteSelection(value);
												const current = persistedRouteBudgets.find((route) => modelKey(route) === value);
												setRouteDraft(current === void 0 ? "" : String(current.rolling30DayBudget));
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: t("routeBudgetChooseModel")
											}), configurableModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: modelKey(model),
												children: routeLabel(model)
											}, modelKey(model)))]
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("routeBudgetInput") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "number",
											inputMode: "numeric",
											min: "1",
											step: "1",
											value: routeDraft,
											placeholder: "0",
											disabled: snapshot.status !== "ready",
											onChange: (event) => {
												setRouteDraft(event.currentTarget.value);
											},
											onKeyDown: (event) => {
												if (event.key === "Enter") saveRoute();
											}
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: TokenUsageSection_module_css_default.quietButton,
											type: "button",
											disabled: routeSelection === "" || !Number.isSafeInteger(Number(routeDraft)) || Number(routeDraft) <= 0,
											onClick: saveRoute,
											children: t("routeBudgetSave")
										})
									]
								})]
							}),
							modelDailyCoverage === "complete" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: TokenUsageSection_module_css_default.insightNote,
								children: t(modelDailyCoverage === "partial" ? "routeBudgetCoveragePartial" : "routeBudgetCoverageUnavailable")
							}),
							persistedRouteBudgets.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: TokenUsageSection_module_css_default.insightNote,
								children: t("routeBudgetsEmpty")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: TokenUsageSection_module_css_default.routeBudgetList,
								"aria-live": "polite",
								children: routeRows.map(({ route, insight }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
									className: TokenUsageSection_module_css_default.routeBudgetRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: TokenUsageSection_module_css_default.routeBudgetIdentity,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: routeLabel(route) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: TokenUsageSection_module_css_default.routeBudgetStatus,
												"data-status": insight?.status ?? "unavailable",
												children: insight === void 0 ? t("routeBudgetUnavailable") : t(`routeBudgetStatus_${insight.status}`)
											})]
										}),
										insight === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: TokenUsageSection_module_css_default.routeBudgetUsage,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: TokenUsageSection_module_css_default.budgetProgress,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
													value: Math.min(insight.usedTokens, insight.rolling30DayBudget),
													max: insight.rolling30DayBudget,
													"aria-label": t("routeBudgetProgress", {
														used: formatCompactTokens(insight.usedTokens),
														budget: formatCompactTokens(insight.rolling30DayBudget),
														percent: Math.round(insight.ratio * 100)
													})
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("routeBudgetProgress", {
													used: formatCompactTokens(insight.usedTokens),
													budget: formatCompactTokens(insight.rolling30DayBudget),
													percent: Math.round(insight.ratio * 100)
												}) })]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: TokenUsageSection_module_css_default.insightNote,
												children: t("routeBudgetForecast", { projected: formatCompactTokens(insight.projectedThirtyDayTokens) })
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: TokenUsageSection_module_css_default.quietButton,
											type: "button",
											"aria-label": t("routeBudgetRemoveFor", { route: routeLabel(route) }),
											onClick: () => {
												setRouteBudget(route.provider, route.model, 0);
											},
											children: t("routeBudgetRemove")
										})
									]
								}, modelKey(route)))
							})
						]
					})
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
					case "models":
						download.save(`dsh-token-usage-models-${date}.csv`, "text/csv;charset=utf-8", modelUsageCsv(data));
						return;
					case "modelDaily": download.save(`dsh-token-usage-model-daily-${date}.csv`, "text/csv;charset=utf-8", modelDailyUsageCsv(data));
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
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: data.modelDailyCoverage !== "complete",
						title: data.modelDailyCoverage === "complete" ? void 0 : t("exportModelDailyUnavailable"),
						onClick: () => {
							save("modelDaily");
						},
						children: t("exportModelDaily")
					}),
					data.modelDailyCoverage === "complete" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("exportModelDailyUnavailable") })
				]
			});
		}
		/** Encode one provider/model route for the native selector without displaying an opaque id. */
		function analysisModelKey(model) {
			return `${model.provider}\u0000${model.model}`;
		}
		/** Render one accessible indeterminate/stream-aware analysis progress surface. */
		function AnalysisLoading({ title, message, progress, t }) {
			const stage = progress === void 0 ? t("analysisProgressPreparing") : t(progress.phase === "preparing" ? "analysisProgressPreparing" : progress.phase === "generating" ? "analysisProgressGenerating" : "analysisProgressFinalizing");
			const output = progress === void 0 || progress.maximumOutputTokens === 0 ? t("analysisProgressWaiting") : progress.exactOutputTokens === void 0 ? t("analysisProgressEstimated", {
				count: formatTokens(progress.estimatedOutputTokens),
				maximum: formatTokens(progress.maximumOutputTokens)
			}) : t("analysisProgressExact", {
				count: formatTokens(progress.exactOutputTokens),
				maximum: formatTokens(progress.maximumOutputTokens)
			});
			const value = progress?.exactOutputTokens ?? progress?.estimatedOutputTokens;
			const maximum = progress?.maximumOutputTokens ?? 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisLoading,
				"aria-busy": "true",
				"aria-live": "polite",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: TokenUsageSection_module_css_default.analysisSpinner,
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: TokenUsageSection_module_css_default.analysisLoadingBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: title }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: message }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: TokenUsageSection_module_css_default.analysisProgressMeta,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: stage }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: output }),
								progress === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("analysisProgressActivity", {
									chunks: formatTokens(progress.chunks),
									characters: formatTokens(progress.outputCharacters)
								}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("analysisProgressElapsed", { seconds: Math.max(1, Math.round(progress.elapsedMs / 1e3)) }) })] })
							]
						}),
						maximum > 0 && value !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
							max: maximum,
							value: Math.min(value, maximum),
							"aria-label": output
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", { "aria-label": output })
					]
				})]
			});
		}
		/** Render a manual integrated-model picker and one aggregate-only Token optimization report. */
		function UsageAnalysisPanel({ catalog, selectedModel, state, onSelectModel, onRefreshCatalog, onAnalyze, download, t }) {
			if (catalog.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsLoading") })]
			});
			if (catalog.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisError,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usageAnalysis") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisModelsFailed", { message: catalog.message }) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: TokenUsageSection_module_css_default.quietButton,
						type: "button",
						onClick: onRefreshCatalog,
						children: t("refreshAnalysisModels")
					})
				]
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
			const analysisUsage = report?.analysisUsage;
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
					state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnalysisLoading, {
						title: t("usageAnalysis"),
						message: t("usageAnalysisRunning"),
						progress: state.progress,
						t
					}) : null,
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
						}) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: TokenUsageSection_module_css_default.analysisHeaderActions,
							children: [analysisUsage === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: TokenUsageSection_module_css_default.analysisCost,
								children: t("analysisCostDetailed", {
									total: formatTokens(totalTokens$1(analysisUsage)),
									output: formatTokens(analysisUsage.outputTokens)
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: TokenUsageSection_module_css_default.quietButton,
								type: "button",
								onClick: () => {
									download.save(analysisReportFilename("usage", report.generatedAt), "text/markdown;charset=utf-8", tokenUsageAnalysisMarkdown(report));
								},
								children: t("exportAnalysisReport")
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SafeMarkdownReport, {
						report: report.report,
						className: TokenUsageSection_module_css_default.analysisReport,
						copyLabel: t("copyCode"),
						copiedLabel: t("copiedCode"),
						footnotesLabel: t("footnotes")
					})] })
				]
			});
		}
		/** Render one ephemeral model-generated review and its deterministic measurements. */
		function TrajectoryAnalysisPanel({ state, download, t }) {
			if (state.status === "idle") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisEmpty,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("trajectoryAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("trajectoryAnalysisIntro") })]
			});
			if (state.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnalysisLoading, {
				title: t("trajectoryAnalysis"),
				message: t("analysisRunning", { title: state.title }),
				progress: state.progress,
				t
			});
			if (state.status === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenUsageSection_module_css_default.analysisError,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("trajectoryAnalysis") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisFailed", { message: state.message }) })]
			});
			const analysis = state.value;
			const metrics = analysis.metrics;
			const analysisUsage = analysis.analysisUsage;
			const largestSpan = metrics.largestSpanId === void 0 ? void 0 : metrics.spans.find((span) => span.id === metrics.largestSpanId);
			const reconciliationDelta = Object.values(metrics.reconciliation.delta).reduce((total, value) => total + Math.abs(value), 0);
			const deniedApprovals = metrics.approvalsRejected + metrics.approvalsCancelled + metrics.approvalsUnavailable;
			const approvalGaps = metrics.unresolvedApprovals + metrics.orphanApprovalDecisions;
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
						}) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: TokenUsageSection_module_css_default.analysisHeaderActions,
							children: [analysisUsage === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: TokenUsageSection_module_css_default.analysisCost,
								children: t("analysisCostDetailed", {
									total: formatTokens(totalTokens$1(analysisUsage)),
									output: formatTokens(analysisUsage.outputTokens)
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: TokenUsageSection_module_css_default.quietButton,
								type: "button",
								onClick: () => {
									download.save(analysisReportFilename("trajectory", analysis.generatedAt), "text/markdown;charset=utf-8", trajectoryAnalysisMarkdown(analysis));
								},
								children: t("exportAnalysisReport")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.analysisSummaryGrid,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnalysisSummaryGroup, {
								title: t("analysisLifecycleGroup"),
								rows: [
									{
										label: t("analysisTurns"),
										value: `${metrics.completedTurns}/${metrics.turnCount}`,
										title: t("analysisOpenCount", { count: metrics.openTurns })
									},
									{
										label: t("analysisSteps"),
										value: formatTokens(metrics.stepCount),
										title: t("analysisOpenCount", { count: metrics.openSteps })
									},
									{
										label: t("analysisRetries"),
										value: formatTokens(metrics.retries),
										title: t("analysisTokenCount", { count: formatTokens(totalTokens$1(metrics.retryUsage)) })
									}
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnalysisSummaryGroup, {
								title: t("analysisToolGroup"),
								rows: [
									{
										label: t("analysisTools"),
										value: `${metrics.toolCalls}/${metrics.toolResults}/${metrics.toolErrors}`
									},
									{
										label: t("analysisIntegrity"),
										value: `${metrics.orphanToolCalls}/${metrics.orphanToolResults}`
									},
									{
										label: t("analysisToolLatency"),
										value: metrics.averageToolLatencyMs === 0 ? "—" : `${formatLatency(metrics.averageToolLatencyMs)} / ${formatLatency(metrics.maxToolLatencyMs)}`
									}
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnalysisSummaryGroup, {
								title: t("analysisComplianceGroup"),
								rows: metrics.completeComplianceEvidenceAvailable ? [
									{
										label: t("analysisApprovalClosure"),
										value: `${metrics.approvalsResolved}/${metrics.approvalsAsked}`
									},
									{
										label: t("analysisApprovalDenied"),
										value: formatTokens(deniedApprovals)
									},
									{
										label: t("analysisAuditGaps"),
										value: formatTokens(approvalGaps)
									}
								] : [
									{
										label: t("analysisApprovalRequests"),
										value: formatTokens(metrics.approvalsAsked)
									},
									{
										label: t("analysisApprovalRejectedOnly"),
										value: formatTokens(metrics.approvalsRejected)
									},
									{
										label: t("analysisComplianceEvidence"),
										value: t("analysisUnavailable")
									}
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AnalysisSummaryGroup, {
								title: t("analysisEfficiencyGroup"),
								rows: [
									{
										label: t("analysisRate"),
										value: metrics.activeTokensPerMinute === 0 ? "—" : `${formatCompactTokens(metrics.activeTokensPerMinute)}/min`
									},
									{
										label: t("analysisLargest"),
										value: largestSpan === void 0 ? "—" : formatCompactTokens(totalTokens$1(largestSpan.usage)),
										title: largestSpan?.id
									},
									{
										label: t("analysisReconciliation"),
										value: metrics.reconciliation.status === "matched" ? t("analysisMatched") : metrics.reconciliation.status === "unavailable" ? t("analysisUnavailable") : t("analysisMismatch", { count: formatTokens(reconciliationDelta) })
									}
								]
							})
						]
					}),
					analysis.truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisWarning,
						children: t("analysisTruncated")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SafeMarkdownReport, {
						report: analysis.report,
						className: TokenUsageSection_module_css_default.analysisReport,
						copyLabel: t("copyCode"),
						copiedLabel: t("copiedCode"),
						footnotesLabel: t("footnotes")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.analysisPrivacy,
						children: t("analysisPrivacy")
					})
				]
			});
		}
		/** Render durable Token usage across all listed sessions. */
		function TokenUsageSection({ close, useSessions, useBudget, setBudget, setRouteBudget, download, saveTrajectoryAnalysis, openSession, listAnalysisModels, analyzeTokenUsage, analyzeTrajectory, t }) {
			const phase = useSessions((state) => state.phase);
			const ids = useSessions((state) => state.ids);
			const byId = useSessions((state) => state.byId);
			const budget = useBudget((snapshot) => snapshot);
			const [query, setQuery] = (0, react.useState)("");
			const [modelSort, setModelSort] = (0, react.useState)("total");
			const [sessionLimit, setSessionLimit] = (0, react.useState)(SESSION_PAGE_SIZE);
			const [range, setRange] = (0, react.useState)(30);
			const [trendModel, setTrendModel] = (0, react.useState)("");
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
				analyzeTrajectory(row.id, selectedAnalysisModel, controller.signal, (progress) => {
					if (trajectoryController.current !== controller || controller.signal.aborted) return;
					setAnalysis((current) => current.status === "loading" && current.sessionId === row.id ? {
						...current,
						progress
					} : current);
				}).then((value) => {
					if (trajectoryController.current === controller && !controller.signal.aborted) {
						saveTrajectoryAnalysis(value);
						setAnalysis({
							status: "ready",
							title: row.title,
							value
						});
					}
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
			const trendModels = (0, react.useMemo)(() => data.models.filter((model) => !isUnattributed(model) && totalTokens$1(model.usage) > 0), [data.models]);
			const selectedTrendModel = data.modelDailyCoverage === "complete" && trendModels.some((model) => modelKey(model) === trendModel) ? trendModel : "";
			const trendDays = (0, react.useMemo)(() => selectedTrendModel === "" ? data.days : modelTrendDays(data.modelDays, selectedTrendModel), [
				data.days,
				data.modelDays,
				selectedTrendModel
			]);
			const runUsageAnalysis = () => {
				if (selectedAnalysisModel === void 0) return;
				usageController.current?.abort();
				const controller = new AbortController();
				usageController.current = controller;
				setUsageReport({ status: "loading" });
				analyzeTokenUsage(usageAnalysisInput(data), selectedAnalysisModel, controller.signal, (progress) => {
					if (usageController.current !== controller || controller.signal.aborted) return;
					setUsageReport((current) => current.status === "loading" ? {
						...current,
						progress
					} : current);
				}).then((value) => {
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
						days: trendDays,
						range,
						models: trendModels,
						selectedModel: selectedTrendModel,
						modelDailyCoverage: data.modelDailyCoverage,
						onRangeChange: setRange,
						onModelChange: setTrendModel,
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
						models: data.models,
						modelDays: data.modelDays,
						modelDailyCoverage: data.modelDailyCoverage,
						snapshot: budget,
						setBudget,
						setRouteBudget,
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
						download,
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
						download,
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
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("analysis") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("session") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("updated") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("routes") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("total") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("input") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("output") })
									] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: visibleSessions.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: TokenUsageSection_module_css_default.analysisButton,
											type: "button",
											disabled: selectedAnalysisModel === void 0 || analysis.status === "loading" && analysis.sessionId === row.id,
											onClick: () => {
												runAnalysis(row);
											},
											children: analysis.status === "loading" && analysis.sessionId === row.id ? t("analyzing") : t("analyze")
										}) }),
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
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: row.usage.outputTokens }) })
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
		//#region src/client/throughput-controller.ts
		/** Sampling cadence shared by the header and sidebar indicators. */
		const THROUGHPUT_SAMPLE_INTERVAL_MS = 5e3;
		/** Rolling observation window used to smooth bursty provider usage updates. */
		const THROUGHPUT_WINDOW_MS = 1e4;
		const EMPTY_SNAPSHOT = Object.freeze({
			status: "sampling",
			allTokensPerSecond: 0,
			activeSessions: 0,
			bySession: Object.freeze({}),
			statusBySession: Object.freeze({})
		});
		/** Read one cumulative output counter, retaining its source identity. */
		function projectionCounter(recorded, builtIn) {
			if (recorded !== void 0) return {
				source: "recorder",
				tokens: recorded.usage.outputTokens
			};
			if (builtIn !== void 0) return {
				source: "built-in",
				tokens: builtIn.outputTokens
			};
		}
		function outputCounter(summary) {
			return projectionCounter(summary.projectionValues?.tokenUsageRecorder, summary.projectionValues?.tokenUsage);
		}
		/** Format a compact Token-per-second value without implying integer precision below ten. */
		function formatTokensPerSecond(value) {
			const clamped = Math.max(0, value);
			if (clamped >= 1e3) return `${new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(clamped / 1e3)}K`;
			return new Intl.NumberFormat(void 0, { maximumFractionDigits: clamped < 10 ? 1 : 0 }).format(clamped);
		}
		/**
		* Samples the client session projection feed on one timer and publishes a
		* shared, at-most-10-second output Token rate. Projection regressions reset that
		* session's baseline instead of producing a negative rate.
		*/
		var TokenThroughputController = class {
			sessions;
			snapshot = EMPTY_SNAPSHOT;
			listeners = /* @__PURE__ */ new Set();
			samples = [];
			epochs = /* @__PURE__ */ new Map();
			previousCounters = /* @__PURE__ */ new Map();
			scopedCounters = /* @__PURE__ */ new Map();
			timer;
			constructor(sessions) {
				this.sessions = sessions;
			}
			/** Return the stable reading until the next sample. */
			getSnapshot = () => this.snapshot;
			/** Subscribe one renderer-bound hook source. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/** Start with an immediate baseline and return lifecycle-complete cleanup. */
			start() {
				this.sample();
				this.timer = setInterval(() => {
					this.sample();
				}, THROUGHPUT_SAMPLE_INTERVAL_MS);
				return () => {
					if (this.timer !== void 0) clearInterval(this.timer);
					this.timer = void 0;
					this.samples = [];
					this.epochs.clear();
					this.previousCounters.clear();
					this.scopedCounters.clear();
					this.listeners.clear();
				};
			}
			/**
			* Supply the strict current session's projection face. Addressed children
			* can be rendered without a projection-bearing session.list row, while the
			* slot-scoped useProjection hook still has their authoritative values.
			*/
			setScopedCounter = (sessionId, recorded, builtIn) => {
				const counter = projectionCounter(recorded, builtIn);
				if (counter === void 0) {
					this.scopedCounters.delete(sessionId);
					return () => {};
				}
				this.scopedCounters.set(sessionId, counter);
				return () => {
					if (this.scopedCounters.get(sessionId) === counter) this.scopedCounters.delete(sessionId);
				};
			};
			/** Capture one deterministic sample; the optional monotonic instant exists for tests. */
			sample(at = performance.now()) {
				const previousInstant = this.samples.at(-1)?.at;
				if (previousInstant !== void 0 && at <= previousInstant) {
					for (const sessionId of this.previousCounters.keys()) this.epochs.set(sessionId, (this.epochs.get(sessionId) ?? 0) + 1);
					this.samples = [];
					this.previousCounters.clear();
				}
				const state = this.sessions.getSnapshot();
				const rawCounters = /* @__PURE__ */ new Map();
				for (const summary of Object.values(state.byId)) {
					const sessionId = String(summary.id);
					const counter = outputCounter(summary);
					if (counter !== void 0) rawCounters.set(sessionId, counter);
				}
				for (const [sessionId, counter] of this.scopedCounters) rawCounters.set(sessionId, counter);
				for (const sessionId of this.previousCounters.keys()) if (!rawCounters.has(sessionId)) this.epochs.set(sessionId, (this.epochs.get(sessionId) ?? 0) + 1);
				const current = /* @__PURE__ */ new Map();
				for (const [sessionId, counter] of rawCounters) {
					const previous = this.previousCounters.get(sessionId);
					if (previous !== void 0 && (previous.source !== counter.source || counter.tokens < previous.tokens)) this.epochs.set(sessionId, (this.epochs.get(sessionId) ?? 0) + 1);
					current.set(sessionId, {
						...counter,
						epoch: this.epochs.get(sessionId) ?? 0
					});
				}
				this.previousCounters = rawCounters;
				this.samples.push({
					at,
					countersBySession: current
				});
				const retainedAfter = at - THROUGHPUT_WINDOW_MS;
				this.samples = this.samples.filter((sample) => sample.at >= retainedAfter);
				const bySession = {};
				const statusBySession = {};
				let ready = false;
				for (const [sessionId, counter] of current) {
					const valid = this.samples.filter((sample) => {
						const previous = sample.countersBySession.get(sessionId);
						return sample.at < at && previous !== void 0 && previous.epoch === counter.epoch && previous.source === counter.source && previous.tokens <= counter.tokens;
					});
					if (valid.length === 0) {
						bySession[sessionId] = 0;
						statusBySession[sessionId] = "sampling";
						continue;
					}
					const target = at - THROUGHPUT_WINDOW_MS;
					const baseline = valid.find((sample) => sample.at >= target);
					if (baseline === void 0) {
						bySession[sessionId] = 0;
						statusBySession[sessionId] = "sampling";
						continue;
					}
					ready = true;
					statusBySession[sessionId] = "ready";
					const previous = baseline?.countersBySession.get(sessionId);
					const elapsedSeconds = (at - baseline.at) / 1e3;
					bySession[sessionId] = previous === void 0 || elapsedSeconds <= 0 ? 0 : Math.max(0, counter.tokens - previous.tokens) / elapsedSeconds;
				}
				const rates = Object.values(bySession);
				const hasPriorSample = this.samples.some((sample) => sample.at < at);
				const everyCurrentReady = current.size > 0 && Object.values(statusBySession).every((status) => status === "ready");
				this.snapshot = Object.freeze({
					status: state.phase !== "ready" ? "sampling" : current.size === 0 ? hasPriorSample ? "ready" : "sampling" : ready && everyCurrentReady ? "ready" : "sampling",
					allTokensPerSecond: rates.reduce((sum, rate) => sum + rate, 0),
					activeSessions: rates.filter((rate) => rate > 0).length,
					bySession: Object.freeze(bySession),
					statusBySession: Object.freeze(statusBySession)
				});
				for (const listener of [...this.listeners]) try {
					listener();
				} catch (error) {
					console.error("[dsh-token-usage] throughput subscriber failed:", error);
				}
			}
		};
		//#endregion
		//#region \0dsh-token-usage-css:src/client/TokenThroughput.module.css.mjs
		const css = ".dsh-token-usage_headerMetric,.dsh-token-usage_sidebarMetric{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;align-items:center;display:inline-flex}.dsh-token-usage_headerMetric{border-left:1px solid var(--dsw-alias-border-l2);gap:5px;min-height:24px;margin-left:2px;padding-left:11px;font-size:11px;line-height:16px}.dsh-token-usage_headerMetric strong,.dsh-token-usage_sidebarMetric strong{color:var(--dsw-alias-label-primary);font-weight:600}.dsh-token-usage_headerLabel{color:var(--dsw-alias-label-caption)}.dsh-token-usage_unit{color:var(--dsw-alias-label-caption);font-size:10px}.dsh-token-usage_signal{box-sizing:border-box;border:1px solid var(--dsw-alias-label-caption);background:var(--dsw-alias-bg-base);border-radius:50%;flex:none;width:6px;height:6px;display:inline-block}[data-active]>.dsh-token-usage_signal,[data-active] .dsh-token-usage_sidebarIcon .dsh-token-usage_signal{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary)}.dsh-token-usage_sidebarMetric{box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border-radius:10px;gap:5px;width:100%;min-height:38px;padding:6px 8px 6px 7px;font-size:12px;line-height:18px;overflow:hidden}.dsh-token-usage_sidebarIcon{width:20px;height:20px;color:var(--dsw-alias-label-secondary);flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}.dsh-token-usage_sidebarIcon .dsh-token-usage_signal{border-color:var(--dsw-alias-bg-layer-2);background:var(--dsw-alias-label-caption);width:6px;height:6px;box-shadow:0 0 0 1px var(--dsw-alias-bg-layer-2);position:absolute;bottom:0;right:-1px}.dsh-token-usage_sidebarLabel{min-width:0;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.dsh-token-usage_activeCount{min-width:0;color:var(--dsw-alias-label-caption);text-overflow:ellipsis;white-space:nowrap;margin-left:auto;font-size:10px;overflow:hidden}.dsh-token-usage_sidebarMetric.dsh-token-usage_rail{background:0 0;border-radius:50%;justify-content:center;width:36px;min-height:36px;padding:0}.dsh-token-usage_sidebarMetric.dsh-token-usage_rail:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}div:has(>[data-slot=\"sidebar.footer.action\"]>[data-token-throughput=all]){flex-direction:column;gap:4px}.dsh-token-usage_rail .dsh-token-usage_sidebarIcon .dsh-token-usage_signal{border-color:var(--dsw-alias-bg-base);box-shadow:0 0 0 1px var(--dsw-alias-bg-base)}@media (width<=1100px){.dsh-token-usage_headerLabel{clip:rect(0 0 0 0);width:1px;height:1px;position:absolute;overflow:hidden}}";
		const tagId = "dsh-token-usage/TokenThroughput.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-token-usage";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TokenThroughput_module_css_default = {
			"activeCount": "dsh-token-usage_activeCount",
			"headerLabel": "dsh-token-usage_headerLabel",
			"headerMetric": "dsh-token-usage_headerMetric",
			"rail": "dsh-token-usage_rail",
			"sidebarIcon": "dsh-token-usage_sidebarIcon",
			"sidebarLabel": "dsh-token-usage_sidebarLabel",
			"sidebarMetric": "dsh-token-usage_sidebarMetric",
			"signal": "dsh-token-usage_signal",
			"unit": "dsh-token-usage_unit"
		};
		//#endregion
		//#region src/client/TokenThroughput.tsx
		function detailLabel(rate, activeSessions, t) {
			return t("throughputDetail", {
				rate: formatTokensPerSecond(rate),
				active: activeSessions,
				window: THROUGHPUT_WINDOW_MS / 1e3,
				interval: THROUGHPUT_SAMPLE_INTERVAL_MS / 1e3
			});
		}
		/** Render the current session's shared recent confirmed-output rate in the title row. */
		function CurrentSessionThroughput({ sessionId, useProjection, useThroughput, observeProjection, t }) {
			const recorded = useProjection("tokenUsageRecorder");
			const builtIn = useProjection("tokenUsage");
			(0, react.useEffect)(() => observeProjection(String(sessionId), recorded, builtIn), [
				builtIn,
				observeProjection,
				recorded,
				sessionId
			]);
			const throughput = useThroughput((snapshot) => snapshot);
			const rate = throughput.bySession[String(sessionId)] ?? 0;
			const sampling = throughput.statusBySession[String(sessionId)] !== "ready";
			const detail = detailLabel(rate, rate > 0 ? 1 : 0, t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: TokenThroughput_module_css_default.headerMetric,
				"data-active": rate > 0 || void 0,
				"aria-label": sampling ? t("throughputSamplingCurrent") : detail,
				title: sampling ? t("throughputSampling") : detail,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: TokenThroughput_module_css_default.signal,
						"aria-hidden": true
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: TokenThroughput_module_css_default.headerLabel,
						children: t("throughputCurrent")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: sampling ? "—" : formatTokensPerSecond(rate) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: TokenThroughput_module_css_default.unit,
						children: "tok/s"
					})
				]
			});
		}
		/** Render the aggregate recent confirmed-output rate at the sidebar foot. */
		function AllSessionsThroughput({ wide, useThroughput, t }) {
			const throughput = useThroughput((snapshot) => snapshot);
			const sampling = throughput.status === "sampling";
			const detail = detailLabel(throughput.allTokensPerSecond, throughput.activeSessions, t);
			const label = sampling ? t("throughputSamplingAll") : detail;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label,
				side: "right",
				delayMs: 400,
				disabled: wide,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `${TokenThroughput_module_css_default.sidebarMetric}${wide ? "" : ` ${TokenThroughput_module_css_default.rail}`}`,
					"data-token-throughput": "all",
					"data-active": throughput.allTokensPerSecond > 0 || void 0,
					role: "status",
					"aria-live": "off",
					"aria-label": label,
					tabIndex: wide ? void 0 : 0,
					title: wide ? label : void 0,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: TokenThroughput_module_css_default.sidebarIcon,
						"aria-hidden": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, { size: wide ? 16 : 18 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: TokenThroughput_module_css_default.signal })]
					}), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TokenThroughput_module_css_default.sidebarLabel,
							children: t("throughputAll")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: sampling ? "—" : formatTokensPerSecond(throughput.allTokensPerSecond) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TokenThroughput_module_css_default.unit,
							children: "tok/s"
						}),
						!sampling && throughput.activeSessions > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TokenThroughput_module_css_default.activeCount,
							children: t("throughputActive", { count: throughput.activeSessions })
						})
					] })]
				})
			});
		}
		//#endregion
		//#region src/client/TrajectoryAnalysisAction.tsx
		/** Conversation-header entry opening session analysis and browser-local history. */
		function TrajectoryAnalysisAction({ sessionId, useTrajectoryHistory, download, listAnalysisModels, analyzeTrajectory, saveTrajectoryAnalysis, removeTrajectoryAnalysis, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [catalog, setCatalog] = (0, react.useState)({ status: "idle" });
			const [selectedModel, setSelectedModel] = (0, react.useState)();
			const [analysis, setAnalysis] = (0, react.useState)({ status: "idle" });
			const catalogController = (0, react.useRef)();
			const analysisController = (0, react.useRef)();
			const history = useTrajectoryHistory((snapshot) => snapshot);
			const sessionHistory = (0, react.useMemo)(() => history.entries.filter((entry) => entry.analysis.sessionId === String(sessionId)), [history.entries, sessionId]);
			const availableModels = catalog.status === "ready" ? catalog.value.models : [];
			(0, react.useEffect)(() => () => {
				catalogController.current?.abort();
				analysisController.current?.abort();
			}, []);
			(0, react.useEffect)(() => {
				if (!open || catalog.status !== "idle") return;
				const controller = new AbortController();
				catalogController.current = controller;
				setCatalog({ status: "loading" });
				listAnalysisModels(controller.signal).then((value) => {
					if (catalogController.current !== controller || controller.signal.aborted) return;
					setCatalog({
						status: "ready",
						value
					});
					setSelectedModel(value.default ?? value.models[0]);
				}, (error) => {
					if (catalogController.current === controller && !controller.signal.aborted) setCatalog({
						status: "error",
						message: error instanceof Error ? error.message : String(error)
					});
				});
			}, [
				catalog.status,
				listAnalysisModels,
				open
			]);
			const retryCatalog = () => {
				catalogController.current?.abort();
				catalogController.current = void 0;
				setSelectedModel(void 0);
				setCatalog({ status: "idle" });
			};
			const closeModal = () => {
				catalogController.current?.abort();
				catalogController.current = void 0;
				analysisController.current?.abort();
				analysisController.current = void 0;
				setSelectedModel(void 0);
				setCatalog({ status: "idle" });
				setAnalysis((current) => current.status === "loading" ? { status: "idle" } : current);
				setOpen(false);
			};
			const run = () => {
				if (selectedModel === void 0) return;
				analysisController.current?.abort();
				const controller = new AbortController();
				analysisController.current = controller;
				setAnalysis({
					status: "loading",
					sessionId: String(sessionId),
					title: t("currentSession")
				});
				analyzeTrajectory(String(sessionId), selectedModel, controller.signal, (progress) => {
					if (analysisController.current !== controller || controller.signal.aborted) return;
					setAnalysis((current) => current.status === "loading" ? {
						...current,
						progress
					} : current);
				}).then((value) => {
					if (analysisController.current !== controller || controller.signal.aborted) return;
					analysisController.current = void 0;
					saveTrajectoryAnalysis(value);
					setAnalysis({
						status: "ready",
						title: t("currentSession"),
						value
					});
				}, (error) => {
					if (analysisController.current === controller && !controller.signal.aborted) {
						analysisController.current = void 0;
						setAnalysis({
							status: "error",
							sessionId: String(sessionId),
							title: t("currentSession"),
							message: error instanceof Error ? error.message : String(error)
						});
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: TokenUsageSection_module_css_default.conversationAnalysisButton,
				type: "button",
				onClick: () => {
					setOpen(true);
				},
				children: t("trajectoryAnalysis")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: closeModal,
				title: t("conversationTrajectoryAnalysis"),
				description: t("conversationTrajectoryAnalysisIntro"),
				closeLabel: t("close"),
				className: TokenUsageSection_module_css_default.analysisDialog,
				contentClassName: TokenUsageSection_module_css_default.analysisDialogContent,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					onClick: closeModal,
					children: t("close")
				}),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: TokenUsageSection_module_css_default.conversationAnalysisControls,
						children: catalog.status === "loading" || catalog.status === "idle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("analysisModelsLoading") }) : catalog.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: TokenUsageSection_module_css_default.analysisErrorText,
							children: t("analysisModelsFailed", { message: catalog.message })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: TokenUsageSection_module_css_default.quietButton,
							type: "button",
							onClick: retryCatalog,
							children: t("refreshAnalysisModels")
						})] }) : availableModels.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("analysisModelsUnavailable") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: TokenUsageSection_module_css_default.quietButton,
							type: "button",
							onClick: retryCatalog,
							children: t("refreshAnalysisModels")
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: TokenUsageSection_module_css_default.analysisModelSelect,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("analysisModel") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								value: selectedModel === void 0 ? "" : JSON.stringify([selectedModel.provider, selectedModel.model]),
								onChange: (event) => {
									const model = availableModels.find((candidate) => JSON.stringify([candidate.provider, candidate.model]) === event.currentTarget.value);
									if (model !== void 0) setSelectedModel({
										provider: model.provider,
										model: model.model
									});
								},
								children: availableModels.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
									value: JSON.stringify([model.provider, model.model]),
									children: [
										model.providerName,
										" · ",
										model.modelName
									]
								}, JSON.stringify([model.provider, model.model])))
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: TokenUsageSection_module_css_default.analysisButton,
							type: "button",
							disabled: selectedModel === void 0 || analysis.status === "loading",
							onClick: run,
							children: analysis.status === "loading" ? t("analyzing") : t("analyze")
						})] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrajectoryAnalysisPanel, {
						state: analysis,
						download,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: TokenUsageSection_module_css_default.analysisHistory,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: TokenUsageSection_module_css_default.blockHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("analysisHistory") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisHistoryLocal") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("analysisHistoryCount", { count: sessionHistory.length }) })]
							}),
							history.status !== "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: TokenUsageSection_module_css_default.analysisWarning,
								children: t("analysisHistoryUnavailable")
							}) : null,
							sessionHistory.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("analysisHistoryEmpty") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: sessionHistory.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => {
									setAnalysis({
										status: "ready",
										title: t("currentSession"),
										value: entry.analysis
									});
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: new Intl.DateTimeFormat(void 0, {
									dateStyle: "medium",
									timeStyle: "short"
								}).format(new Date(entry.savedAt)) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									entry.analysis.model.provider,
									"/",
									entry.analysis.model.model
								] })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: TokenUsageSection_module_css_default.historyDeleteButton,
								type: "button",
								"aria-label": t("deleteAnalysisHistory"),
								onClick: () => {
									removeTrajectoryAnalysis(entry.id);
								},
								children: "×"
							})] }, entry.id)) })
						]
					})
				]
			})] });
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
			analysisProgress: "analysis/progress",
			usageAnalyze: "usage/analyze",
			trajectoryAnalyze: "trajectory/analyze"
		};
		//#endregion
		//#region src/client/budget-controller.ts
		const INITIAL = {
			status: "loading",
			budget: 0,
			routeBudgets: []
		};
		const MAX_ROUTE_BUDGETS = 64;
		/** Stable exact-route identity for settings comparisons and updates. */
		function routeKey(route) {
			return JSON.stringify([route.provider, route.model]);
		}
		/** Whether two normalized route-budget lists contain the same settings. */
		function sameRouteBudgets(left, right) {
			return left.length === right.length && left.every((route, index) => {
				const other = right[index];
				return other !== void 0 && route.provider === other.provider && route.model === other.model && route.rolling30DayBudget === other.rolling30DayBudget;
			});
		}
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
				if (this.snapshot.status === next.status && this.snapshot.budget === next.budget && sameRouteBudgets(this.snapshot.routeBudgets, next.routeBudgets)) return;
				this.snapshot = next;
				for (const listener of [...this.listeners]) listener();
			}
		};
		/** Decode normalized budget settings returned by the private Host RPC. */
		function settingsOf(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const budget = value.rolling30DayBudget;
			if (typeof budget !== "number" || !Number.isSafeInteger(budget) || budget < 0) return void 0;
			const rawRoutes = value.routeBudgets ?? [];
			if (!Array.isArray(rawRoutes) || rawRoutes.length > MAX_ROUTE_BUDGETS) return void 0;
			const routeBudgets = [];
			const seen = /* @__PURE__ */ new Set();
			for (const value of rawRoutes) {
				if (typeof value !== "object" || value === null) return void 0;
				const provider = value.provider;
				const model = value.model;
				const rolling30DayBudget = value.rolling30DayBudget;
				if (typeof provider !== "string" || provider.length === 0 || provider.length > 256 || typeof model !== "string" || model.length === 0 || model.length > 256 || typeof rolling30DayBudget !== "number" || !Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget <= 0) return void 0;
				const route = {
					provider,
					model,
					rolling30DayBudget
				};
				const key = routeKey(route);
				if (seen.has(key)) return void 0;
				seen.add(key);
				routeBudgets.push(route);
			}
			routeBudgets.sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
			return {
				rolling30DayBudget: budget,
				routeBudgets
			};
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
			/** Fetch durable budgets unless the current page cannot call loopback-only endpoints. */
			async load() {
				const generation = ++this.generation;
				if (!this.connection.isLoopback) {
					this.publish(generation, {
						status: "unavailable",
						budget: 0,
						routeBudgets: []
					});
					return;
				}
				try {
					const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetRead, {});
					const settings = result.ok ? settingsOf(result.value) : void 0;
					this.publish(generation, settings === void 0 ? {
						status: "unavailable",
						budget: 0,
						routeBudgets: []
					} : {
						status: "ready",
						budget: settings.rolling30DayBudget,
						routeBudgets: settings.routeBudgets
					});
				} catch (_budgetReadFailure) {
					this.publish(generation, {
						status: "unavailable",
						budget: 0,
						routeBudgets: []
					});
				}
			}
			/** Persist one whole-token global rolling budget and return the durable value. */
			setBudget(rolling30DayBudget) {
				if (!Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) return Promise.resolve(this.store.getSnapshot().budget);
				return this.enqueue(async () => (await this.writeSettings({ rolling30DayBudget })).budget);
			}
			/** Add, replace, or remove one exact-route rolling budget; zero removes it. */
			setRouteBudget(provider, model, rolling30DayBudget) {
				if (provider.length === 0 || provider.length > 256 || model.length === 0 || model.length > 256 || !Number.isSafeInteger(rolling30DayBudget) || rolling30DayBudget < 0) return Promise.resolve();
				return this.enqueue(async () => {
					const current = this.store.getSnapshot().routeBudgets;
					const key = routeKey({
						provider,
						model
					});
					const routeBudgets = current.filter((route) => routeKey(route) !== key).concat(rolling30DayBudget === 0 ? [] : [{
						provider,
						model,
						rolling30DayBudget
					}]).sort((left, right) => left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
					if (routeBudgets.length > MAX_ROUTE_BUDGETS) return;
					await this.writeSettings({ routeBudgets });
				});
			}
			/** Serialize settings writes so each patch is based on the latest durable snapshot. */
			enqueue(operation) {
				const queued = this.writeQueue.then(operation);
				this.writeQueue = queued.then(() => void 0, () => void 0);
				return queued;
			}
			/** Execute one queued settings patch and publish the Host-returned durable value. */
			async writeSettings(payload) {
				if (this.disposed) return this.store.getSnapshot();
				const previous = this.store.getSnapshot();
				const fallback = previous.status === "ready" ? previous : {
					status: "unavailable",
					budget: 0,
					routeBudgets: []
				};
				const generation = ++this.generation;
				if (!this.connection.isLoopback) {
					this.publish(generation, fallback);
					return fallback;
				}
				try {
					const result = await this.connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.budgetWrite, payload);
					const settings = result.ok ? settingsOf(result.value) : void 0;
					const next = settings === void 0 ? fallback : {
						status: "ready",
						budget: settings.rolling30DayBudget,
						routeBudgets: settings.routeBudgets
					};
					this.publish(generation, next);
					return next;
				} catch (_budgetWriteFailure) {
					this.publish(generation, fallback);
					return fallback;
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
		//#region src/client/analysis-progress-client.ts
		const POLL_INTERVAL_MS = 350;
		/** Return whether one wire value is a JSON record. */
		function isRecord$2(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Generate one request-local opaque progress id without persisting browser identity. */
		function createProgressId() {
			const random = globalThis.crypto?.randomUUID?.();
			return random === void 0 ? `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}.${Math.random().toString(36).slice(2)}` : random;
		}
		/** Decode one live progress snapshot from the Host. */
		function analysisProgressOf(value) {
			if (!isRecord$2(value) || value.available !== true) return void 0;
			if (![
				"elapsedMs",
				"chunks",
				"outputCharacters",
				"estimatedOutputTokens",
				"maximumOutputTokens"
			].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0) || value.phase !== "preparing" && value.phase !== "generating" && value.phase !== "finalizing" || value.exactOutputTokens !== void 0 && (typeof value.exactOutputTokens !== "number" || !Number.isFinite(value.exactOutputTokens) || value.exactOutputTokens < 0)) return;
			return {
				phase: value.phase,
				elapsedMs: value.elapsedMs,
				chunks: value.chunks,
				outputCharacters: value.outputCharacters,
				estimatedOutputTokens: value.estimatedOutputTokens,
				...value.exactOutputTokens === void 0 ? {} : { exactOutputTokens: value.exactOutputTokens },
				maximumOutputTokens: value.maximumOutputTokens
			};
		}
		/** Wait for the next poll or reject promptly when the owning request ends. */
		function waitForPoll(signal) {
			return new Promise((resolve, reject) => {
				const timer = globalThis.setTimeout(() => {
					signal.removeEventListener("abort", aborted);
					resolve();
				}, POLL_INTERVAL_MS);
				const aborted = () => {
					globalThis.clearTimeout(timer);
					reject(signal.reason);
				};
				if (signal.aborted) aborted();
				else signal.addEventListener("abort", aborted, { once: true });
			});
		}
		/** Run one unary analysis call while polling its request-bound progress record. */
		async function requestAnalysisWithProgress(connection, endpoint, payload, signal, decode, onProgress) {
			const progressId = createProgressId();
			const polling = new AbortController();
			const pollingSignal = AbortSignal.any([signal, polling.signal]);
			const monitor = (async () => {
				while (!pollingSignal.aborted) {
					try {
						const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, TOKEN_USAGE_RPC_ENDPOINT.analysisProgress, { progressId }, pollingSignal);
						if (pollingSignal.aborted) return;
						if (result.ok) {
							const progress = analysisProgressOf(result.value);
							if (progress !== void 0) onProgress?.(progress);
						}
					} catch (_transientProgressFailure) {
						if (pollingSignal.aborted) return;
					}
					try {
						await waitForPoll(pollingSignal);
					} catch (_analysisFinished) {
						return;
					}
				}
			})();
			try {
				const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, endpoint, {
					...payload,
					progressId
				}, signal);
				if (!result.ok) throw new Error(result.error.message);
				const decoded = decode(result.value);
				if (decoded === void 0) throw new Error("The Host returned an invalid analysis report.");
				return decoded;
			} finally {
				polling.abort(/* @__PURE__ */ new Error("analysis request settled"));
				await monitor;
			}
		}
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
		const COMPLIANCE_METRIC_KEYS = [
			"approvalsResolved",
			"approvalsAllowedOnce",
			"approvalsCancelled",
			"approvalsUnavailable",
			"unresolvedApprovals",
			"orphanApprovalDecisions"
		];
		/** Decode deterministic analysis metrics while tolerating older report schema fields. */
		function metricsOf(value, schema) {
			const legacy = schema === "dsh-token-usage/trajectory-analysis-v1";
			if (!isRecord$1(value)) return void 0;
			const validNumber = (candidate) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0;
			if (!BASE_METRIC_KEYS.every((key) => validNumber(value[key]))) return void 0;
			const additive = {};
			for (const key of ADDITIVE_METRIC_KEYS) if (value[key] === void 0 && legacy) additive[key] = 0;
			else if (validNumber(value[key])) additive[key] = value[key];
			else return void 0;
			const compliance = {};
			for (const key of COMPLIANCE_METRIC_KEYS) if (value[key] === void 0 && schema !== "dsh-token-usage/trajectory-analysis-v3") compliance[key] = 0;
			else if (validNumber(value[key])) compliance[key] = value[key];
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
				completeComplianceEvidenceAvailable: schema === "dsh-token-usage/trajectory-analysis-v3",
				...compliance,
				usage,
				retryUsage,
				spans: decodedSpans,
				...value.largestSpanId === void 0 ? {} : { largestSpanId: value.largestSpanId },
				reconciliation
			};
		}
		/** Decode one complete versioned trajectory report. */
		function trajectoryAnalysisOf(value) {
			if (!isRecord$1(value) || value.schema !== "dsh-token-usage/trajectory-analysis-v1" && value.schema !== "dsh-token-usage/trajectory-analysis-v2" && value.schema !== "dsh-token-usage/trajectory-analysis-v3" || typeof value.sessionId !== "string" || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) || typeof value.truncated !== "boolean" || typeof value.report !== "string" || !isRecord$1(value.model) || typeof value.model.provider !== "string" || typeof value.model.model !== "string") return void 0;
			const metrics = metricsOf(value.metrics, value.schema);
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
		async function requestTrajectoryAnalysis(connection, sessionId, model, language, signal, onProgress) {
			if (!connection.isLoopback) throw new Error("Trajectory analysis is available only from the local DSH page.");
			return requestAnalysisWithProgress(connection, TOKEN_USAGE_RPC_ENDPOINT.trajectoryAnalyze, {
				sessionId,
				model,
				language
			}, signal, trajectoryAnalysisOf, onProgress);
		}
		//#endregion
		//#region src/client/trajectory-history.ts
		const STORAGE_KEY = "dsh-token-usage.trajectory-history.v1";
		const MAX_ENTRIES = 24;
		const MAX_SERIALIZED_CHARS = 3e6;
		/** Stable observable source consumed through the slot inject hooks compartment. */
		var TrajectoryHistoryStore = class {
			snapshot = {
				status: "ready",
				entries: []
			};
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
			set(snapshot) {
				this.snapshot = snapshot;
				for (const listener of [...this.listeners]) listener();
			}
		};
		/** Return whether a durable timestamp is finite and renderable. */
		function validTimestamp(value) {
			return typeof value === "string" && Number.isFinite(Date.parse(value));
		}
		/** Decode only reports that still satisfy the current client wire validation. */
		function storedEntriesOf(value) {
			if (!Array.isArray(value)) return [];
			return value.flatMap((candidate) => {
				if (typeof candidate !== "object" || candidate === null) return [];
				const record = candidate;
				const analysis = trajectoryAnalysisOf(record.analysis);
				return typeof record.id === "string" && record.id.length > 0 && record.id.length <= 512 && validTimestamp(record.savedAt) && analysis !== void 0 && validTimestamp(analysis.generatedAt) ? [{
					id: record.id,
					savedAt: record.savedAt,
					analysis
				}] : [];
			}).slice(0, MAX_ENTRIES);
		}
		/** Persist bounded report history in the current browser profile only. */
		var TrajectoryHistoryController = class {
			store = new TrajectoryHistoryStore();
			load() {
				if (typeof localStorage === "undefined") {
					this.store.set({
						status: "unavailable",
						entries: []
					});
					return;
				}
				try {
					const raw = localStorage.getItem(STORAGE_KEY);
					const entries = raw === null ? [] : storedEntriesOf(JSON.parse(raw));
					this.store.set({
						status: "ready",
						entries
					});
				} catch (_invalidOrUnavailableStorage) {
					try {
						localStorage.removeItem(STORAGE_KEY);
						this.store.set({
							status: "ready",
							entries: []
						});
					} catch (_storageUnavailable) {
						this.store.set({
							status: "unavailable",
							entries: []
						});
					}
				}
			}
			save(analysis) {
				const snapshot = this.store.getSnapshot();
				if (snapshot.status === "unavailable" || typeof localStorage === "undefined") return;
				const entry = {
					id: `${analysis.sessionId}\u0000${analysis.generatedAt}\u0000${analysis.model.provider}\u0000${analysis.model.model}`,
					savedAt: (/* @__PURE__ */ new Date()).toISOString(),
					analysis
				};
				const entries = [entry, ...snapshot.entries.filter((candidate) => candidate.id !== entry.id)].slice(0, MAX_ENTRIES);
				while (entries.length > 1 && JSON.stringify(entries).length > MAX_SERIALIZED_CHARS) entries.pop();
				const serialized = JSON.stringify(entries);
				if (serialized.length > MAX_SERIALIZED_CHARS) {
					this.store.set({
						status: "error",
						entries: snapshot.entries
					});
					return;
				}
				try {
					localStorage.setItem(STORAGE_KEY, serialized);
					this.store.set({
						status: "ready",
						entries
					});
				} catch (_storageQuotaOrPrivacyMode) {
					this.store.set({
						status: "error",
						entries: snapshot.entries
					});
				}
			}
			remove(id) {
				const snapshot = this.store.getSnapshot();
				if (snapshot.status === "unavailable" || typeof localStorage === "undefined") return;
				const entries = snapshot.entries.filter((entry) => entry.id !== id);
				try {
					localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
					this.store.set({
						status: "ready",
						entries
					});
				} catch (_storageQuotaOrPrivacyMode) {
					this.store.set({
						status: "error",
						entries: snapshot.entries
					});
				}
			}
		};
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
			if (!isRecord(value) || value.schema !== "dsh-token-usage/usage-analysis-v1" || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt)) || typeof value.report !== "string" || !isRecord(value.model) || typeof value.model.provider !== "string" || typeof value.model.model !== "string") return void 0;
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
		async function requestTokenUsageAnalysis(connection, input, model, language, signal, onProgress) {
			if (!connection.isLoopback) throw new Error("AI analysis is available only from the local DSH page.");
			return requestAnalysisWithProgress(connection, TOKEN_USAGE_RPC_ENDPOINT.usageAnalyze, {
				input,
				model,
				language
			}, signal, tokenUsageAnalysisOf, onProgress);
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
			throughputAll: "全部会话速率",
			throughputCurrent: "当前会话",
			throughputActive: "{count} 近期入账",
			throughputSampling: "正在建立输出用量基线…",
			throughputSamplingAll: "全部会话输出速率正在采样",
			throughputSamplingCurrent: "当前会话输出速率正在采样",
			throughputDetail: "最近最多 {window} 秒已确认输出 {rate} tok/s · {active} 个会话近期有入账 · 每 {interval} 秒刷新",
			modelBreakdown: "模型用量",
			activity: "Token 活跃度",
			activityIntro: "最近 30 周，颜色越深表示当日 Token 使用量越高。悬停查看明细，点击查看当天会话。",
			activityTooltip: "{date}\n总计 {total} Token\n输入 {input} · 输出 {output}\n缓存：读 {cacheRead} · 写 {cacheWrite}",
			less: "少",
			more: "多",
			trend: "用量趋势",
			trendIntro: "按 UTC 日期比较当前周期与前一等长周期。",
			trendModel: "趋势模型",
			allModels: "全部模型",
			trendModelScope: "当前趋势仅统计 {route} 的可靠逐日 bucket。",
			modelDailyCoverageUnavailable: "旧版回退记录没有日期×模型 bucket；完成历史重折叠后才能按模型筛选趋势。",
			modelDailyCoveragePartial: "部分历史记录缺少日期×模型 bucket；为避免低估，模型趋势筛选暂不可用。",
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
			routeBudgets: "模型预算与预警",
			routeBudgetsIntro: "为精确 provider/model 设置滚动 30 日 Token 预算；达到 80% 预警，达到 100% 或预测超额时优先提示。",
			routeBudgetModel: "模型路由",
			routeBudgetChooseModel: "选择有用量的模型",
			routeBudgetInput: "模型 30 日预算（Token）",
			routeBudgetSave: "保存模型预算",
			routeBudgetRemove: "移除预算",
			routeBudgetRemoveFor: "移除 {route} 的预算",
			routeBudgetsEmpty: "尚未设置模型级预算。",
			routeBudgetCoverageUnavailable: "没有完整且守恒的日期×模型数据；可配置预算，但暂不计算消耗和预测。",
			routeBudgetCoveragePartial: "部分日期×模型数据缺失或无法与总量守恒；为避免低估，模型预算状态暂不可用。",
			routeBudgetUnavailable: "等待可靠数据",
			routeBudgetStatus_healthy: "健康",
			routeBudgetStatus_warning: "已达 80% 预警",
			"routeBudgetStatus_forecast-exceeded": "预测将超额",
			routeBudgetStatus_exceeded: "已超额",
			routeBudgetProgress: "已用 {used} / {budget} Token（{percent}%）",
			routeBudgetForecast: "按最近 7 个完整 UTC 日预测滚动 30 日 {projected} Token。",
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
			usageSignalsIntro: "运行率和突增检测只使用完整 UTC 日，当前仍是全局口径，不作为模型级告警。",
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
			analysisModelScope: "此处选择的模型同样用于下方按会话运行的轨迹分析；轨迹报告会保存在当前浏览器本地。",
			analyzeUsage: "生成用量分析",
			usageAnalyzing: "正在生成分析…",
			usageAnalysisRunning: "模型正在生成 Token 用量分析报告。",
			usageAnalysisFailed: "用量分析失败：{message}",
			usageAnalysisReport: "AI 用量分析报告",
			exportAnalysisReport: "导出 Markdown 报告",
			copyCode: "复制代码",
			copiedCode: "已复制",
			footnotes: "脚注",
			analysisProgressPreparing: "准备分析证据",
			analysisProgressGenerating: "模型生成中",
			analysisProgressFinalizing: "整理报告",
			analysisProgressWaiting: "等待模型返回内容",
			analysisProgressEstimated: "已返回约 {count} / {maximum} Token",
			analysisProgressExact: "已返回 {count} / {maximum} Token",
			analysisProgressActivity: "{chunks} 个流块 · {characters} 个字符",
			analysisProgressElapsed: "已等待 {seconds} 秒",
			dayDetails: "{date} 用量明细",
			dayDetailsIntro: "仅显示该 UTC 日期内已记录的聚合用量与贡献会话。",
			closeDayDetails: "收起明细",
			contributors: "贡献会话（{count}）",
			noContributors: "当天没有可显示的会话贡献。",
			export: "导出",
			exportJson: "JSON 汇总",
			exportDaily: "每日 CSV",
			exportModels: "模型 CSV",
			exportModelDaily: "日期×模型 CSV",
			exportModelDailyUnavailable: "日期×模型覆盖不完整或未通过守恒校验，暂不导出以避免生成低估数据。",
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
			trajectoryAnalysisIntro: "选择“分析轨迹”后，仅将事件类别、相对时间、路由别名、工具名称、审批结果、状态和 provider Token bucket 发送给所选模型；提示词、回复、工具参数与结果始终省略。完成的报告保存在当前浏览器本地。",
			analysisRunning: "正在分析“{title}”的元数据轨迹…",
			analysisFailed: "分析失败：{message}",
			analysisFor: "轨迹分析 · {title}",
			analysisMeta: "{provider}/{model} · {time}",
			analysisCostDetailed: "本次分析 {total} Token · 模型输出 {output}",
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
			analysisLifecycleGroup: "生命周期",
			analysisToolGroup: "工具可靠性",
			analysisComplianceGroup: "合规控制",
			analysisEfficiencyGroup: "资源效率",
			analysisSteps: "步骤",
			analysisOpenCount: "未闭合 {count}",
			analysisTokenCount: "{count} Token",
			analysisApprovalClosure: "审批闭环",
			analysisApprovalDenied: "拒绝 / 取消 / 不可用",
			analysisApprovalRequests: "审批请求",
			analysisApprovalRejectedOnly: "拒绝决定",
			analysisComplianceEvidence: "v3 审计字段",
			analysisAuditGaps: "审计缺口",
			analysisTruncated: "元数据轨迹过长，模型仅收到首尾有界样本；报告会将中段标为不可用证据。",
			analysisPrivacy: "隐私：所选模型只接收白名单元数据、工具名称、审批结果和 provider 上报 Token；不发送提示词、回复、工具参数/结果、原始 provider/model、会话标题/ID 或个人与组织字段。报告历史仅保存在当前浏览器。",
			conversationTrajectoryAnalysis: "当前会话轨迹分析",
			conversationTrajectoryAnalysisIntro: "可在对话页直接运行与 Token 用量页一致的轨迹审计，并查看当前会话的本地历史。",
			currentSession: "当前会话",
			analysisHistory: "分析历史",
			analysisHistoryLocal: "仅保存在当前浏览器 localStorage，最多保留 24 条。",
			analysisHistoryCount: "{count} 条",
			analysisHistoryEmpty: "当前会话还没有已保存的分析报告。",
			analysisHistoryUnavailable: "浏览器本地存储不可用，分析报告不会保留。",
			deleteAnalysisHistory: "删除分析历史",
			close: "关闭",
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
			throughputAll: "All-session rate",
			throughputCurrent: "Current session",
			throughputActive: "{count} recent",
			throughputSampling: "Establishing the confirmed-output baseline…",
			throughputSamplingAll: "Sampling the all-session output rate",
			throughputSamplingCurrent: "Sampling the current-session output rate",
			throughputDetail: "Confirmed output over up to {window}s: {rate} tok/s · {active} sessions posted usage recently · refreshes every {interval}s",
			modelBreakdown: "Usage by model",
			activity: "Token activity",
			activityIntro: "Last 30 weeks. Darker cells represent higher daily Token usage. Hover for details or select a day for its sessions.",
			activityTooltip: "{date}\nTotal {total} tokens\nInput {input} · Output {output}\nCache: read {cacheRead} · write {cacheWrite}",
			less: "Less",
			more: "More",
			trend: "Usage trends",
			trendIntro: "Compares the current UTC period with the preceding period of equal length.",
			trendModel: "Trend model",
			allModels: "All models",
			trendModelScope: "This trend includes reliable daily buckets for {route} only.",
			modelDailyCoverageUnavailable: "Legacy fallback records lack date-by-model buckets. Model filtering becomes available after history is refolded.",
			modelDailyCoveragePartial: "Some history lacks date-by-model buckets, so model filtering is unavailable to avoid undercounting.",
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
			routeBudgets: "Model budgets and alerts",
			routeBudgetsIntro: "Set a rolling 30-day Token budget for an exact provider/model route. Warning starts at 80%; actual and forecast overages are prioritized.",
			routeBudgetModel: "Model route",
			routeBudgetChooseModel: "Choose a model with usage",
			routeBudgetInput: "Model 30-day budget (tokens)",
			routeBudgetSave: "Save model budget",
			routeBudgetRemove: "Remove budget",
			routeBudgetRemoveFor: "Remove the budget for {route}",
			routeBudgetsEmpty: "No model-level budget is configured.",
			routeBudgetCoverageUnavailable: "No complete, conserved date-by-model data is available. Budgets can be configured, but usage and forecasts are not evaluated yet.",
			routeBudgetCoveragePartial: "Some date-by-model data is missing or does not conserve totals. Model budget status is unavailable to avoid undercounting.",
			routeBudgetUnavailable: "Waiting for reliable data",
			routeBudgetStatus_healthy: "Healthy",
			routeBudgetStatus_warning: "80% warning reached",
			"routeBudgetStatus_forecast-exceeded": "Forecast over budget",
			routeBudgetStatus_exceeded: "Over budget",
			routeBudgetProgress: "{used} / {budget} tokens used ({percent}%)",
			routeBudgetForecast: "Latest 7 complete UTC days project {projected} tokens over a rolling 30-day period.",
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
			usageSignalsIntro: "Run rate and spike detection use complete UTC days and remain global signals, not model-level alerts.",
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
			analysisModelScope: "The selected model is also used by the per-session trajectory analysis below; trajectory reports are stored in this browser.",
			analyzeUsage: "Generate usage analysis",
			usageAnalyzing: "Generating analysis…",
			usageAnalysisRunning: "The model is generating the Token usage analysis report.",
			usageAnalysisFailed: "Usage analysis failed: {message}",
			usageAnalysisReport: "AI usage analysis report",
			exportAnalysisReport: "Export Markdown report",
			copyCode: "Copy code",
			copiedCode: "Copied",
			footnotes: "Footnotes",
			analysisProgressPreparing: "Preparing evidence",
			analysisProgressGenerating: "Model generating",
			analysisProgressFinalizing: "Finalizing report",
			analysisProgressWaiting: "Waiting for model output",
			analysisProgressEstimated: "About {count} / {maximum} tokens returned",
			analysisProgressExact: "{count} / {maximum} tokens returned",
			analysisProgressActivity: "{chunks} stream chunks · {characters} characters",
			analysisProgressElapsed: "Waiting for {seconds}s",
			dayDetails: "{date} usage details",
			dayDetailsIntro: "Shows aggregate usage and contributing sessions recorded for this UTC date.",
			closeDayDetails: "Hide details",
			contributors: "Contributing sessions ({count})",
			noContributors: "No session contribution is available for this day.",
			export: "Export",
			exportJson: "JSON summary",
			exportDaily: "Daily CSV",
			exportModels: "Model CSV",
			exportModelDaily: "Date × model CSV",
			exportModelDailyUnavailable: "Date-by-model coverage is incomplete or failed conservation checks, so this export is disabled to avoid undercounting.",
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
			trajectoryAnalysisIntro: "Analyze trajectory sends only event categories, relative timing, route aliases, tool names, approval outcomes, statuses, and provider Token buckets to the selected model. Prompts, replies, tool arguments, and results are always omitted. Completed reports are stored in this browser.",
			analysisRunning: "Analyzing the metadata trajectory for “{title}”…",
			analysisFailed: "Analysis failed: {message}",
			analysisFor: "Trajectory analysis · {title}",
			analysisMeta: "{provider}/{model} · {time}",
			analysisCostDetailed: "{total} analysis tokens · {output} model output",
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
			analysisLifecycleGroup: "Lifecycle",
			analysisToolGroup: "Tool reliability",
			analysisComplianceGroup: "Compliance controls",
			analysisEfficiencyGroup: "Resource efficiency",
			analysisSteps: "Steps",
			analysisOpenCount: "{count} open",
			analysisTokenCount: "{count} tokens",
			analysisApprovalClosure: "Approval closure",
			analysisApprovalDenied: "Rejected / cancelled / unavailable",
			analysisApprovalRequests: "Approval requests",
			analysisApprovalRejectedOnly: "Rejected decisions",
			analysisComplianceEvidence: "v3 audit fields",
			analysisAuditGaps: "Audit gaps",
			analysisTruncated: "The metadata trajectory was too long, so the model received a bounded head-and-tail sample and treats the middle as unavailable evidence.",
			analysisPrivacy: "Privacy: the selected model receives only allowlisted metadata, tool names, approval outcomes, and provider-reported Token buckets—never prompts, replies, tool arguments/results, raw provider/model ids, session titles/IDs, or personal and organization fields. Report history stays in this browser.",
			conversationTrajectoryAnalysis: "Current session trajectory analysis",
			conversationTrajectoryAnalysisIntro: "Run the same trajectory audit from the conversation page and review local history for this session.",
			currentSession: "Current session",
			analysisHistory: "Analysis history",
			analysisHistoryLocal: "Stored only in this browser localStorage, up to 24 reports.",
			analysisHistoryCount: "{count} reports",
			analysisHistoryEmpty: "No saved analysis report exists for this session.",
			analysisHistoryUnavailable: "Browser local storage is unavailable, so analysis reports will not persist.",
			deleteAnalysisHistory: "Delete analysis history",
			close: "Close",
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
			const trajectoryHistory = new TrajectoryHistoryController();
			const throughput = new TokenThroughputController(ctx.sessions.list);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "token-usage: dictionaries");
			ctx.effect(() => throughput.start(), "token usage: sample confirmed output rate");
			ctx.effect(() => {
				trajectoryHistory.load();
				budget.load();
				return () => {
					budget.dispose();
				};
			}, "token usage: load persistent budget");
			const t = ctx.locale.bind(NS);
			const throughputFace = () => ({
				hooks: { throughput },
				observeProjection: throughput.setScopedCounter
			});
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "token-usage-throughput-all",
				order: 100,
				locale: NS,
				inject: throughputFace
			}, AllSessionsThroughput));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "token-usage-throughput-current",
				order: 50,
				locale: NS,
				inject: throughputFace
			}, CurrentSessionThroughput));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "token-usage",
				order: 30,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					hooks: { budget: budget.store },
					setBudget: (value) => budget.setBudget(value),
					setRouteBudget: (provider, model, value) => budget.setRouteBudget(provider, model, value),
					download: browserDownload,
					saveTrajectoryAnalysis: (analysis) => {
						trajectoryHistory.save(analysis);
					},
					openSession: (sessionId) => {
						ctx.sessions.open(sessionId);
					},
					listAnalysisModels: (signal) => requestAnalysisModels(connection, signal),
					analyzeTokenUsage: (input, model, signal, onProgress) => requestTokenUsageAnalysis(connection, input, model, ctx.locale.getLocale().active, signal, onProgress),
					analyzeTrajectory: (sessionId, model, signal, onProgress) => requestTrajectoryAnalysis(connection, sessionId, model, ctx.locale.getLocale().active, signal, onProgress)
				})
			}, TokenUsageSection));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "token-usage-trajectory-analysis",
				order: 40,
				locale: NS,
				inject: () => ({
					hooks: { trajectoryHistory: trajectoryHistory.store },
					download: browserDownload,
					listAnalysisModels: (signal) => requestAnalysisModels(connection, signal),
					analyzeTrajectory: (sessionId, model, signal, onProgress) => requestTrajectoryAnalysis(connection, sessionId, model, ctx.locale.getLocale().active, signal, onProgress),
					saveTrajectoryAnalysis: (analysis) => {
						trajectoryHistory.save(analysis);
					},
					removeTrajectoryAnalysis: (id) => {
						trajectoryHistory.remove(id);
					}
				})
			}, TrajectoryAnalysisAction));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map