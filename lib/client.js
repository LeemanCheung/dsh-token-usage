window.__ModuleLoader__.load({
	id: "dsh-token-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/selectors/usage.ts
		/** Detached zero buckets for dashboard folds. */
		function zeroBuckets$1() {
			return {
				uncachedInputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0
			};
		}
		/** Add four disjoint token buckets. */
		function addBuckets$1(left, right) {
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
			return records.reduce((sum, record) => addBuckets$1(sum, record.usage), zeroBuckets$1());
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
				if (totalTokens$5(record.usage) === 0) continue;
				const route = modelKey(record);
				routeTotals.set(route, addBuckets$1(routeTotals.get(route) ?? zeroBuckets$1(), record.usage));
				dayTotals.set(record.date, addBuckets$1(dayTotals.get(record.date) ?? zeroBuckets$1(), record.usage));
			}
			const expectedRoutes = new Map(recorded.models.filter((model) => totalTokens$5(model.usage) > 0).map((model) => [modelKey(model), model.usage]));
			const expectedDays = new Map(recorded.days.filter((day) => totalTokens$5(day.usage) > 0).map((day) => [day.date, day.usage]));
			return sameUsageMap(routeTotals, expectedRoutes) && sameUsageMap(dayTotals, expectedDays);
		}
		/** Stable UTC day key used by durable Host records and legacy fallbacks. */
		function dayKey$1(time) {
			return new Date(time).toISOString().slice(0, 10);
		}
		/** Prompt-side total across uncached input and cache traffic. */
		function inputTokens$1(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Complete request/response total without double-counting reasoning output. */
		function totalTokens$5(usage) {
			return inputTokens$1(usage) + usage.outputTokens;
		}
		function modelKey(model) {
			return JSON.stringify([model.provider, model.model]);
		}
		function modelDayKey(model) {
			return JSON.stringify([
				model.provider,
				model.model,
				model.date
			]);
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
			if (usage === void 0 || totalTokens$5(usage) === 0 && assistantRequests === 0 && compactionRequests === 0) return null;
			const dailyUsageReliable = recorded?.days !== void 0 && dailyUsageConserved(recorded);
			const modelDailyUsageReliable = recorded?.modelDays !== void 0 && dailyUsageReliable && modelDailyUsageConserved(recorded);
			return {
				id: summary.id,
				title: summary.displayTitle,
				updatedAt: summary.updatedAt,
				assistantRequests,
				compactionRequests,
				compactionUsage: recorded?.compactionUsage === void 0 ? zeroBuckets$1() : { ...recorded.compactionUsage },
				usage,
				models: recorded?.models ?? [unattributedModel(usage)],
				days: recorded?.days ?? [{
					date: dayKey$1(summary.updatedAt),
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
			let usage = zeroBuckets$1();
			let assistantRequests = 0;
			let compactionRequests = 0;
			let compactionUsage = zeroBuckets$1();
			let reliableDailySessions = 0;
			let reliableModelDailySessions = 0;
			for (const summary of summaries) {
				const row = sessionRow(summary);
				if (row === null) continue;
				sessions.push(row);
				usage = addBuckets$1(usage, row.usage);
				assistantRequests += row.assistantRequests;
				compactionRequests += row.compactionRequests;
				compactionUsage = addBuckets$1(compactionUsage, row.compactionUsage);
				if (row.dailyUsageReliable) reliableDailySessions += 1;
				if (row.modelDailyUsageReliable) reliableModelDailySessions += 1;
				for (const day of row.days) {
					days.set(day.date, addBuckets$1(days.get(day.date) ?? zeroBuckets$1(), day.usage));
					if (row.dailyUsageReliable) operationalDays.set(day.date, addBuckets$1(operationalDays.get(day.date) ?? zeroBuckets$1(), day.usage));
				}
				for (const modelDay of row.modelDays) {
					const key = modelDayKey(modelDay);
					const current = modelDays.get(key);
					modelDays.set(key, current === void 0 ? {
						...modelDay,
						usage: { ...modelDay.usage }
					} : {
						...current,
						usage: addBuckets$1(current.usage, modelDay.usage)
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
						usage: addBuckets$1(current.usage, model.usage)
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
				models: [...models.values()].sort((left, right) => totalTokens$5(right.usage) - totalTokens$5(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
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
		//#endregion
		//#region src/client/analytics.ts
		/** Detached zero buckets for analytics calculations. */
		function zeroBuckets() {
			return {
				uncachedInputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0
			};
		}
		/** Add two disjoint Token bucket sets. */
		function addBuckets(left, right) {
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
		function dayKey(time) {
			return new Date(time).toISOString().slice(0, 10);
		}
		/** Build a newest-inclusive UTC date range. */
		function datesEndingOn(now, length) {
			const end = /* @__PURE__ */ new Date(`${dayKey(now)}T00:00:00.000Z`);
			end.setUTCDate(end.getUTCDate() - length + 1);
			const dates = [];
			for (let offset = 0; offset < length; offset += 1) {
				const date = new Date(end);
				date.setUTCDate(date.getUTCDate() + offset);
				dates.push(dayKey(date.getTime()));
			}
			return dates;
		}
		/** Aggregate a fixed sequence of UTC dates from a daily bucket lookup. */
		function aggregateDates(byDate, dates) {
			return dates.reduce((usage, date) => addBuckets(usage, byDate.get(date) ?? zeroBuckets()), zeroBuckets());
		}
		/** Derive period totals, comparison totals, activity, and the highest-use day. */
		function periodInsight(records, days, now = Date.now()) {
			const byDate = new Map(records.map((record) => [record.date, record.usage]));
			const currentDates = datesEndingOn(now, days);
			const previousDates = datesEndingOn(now - days * 864e5, days);
			const active = currentDates.map((date) => ({
				date,
				usage: { ...byDate.get(date) ?? zeroBuckets() }
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
			const averageDailyTokens = dates.reduce((sum, date) => sum + totalTokens$4(byDate.get(date) ?? zeroBuckets()), 0) / dates.length;
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
			const tokens = totalTokens$4(byDate.get(date) ?? zeroBuckets());
			const activeBaseline = datesEndingOn(now - 2 * 864e5, 28).map((baselineDate) => totalTokens$4(byDate.get(baselineDate) ?? zeroBuckets())).filter((value) => value > 0);
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
		function inputTokens(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Identify legacy fallback rows with no source route attribution. */
		function isUnattributed$1(model) {
			return model.provider === "" && model.model === "";
		}
		/** Derive request efficiency, compaction overhead, and stable top-route shares. */
		function usageEfficiencyInsight(usage, compactionUsage, models, assistantAttempts, compactionAttempts) {
			const total = totalTokens$3(usage);
			const input = inputTokens(usage);
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
		/** Sum all four disjoint provider Token buckets. */
		function totalTokens$2(usage) {
			return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
		}
		/** Evaluate one route budget from exact date-by-model buckets. */
		function routeBudgetInsight(budget, records, now = Date.now()) {
			const days = records.filter((record) => record.provider === budget.provider && record.model === budget.model).map((record) => ({
				date: record.date,
				usage: { ...record.usage }
			}));
			const usedTokens = totalTokens$2(periodInsight(days, 30, now).usage);
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
		function totalTokens$1(usage) {
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
				const total = totalTokens$1(usage);
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
				totalModels: models.filter((model) => totalTokens$1(model.usage) > 0).length,
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
		function csvCell$1(value) {
			const text = typeof value === "string" ? spreadsheetText(value) : String(value);
			return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
		}
		/** Encode a complete CSV table with a stable CRLF delimiter. */
		function csv(rows) {
			return `${rows.map((row) => row.map(csvCell$1).join(",")).join("\r\n")}\r\n`;
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
		/** Stable provider/model/date identity for route-day aggregation. */
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
				case "total": return totalTokens$5(model.usage);
				case "cost": return model.totalCostUSD ?? -1;
				case "tokensPerAttempt": {
					const attempts = recordedAttempts(model);
					return attempts === 0 ? -1 : totalTokens$5(model.usage) / attempts;
				}
				case "cacheReadShare": {
					const input = inputTokens$1(model.usage);
					return input === 0 ? -1 : model.usage.cacheReadTokens / input;
				}
			}
		}
		/** Sort model hotspot rows deterministically without mutating cost-summary data. */
		function sortedModelHotspots(models, sort) {
			return models.slice().sort((left, right) => modelSortValue(right, sort) - modelSortValue(left, sort) || totalTokens$5(right.usage) - totalTokens$5(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
		}
		/** Return one exact route's reliable daily buckets from the aggregate route-day table. */
		function modelTrendDays(modelDays, route) {
			return modelDays.filter((modelDay) => modelKey(modelDay) === route).map((modelDay) => ({
				date: modelDay.date,
				usage: { ...modelDay.usage }
			}));
		}
		/** Return only detached aggregate buckets, route records, and UTC dates for AI usage analysis. */
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
			const today = dayKey$1(now);
			const end = /* @__PURE__ */ new Date(`${today}T00:00:00.000Z`);
			const start = new Date(end);
			start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7 - 203);
			const dates = [];
			for (const cursor = new Date(start); dates.length < 210; cursor.setUTCDate(cursor.getUTCDate() + 1)) dates.push(dayKey$1(cursor.getTime()));
			const maximum = Math.max(0, ...dates.filter((date) => date <= today).map((date) => totalTokens$5(byDate.get(date) ?? zeroBuckets$1())));
			return dates.map((date) => {
				const future = date > today;
				const usage = byDate.get(date) ?? zeroBuckets$1();
				const tokens = future ? 0 : totalTokens$5(usage);
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
							input: formatTokens(inputTokens$1(day.usage)),
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
								value: totalTokens$5(day.usage)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("input"),
								value: inputTokens$1(day.usage)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("output"),
								value: day.usage.outputTokens
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("cacheHit"),
								value: inputTokens$1(day.usage) === 0 ? "—" : `${Math.round(day.usage.cacheReadTokens / inputTokens$1(day.usage) * 100)}%`
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: TokenUsageSection_module_css_default.contributors,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("contributors", { count: contributors.length }) }), contributors.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noContributors") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ol", { children: contributors.slice(0, 5).map((contributor) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							title: contributor.id,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: contributor.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens$5(contributor.usage) })]
						}, contributor.id)) })]
					})
				]
			});
		}
		/** Render period-aware trend and activity summaries from daily records. */
		function PeriodInsights({ days, range, models, selectedModel, modelDailyCoverage, onRangeChange, onModelChange, t }) {
			const insight = (0, react.useMemo)(() => periodInsight(days, range), [days, range]);
			const current = totalTokens$5(insight.usage);
			const previous = totalTokens$5(insight.previousUsage);
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
								value: peak === void 0 ? "—" : formatCompactTokens(totalTokens$5(peak.usage))
							})
						]
					}),
					peak === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: TokenUsageSection_module_css_default.insightNote,
						children: t("peakDayNote", {
							date: peak.date,
							total: formatTokens(totalTokens$5(peak.usage))
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
			const used = totalTokens$5(insight.usage);
			const budget = snapshot.budget;
			const enabled = budget > 0;
			const durableValue = enabled ? String(budget) : "";
			const [draft, setDraft] = (0, react.useState)(durableValue);
			const [routeSelection, setRouteSelection] = (0, react.useState)("");
			const [routeDraft, setRouteDraft] = (0, react.useState)("");
			const editGeneration = (0, react.useRef)(0);
			const dirtyDraft = (0, react.useRef)(false);
			const ratio = enabled ? used / budget : 0;
			const configurableModels = (0, react.useMemo)(() => models.filter((model) => !isUnattributed(model) && totalTokens$5(model.usage) > 0), [models]);
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
									total: formatTokens(totalTokens$5(analysisUsage)),
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
									total: formatTokens(totalTokens$5(analysisUsage)),
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
										title: t("analysisTokenCount", { count: formatTokens(totalTokens$5(metrics.retryUsage)) })
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
										value: largestSpan === void 0 ? "—" : formatCompactTokens(totalTokens$5(largestSpan.usage)),
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
			const trendModels = (0, react.useMemo)(() => data.models.filter((model) => !isUnattributed(model) && totalTokens$5(model.usage) > 0), [data.models]);
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
			const billedInput = inputTokens$1(data.usage);
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
								value: totalTokens$5(data.usage)
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
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens$5(model.usage) }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: inputTokens$1(model.usage) }), model.usage.cacheReadTokens > 0 || model.usage.cacheWriteTokens > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
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
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: totalTokens$5(row.usage) }) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: inputTokens$1(row.usage) }) }),
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
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
		var _a$1;
		function $constructor(name, initializer, params) {
			function init(inst, def) {
				if (!inst._zod) Object.defineProperty(inst, "_zod", {
					value: {
						def,
						constr: _,
						traits: /* @__PURE__ */ new Set()
					},
					enumerable: false
				});
				if (inst._zod.traits.has(name)) return;
				inst._zod.traits.add(name);
				initializer(inst, def);
				const proto = _.prototype;
				const keys = Object.keys(proto);
				for (let i = 0; i < keys.length; i++) {
					const k = keys[i];
					if (!(k in inst)) inst[k] = proto[k].bind(inst);
				}
			}
			const Parent = params?.Parent ?? Object;
			class Definition extends Parent {}
			Object.defineProperty(Definition, "name", { value: name });
			function _(def) {
				var _a;
				const inst = params?.Parent ? new Definition() : this;
				init(inst, def);
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				for (const fn of inst._zod.deferred) fn();
				return inst;
			}
			Object.defineProperty(_, "init", { value: init });
			Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
				if (params?.Parent && inst instanceof params.Parent) return true;
				return inst?._zod?.traits?.has(name);
			} });
			Object.defineProperty(_, "name", { value: name });
			return _;
		}
		var $ZodAsyncError = class extends Error {
			constructor() {
				super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
			}
		};
		var $ZodEncodeError = class extends Error {
			constructor(name) {
				super(`Encountered unidirectional transform during encode: ${name}`);
				this.name = "ZodEncodeError";
			}
		};
		(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
		const globalConfig = globalThis.__zod_globalConfig;
		function config(newConfig) {
			if (newConfig) Object.assign(globalConfig, newConfig);
			return globalConfig;
		}
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
		function getEnumValues(entries) {
			const numericValues = Object.values(entries).filter((v) => typeof v === "number");
			return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
		}
		function jsonStringifyReplacer(_, value) {
			if (typeof value === "bigint") return value.toString();
			return value;
		}
		function cached(getter) {
			return { get value() {
				{
					const value = getter();
					Object.defineProperty(this, "value", { value });
					return value;
				}
				throw new Error("cached value already set");
			} };
		}
		function nullish(input) {
			return input === null || input === void 0;
		}
		function cleanRegex(source) {
			const start = source.startsWith("^") ? 1 : 0;
			const end = source.endsWith("$") ? source.length - 1 : source.length;
			return source.slice(start, end);
		}
		function floatSafeRemainder(val, step) {
			const ratio = val / step;
			const roundedRatio = Math.round(ratio);
			const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
			if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
			return ratio - roundedRatio;
		}
		const EVALUATING = /* @__PURE__*/ Symbol("evaluating");
		function defineLazy(object, key, getter) {
			let value = void 0;
			Object.defineProperty(object, key, {
				get() {
					if (value === EVALUATING) return;
					if (value === void 0) {
						value = EVALUATING;
						value = getter();
					}
					return value;
				},
				set(v) {
					Object.defineProperty(object, key, { value: v });
				},
				configurable: true
			});
		}
		function assignProp(target, prop, value) {
			Object.defineProperty(target, prop, {
				value,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
		function mergeDefs(...defs) {
			const mergedDescriptors = {};
			for (const def of defs) Object.assign(mergedDescriptors, Object.getOwnPropertyDescriptors(def));
			return Object.defineProperties({}, mergedDescriptors);
		}
		function esc(str) {
			return JSON.stringify(str);
		}
		function slugify(input) {
			return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
		}
		const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
		function isObject(data) {
			return typeof data === "object" && data !== null && !Array.isArray(data);
		}
		const allowsEval = /* @__PURE__*/ cached(() => {
			if (globalConfig.jitless) return false;
			if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
			try {
				new Function("");
				return true;
			} catch (_) {
				return false;
			}
		});
		function isPlainObject(o) {
			if (isObject(o) === false) return false;
			const ctor = o.constructor;
			if (ctor === void 0) return true;
			if (typeof ctor !== "function") return true;
			const prot = ctor.prototype;
			if (isObject(prot) === false) return false;
			if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
			return true;
		}
		function shallowClone(o) {
			if (isPlainObject(o)) return { ...o };
			if (Array.isArray(o)) return [...o];
			if (o instanceof Map) return new Map(o);
			if (o instanceof Set) return new Set(o);
			return o;
		}
		const propertyKeyTypes = /* @__PURE__*/ new Set([
			"string",
			"number",
			"symbol"
		]);
		function escapeRegex(str) {
			return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function clone(inst, def, params) {
			const cl = new inst._zod.constr(def ?? inst._zod.def);
			if (!def || params?.parent) cl._zod.parent = inst;
			return cl;
		}
		function normalizeParams(_params) {
			const params = _params;
			if (!params) return {};
			if (typeof params === "string") return { error: () => params };
			if (params?.message !== void 0) {
				if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
				params.error = params.message;
			}
			delete params.message;
			if (typeof params.error === "string") return {
				...params,
				error: () => params.error
			};
			return params;
		}
		function optionalKeys(shape) {
			return Object.keys(shape).filter((k) => {
				return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
			});
		}
		const NUMBER_FORMAT_RANGES = {
			safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			int32: [-2147483648, 2147483647],
			uint32: [0, 4294967295],
			float32: [-34028234663852886e22, 34028234663852886e22],
			float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
		};
		function pick(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = {};
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						newShape[key] = currDef.shape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function omit(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = { ...schema._zod.def.shape };
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						delete newShape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function extend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) {
				const existingShape = schema._zod.def.shape;
				for (const key in shape) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
			}
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function safeExtend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function merge(a, b) {
			if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
			return clone(a, mergeDefs(a._zod.def, {
				get shape() {
					const _shape = {
						...a._zod.def.shape,
						...b._zod.def.shape
					};
					assignProp(this, "shape", _shape);
					return _shape;
				},
				get catchall() {
					return b._zod.def.catchall;
				},
				checks: b._zod.def.checks ?? []
			}));
		}
		function partial(Class, schema, mask) {
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) throw new Error(".partial() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const oldShape = schema._zod.def.shape;
					const shape = { ...oldShape };
					if (mask) for (const key in mask) {
						if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						shape[key] = Class ? new Class({
							type: "optional",
							innerType: oldShape[key]
						}) : oldShape[key];
					}
					else for (const key in oldShape) shape[key] = Class ? new Class({
						type: "optional",
						innerType: oldShape[key]
					}) : oldShape[key];
					assignProp(this, "shape", shape);
					return shape;
				},
				checks: []
			}));
		}
		function required(Class, schema, mask) {
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const oldShape = schema._zod.def.shape;
				const shape = { ...oldShape };
				if (mask) for (const key in mask) {
					if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
					if (!mask[key]) continue;
					shape[key] = new Class({
						type: "nonoptional",
						innerType: oldShape[key]
					});
				}
				else for (const key in oldShape) shape[key] = new Class({
					type: "nonoptional",
					innerType: oldShape[key]
				});
				assignProp(this, "shape", shape);
				return shape;
			} }));
		}
		function aborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
			return false;
		}
		function explicitlyAborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
			return false;
		}
		function prefixIssues(path, issues) {
			return issues.map((iss) => {
				var _a;
				(_a = iss).path ?? (_a.path = []);
				iss.path.unshift(path);
				return iss;
			});
		}
		function unwrapMessage(message) {
			return typeof message === "string" ? message : message?.message;
		}
		function finalizeIssue(iss, ctx, config) {
			const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
			const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
			rest.path ?? (rest.path = []);
			rest.message = message;
			if (ctx?.reportInput) rest.input = _input;
			return rest;
		}
		function getLengthableOrigin(input) {
			if (Array.isArray(input)) return "array";
			if (typeof input === "string") return "string";
			return "unknown";
		}
		function issue(...args) {
			const [iss, input, inst] = args;
			if (typeof iss === "string") return {
				message: iss,
				code: "custom",
				input,
				inst
			};
			return { ...iss };
		}
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
		const initializer$1 = (inst, def) => {
			inst.name = "$ZodError";
			Object.defineProperty(inst, "_zod", {
				value: inst._zod,
				enumerable: false
			});
			Object.defineProperty(inst, "issues", {
				value: def,
				enumerable: false
			});
			inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
			Object.defineProperty(inst, "toString", {
				value: () => inst.message,
				enumerable: false
			});
		};
		const $ZodError = $constructor("$ZodError", initializer$1);
		const $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
		function flattenError(error, mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of error.issues) if (sub.path.length > 0) {
				fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
				fieldErrors[sub.path[0]].push(mapper(sub));
			} else formErrors.push(mapper(sub));
			return {
				formErrors,
				fieldErrors
			};
		}
		function formatError(error, mapper = (issue) => issue.message) {
			const fieldErrors = { _errors: [] };
			const processError = (error, path = []) => {
				for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
				else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else {
					const fullpath = [...path, ...issue.path];
					if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
					else {
						let curr = fieldErrors;
						let i = 0;
						while (i < fullpath.length) {
							const el = fullpath[i];
							if (!(i === fullpath.length - 1)) curr[el] = curr[el] || { _errors: [] };
							else {
								curr[el] = curr[el] || { _errors: [] };
								curr[el]._errors.push(mapper(issue));
							}
							curr = curr[el];
							i++;
						}
					}
				}
			};
			processError(error);
			return fieldErrors;
		}
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
		const _parse = (_Err) => (schema, value, _ctx, _params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			if (result.issues.length) {
				const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, _params?.callee);
				throw e;
			}
			return result.value;
		};
		const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			if (result.issues.length) {
				const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, params?.callee);
				throw e;
			}
			return result.value;
		};
		const _safeParse = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			return result.issues.length ? {
				success: false,
				error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
		const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			return result.issues.length ? {
				success: false,
				error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
		const _encode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parse(_Err)(schema, value, ctx);
		};
		const _decode = (_Err) => (schema, value, _ctx) => {
			return _parse(_Err)(schema, value, _ctx);
		};
		const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parseAsync(_Err)(schema, value, ctx);
		};
		const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _parseAsync(_Err)(schema, value, _ctx);
		};
		const _safeEncode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParse(_Err)(schema, value, ctx);
		};
		const _safeDecode = (_Err) => (schema, value, _ctx) => {
			return _safeParse(_Err)(schema, value, _ctx);
		};
		const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParseAsync(_Err)(schema, value, ctx);
		};
		const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _safeParseAsync(_Err)(schema, value, _ctx);
		};
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const cuid = /^[cC][0-9a-z]{6,}$/;
		const cuid2 = /^[0-9a-z]+$/;
		const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
		const xid = /^[0-9a-vA-V]{20}$/;
		const ksuid = /^[A-Za-z0-9]{27}$/;
		const nanoid = /^[a-zA-Z0-9_-]{21}$/;
		/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
		const duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
		/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
		const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
		/** Returns a regex for validating an RFC 9562/4122 UUID.
		*
		* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
		const uuid = (version) => {
			if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
			return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
		};
		/** Practical email validation */
		const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
		const _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
		function emoji() {
			return new RegExp(_emoji$1, "u");
		}
		const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
		const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
		const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
		const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
		const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
		const base64url = /^[A-Za-z0-9_-]*$/;
		const httpProtocol = /^https?$/;
		const e164 = /^\+[1-9]\d{6,14}$/;
		const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
		const date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
		function timeSource(args) {
			const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
			return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
		}
		function time$1(args) {
			return new RegExp(`^${timeSource(args)}$`);
		}
		function datetime$1(args) {
			const time = timeSource({ precision: args.precision });
			const opts = ["Z"];
			if (args.local) opts.push("");
			if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
			const timeRegex = `${time}(?:${opts.join("|")})`;
			return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
		}
		const string$1 = (params) => {
			const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
			return new RegExp(`^${regex}$`);
		};
		const integer$1 = /^-?\d+$/;
		const number$2 = /^-?\d+(?:\.\d+)?$/;
		const boolean$1 = /^(?:true|false)$/i;
		const lowercase = /^[^A-Z]*$/;
		const uppercase = /^[^a-z]*$/;
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
		const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
			var _a;
			inst._zod ?? (inst._zod = {});
			inst._zod.def = def;
			(_a = inst._zod).onattach ?? (_a.onattach = []);
		});
		const numericOriginMap = {
			number: "number",
			bigint: "bigint",
			object: "date"
		};
		const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
				if (def.value < curr) if (def.inclusive) bag.maximum = def.value;
				else bag.exclusiveMaximum = def.value;
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
				if (def.value > curr) if (def.inclusive) bag.minimum = def.value;
				else bag.exclusiveMinimum = def.value;
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				var _a;
				(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
			});
			inst._zod.check = (payload) => {
				if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
				if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
				payload.issues.push({
					origin: typeof payload.value,
					code: "not_multiple_of",
					divisor: def.value,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
			$ZodCheck.init(inst, def);
			def.format = def.format || "float64";
			const isInt = def.format?.includes("int");
			const origin = isInt ? "int" : "number";
			const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				bag.minimum = minimum;
				bag.maximum = maximum;
				if (isInt) bag.pattern = integer$1;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (isInt) {
					if (!Number.isInteger(input)) {
						payload.issues.push({
							expected: origin,
							format: def.format,
							code: "invalid_type",
							continue: false,
							input,
							inst
						});
						return;
					}
					if (!Number.isSafeInteger(input)) {
						if (input > 0) payload.issues.push({
							input,
							code: "too_big",
							maximum: Number.MAX_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						else payload.issues.push({
							input,
							code: "too_small",
							minimum: Number.MIN_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						return;
					}
				}
				if (input < minimum) payload.issues.push({
					origin: "number",
					input,
					code: "too_small",
					minimum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
				if (input > maximum) payload.issues.push({
					origin: "number",
					input,
					code: "too_big",
					maximum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
				if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length <= def.maximum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: def.maximum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
				if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length >= def.minimum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: def.minimum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.minimum = def.length;
				bag.maximum = def.length;
				bag.length = def.length;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				const length = input.length;
				if (length === def.length) return;
				const origin = getLengthableOrigin(input);
				const tooBig = length > def.length;
				payload.issues.push({
					origin,
					...tooBig ? {
						code: "too_big",
						maximum: def.length
					} : {
						code: "too_small",
						minimum: def.length
					},
					inclusive: true,
					exact: true,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
			var _a, _b;
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				if (def.pattern) {
					bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
					bag.patterns.add(def.pattern);
				}
			});
			if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: def.format,
					input: payload.value,
					...def.pattern ? { pattern: def.pattern.toString() } : {},
					inst,
					continue: !def.abort
				});
			});
			else (_b = inst._zod).check ?? (_b.check = () => {});
		});
		const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "regex",
					input: payload.value,
					pattern: def.pattern.toString(),
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
			def.pattern ?? (def.pattern = lowercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
			def.pattern ?? (def.pattern = uppercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
			$ZodCheck.init(inst, def);
			const escapedRegex = escapeRegex(def.includes);
			const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
			def.pattern = pattern;
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.includes(def.includes, def.position)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "includes",
					includes: def.includes,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.startsWith(def.prefix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "starts_with",
					prefix: def.prefix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.endsWith(def.suffix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "ends_with",
					suffix: def.suffix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.check = (payload) => {
				payload.value = def.tx(payload.value);
			};
		});
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
		var Doc = class {
			constructor(args = []) {
				this.content = [];
				this.indent = 0;
				if (this) this.args = args;
			}
			indented(fn) {
				this.indent += 1;
				fn(this);
				this.indent -= 1;
			}
			write(arg) {
				if (typeof arg === "function") {
					arg(this, { execution: "sync" });
					arg(this, { execution: "async" });
					return;
				}
				const lines = arg.split("\n").filter((x) => x);
				const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
				const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
				for (const line of dedented) this.content.push(line);
			}
			compile() {
				const F = Function;
				const args = this?.args;
				const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
				return new F(...args, lines.join("\n"));
			}
		};
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
		const version = {
			major: 4,
			minor: 4,
			patch: 3
		};
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
		const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
			var _a;
			inst ?? (inst = {});
			inst._zod.def = def;
			inst._zod.bag = inst._zod.bag || {};
			inst._zod.version = version;
			const checks = [...inst._zod.def.checks ?? []];
			if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
			for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
			if (checks.length === 0) {
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred?.push(() => {
					inst._zod.run = inst._zod.parse;
				});
			} else {
				const runChecks = (payload, checks, ctx) => {
					let isAborted = aborted(payload);
					let asyncResult;
					for (const ch of checks) {
						if (ch._zod.def.when) {
							if (explicitlyAborted(payload)) continue;
							if (!ch._zod.def.when(payload)) continue;
						} else if (isAborted) continue;
						const currLen = payload.issues.length;
						const _ = ch._zod.check(payload);
						if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
						if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
							await _;
							if (payload.issues.length === currLen) return;
							if (!isAborted) isAborted = aborted(payload, currLen);
						});
						else {
							if (payload.issues.length === currLen) continue;
							if (!isAborted) isAborted = aborted(payload, currLen);
						}
					}
					if (asyncResult) return asyncResult.then(() => {
						return payload;
					});
					return payload;
				};
				const handleCanaryResult = (canary, payload, ctx) => {
					if (aborted(canary)) {
						canary.aborted = true;
						return canary;
					}
					const checkResult = runChecks(payload, checks, ctx);
					if (checkResult instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
					}
					return inst._zod.parse(checkResult, ctx);
				};
				inst._zod.run = (payload, ctx) => {
					if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
					if (ctx.direction === "backward") {
						const canary = inst._zod.parse({
							value: payload.value,
							issues: []
						}, {
							...ctx,
							skipChecks: true
						});
						if (canary instanceof Promise) return canary.then((canary) => {
							return handleCanaryResult(canary, payload, ctx);
						});
						return handleCanaryResult(canary, payload, ctx);
					}
					const result = inst._zod.parse(payload, ctx);
					if (result instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return result.then((result) => runChecks(result, checks, ctx));
					}
					return runChecks(result, checks, ctx);
				};
			}
			defineLazy(inst, "~standard", () => ({
				validate: (value) => {
					try {
						const r = safeParse$1(inst, value);
						return r.success ? { value: r.data } : { issues: r.error?.issues };
					} catch (_) {
						return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
					}
				},
				vendor: "zod",
				version: 1
			}));
		});
		const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
			inst._zod.parse = (payload, _) => {
				if (def.coerce) try {
					payload.value = String(payload.value);
				} catch (_) {}
				if (typeof payload.value === "string") return payload;
				payload.issues.push({
					expected: "string",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			$ZodString.init(inst, def);
		});
		const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
			def.pattern ?? (def.pattern = guid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
			if (def.version) {
				const v = {
					v1: 1,
					v2: 2,
					v3: 3,
					v4: 4,
					v5: 5,
					v6: 6,
					v7: 7,
					v8: 8
				}[def.version];
				if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
				def.pattern ?? (def.pattern = uuid(v));
			} else def.pattern ?? (def.pattern = uuid());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
			def.pattern ?? (def.pattern = email);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				try {
					const trimmed = payload.value.trim();
					if (!def.normalize && def.protocol?.source === httpProtocol.source) {
						if (!/^https?:\/\//i.test(trimmed)) {
							payload.issues.push({
								code: "invalid_format",
								format: "url",
								note: "Invalid URL format",
								input: payload.value,
								inst,
								continue: !def.abort
							});
							return;
						}
					}
					const url = new URL(trimmed);
					if (def.hostname) {
						def.hostname.lastIndex = 0;
						if (!def.hostname.test(url.hostname)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid hostname",
							pattern: def.hostname.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.protocol) {
						def.protocol.lastIndex = 0;
						if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid protocol",
							pattern: def.protocol.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.normalize) payload.value = url.href;
					else payload.value = trimmed;
					return;
				} catch (_) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
			def.pattern ?? (def.pattern = emoji());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
			def.pattern ?? (def.pattern = nanoid);
			$ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
			def.pattern ?? (def.pattern = cuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
			def.pattern ?? (def.pattern = cuid2);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
			def.pattern ?? (def.pattern = ulid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
			def.pattern ?? (def.pattern = xid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
			def.pattern ?? (def.pattern = ksuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
			def.pattern ?? (def.pattern = datetime$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
			def.pattern ?? (def.pattern = date$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
			def.pattern ?? (def.pattern = time$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
			def.pattern ?? (def.pattern = duration$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
			def.pattern ?? (def.pattern = ipv4);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv4`;
		});
		const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
			def.pattern ?? (def.pattern = ipv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv6`;
			inst._zod.check = (payload) => {
				try {
					new URL(`http://[${payload.value}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "ipv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv4);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				const parts = payload.value.split("/");
				try {
					if (parts.length !== 2) throw new Error();
					const [address, prefix] = parts;
					if (!prefix) throw new Error();
					const prefixNum = Number(prefix);
					if (`${prefixNum}` !== prefix) throw new Error();
					if (prefixNum < 0 || prefixNum > 128) throw new Error();
					new URL(`http://[${address}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "cidrv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		function isValidBase64(data) {
			if (data === "") return true;
			if (/\s/.test(data)) return false;
			if (data.length % 4 !== 0) return false;
			try {
				atob(data);
				return true;
			} catch {
				return false;
			}
		}
		const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
			def.pattern ?? (def.pattern = base64);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64";
			inst._zod.check = (payload) => {
				if (isValidBase64(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		function isValidBase64URL(data) {
			if (!base64url.test(data)) return false;
			const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
			return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
		}
		const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
			def.pattern ?? (def.pattern = base64url);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64url";
			inst._zod.check = (payload) => {
				if (isValidBase64URL(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
			def.pattern ?? (def.pattern = e164);
			$ZodStringFormat.init(inst, def);
		});
		function isValidJWT(token, algorithm = null) {
			try {
				const tokensParts = token.split(".");
				if (tokensParts.length !== 3) return false;
				const [header] = tokensParts;
				if (!header) return false;
				const parsedHeader = JSON.parse(atob(header));
				if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
				if (!parsedHeader.alg) return false;
				if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
				return true;
			} catch {
				return false;
			}
		}
		const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (isValidJWT(payload.value, def.alg)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "jwt",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = inst._zod.bag.pattern ?? number$2;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Number(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
				const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
				payload.issues.push({
					expected: "number",
					code: "invalid_type",
					input,
					inst,
					...received ? { received } : {}
				});
				return payload;
			};
		});
		const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
			$ZodCheckNumberFormat.init(inst, def);
			$ZodNumber.init(inst, def);
		});
		const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = boolean$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Boolean(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "boolean") return payload;
				payload.issues.push({
					expected: "boolean",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload) => payload;
		});
		const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _ctx) => {
				payload.issues.push({
					expected: "never",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		function handleArrayResult(result, final, index) {
			if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
			final.value[index] = result.value;
		}
		const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				if (!Array.isArray(input)) {
					payload.issues.push({
						expected: "array",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = Array(input.length);
				const proms = [];
				for (let i = 0; i < input.length; i++) {
					const item = input[i];
					const result = def.element._zod.run({
						value: item,
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
					else handleArrayResult(result, payload, i);
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
			const isPresent = key in input;
			if (result.issues.length) {
				if (isOptionalIn && isOptionalOut && !isPresent) return;
				final.issues.push(...prefixIssues(key, result.issues));
			}
			if (!isPresent && !isOptionalIn) {
				if (!result.issues.length) final.issues.push({
					code: "invalid_type",
					expected: "nonoptional",
					input: void 0,
					path: [key]
				});
				return;
			}
			if (result.value === void 0) {
				if (isPresent) final.value[key] = void 0;
			} else final.value[key] = result.value;
		}
		function normalizeDef(def) {
			const keys = Object.keys(def.shape);
			for (const k of keys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
			const okeys = optionalKeys(def.shape);
			return {
				...def,
				keys,
				keySet: new Set(keys),
				numKeys: keys.length,
				optionalKeys: new Set(okeys)
			};
		}
		function handleCatchall(proms, input, payload, ctx, def, inst) {
			const unrecognized = [];
			const keySet = def.keySet;
			const _catchall = def.catchall._zod;
			const t = _catchall.def.type;
			const isOptionalIn = _catchall.optin === "optional";
			const isOptionalOut = _catchall.optout === "optional";
			for (const key in input) {
				if (key === "__proto__") continue;
				if (keySet.has(key)) continue;
				if (t === "never") {
					unrecognized.push(key);
					continue;
				}
				const r = _catchall.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
				else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
			}
			if (unrecognized.length) payload.issues.push({
				code: "unrecognized_keys",
				keys: unrecognized,
				input,
				inst
			});
			if (!proms.length) return payload;
			return Promise.all(proms).then(() => {
				return payload;
			});
		}
		const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
			$ZodType.init(inst, def);
			if (!Object.getOwnPropertyDescriptor(def, "shape")?.get) {
				const sh = def.shape;
				Object.defineProperty(def, "shape", { get: () => {
					const newSh = { ...sh };
					Object.defineProperty(def, "shape", { value: newSh });
					return newSh;
				} });
			}
			const _normalized = cached(() => normalizeDef(def));
			defineLazy(inst._zod, "propValues", () => {
				const shape = def.shape;
				const propValues = {};
				for (const key in shape) {
					const field = shape[key]._zod;
					if (field.values) {
						propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
						for (const v of field.values) propValues[key].add(v);
					}
				}
				return propValues;
			});
			const isObject$1 = isObject;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$1(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = {};
				const proms = [];
				const shape = value.shape;
				for (const key of value.keys) {
					const el = shape[key];
					const isOptionalIn = el._zod.optin === "optional";
					const isOptionalOut = el._zod.optout === "optional";
					const r = el._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
					else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
				}
				if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
				return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
			};
		});
		const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
			$ZodObject.init(inst, def);
			const superParse = inst._zod.parse;
			const _normalized = cached(() => normalizeDef(def));
			const generateFastpass = (shape) => {
				const doc = new Doc([
					"shape",
					"payload",
					"ctx"
				]);
				const normalized = _normalized.value;
				const parseStr = (key) => {
					const k = esc(key);
					return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
				};
				doc.write(`const input = payload.value;`);
				const ids = Object.create(null);
				let counter = 0;
				for (const key of normalized.keys) ids[key] = `key_${counter++}`;
				doc.write(`const newResult = {};`);
				for (const key of normalized.keys) {
					const id = ids[key];
					const k = esc(key);
					const schema = shape[key];
					const isOptionalIn = schema?._zod?.optin === "optional";
					const isOptionalOut = schema?._zod?.optout === "optional";
					doc.write(`const ${id} = ${parseStr(key)};`);
					if (isOptionalIn && isOptionalOut) doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
					else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
					else doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
				}
				doc.write(`payload.value = newResult;`);
				doc.write(`return payload;`);
				const fn = doc.compile();
				return (payload, ctx) => fn(shape, payload, ctx);
			};
			let fastpass;
			const isObject$2 = isObject;
			const jit = !globalConfig.jitless;
			const fastEnabled = jit && allowsEval.value;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$2(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
					if (!fastpass) fastpass = generateFastpass(def.shape);
					payload = fastpass(payload, ctx);
					if (!catchall) return payload;
					return handleCatchall([], input, payload, ctx, value, inst);
				}
				return superParse(payload, ctx);
			};
		});
		function handleUnionResults(results, final, inst, ctx) {
			for (const result of results) if (result.issues.length === 0) {
				final.value = result.value;
				return final;
			}
			const nonaborted = results.filter((r) => !aborted(r));
			if (nonaborted.length === 1) {
				final.value = nonaborted[0].value;
				return nonaborted[0];
			}
			final.issues.push({
				code: "invalid_union",
				input: final.value,
				inst,
				errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			});
			return final;
		}
		const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "values", () => {
				if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
			});
			defineLazy(inst._zod, "pattern", () => {
				if (def.options.every((o) => o._zod.pattern)) {
					const patterns = def.options.map((o) => o._zod.pattern);
					return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
				}
			});
			const first = def.options.length === 1 ? def.options[0]._zod.run : null;
			inst._zod.parse = (payload, ctx) => {
				if (first) return first(payload, ctx);
				let async = false;
				const results = [];
				for (const option of def.options) {
					const result = option._zod.run({
						value: payload.value,
						issues: []
					}, ctx);
					if (result instanceof Promise) {
						results.push(result);
						async = true;
					} else {
						if (result.issues.length === 0) return result;
						results.push(result);
					}
				}
				if (!async) return handleUnionResults(results, payload, inst, ctx);
				return Promise.all(results).then((results) => {
					return handleUnionResults(results, payload, inst, ctx);
				});
			};
		});
		const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				const left = def.left._zod.run({
					value: input,
					issues: []
				}, ctx);
				const right = def.right._zod.run({
					value: input,
					issues: []
				}, ctx);
				if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
					return handleIntersectionResults(payload, left, right);
				});
				return handleIntersectionResults(payload, left, right);
			};
		});
		function mergeValues(a, b) {
			if (a === b) return {
				valid: true,
				data: a
			};
			if (a instanceof Date && b instanceof Date && +a === +b) return {
				valid: true,
				data: a
			};
			if (isPlainObject(a) && isPlainObject(b)) {
				const bKeys = Object.keys(b);
				const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
				const newObj = {
					...a,
					...b
				};
				for (const key of sharedKeys) {
					const sharedValue = mergeValues(a[key], b[key]);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
					};
					newObj[key] = sharedValue.data;
				}
				return {
					valid: true,
					data: newObj
				};
			}
			if (Array.isArray(a) && Array.isArray(b)) {
				if (a.length !== b.length) return {
					valid: false,
					mergeErrorPath: []
				};
				const newArray = [];
				for (let index = 0; index < a.length; index++) {
					const itemA = a[index];
					const itemB = b[index];
					const sharedValue = mergeValues(itemA, itemB);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
					};
					newArray.push(sharedValue.data);
				}
				return {
					valid: true,
					data: newArray
				};
			}
			return {
				valid: false,
				mergeErrorPath: []
			};
		}
		function handleIntersectionResults(result, left, right) {
			const unrecKeys = /* @__PURE__ */ new Map();
			let unrecIssue;
			for (const iss of left.issues) if (iss.code === "unrecognized_keys") {
				unrecIssue ?? (unrecIssue = iss);
				for (const k of iss.keys) {
					if (!unrecKeys.has(k)) unrecKeys.set(k, {});
					unrecKeys.get(k).l = true;
				}
			} else result.issues.push(iss);
			for (const iss of right.issues) if (iss.code === "unrecognized_keys") for (const k of iss.keys) {
				if (!unrecKeys.has(k)) unrecKeys.set(k, {});
				unrecKeys.get(k).r = true;
			}
			else result.issues.push(iss);
			const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
			if (bothKeys.length && unrecIssue) result.issues.push({
				...unrecIssue,
				keys: bothKeys
			});
			if (aborted(result)) return result;
			const merged = mergeValues(left.value, right.value);
			if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
			result.value = merged.data;
			return result;
		}
		const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
			$ZodType.init(inst, def);
			const values = getEnumValues(def.entries);
			const valuesSet = new Set(values);
			inst._zod.values = valuesSet;
			inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (valuesSet.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
			$ZodType.init(inst, def);
			if (def.values.length === 0) throw new Error("Cannot create literal schema with no valid values");
			const values = new Set(def.values);
			inst._zod.values = values;
			inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (values.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values: def.values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				const _out = def.transform(payload.value, payload);
				if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				if (_out instanceof Promise) throw new $ZodAsyncError();
				payload.value = _out;
				payload.fallback = true;
				return payload;
			};
		});
		function handleOptionalResult(result, input) {
			if (input === void 0 && (result.issues.length || result.fallback)) return {
				issues: [],
				value: void 0
			};
			return result;
		}
		const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.optout = "optional";
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? new Set([...def.innerType._zod.values, void 0]) : void 0;
			});
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (def.innerType._zod.optin === "optional") {
					const input = payload.value;
					const result = def.innerType._zod.run(payload, ctx);
					if (result instanceof Promise) return result.then((r) => handleOptionalResult(r, input));
					return handleOptionalResult(result, input);
				}
				if (payload.value === void 0) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
			inst._zod.parse = (payload, ctx) => {
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
			});
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === null) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) {
					payload.value = def.defaultValue;
					/**
					* $ZodDefault returns the default value immediately in forward direction.
					* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
					return payload;
				}
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
				return handleDefaultResult(result, def);
			};
		});
		function handleDefaultResult(payload, def) {
			if (payload.value === void 0) payload.value = def.defaultValue;
			return payload;
		}
		const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) payload.value = def.defaultValue;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => {
				const v = def.innerType._zod.values;
				return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
				return handleNonOptionalResult(result, inst);
			};
		});
		function handleNonOptionalResult(payload, inst) {
			if (!payload.issues.length && payload.value === void 0) payload.issues.push({
				code: "invalid_type",
				expected: "nonoptional",
				input: payload.value,
				inst
			});
			return payload;
		}
		const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => {
					payload.value = result.value;
					if (result.issues.length) {
						payload.value = def.catchValue({
							...payload,
							error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
							input: payload.value
						});
						payload.issues = [];
						payload.fallback = true;
					}
					return payload;
				});
				payload.value = result.value;
				if (result.issues.length) {
					payload.value = def.catchValue({
						...payload,
						error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
						input: payload.value
					});
					payload.issues = [];
					payload.fallback = true;
				}
				return payload;
			};
		});
		const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => def.in._zod.values);
			defineLazy(inst._zod, "optin", () => def.in._zod.optin);
			defineLazy(inst._zod, "optout", () => def.out._zod.optout);
			defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") {
					const right = def.out._zod.run(payload, ctx);
					if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
					return handlePipeResult(right, def.in, ctx);
				}
				const left = def.in._zod.run(payload, ctx);
				if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
				return handlePipeResult(left, def.out, ctx);
			};
		});
		function handlePipeResult(left, next, ctx) {
			if (left.issues.length) {
				left.aborted = true;
				return left;
			}
			return next._zod.run({
				value: left.value,
				issues: left.issues,
				fallback: left.fallback
			}, ctx);
		}
		const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
			defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then(handleReadonlyResult);
				return handleReadonlyResult(result);
			};
		});
		function handleReadonlyResult(payload) {
			payload.value = Object.freeze(payload.value);
			return payload;
		}
		const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
			$ZodCheck.init(inst, def);
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _) => {
				return payload;
			};
			inst._zod.check = (payload) => {
				const input = payload.value;
				const r = def.fn(input);
				if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
				handleRefineResult(r, payload, input, inst);
			};
		});
		function handleRefineResult(result, payload, input, inst) {
			if (!result) {
				const _iss = {
					code: "custom",
					input,
					inst,
					path: [...inst._zod.def.path ?? []],
					continue: !inst._zod.def.abort
				};
				if (inst._zod.def.params) _iss.params = inst._zod.def.params;
				payload.issues.push(issue(_iss));
			}
		}
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
		var _a;
		var $ZodRegistry = class {
			constructor() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
			}
			add(schema, ..._meta) {
				const meta = _meta[0];
				this._map.set(schema, meta);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
				return this;
			}
			clear() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
				return this;
			}
			remove(schema) {
				const meta = this._map.get(schema);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
				this._map.delete(schema);
				return this;
			}
			get(schema) {
				const p = schema._zod.parent;
				if (p) {
					const pm = { ...this.get(p) ?? {} };
					delete pm.id;
					const f = {
						...pm,
						...this._map.get(schema)
					};
					return Object.keys(f).length ? f : void 0;
				}
				return this._map.get(schema);
			}
			has(schema) {
				return this._map.has(schema);
			}
		};
		function registry() {
			return new $ZodRegistry();
		}
		(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
		const globalRegistry = globalThis.__zod_globalRegistry;
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
		// @__NO_SIDE_EFFECTS__
		function _string(Class, params) {
			return new Class({
				type: "string",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _email(Class, params) {
			return new Class({
				type: "string",
				format: "email",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _guid(Class, params) {
			return new Class({
				type: "string",
				format: "guid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuid(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv4(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v4",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv6(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v6",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv7(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v7",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _url(Class, params) {
			return new Class({
				type: "string",
				format: "url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _emoji(Class, params) {
			return new Class({
				type: "string",
				format: "emoji",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _nanoid(Class, params) {
			return new Class({
				type: "string",
				format: "nanoid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link _cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		// @__NO_SIDE_EFFECTS__
		function _cuid(Class, params) {
			return new Class({
				type: "string",
				format: "cuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cuid2(Class, params) {
			return new Class({
				type: "string",
				format: "cuid2",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ulid(Class, params) {
			return new Class({
				type: "string",
				format: "ulid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _xid(Class, params) {
			return new Class({
				type: "string",
				format: "xid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ksuid(Class, params) {
			return new Class({
				type: "string",
				format: "ksuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv4(Class, params) {
			return new Class({
				type: "string",
				format: "ipv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv6(Class, params) {
			return new Class({
				type: "string",
				format: "ipv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv4(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv6(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64(Class, params) {
			return new Class({
				type: "string",
				format: "base64",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64url(Class, params) {
			return new Class({
				type: "string",
				format: "base64url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _e164(Class, params) {
			return new Class({
				type: "string",
				format: "e164",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _jwt(Class, params) {
			return new Class({
				type: "string",
				format: "jwt",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDateTime(Class, params) {
			return new Class({
				type: "string",
				format: "datetime",
				check: "string_format",
				offset: false,
				local: false,
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDate(Class, params) {
			return new Class({
				type: "string",
				format: "date",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoTime(Class, params) {
			return new Class({
				type: "string",
				format: "time",
				check: "string_format",
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDuration(Class, params) {
			return new Class({
				type: "string",
				format: "duration",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _number(Class, params) {
			return new Class({
				type: "number",
				checks: [],
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _int(Class, params) {
			return new Class({
				type: "number",
				check: "number_format",
				abort: false,
				format: "safeint",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _boolean(Class, params) {
			return new Class({
				type: "boolean",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _unknown(Class) {
			return new Class({ type: "unknown" });
		}
		// @__NO_SIDE_EFFECTS__
		function _never(Class, params) {
			return new Class({
				type: "never",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lt(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lte(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gt(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gte(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _multipleOf(value, params) {
			return new $ZodCheckMultipleOf({
				check: "multiple_of",
				...normalizeParams(params),
				value
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _maxLength(maximum, params) {
			return new $ZodCheckMaxLength({
				check: "max_length",
				...normalizeParams(params),
				maximum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _minLength(minimum, params) {
			return new $ZodCheckMinLength({
				check: "min_length",
				...normalizeParams(params),
				minimum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _length(length, params) {
			return new $ZodCheckLengthEquals({
				check: "length_equals",
				...normalizeParams(params),
				length
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _regex(pattern, params) {
			return new $ZodCheckRegex({
				check: "string_format",
				format: "regex",
				...normalizeParams(params),
				pattern
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lowercase(params) {
			return new $ZodCheckLowerCase({
				check: "string_format",
				format: "lowercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uppercase(params) {
			return new $ZodCheckUpperCase({
				check: "string_format",
				format: "uppercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _includes(includes, params) {
			return new $ZodCheckIncludes({
				check: "string_format",
				format: "includes",
				...normalizeParams(params),
				includes
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _startsWith(prefix, params) {
			return new $ZodCheckStartsWith({
				check: "string_format",
				format: "starts_with",
				...normalizeParams(params),
				prefix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _endsWith(suffix, params) {
			return new $ZodCheckEndsWith({
				check: "string_format",
				format: "ends_with",
				...normalizeParams(params),
				suffix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _overwrite(tx) {
			return new $ZodCheckOverwrite({
				check: "overwrite",
				tx
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _normalize(form) {
			return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
		}
		// @__NO_SIDE_EFFECTS__
		function _trim() {
			return /* @__PURE__ */ _overwrite((input) => input.trim());
		}
		// @__NO_SIDE_EFFECTS__
		function _toLowerCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _toUpperCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _slugify() {
			return /* @__PURE__ */ _overwrite((input) => slugify(input));
		}
		// @__NO_SIDE_EFFECTS__
		function _array(Class, element, params) {
			return new Class({
				type: "array",
				element,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _refine(Class, fn, _params) {
			return new Class({
				type: "custom",
				check: "custom",
				fn,
				...normalizeParams(_params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _superRefine(fn, params) {
			const ch = /* @__PURE__ */ _check((payload) => {
				payload.addIssue = (issue$2) => {
					if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
					else {
						const _issue = issue$2;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = ch);
						_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
						payload.issues.push(issue(_issue));
					}
				};
				return fn(payload.value, payload);
			}, params);
			return ch;
		}
		// @__NO_SIDE_EFFECTS__
		function _check(fn, params) {
			const ch = new $ZodCheck({
				check: "custom",
				...normalizeParams(params)
			});
			ch._zod.check = fn;
			return ch;
		}
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
		function initializeContext(params) {
			let target = params?.target ?? "draft-2020-12";
			if (target === "draft-4") target = "draft-04";
			if (target === "draft-7") target = "draft-07";
			return {
				processors: params.processors ?? {},
				metadataRegistry: params?.metadata ?? globalRegistry,
				target,
				unrepresentable: params?.unrepresentable ?? "throw",
				override: params?.override ?? (() => {}),
				io: params?.io ?? "output",
				counter: 0,
				seen: /* @__PURE__ */ new Map(),
				cycles: params?.cycles ?? "ref",
				reused: params?.reused ?? "inline",
				external: params?.external ?? void 0
			};
		}
		function process(schema, ctx, _params = {
			path: [],
			schemaPath: []
		}) {
			var _a;
			const def = schema._zod.def;
			const seen = ctx.seen.get(schema);
			if (seen) {
				seen.count++;
				if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
				return seen.schema;
			}
			const result = {
				schema: {},
				count: 1,
				cycle: void 0,
				path: _params.path
			};
			ctx.seen.set(schema, result);
			const overrideSchema = schema._zod.toJSONSchema?.();
			if (overrideSchema) result.schema = overrideSchema;
			else {
				const params = {
					..._params,
					schemaPath: [..._params.schemaPath, schema],
					path: _params.path
				};
				if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
				else {
					const _json = result.schema;
					const processor = ctx.processors[def.type];
					if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
					processor(schema, ctx, _json, params);
				}
				const parent = schema._zod.parent;
				if (parent) {
					if (!result.ref) result.ref = parent;
					process(parent, ctx, params);
					ctx.seen.get(parent).isParent = true;
				}
			}
			const meta = ctx.metadataRegistry.get(schema);
			if (meta) Object.assign(result.schema, meta);
			if (ctx.io === "input" && isTransforming(schema)) {
				delete result.schema.examples;
				delete result.schema.default;
			}
			if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
			delete result.schema._prefault;
			return ctx.seen.get(schema).schema;
		}
		function extractDefs(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const idToSchema = /* @__PURE__ */ new Map();
			for (const entry of ctx.seen.entries()) {
				const id = ctx.metadataRegistry.get(entry[0])?.id;
				if (id) {
					const existing = idToSchema.get(id);
					if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
					idToSchema.set(id, entry[0]);
				}
			}
			const makeURI = (entry) => {
				const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
				if (ctx.external) {
					const externalId = ctx.external.registry.get(entry[0])?.id;
					const uriGenerator = ctx.external.uri ?? ((id) => id);
					if (externalId) return { ref: uriGenerator(externalId) };
					const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
					entry[1].defId = id;
					return {
						defId: id,
						ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
					};
				}
				if (entry[1] === root) return { ref: "#" };
				const defUriPrefix = `#/${defsSegment}/`;
				const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
				return {
					defId,
					ref: defUriPrefix + defId
				};
			};
			const extractToDef = (entry) => {
				if (entry[1].schema.$ref) return;
				const seen = entry[1];
				const { ref, defId } = makeURI(entry);
				seen.def = { ...seen.schema };
				if (defId) seen.defId = defId;
				const schema = seen.schema;
				for (const key in schema) delete schema[key];
				schema.$ref = ref;
			};
			if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
			}
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (schema === entry[0]) {
					extractToDef(entry);
					continue;
				}
				if (ctx.external) {
					const ext = ctx.external.registry.get(entry[0])?.id;
					if (schema !== entry[0] && ext) {
						extractToDef(entry);
						continue;
					}
				}
				if (ctx.metadataRegistry.get(entry[0])?.id) {
					extractToDef(entry);
					continue;
				}
				if (seen.cycle) {
					extractToDef(entry);
					continue;
				}
				if (seen.count > 1) {
					if (ctx.reused === "ref") {
						extractToDef(entry);
						continue;
					}
				}
			}
		}
		function finalize(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const flattenRef = (zodSchema) => {
				const seen = ctx.seen.get(zodSchema);
				if (seen.ref === null) return;
				const schema = seen.def ?? seen.schema;
				const _cached = { ...schema };
				const ref = seen.ref;
				seen.ref = null;
				if (ref) {
					flattenRef(ref);
					const refSeen = ctx.seen.get(ref);
					const refSchema = refSeen.schema;
					if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
						schema.allOf = schema.allOf ?? [];
						schema.allOf.push(refSchema);
					} else Object.assign(schema, refSchema);
					Object.assign(schema, _cached);
					if (zodSchema._zod.parent === ref) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (!(key in _cached)) delete schema[key];
					}
					if (refSchema.$ref && refSeen.def) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
					}
				}
				const parent = zodSchema._zod.parent;
				if (parent && parent !== ref) {
					flattenRef(parent);
					const parentSeen = ctx.seen.get(parent);
					if (parentSeen?.schema.$ref) {
						schema.$ref = parentSeen.schema.$ref;
						if (parentSeen.def) for (const key in schema) {
							if (key === "$ref" || key === "allOf") continue;
							if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
						}
					}
				}
				ctx.override({
					zodSchema,
					jsonSchema: schema,
					path: seen.path ?? []
				});
			};
			for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
			const result = {};
			if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
			else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
			else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
			else if (ctx.target === "openapi-3.0") {}
			if (ctx.external?.uri) {
				const id = ctx.external.registry.get(schema)?.id;
				if (!id) throw new Error("Schema is missing an `id` property");
				result.$id = ctx.external.uri(id);
			}
			Object.assign(result, root.def ?? root.schema);
			const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
			if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
			const defs = ctx.external?.defs ?? {};
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.def && seen.defId) {
					if (seen.def.id === seen.defId) delete seen.def.id;
					defs[seen.defId] = seen.def;
				}
			}
			if (ctx.external) {} else if (Object.keys(defs).length > 0) if (ctx.target === "draft-2020-12") result.$defs = defs;
			else result.definitions = defs;
			try {
				const finalized = JSON.parse(JSON.stringify(result));
				Object.defineProperty(finalized, "~standard", {
					value: {
						...schema["~standard"],
						jsonSchema: {
							input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
							output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
						}
					},
					enumerable: false,
					writable: false
				});
				return finalized;
			} catch (_err) {
				throw new Error("Error converting schema to JSON.");
			}
		}
		function isTransforming(_schema, _ctx) {
			const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
			if (ctx.seen.has(_schema)) return false;
			ctx.seen.add(_schema);
			const def = _schema._zod.def;
			if (def.type === "transform") return true;
			if (def.type === "array") return isTransforming(def.element, ctx);
			if (def.type === "set") return isTransforming(def.valueType, ctx);
			if (def.type === "lazy") return isTransforming(def.getter(), ctx);
			if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") return isTransforming(def.innerType, ctx);
			if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
			if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
			if (def.type === "pipe") {
				if (_schema._zod.traits.has("$ZodCodec")) return true;
				return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
			}
			if (def.type === "object") {
				for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
				return false;
			}
			if (def.type === "union") {
				for (const option of def.options) if (isTransforming(option, ctx)) return true;
				return false;
			}
			if (def.type === "tuple") {
				for (const item of def.items) if (isTransforming(item, ctx)) return true;
				if (def.rest && isTransforming(def.rest, ctx)) return true;
				return false;
			}
			return false;
		}
		/**
		* Creates a toJSONSchema method for a schema instance.
		* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
		*/
		const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
			const ctx = initializeContext({
				...params,
				processors
			});
			process(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
			const { libraryOptions, target } = params ?? {};
			const ctx = initializeContext({
				...libraryOptions ?? {},
				target,
				io,
				processors
			});
			process(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
		const formatMap = {
			guid: "uuid",
			url: "uri",
			datetime: "date-time",
			json_string: "json-string",
			regex: ""
		};
		const stringProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			json.type = "string";
			const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
			if (typeof minimum === "number") json.minLength = minimum;
			if (typeof maximum === "number") json.maxLength = maximum;
			if (format) {
				json.format = formatMap[format] ?? format;
				if (json.format === "") delete json.format;
				if (format === "time") delete json.format;
			}
			if (contentEncoding) json.contentEncoding = contentEncoding;
			if (patterns && patterns.size > 0) {
				const regexes = [...patterns];
				if (regexes.length === 1) json.pattern = regexes[0].source;
				else if (regexes.length > 1) json.allOf = [...regexes.map((regex) => ({
					...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
					pattern: regex.source
				}))];
			}
		};
		const numberProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
			if (typeof format === "string" && format.includes("int")) json.type = "integer";
			else json.type = "number";
			const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
			const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
			const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
			if (exMin) if (legacy) {
				json.minimum = exclusiveMinimum;
				json.exclusiveMinimum = true;
			} else json.exclusiveMinimum = exclusiveMinimum;
			else if (typeof minimum === "number") json.minimum = minimum;
			if (exMax) if (legacy) {
				json.maximum = exclusiveMaximum;
				json.exclusiveMaximum = true;
			} else json.exclusiveMaximum = exclusiveMaximum;
			else if (typeof maximum === "number") json.maximum = maximum;
			if (typeof multipleOf === "number") json.multipleOf = multipleOf;
		};
		const booleanProcessor = (_schema, _ctx, json, _params) => {
			json.type = "boolean";
		};
		const neverProcessor = (_schema, _ctx, json, _params) => {
			json.not = {};
		};
		const enumProcessor = (schema, _ctx, json, _params) => {
			const def = schema._zod.def;
			const values = getEnumValues(def.entries);
			if (values.every((v) => typeof v === "number")) json.type = "number";
			if (values.every((v) => typeof v === "string")) json.type = "string";
			json.enum = values;
		};
		const literalProcessor = (schema, ctx, json, _params) => {
			const def = schema._zod.def;
			const vals = [];
			for (const val of def.values) if (val === void 0) {
				if (ctx.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
			} else if (typeof val === "bigint") if (ctx.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
			else vals.push(Number(val));
			else vals.push(val);
			if (vals.length === 0) {} else if (vals.length === 1) {
				const val = vals[0];
				json.type = val === null ? "null" : typeof val;
				if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
				else json.const = val;
			} else {
				if (vals.every((v) => typeof v === "number")) json.type = "number";
				if (vals.every((v) => typeof v === "string")) json.type = "string";
				if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
				if (vals.every((v) => v === null)) json.type = "null";
				json.enum = vals;
			}
		};
		const customProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
		};
		const transformProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
		};
		const arrayProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const { minimum, maximum } = schema._zod.bag;
			if (typeof minimum === "number") json.minItems = minimum;
			if (typeof maximum === "number") json.maxItems = maximum;
			json.type = "array";
			json.items = process(def.element, ctx, {
				...params,
				path: [...params.path, "items"]
			});
		};
		const objectProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			json.type = "object";
			json.properties = {};
			const shape = def.shape;
			for (const key in shape) json.properties[key] = process(shape[key], ctx, {
				...params,
				path: [
					...params.path,
					"properties",
					key
				]
			});
			const allKeys = new Set(Object.keys(shape));
			const requiredKeys = new Set([...allKeys].filter((key) => {
				const v = def.shape[key]._zod;
				if (ctx.io === "input") return v.optin === void 0;
				else return v.optout === void 0;
			}));
			if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
			if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
			else if (!def.catchall) {
				if (ctx.io === "output") json.additionalProperties = false;
			} else if (def.catchall) json.additionalProperties = process(def.catchall, ctx, {
				...params,
				path: [...params.path, "additionalProperties"]
			});
		};
		const unionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const isExclusive = def.inclusive === false;
			const options = def.options.map((x, i) => process(x, ctx, {
				...params,
				path: [
					...params.path,
					isExclusive ? "oneOf" : "anyOf",
					i
				]
			}));
			if (isExclusive) json.oneOf = options;
			else json.anyOf = options;
		};
		const intersectionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const a = process(def.left, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					0
				]
			});
			const b = process(def.right, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					1
				]
			});
			const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
			json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
		};
		const nullableProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const inner = process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			if (ctx.target === "openapi-3.0") {
				seen.ref = def.innerType;
				json.nullable = true;
			} else json.anyOf = [inner, { type: "null" }];
		};
		const nonoptionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		const defaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.default = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const prefaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const catchProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			let catchValue;
			try {
				catchValue = def.catchValue(void 0);
			} catch {
				throw new Error("Dynamic catch values are not supported in JSON Schema");
			}
			json.default = catchValue;
		};
		const pipeProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			const inIsTransform = def.in._zod.traits.has("$ZodTransform");
			const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
			process(innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = innerType;
		};
		const readonlyProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.readOnly = true;
		};
		const optionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js
		const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
			$ZodISODateTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function datetime(params) {
			return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
		}
		const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
			$ZodISODate.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function date(params) {
			return /* @__PURE__ */ _isoDate(ZodISODate, params);
		}
		const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
			$ZodISOTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function time(params) {
			return /* @__PURE__ */ _isoTime(ZodISOTime, params);
		}
		const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
			$ZodISODuration.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function duration(params) {
			return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
		}
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
		const initializer = (inst, issues) => {
			$ZodError.init(inst, issues);
			inst.name = "ZodError";
			Object.defineProperties(inst, {
				format: { value: (mapper) => formatError(inst, mapper) },
				flatten: { value: (mapper) => flattenError(inst, mapper) },
				addIssue: { value: (issue) => {
					inst.issues.push(issue);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				addIssues: { value: (issues) => {
					inst.issues.push(...issues);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				isEmpty: { get() {
					return inst.issues.length === 0;
				} }
			});
		};
		const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, { Parent: Error });
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js
		const parse = /* @__PURE__ */ _parse(ZodRealError);
		const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
		const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
		const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
		const encode = /* @__PURE__ */ _encode(ZodRealError);
		const decode = /* @__PURE__ */ _decode(ZodRealError);
		const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
		const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
		const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
		const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
		const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
		const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
		//#endregion
		//#region ../../_temp/deepseek-harness/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
		const _installedGroups = /* @__PURE__ */ new WeakMap();
		function _installLazyMethods(inst, group, methods) {
			const proto = Object.getPrototypeOf(inst);
			let installed = _installedGroups.get(proto);
			if (!installed) {
				installed = /* @__PURE__ */ new Set();
				_installedGroups.set(proto, installed);
			}
			if (installed.has(group)) return;
			installed.add(group);
			for (const key in methods) {
				const fn = methods[key];
				Object.defineProperty(proto, key, {
					configurable: true,
					enumerable: false,
					get() {
						const bound = fn.bind(this);
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: bound
						});
						return bound;
					},
					set(v) {
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: v
						});
					}
				});
			}
		}
		const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
			$ZodType.init(inst, def);
			Object.assign(inst["~standard"], { jsonSchema: {
				input: createStandardJSONSchemaMethod(inst, "input"),
				output: createStandardJSONSchemaMethod(inst, "output")
			} });
			inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
			inst.def = def;
			inst.type = def.type;
			Object.defineProperty(inst, "_def", { value: def });
			inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
			inst.safeParse = (data, params) => safeParse(inst, data, params);
			inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
			inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
			inst.spa = inst.safeParseAsync;
			inst.encode = (data, params) => encode(inst, data, params);
			inst.decode = (data, params) => decode(inst, data, params);
			inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
			inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
			inst.safeEncode = (data, params) => safeEncode(inst, data, params);
			inst.safeDecode = (data, params) => safeDecode(inst, data, params);
			inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
			inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
			_installLazyMethods(inst, "ZodType", {
				check(...chks) {
					const def = this.def;
					return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
						check: ch,
						def: { check: "custom" },
						onattach: []
					} } : ch)] }), { parent: true });
				},
				with(...chks) {
					return this.check(...chks);
				},
				clone(def, params) {
					return clone(this, def, params);
				},
				brand() {
					return this;
				},
				register(reg, meta) {
					reg.add(this, meta);
					return this;
				},
				refine(check, params) {
					return this.check(refine(check, params));
				},
				superRefine(refinement, params) {
					return this.check(superRefine(refinement, params));
				},
				overwrite(fn) {
					return this.check(/* @__PURE__ */ _overwrite(fn));
				},
				optional() {
					return optional(this);
				},
				exactOptional() {
					return exactOptional(this);
				},
				nullable() {
					return nullable(this);
				},
				nullish() {
					return optional(nullable(this));
				},
				nonoptional(params) {
					return nonoptional(this, params);
				},
				array() {
					return array(this);
				},
				or(arg) {
					return union([this, arg]);
				},
				and(arg) {
					return intersection(this, arg);
				},
				transform(tx) {
					return pipe(this, transform(tx));
				},
				default(d) {
					return _default(this, d);
				},
				prefault(d) {
					return prefault(this, d);
				},
				catch(params) {
					return _catch(this, params);
				},
				pipe(target) {
					return pipe(this, target);
				},
				readonly() {
					return readonly(this);
				},
				describe(description) {
					const cl = this.clone();
					globalRegistry.add(cl, { description });
					return cl;
				},
				meta(...args) {
					if (args.length === 0) return globalRegistry.get(this);
					const cl = this.clone();
					globalRegistry.add(cl, args[0]);
					return cl;
				},
				isOptional() {
					return this.safeParse(void 0).success;
				},
				isNullable() {
					return this.safeParse(null).success;
				},
				apply(fn) {
					return fn(this);
				}
			});
			Object.defineProperty(inst, "description", {
				get() {
					return globalRegistry.get(inst)?.description;
				},
				configurable: true
			});
			return inst;
		});
		/** @internal */
		const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
			const bag = inst._zod.bag;
			inst.format = bag.format ?? null;
			inst.minLength = bag.minimum ?? null;
			inst.maxLength = bag.maximum ?? null;
			_installLazyMethods(inst, "_ZodString", {
				regex(...args) {
					return this.check(/* @__PURE__ */ _regex(...args));
				},
				includes(...args) {
					return this.check(/* @__PURE__ */ _includes(...args));
				},
				startsWith(...args) {
					return this.check(/* @__PURE__ */ _startsWith(...args));
				},
				endsWith(...args) {
					return this.check(/* @__PURE__ */ _endsWith(...args));
				},
				min(...args) {
					return this.check(/* @__PURE__ */ _minLength(...args));
				},
				max(...args) {
					return this.check(/* @__PURE__ */ _maxLength(...args));
				},
				length(...args) {
					return this.check(/* @__PURE__ */ _length(...args));
				},
				nonempty(...args) {
					return this.check(/* @__PURE__ */ _minLength(1, ...args));
				},
				lowercase(params) {
					return this.check(/* @__PURE__ */ _lowercase(params));
				},
				uppercase(params) {
					return this.check(/* @__PURE__ */ _uppercase(params));
				},
				trim() {
					return this.check(/* @__PURE__ */ _trim());
				},
				normalize(...args) {
					return this.check(/* @__PURE__ */ _normalize(...args));
				},
				toLowerCase() {
					return this.check(/* @__PURE__ */ _toLowerCase());
				},
				toUpperCase() {
					return this.check(/* @__PURE__ */ _toUpperCase());
				},
				slugify() {
					return this.check(/* @__PURE__ */ _slugify());
				}
			});
		});
		const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			_ZodString.init(inst, def);
			inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
			inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
			inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
			inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
			inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
			inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
			inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
			inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
			inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
			inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
			inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
			inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
			inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
			inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
			inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
			inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
			inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
			inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
			inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
			inst.datetime = (params) => inst.check(datetime(params));
			inst.date = (params) => inst.check(date(params));
			inst.time = (params) => inst.check(time(params));
			inst.duration = (params) => inst.check(duration(params));
		});
		function string(params) {
			return /* @__PURE__ */ _string(ZodString, params);
		}
		const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			_ZodString.init(inst, def);
		});
		const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
			$ZodEmail.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
			$ZodGUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
			$ZodUUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
			$ZodURL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
			$ZodEmoji.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
			$ZodNanoID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
			$ZodCUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
			$ZodCUID2.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
			$ZodULID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
			$ZodXID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
			$ZodKSUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
			$ZodIPv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
			$ZodIPv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
			$ZodCIDRv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
			$ZodCIDRv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
			$ZodBase64.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
			$ZodBase64URL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
			$ZodE164.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
			$ZodJWT.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
			$ZodNumber.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
			_installLazyMethods(inst, "ZodNumber", {
				gt(value, params) {
					return this.check(/* @__PURE__ */ _gt(value, params));
				},
				gte(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				min(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				lt(value, params) {
					return this.check(/* @__PURE__ */ _lt(value, params));
				},
				lte(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				max(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				int(params) {
					return this.check(int(params));
				},
				safe(params) {
					return this.check(int(params));
				},
				positive(params) {
					return this.check(/* @__PURE__ */ _gt(0, params));
				},
				nonnegative(params) {
					return this.check(/* @__PURE__ */ _gte(0, params));
				},
				negative(params) {
					return this.check(/* @__PURE__ */ _lt(0, params));
				},
				nonpositive(params) {
					return this.check(/* @__PURE__ */ _lte(0, params));
				},
				multipleOf(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				step(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				finite() {
					return this;
				}
			});
			const bag = inst._zod.bag;
			inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
			inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
			inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
			inst.isFinite = true;
			inst.format = bag.format ?? null;
		});
		function number$1(params) {
			return /* @__PURE__ */ _number(ZodNumber, params);
		}
		const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
			$ZodNumberFormat.init(inst, def);
			ZodNumber.init(inst, def);
		});
		function int(params) {
			return /* @__PURE__ */ _int(ZodNumberFormat, params);
		}
		const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
			$ZodBoolean.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
		});
		function boolean(params) {
			return /* @__PURE__ */ _boolean(ZodBoolean, params);
		}
		const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
			$ZodUnknown.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => void 0;
		});
		function unknown() {
			return /* @__PURE__ */ _unknown(ZodUnknown);
		}
		const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
			$ZodNever.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
		});
		function never(params) {
			return /* @__PURE__ */ _never(ZodNever, params);
		}
		const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
			$ZodArray.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
			inst.element = def.element;
			_installLazyMethods(inst, "ZodArray", {
				min(n, params) {
					return this.check(/* @__PURE__ */ _minLength(n, params));
				},
				nonempty(params) {
					return this.check(/* @__PURE__ */ _minLength(1, params));
				},
				max(n, params) {
					return this.check(/* @__PURE__ */ _maxLength(n, params));
				},
				length(n, params) {
					return this.check(/* @__PURE__ */ _length(n, params));
				},
				unwrap() {
					return this.element;
				}
			});
		});
		function array(element, params) {
			return /* @__PURE__ */ _array(ZodArray, element, params);
		}
		const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
			$ZodObjectJIT.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
			defineLazy(inst, "shape", () => {
				return def.shape;
			});
			_installLazyMethods(inst, "ZodObject", {
				keyof() {
					return _enum(Object.keys(this._zod.def.shape));
				},
				catchall(catchall) {
					return this.clone({
						...this._zod.def,
						catchall
					});
				},
				passthrough() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				loose() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				strict() {
					return this.clone({
						...this._zod.def,
						catchall: never()
					});
				},
				strip() {
					return this.clone({
						...this._zod.def,
						catchall: void 0
					});
				},
				extend(incoming) {
					return extend(this, incoming);
				},
				safeExtend(incoming) {
					return safeExtend(this, incoming);
				},
				merge(other) {
					return merge(this, other);
				},
				pick(mask) {
					return pick(this, mask);
				},
				omit(mask) {
					return omit(this, mask);
				},
				partial(...args) {
					return partial(ZodOptional, this, args[0]);
				},
				required(...args) {
					return required(ZodNonOptional, this, args[0]);
				}
			});
		});
		function object(shape, params) {
			return new ZodObject({
				type: "object",
				shape: shape ?? {},
				...normalizeParams(params)
			});
		}
		const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
			$ZodUnion.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
			inst.options = def.options;
		});
		function union(options, params) {
			return new ZodUnion({
				type: "union",
				options,
				...normalizeParams(params)
			});
		}
		const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
			$ZodIntersection.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
		});
		function intersection(left, right) {
			return new ZodIntersection({
				type: "intersection",
				left,
				right
			});
		}
		const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
			$ZodEnum.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
			inst.enum = def.entries;
			inst.options = Object.values(def.entries);
			const keys = new Set(Object.keys(def.entries));
			inst.extract = (values, params) => {
				const newEntries = {};
				for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
			inst.exclude = (values, params) => {
				const newEntries = { ...def.entries };
				for (const value of values) if (keys.has(value)) delete newEntries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
		});
		function _enum(values, params) {
			return new ZodEnum({
				type: "enum",
				entries: Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values,
				...normalizeParams(params)
			});
		}
		const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
			$ZodLiteral.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
			inst.values = new Set(def.values);
			Object.defineProperty(inst, "value", { get() {
				if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
				return def.values[0];
			} });
		});
		function literal(value, params) {
			return new ZodLiteral({
				type: "literal",
				values: Array.isArray(value) ? value : [value],
				...normalizeParams(params)
			});
		}
		const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
			$ZodTransform.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
			inst._zod.parse = (payload, _ctx) => {
				if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				payload.addIssue = (issue$1) => {
					if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
					else {
						const _issue = issue$1;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = inst);
						payload.issues.push(issue(_issue));
					}
				};
				const output = def.transform(payload.value, payload);
				if (output instanceof Promise) return output.then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				payload.value = output;
				payload.fallback = true;
				return payload;
			};
		});
		function transform(fn) {
			return new ZodTransform({
				type: "transform",
				transform: fn
			});
		}
		const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function optional(innerType) {
			return new ZodOptional({
				type: "optional",
				innerType
			});
		}
		const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
			$ZodExactOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function exactOptional(innerType) {
			return new ZodExactOptional({
				type: "optional",
				innerType
			});
		}
		const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
			$ZodNullable.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nullable(innerType) {
			return new ZodNullable({
				type: "nullable",
				innerType
			});
		}
		const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
			$ZodDefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeDefault = inst.unwrap;
		});
		function _default(innerType, defaultValue) {
			return new ZodDefault({
				type: "default",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
			$ZodPrefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function prefault(innerType, defaultValue) {
			return new ZodPrefault({
				type: "prefault",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
			$ZodNonOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nonoptional(innerType, params) {
			return new ZodNonOptional({
				type: "nonoptional",
				innerType,
				...normalizeParams(params)
			});
		}
		const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
			$ZodCatch.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeCatch = inst.unwrap;
		});
		function _catch(innerType, catchValue) {
			return new ZodCatch({
				type: "catch",
				innerType,
				catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
			});
		}
		const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
			$ZodPipe.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
			inst.in = def.in;
			inst.out = def.out;
		});
		function pipe(in_, out) {
			return new ZodPipe({
				type: "pipe",
				in: in_,
				out
			});
		}
		const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
			$ZodReadonly.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function readonly(innerType) {
			return new ZodReadonly({
				type: "readonly",
				innerType
			});
		}
		const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
			$ZodCustom.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
		});
		function refine(fn, _params = {}) {
			return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
		}
		function superRefine(fn, params) {
			return /* @__PURE__ */ _superRefine(fn, params);
		}
		//#endregion
		//#region src/workbench/schema.ts
		const SCHEMA = "dsh-token-usage/workbench-v2";
		const MAX_STATE_CHARS = 3e6;
		const integer = number$1().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
		const identifier = string().min(1).max(256);
		const stamp = string().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)));
		const day = string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
			const date = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
			return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
		});
		const bucketsSchema = object({
			uncachedInputTokens: integer,
			outputTokens: integer,
			cacheReadTokens: integer,
			cacheWriteTokens: integer
		}).strict().refine((value) => Number.isSafeInteger(Object.values(value).reduce((sum, n) => sum + n, 0)));
		const bucketKeys = [
			"uncachedInputTokens",
			"outputTokens",
			"cacheReadTokens",
			"cacheWriteTokens"
		];
		const rate = number$1().finite().min(0).max(1e6).nullable();
		const ratesSchema = object({
			uncachedInputTokens: rate,
			outputTokens: rate,
			cacheReadTokens: rate,
			cacheWriteTokens: rate
		}).strict();
		const periodSchema = object({
			days: array(number$1().int().min(0).max(6)).min(1).max(7).refine((days) => new Set(days).size === days.length),
			startMinute: number$1().int().min(0).max(1439),
			endMinute: number$1().int().min(1).max(1440),
			rates: ratesSchema
		}).strict().refine((value) => value.startMinute < value.endMinute);
		const rateCardSchema = object({
			id: string().regex(/^[A-Za-z0-9._-]{1,96}$/),
			label: string().min(1).max(100),
			provider: identifier,
			model: identifier,
			currency: _enum(["USD", "CNY"]),
			effectiveFrom: stamp,
			effectiveTo: stamp.optional(),
			verifiedAt: stamp,
			source: _enum(["public", "user-defined"]),
			sourceUrl: string().max(512).url().refine((value) => {
				const url = new URL(value);
				return url.protocol === "https:" && !url.username && !url.password;
			}).optional(),
			rates: ratesSchema,
			timezone: string().min(1).max(80).refine((value) => {
				try {
					new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
					return true;
				} catch {
					return false;
				}
			}).default("UTC"),
			periods: array(periodSchema).max(32).default([]),
			tiers: array(object({
				minimumInput: integer,
				rates: ratesSchema
			}).strict()).max(16).default([]),
			cacheWriteVariants: object({
				short: rate,
				long: rate
			}).strict().optional()
		}).strict().superRefine((card, ctx) => {
			if (card.effectiveTo && Date.parse(card.effectiveTo) <= Date.parse(card.effectiveFrom)) ctx.addIssue({
				code: "custom",
				message: "Invalid effective interval"
			});
			if (new Set(card.tiers.map((tier) => tier.minimumInput)).size !== card.tiers.length) ctx.addIssue({
				code: "custom",
				message: "Duplicate context threshold"
			});
			if (card.periods.length && card.tiers.length) ctx.addIssue({
				code: "custom",
				message: "Combined time/context tariffs require an explicit supported rule; split into separate cards"
			});
			for (let i = 0; i < card.periods.length; i++) for (let j = i + 1; j < card.periods.length; j++) {
				const a = card.periods[i], b = card.periods[j];
				if (a.days.some((day) => b.days.includes(day)) && a.startMinute < b.endMinute && b.startMinute < a.endMinute) ctx.addIssue({
					code: "custom",
					message: "Overlapping tariff periods"
				});
			}
		});
		const cardsSchema = array(rateCardSchema).max(128).superRefine((cards, ctx) => {
			if (new Set(cards.map((card) => card.id)).size !== cards.length) ctx.addIssue({
				code: "custom",
				message: "Duplicate price-card id"
			});
			for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
				const a = cards[i], b = cards[j];
				if (a.provider === b.provider && a.model === b.model && a.currency === b.currency && Date.parse(a.effectiveFrom) < (b.effectiveTo ? Date.parse(b.effectiveTo) : Infinity) && Date.parse(b.effectiveFrom) < (a.effectiveTo ? Date.parse(a.effectiveTo) : Infinity)) ctx.addIssue({
					code: "custom",
					message: "Overlapping route/currency price versions"
				});
			}
		});
		const moneyBudgetSchema = object({
			currency: _enum(["USD", "CNY"]),
			amount: number$1().finite().positive().max(1e9)
		}).strict();
		const projectSchema = object({
			id: identifier,
			name: string().trim().min(1).max(80),
			tokenBudget: integer,
			moneyBudgets: array(moneyBudgetSchema).max(2).refine((values) => new Set(values.map((value) => value.currency)).size === values.length).default([])
		}).strict();
		const assignmentSchema = object({
			sessionId: identifier,
			projectId: identifier,
			tags: array(string().trim().min(1).max(40)).max(12)
		}).strict();
		const findingSchema = object({
			ruleId: identifier,
			ruleVersion: literal("1"),
			severity: _enum([
				"info",
				"warning",
				"error"
			]),
			evidence: array(string().max(200)).max(16),
			value: number$1().finite(),
			threshold: number$1().finite().optional(),
			coverage: _enum([
				"complete",
				"partial",
				"unavailable"
			]),
			scope: _enum([
				"session",
				"project",
				"global"
			]).default("session"),
			suggestedAction: object({
				zh: string().min(1).max(400),
				en: string().min(1).max(600)
			}).strict().default({
				zh: "查看证据并确认数据覆盖。",
				en: "Inspect the evidence and verify data coverage."
			}),
			nodes: array(object({
				id: identifier,
				seq: integer,
				index: integer
			}).strict()).max(16).default([])
		}).strict();
		const nodeSchema = object({
			id: identifier,
			seq: integer,
			kind: _enum(["model", "compaction"]),
			status: _enum([
				"open",
				"completed",
				"retried"
			]),
			finality: _enum(["provisional", "authoritative"]),
			provider: identifier,
			model: identifier,
			usage: bucketsSchema,
			time: stamp.optional()
		}).strict();
		const totalsSchema = object({
			usage: bucketsSchema,
			retry: bucketsSchema,
			compaction: bucketsSchema,
			ordinary: bucketsSchema,
			attributed: bucketsSchema,
			delta: object({
				uncachedInputTokens: number$1().int().finite(),
				outputTokens: number$1().int().finite(),
				cacheReadTokens: number$1().int().finite(),
				cacheWriteTokens: number$1().int().finite()
			}).strict(),
			requests: integer,
			retries: integer,
			compactions: integer,
			toolCalls: integer,
			toolErrors: integer,
			orphanTools: integer,
			openTurns: integer,
			openSteps: integer,
			unresolvedApprovals: integer,
			durationMs: integer,
			activeDurationMs: integer,
			completedTurns: integer,
			failedTurns: integer
		}).strict();
		const snapshotSchema = object({
			schema: literal("dsh-token-usage/snapshot-v1"),
			sessionId: identifier,
			generatedAt: stamp,
			revision: identifier,
			firstSeq: integer,
			lastSeq: integer,
			eventCount: integer,
			totals: totalsSchema,
			reconciliation: _enum(["matched", "mismatch"]),
			findings: array(findingSchema).max(32),
			nodes: array(nodeSchema).max(200),
			nodeCount: integer,
			provisionalNodeCount: integer,
			offset: integer,
			nextOffset: integer.nullable(),
			timeCoverage: _enum([
				"complete",
				"partial",
				"unavailable"
			]).default("unavailable"),
			routeCoverage: _enum([
				"complete",
				"partial",
				"unavailable"
			]).default("unavailable"),
			routes: array(object({
				provider: identifier,
				model: identifier,
				usage: bucketsSchema
			}).strict()).max(512)
		}).strict();
		const experimentRunSchema = object({
			id: identifier,
			experiment: string().trim().min(1).max(80),
			variant: _enum(["baseline", "candidate"]),
			pair: string().trim().min(1).max(80),
			task: string().trim().min(1).max(80),
			size: string().trim().min(1).max(40),
			conditions: string().trim().min(1).max(160),
			configLabel: string().trim().min(1).max(80),
			accepted: boolean().nullable(),
			generatedAt: stamp,
			revision: identifier,
			usage: bucketsSchema,
			retries: integer,
			durationMs: integer,
			complete: boolean(),
			requests: integer.optional(),
			retryUsage: bucketsSchema.optional(),
			toolCalls: integer.optional(),
			toolErrors: integer.optional(),
			acceptanceAt: stamp.optional(),
			costs: array(object({
				currency: _enum(["USD", "CNY"]),
				amount: number$1().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
				complete: boolean(),
				basis: string().max(200),
				fingerprint: string().max(128).optional()
			}).strict()).max(2)
		}).strict();
		const configurationSchema = object({
			cards: cardsSchema,
			projects: array(projectSchema).max(64),
			assignments: array(assignmentSchema).max(5e3),
			experiments: array(experimentRunSchema).max(500),
			thresholds: object({
				retryShare: number$1().min(0).max(1),
				compactionShare: number$1().min(0).max(1)
			}).strict(),
			moneyBudgets: array(moneyBudgetSchema).max(2).refine((values) => new Set(values.map((value) => value.currency)).size === values.length),
			shareSummary: boolean()
		}).strict().superRefine((config, ctx) => {
			for (const items of [config.projects, config.experiments]) if (new Set(items.map((item) => item.id)).size !== items.length) ctx.addIssue({
				code: "custom",
				message: "Duplicate id"
			});
			if (config.projects.some((project) => project.id === "unassigned")) ctx.addIssue({
				code: "custom",
				message: "Reserved project id"
			});
			if (new Set(config.assignments.map((item) => item.sessionId)).size !== config.assignments.length) ctx.addIssue({
				code: "custom",
				message: "A session must have one primary project"
			});
			if (config.assignments.some((item) => !config.projects.some((project) => project.id === item.projectId))) ctx.addIssue({
				code: "custom",
				message: "Unknown project assignment"
			});
		});
		const ledgerEntrySchema = object({
			requestKey: string().regex(/^[a-f0-9]{64}$/).optional(),
			id: identifier,
			routeId: string().regex(/^[a-f0-9]{32}$/),
			kind: _enum(["usage-analysis", "trajectory-analysis"]),
			startedAt: stamp,
			endedAt: stamp.optional(),
			status: _enum([
				"running",
				"completed",
				"failed",
				"cancelled",
				"interrupted"
			]),
			usage: bucketsSchema.nullable(),
			finality: _enum([
				"unknown",
				"provisional",
				"authoritative"
			])
		}).strict();
		const priceRevisionSchema = object({
			revision: integer,
			at: stamp,
			reason: _enum([
				"initial",
				"edit",
				"rollback"
			]),
			digest: string().regex(/^[a-f0-9]{64}$/),
			cards: cardsSchema
		}).strict();
		const requestKeySchema = object({
			key: string().regex(/^[a-f0-9]{64}$/),
			fingerprint: string().regex(/^[a-f0-9]{64}$/),
			at: stamp
		}).strict();
		const stateSchema = object({
			schema: literal(SCHEMA),
			revision: integer,
			config: configurationSchema,
			ledger: array(ledgerEntrySchema).max(512),
			evictedEntries: integer,
			priceRevision: integer.default(0),
			priceHistory: array(priceRevisionSchema).max(16).default([]),
			evictedPriceRevisions: integer.default(0),
			requestKeys: array(requestKeySchema).max(2048).default([]),
			evictedRequestKeys: integer.default(0),
			ledgerStartedAt: stamp.nullable().default(null),
			ledgerClearedAt: stamp.nullable().default(null)
		}).strict();
		function boundedParse(schema, value, maxChars = MAX_STATE_CHARS) {
			if (value === void 0 || JSON.stringify(value).length > maxChars) throw new Error("Payload exceeds the workbench limit");
			return schema.parse(value);
		}
		const snapshotRequestSchema = object({
			sessionId: identifier,
			offset: integer.max(2e5).default(0),
			revision: identifier.optional()
		}).strict();
		const configRequestSchema = object({
			revision: integer,
			config: configurationSchema
		}).strict();
		//#endregion
		//#region src/workbench/diagnostics.ts
		const actions = {
			"retry-share": ["展开重试节点，核对之前的失败事件；先区分提供方限流、网络错误和任务自身重试，再调整策略。", "Open retry nodes and inspect preceding failures. Distinguish provider throttling, transport failures and task retries before changing policy."],
			"compaction-share": ["检查压缩节点和上下文增长，比较相同任务的压缩频率；高占比本身不能证明浪费。", "Inspect compaction nodes and context growth, then compare equivalent tasks. A high share alone does not prove waste."],
			"tool-errors": ["在原会话检查工具错误与恢复结果，不要仅凭同名工具反复出现判断死循环。", "Inspect tool failures and recovery in the original session. Repeated tool names alone do not prove a loop."],
			"orphan-tools": ["核对事件是否完整、工具调用与返回是否成对；缺少一侧时不要补造耗时。", "Check event coverage and tool call/result pairing. Do not infer duration from a missing counterpart."],
			"open-lifecycle": ["会话仍在运行时重新读取；已经结束则检查是否缺失终态事件。", "Re-inspect an active session; for a finished session, check for missing terminal events."],
			"unresolved-approvals": ["在宿主审批界面确认待处理请求；体检不会代替你批准或拒绝。", "Review pending requests in the Host approval interface. Diagnostics never approve or reject them."],
			reconciliation: ["检查事件重放、临时用量替换和旧投影覆盖；对账恢复前不要据此认定完整费用。", "Inspect replay, provisional-usage replacement and legacy projection coverage. Do not treat pricing as complete until reconciliation matches."],
			"usage-unavailable": ["等待提供方上报 usage，或检查模型适配器；未观测用量不是零消耗。", "Wait for provider usage or inspect the model adapter. Unobserved usage is not zero consumption."],
			"time-coverage": ["部分节点没有有效时间戳；补齐事件后重读，不把未知时刻用于峰谷定价。", "Some nodes lack valid timestamps. Re-read after repairing event coverage; do not assign unknown times to tariffs."],
			"route-coverage": ["部分节点缺少精确模型路由；核对请求上下文，不借用其他模型费率。", "Some nodes lack an exact model route. Inspect request context; do not borrow another model’s rates."],
			"budget-pressure": ["核对完整项目范围与当前费率；需要调整预算或运行方式时由你显式操作，插件不会拦截任务。", "Verify the complete budget scope and current rates. Any budget or scheduling change remains an explicit user action; tasks are never blocked."],
			"budget-coverage": ["日期或定价覆盖不足，不能判断预算内；先核对未归因会话与缺失价卡。", "Incomplete dates or pricing prevent an “within budget” conclusion. Inspect undated sessions and missing price cards first."]
		};
		function finding(ruleId, severity, value, evidence, coverage = "complete", scope = "session", threshold) {
			const [zh, en] = actions[ruleId] ?? ["核对证据与数据覆盖。", "Verify the evidence and data coverage."];
			return findingSchema.parse({
				ruleId,
				ruleVersion: "1",
				severity,
				value,
				evidence,
				coverage,
				scope,
				suggestedAction: {
					zh,
					en
				},
				nodes: [],
				...threshold === void 0 ? {} : { threshold }
			});
		}
		//#endregion
		//#region src/workbench/prices.ts
		const zero = () => ({
			uncachedInputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0
		});
		const total = (usage) => bucketKeys.reduce((sum, key) => sum + usage[key], 0);
		function add(left, right) {
			return bucketsSchema.parse(Object.fromEntries(bucketKeys.map((key) => [key, left[key] + right[key]])));
		}
		const clocks = /* @__PURE__ */ new Map();
		function localClock(time, timezone) {
			let formatter = clocks.get(timezone);
			if (!formatter) {
				formatter = new Intl.DateTimeFormat("en-US", {
					timeZone: timezone,
					weekday: "short",
					hour: "2-digit",
					minute: "2-digit",
					hourCycle: "h23"
				});
				if (clocks.size >= 64) clocks.clear();
				clocks.set(timezone, formatter);
			}
			const parts = formatter.formatToParts(time);
			const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
			return {
				day: [
					"Sun",
					"Mon",
					"Tue",
					"Wed",
					"Thu",
					"Fri",
					"Sat"
				].indexOf(read("weekday")),
				minute: Number(read("hour")) * 60 + Number(read("minute"))
			};
		}
		function applies(card, time) {
			return time >= Date.parse(card.effectiveFrom) && (!card.effectiveTo || time < Date.parse(card.effectiveTo));
		}
		function ratesAt(card, usage, time, cacheWriteClass) {
			let rates = { ...card.rates };
			const clock = localClock(time, card.timezone);
			const period = card.periods.find((period) => period.days.includes(clock.day) && clock.minute >= period.startMinute && clock.minute < period.endMinute);
			if (period) rates = { ...period.rates };
			const input = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
			const tier = [...card.tiers].sort((a, b) => b.minimumInput - a.minimumInput).find((tier) => input >= tier.minimumInput);
			if (tier) rates = { ...tier.rates };
			if (card.cacheWriteVariants) rates.cacheWriteTokens = cacheWriteClass ? card.cacheWriteVariants[cacheWriteClass] : null;
			return rates;
		}
		function cost(usage, rates) {
			let amount = 0, covered = 0;
			const missing = [];
			for (const key of bucketKeys) {
				if (rates[key] === null) {
					if (usage[key]) missing.push(key);
					continue;
				}
				amount += usage[key] * rates[key] / 1e6;
				covered += usage[key];
			}
			if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER) throw new Error("Cost estimate overflow");
			return {
				amount,
				covered,
				missing
			};
		}
		function quote(cards, route, usage, options) {
			bucketsSchema.parse(usage);
			stamp.parse(options.at);
			const time = Date.parse(options.at);
			const matches = cards.filter((card) => card.provider === route.provider && card.model === route.model && card.currency === options.currency && applies(card, time));
			const base = {
				currency: options.currency,
				mode: options.mode,
				totalTokens: total(usage),
				cards: matches.map((card) => card.id),
				verifiedAt: matches.map((card) => card.verifiedAt)
			};
			if (matches.length !== 1) return {
				...base,
				amount: null,
				lower: null,
				upper: null,
				coveredTokens: 0,
				status: "unavailable",
				unavailable: [matches.length ? "ambiguous-price-card" : "unpriced-route"]
			};
			const card = matches[0];
			if (card.tiers.length && options.requestInputKnown !== true) return {
				...base,
				amount: null,
				lower: null,
				upper: null,
				coveredTokens: 0,
				status: "unavailable",
				unavailable: ["request-context-size-unavailable"]
			};
			const rates = ratesAt(card, usage, time, options.cacheWriteClass);
			const results = (options.timingKnown || !card.periods.length ? [rates] : [card.rates, ...card.periods.map((period) => period.rates)].map((value) => ({
				...value,
				...card.cacheWriteVariants ? { cacheWriteTokens: options.cacheWriteClass ? card.cacheWriteVariants[options.cacheWriteClass] : null } : {}
			}))).map((rates) => cost(usage, rates));
			const coveredTokens = Math.min(...results.map((result) => result.covered));
			const unavailable = [...new Set(results.flatMap((result) => result.missing))];
			const lower = Math.min(...results.map((result) => result.amount)), upper = Math.max(...results.map((result) => result.amount));
			const unknown = coveredTokens < total(usage);
			return {
				...base,
				amount: unknown || lower !== upper ? null : lower,
				lower: coveredTokens > 0 || total(usage) === 0 ? lower : null,
				upper: unknown ? null : upper,
				coveredTokens,
				status: unknown ? coveredTokens ? "partial" : "unavailable" : lower === upper ? "complete" : "range",
				unavailable: [...unavailable, ...!options.timingKnown && card.periods.length ? ["billing-instant-unverified"] : []]
			};
		}
		function sumQuotes(quotes, currency) {
			const items = quotes.filter((item) => item.currency === currency);
			const totalTokens = items.reduce((sum, item) => sum + item.totalTokens, 0);
			const coveredTokens = items.reduce((sum, item) => sum + item.coveredTokens, 0);
			const lower = items.length ? items.reduce((sum, item) => sum + (item.lower ?? 0), 0) : null;
			const upper = items.length && items.every((item) => item.upper !== null) ? items.reduce((sum, item) => sum + item.upper, 0) : null;
			if ([
				totalTokens,
				coveredTokens,
				lower ?? 0,
				upper ?? 0
			].some((value) => !Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)) throw new Error("Quote total overflow");
			const complete = items.length > 0 && items.every((item) => item.status === "complete");
			const range = items.length > 0 && items.every((item) => item.status === "complete" || item.status === "range");
			return {
				currency,
				mode: items[0]?.mode ?? "revaluation",
				amount: complete ? lower : null,
				lower: coveredTokens || totalTokens === 0 && items.length ? lower : null,
				upper,
				coveredTokens,
				totalTokens,
				status: complete ? "complete" : range ? "range" : coveredTokens ? "partial" : "unavailable",
				cards: [...new Set(items.flatMap((item) => item.cards))],
				verifiedAt: [...new Set(items.flatMap((item) => item.verifiedAt))],
				unavailable: [...new Set(items.flatMap((item) => item.unavailable))]
			};
		}
		function simulateCache(usage, share) {
			bucketsSchema.parse(usage);
			if (!Number.isFinite(share) || share < 0 || share > 1) throw new Error("Cache migration share must be between zero and one");
			const moved = Math.floor(usage.uncachedInputTokens * share);
			return bucketsSchema.parse({
				...usage,
				uncachedInputTokens: usage.uncachedInputTokens - moved,
				cacheReadTokens: usage.cacheReadTokens + moved
			});
		}
		function tariffClock(cards, card, now = Date.now()) {
			const candidates = cards.filter((value) => value.provider === card.provider && value.model === card.model && value.currency === card.currency);
			const signature = (time) => {
				const value = candidates.find((value) => applies(value, time));
				return value ? JSON.stringify({
					id: value.id,
					rates: ratesAt(value, zero(), time)
				}) : "unavailable";
			};
			const currentCard = candidates.find((value) => applies(value, now));
			const current = currentCard ? ratesAt(currentCard, zero(), now) : null;
			const initial = signature(now);
			let next = candidates.flatMap((value) => [Date.parse(value.effectiveFrom), ...value.effectiveTo ? [Date.parse(value.effectiveTo)] : []]).filter((time) => time > now).sort((a, b) => a - b).find((time) => signature(time) !== initial) ?? Infinity;
			if (candidates.some((value) => value.periods.length)) {
				for (let time = Math.floor(now / 6e4) * 6e4 + 6e4; time <= now + 8 * 864e5 && time < next; time += 6e4) if (signature(time) !== initial) {
					next = time;
					break;
				}
			}
			return {
				current,
				next: Number.isFinite(next) ? new Date(next).toISOString() : null,
				timezone: currentCard?.timezone ?? card.timezone
			};
		}
		/** Empty route templates: never claim a remotely changing tariff was verified by installing this plugin. */
		function publicTemplates() {
			const now = (/* @__PURE__ */ new Date()).toISOString();
			return ["deepseek-v4-flash", "deepseek-v4-pro"].map((model) => rateCardSchema.parse({
				id: `template-${model}`,
				label: `${model} — configure rates`,
				provider: "deepseek",
				model,
				currency: "USD",
				effectiveFrom: now,
				verifiedAt: now,
				source: "user-defined",
				sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
				rates: {
					uncachedInputTokens: null,
					outputTokens: null,
					cacheReadTokens: null,
					cacheWriteTokens: null
				},
				timezone: "UTC",
				periods: [],
				tiers: []
			}));
		}
		//#endregion
		//#region src/workbench/insights.ts
		/** Half-open UTC windows; comparison excludes the unfinished current day. */
		function windows(length, now = Date.now()) {
			const end = Date.parse(new Date(now).toISOString().slice(0, 10)), start = end - length * 864e5;
			return {
				previousStart: (/* @__PURE__ */ new Date(start - length * 864e5)).toISOString().slice(0, 10),
				start: new Date(start).toISOString().slice(0, 10),
				end: new Date(end).toISOString().slice(0, 10),
				timezone: "UTC",
				length
			};
		}
		function periodSum(days, start, end) {
			day.parse(start);
			day.parse(end);
			return days.filter((day) => day.date >= start && day.date < end).reduce((sum, row) => add(sum, row.usage), zero());
		}
		function changes(sessions, length, now = Date.now()) {
			const window = windows(length, now);
			let current = zero(), previous = zero(), excluded = zero();
			const contributors = [];
			const routes = /* @__PURE__ */ new Map();
			for (const session of sessions) {
				if (!session.dailyUsageReliable) {
					excluded = add(excluded, session.usage);
					continue;
				}
				const before = periodSum(session.days, window.previousStart, window.start), after = periodSum(session.days, window.start, window.end);
				current = add(current, after);
				previous = add(previous, before);
				contributors.push({
					id: session.id,
					current: total(after),
					previous: total(before),
					delta: total(after) - total(before)
				});
				if (!session.modelDailyUsageReliable) continue;
				for (const row of session.modelDays) {
					if (row.date < window.previousStart || row.date >= window.end) continue;
					const key = JSON.stringify([row.provider, row.model]), value = routes.get(key) ?? {
						provider: row.provider,
						model: row.model,
						current: 0,
						previous: 0
					};
					if (row.date < window.start) value.previous += total(row.usage);
					else value.current += total(row.usage);
					routes.set(key, value);
				}
			}
			const routeRows = [...routes.values()].map((row) => ({
				...row,
				delta: row.current - row.previous
			}));
			const residual = {
				provider: "",
				model: "",
				current: total(current) - routeRows.reduce((sum, row) => sum + row.current, 0),
				previous: total(previous) - routeRows.reduce((sum, row) => sum + row.previous, 0)
			};
			return {
				window,
				current,
				previous,
				delta: total(current) - total(previous),
				excludedUndated: excluded,
				complete: sessions.every((session) => session.dailyUsageReliable),
				routes: [...routeRows, {
					...residual,
					delta: residual.current - residual.previous
				}].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
				contributors: contributors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
				buckets: bucketKeys.map((key) => ({
					key,
					current: current[key],
					previous: previous[key],
					delta: current[key] - previous[key]
				}))
			};
		}
		/** Rolling budgets include today's confirmed data, unlike complete-day comparisons. */
		function projectTotals(sessions, config, now = Date.now()) {
			const today = new Date(now).toISOString().slice(0, 10), start = (/* @__PURE__ */ new Date(Date.parse(today) - 29 * 864e5)).toISOString().slice(0, 10), end = new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10);
			const assignments = new Map(config.assignments.map((item) => [item.sessionId, item.projectId]));
			const rows = new Map(config.projects.map((project) => [project.id, {
				id: project.id,
				name: project.name,
				tokenBudget: project.tokenBudget,
				total: zero(),
				rolling: zero(),
				complete: true,
				sessions: 0
			}]));
			rows.set("unassigned", {
				id: "unassigned",
				name: "",
				tokenBudget: 0,
				total: zero(),
				rolling: zero(),
				complete: true,
				sessions: 0
			});
			for (const session of sessions) {
				const row = rows.get(assignments.get(session.id) ?? "unassigned") ?? rows.get("unassigned");
				row.total = add(row.total, session.usage);
				row.sessions++;
				if (session.dailyUsageReliable) row.rolling = add(row.rolling, periodSum(session.days, start, end));
				else row.complete = false;
			}
			return [...rows.values()].map((row) => ({
				...row,
				status: !row.complete ? "unavailable" : !row.tokenBudget ? "disabled" : total(row.rolling) >= row.tokenBudget ? "exceeded" : total(row.rolling) >= row.tokenBudget * .8 ? "warning" : "within",
				start,
				end
			}));
		}
		function ledgerTotals(entries) {
			return {
				usage: entries.reduce((sum, entry) => entry.usage ? add(sum, entry.usage) : sum, zero()),
				unknown: entries.filter((entry) => entry.usage === null).length,
				provisional: entries.filter((entry) => entry.finality === "provisional").length,
				byKind: ["usage-analysis", "trajectory-analysis"].map((kind) => ({
					kind,
					count: entries.filter((entry) => entry.kind === kind).length,
					usage: entries.filter((entry) => entry.kind === kind).reduce((sum, entry) => entry.usage ? add(sum, entry.usage) : sum, zero())
				}))
			};
		}
		function stats(values) {
			const sorted = [...values].sort((a, b) => a - b), n = values.length, mean = n ? values.reduce((sum, value) => sum + value, 0) / n : null;
			return {
				n,
				mean,
				median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
				sd: n > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : null
			};
		}
		function experimentComparison(runs, experiment) {
			const selected = runs.filter((run) => run.experiment === experiment);
			const groups = ["baseline", "candidate"].map((variant) => {
				const rows = selected.filter((run) => run.variant === variant), passed = rows.filter((run) => run.accepted === true).length;
				return {
					variant,
					n: rows.length,
					judged: rows.filter((run) => run.accepted !== null).length,
					passed,
					acceptance: rows.length && rows.every((run) => run.accepted !== null) ? passed / rows.length : null,
					tokens: stats(rows.map((run) => total(run.usage))),
					retryTokenShare: stats(rows.filter((run) => run.retryUsage && total(run.usage) > 0).map((run) => total(run.retryUsage) / total(run.usage))),
					requestRetryShare: stats(rows.filter((run) => run.requests && run.requests > 0).map((run) => run.retries / run.requests)),
					durationMs: stats(rows.map((run) => run.durationMs)),
					retries: stats(rows.map((run) => run.retries)),
					costs: ["USD", "CNY"].map((currency) => {
						const costs = rows.map((run) => run.costs.find((cost) => cost.currency === currency));
						const complete = rows.length > 0 && rows.every((run) => run.complete) && costs.every((cost) => cost?.complete);
						const knownCost = costs.reduce((sum, cost) => sum + (cost?.amount ?? 0), 0);
						return {
							currency,
							complete,
							knownCost,
							perAccepted: complete && passed > 0 && rows.every((run) => run.accepted !== null) ? knownCost / passed : null
						};
					})
				};
			});
			const pairs = /* @__PURE__ */ new Map();
			for (const run of selected) {
				const key = JSON.stringify([
					run.pair,
					run.task,
					run.size,
					run.conditions
				]);
				pairs.set(key, [...pairs.get(key) ?? [], run]);
			}
			const paired = [...pairs.values()].filter((rows) => rows.filter((row) => row.variant === "baseline").length === 1 && rows.filter((row) => row.variant === "candidate").length === 1);
			const differences = paired.map((rows) => total(rows.find((row) => row.variant === "candidate").usage) - total(rows.find((row) => row.variant === "baseline").usage));
			const uniqueSnapshots = new Set(selected.map((run) => run.revision)).size === selected.length;
			selected.flatMap((run) => run.costs);
			const priceBases = ["USD", "CNY"].map((currency) => {
				const values = selected.map((run) => run.costs.find((cost) => cost.currency === currency));
				return {
					currency,
					comparable: selected.length > 0 && values.every((cost) => cost?.complete && cost.fingerprint) && new Set(values.map((cost) => cost?.fingerprint)).size === 1
				};
			});
			return {
				groups,
				uniqueSnapshots,
				samePriceBasis: priceBases.some((item) => item.comparable),
				priceBases,
				observations: selected,
				pairedCount: paired.length,
				tokenDifferences: stats(differences),
				comparable: selected.length > 0 && uniqueSnapshots && paired.length * 2 === selected.length && selected.every((run) => run.complete),
				qualityObserved: selected.length > 0 && selected.every((run) => run.accepted !== null),
				exploratory: true
			};
		}
		/** Only numerical allowlisted fields enter the optional same-origin summary. */
		function shareSummary(sessions, now = Date.now()) {
			const change = changes(sessions, 7, now), input = change.current.uncachedInputTokens + change.current.cacheReadTokens + change.current.cacheWriteTokens;
			return {
				schema: "dsh-token-usage/public-summary-v1",
				from: change.window.start,
				to: change.window.end,
				timezone: "UTC",
				complete: change.complete,
				sessions: change.contributors.filter((row) => row.current > 0).length,
				tokens: total(change.current),
				delta: change.delta,
				cacheReadShare: input ? change.current.cacheReadTokens / input : null
			};
		}
		function shareSvg(summary, chinese) {
			const esc = (text) => text.replace(/[&<>"']/g, (char) => ({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"\"": "&quot;",
				"'": "&apos;"
			})[char]);
			const text = chinese ? [
				"本地用量周报",
				"可观测会话",
				"已确认 Token",
				"较上个完整周期",
				"缓存读取占输入",
				"统计完整",
				"仅可比子集"
			] : [
				"Local usage weekly",
				"Observed sessions",
				"Confirmed Tokens",
				"Change vs previous window",
				"Cache reads / input",
				"Complete coverage",
				"Comparable subset only"
			];
			const rows = [
				[text[1], String(summary.sessions)],
				[text[2], summary.tokens.toLocaleString("en-US")],
				[text[3], `${summary.delta > 0 ? "+" : ""}${summary.delta.toLocaleString("en-US")}`],
				[text[4], summary.cacheReadShare === null ? "—" : `${(summary.cacheReadShare * 100).toFixed(1)}%`]
			];
			return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><rect width="960" height="600" fill="#f7f8fb"/><g font-family="system-ui,sans-serif" fill="#17263d"><text x="64" y="84" font-size="34">${esc(text[0])}</text><text x="64" y="124" font-size="18">${summary.from} — ${summary.to} UTC (${esc(summary.complete ? text[5] : text[6])})</text>${rows.map((row, index) => `<text x="64" y="${196 + index * 78}" font-size="20">${esc(row[0])}</text><text x="860" y="${196 + index * 78}" text-anchor="end" font-size="28">${esc(row[1])}</text>`).join("")}<text x="64" y="548" font-size="16">dsh-token-usage · local-first · not a bill</text></g></svg>`;
		}
		//#endregion
		//#region src/workbench/reporting.ts
		function rollingWindow(now = Date.now()) {
			const today = Date.parse(new Date(now).toISOString().slice(0, 10));
			return {
				start: (/* @__PURE__ */ new Date(today - 29 * 864e5)).toISOString().slice(0, 10),
				end: new Date(today + 864e5).toISOString().slice(0, 10)
			};
		}
		/** Revalue only observable, dated usage. No FX conversion and no request-tier inference from daily aggregates. */
		function rollingMoney(sessions, config, currency, now = Date.now()) {
			const { start, end } = rollingWindow(now), at = new Date(now).toISOString();
			const estimates = [];
			let undated = false;
			for (const session of sessions) {
				if (!session.dailyUsageReliable) {
					undated = true;
					continue;
				}
				const usage = periodSum(session.days, start, end);
				if (!total(usage)) continue;
				if (!session.modelDailyUsageReliable) {
					estimates.push(quote([], {
						provider: "",
						model: ""
					}, usage, {
						currency,
						mode: "revaluation",
						at
					}));
					continue;
				}
				for (const row of session.modelDays.filter((row) => row.date >= start && row.date < end)) estimates.push(quote(config.cards, row, row.usage, {
					currency,
					mode: "revaluation",
					at,
					timingKnown: true,
					requestInputKnown: false
				}));
			}
			let result = estimates.length ? sumQuotes(estimates, currency) : {
				currency,
				mode: "revaluation",
				amount: 0,
				lower: 0,
				upper: 0,
				coveredTokens: 0,
				totalTokens: 0,
				status: "complete",
				cards: [],
				verifiedAt: [],
				unavailable: []
			};
			if (undated) result = {
				...result,
				amount: null,
				upper: null,
				status: result.coveredTokens ? "partial" : "unavailable",
				unavailable: [...result.unavailable, "undated-session-usage"]
			};
			return result;
		}
		function moneyBudgetStatus(estimate, amount) {
			if (estimate.lower !== null && estimate.lower >= amount) return "exceeded";
			if (estimate.status !== "complete" || estimate.amount === null) return "unavailable";
			return estimate.amount >= amount * .8 ? "warning" : "within";
		}
		function selectSessions(sessions, config, project, tag = "") {
			const assignments = new Map(config.assignments.map((item) => [item.sessionId, item]));
			return sessions.filter((session) => {
				const assignment = assignments.get(session.id);
				return (!project || (assignment?.projectId ?? "unassigned") === project) && (!tag || assignment?.tags.includes(tag));
			});
		}
		function receiptDocument(snapshot, costs, anonymize = false) {
			return {
				schema: "dsh-token-usage/local-receipt-v1",
				generatedAt: snapshot.generatedAt,
				...anonymize ? {} : { sessionId: snapshot.sessionId },
				revision: snapshot.revision,
				totals: snapshot.totals,
				reconciliation: snapshot.reconciliation,
				findings: snapshot.findings.map((item) => anonymize ? {
					...item,
					nodes: item.nodes.map(({ seq, index }) => ({
						seq,
						index
					}))
				} : item),
				inspectedEvents: snapshot.eventCount,
				totalNodes: snapshot.nodeCount,
				page: {
					offset: snapshot.offset,
					nextOffset: snapshot.nextOffset,
					includedNodes: snapshot.nodes.length
				},
				nodes: snapshot.nodes.map((node, index) => anonymize ? {
					index: snapshot.offset + index,
					seq: node.seq,
					kind: node.kind,
					status: node.status,
					finality: node.finality,
					usage: node.usage
				} : node),
				costs: costs.filter((cost) => cost.revision === snapshot.revision).map((cost) => anonymize ? {
					currency: cost.estimate.currency,
					mode: cost.estimate.mode,
					amount: cost.estimate.amount,
					lower: cost.estimate.lower,
					upper: cost.estimate.upper,
					status: cost.estimate.status,
					coveredTokens: cost.estimate.coveredTokens,
					totalTokens: cost.estimate.totalTokens
				} : cost),
				notes: [
					"Reference estimate, not a provider invoice.",
					"Auxiliary AI analysis is recorded separately.",
					"Node export contains the currently displayed page; totals cover the complete inspected snapshot."
				]
			};
		}
		function receiptMarkdown(snapshot, costs) {
			const rows = bucketKeys.map((key) => `| ${key} | ${snapshot.totals.usage[key]} | ${snapshot.totals.ordinary[key]} | ${snapshot.totals.retry[key]} | ${snapshot.totals.compaction[key]} | ${snapshot.totals.delta[key]} |`);
			return `# Local Token receipt\n\nSnapshot: ${snapshot.generatedAt}\n\nReconciliation: ${snapshot.reconciliation}\n\n| Bucket | Total | Ordinary | Retry | Compaction | Delta |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${rows.join("\n")}\n\n${costs.filter((cost) => cost.revision === snapshot.revision).map((cost) => `${cost.estimate.currency}: ${cost.estimate.amount ?? "unavailable"} (${cost.estimate.status}; ${cost.estimate.mode})`).join("\n\n")}\n\nReference estimates, not a provider invoice. Auxiliary analysis is accounted separately.\n`;
		}
		/** CSV cells cannot initiate a spreadsheet formula, including leading whitespace. */
		function csvCell(value) {
			let text = String(value ?? "");
			if (/^[\s]*[=+\-@]/u.test(text)) text = `'${text}`;
			return `"${text.replaceAll("\"", "\"\"")}"`;
		}
		function changesCsv(sessions, length, now = Date.now()) {
			return [[
				"sessionId",
				"previous",
				"current",
				"delta"
			], ...changes(sessions, length, now).contributors.map((row) => [
				row.id,
				row.previous,
				row.current,
				row.delta
			])].map((row) => row.map(csvCell).join(",")).join("\r\n");
		}
		function sumSessionUsage(sessions) {
			const result = zero();
			for (const session of sessions) for (const key of bucketKeys) result[key] += session.usage[key];
			if (!Number.isSafeInteger(total(result))) throw new Error("Usage total exceeds safe integer precision");
			return result;
		}
		/** One complete date window across both ledgers; unknown coverage is never extrapolated. */
		function observableTotals(sessions, state, length, now = Date.now()) {
			const end = new Date(Date.parse(new Date(now).toISOString().slice(0, 10)) + 864e5).toISOString().slice(0, 10);
			const start = (/* @__PURE__ */ new Date(Date.parse(end) - length * 864e5)).toISOString().slice(0, 10);
			const sessionUsage = sessions.filter((session) => session.dailyUsageReliable).reduce((sum, session) => add(sum, periodSum(session.days, start, end)), zero());
			const entries = state.ledger.filter((entry) => entry.startedAt.slice(0, 10) >= start && entry.startedAt.slice(0, 10) < end);
			const auxiliaryUsage = entries.reduce((sum, entry) => entry.usage ? add(sum, entry.usage) : sum, zero());
			const combined = add(sessionUsage, auxiliaryUsage);
			const reasons = [];
			if (sessions.some((session) => !session.dailyUsageReliable)) reasons.push("undated-sessions");
			if (entries.some((entry) => entry.usage === null)) reasons.push("unreported-analysis-usage");
			if (entries.some((entry) => entry.finality !== "authoritative")) reasons.push("provisional-analysis-usage");
			if (!state.ledgerStartedAt || state.ledgerStartedAt.slice(0, 10) > start) reasons.push("analysis-tracking-started-after-window");
			if (state.evictedEntries || state.ledgerClearedAt) reasons.push("analysis-history-evicted-or-cleared");
			return {
				start,
				end,
				timezone: "UTC",
				sessionUsage,
				auxiliaryUsage,
				combined,
				reasons,
				complete: reasons.length === 0,
				unknownSessions: sessions.filter((session) => !session.dailyUsageReliable).length,
				unknownAnalysis: entries.filter((entry) => entry.usage === null).length,
				analysisShare: total(combined) ? total(auxiliaryUsage) / total(combined) : null,
				ledgerStartedAt: state.ledgerStartedAt,
				ledgerClearedAt: state.ledgerClearedAt,
				evictedEntries: state.evictedEntries
			};
		}
		/** Budget findings share the same explicit date basis as the displayed snapshot. */
		function budgetFindings(sessions, config, sessionId, at) {
			const findings = [];
			const assignment = config.assignments.find((item) => item.sessionId === sessionId);
			const project = config.projects.find((item) => item.id === assignment?.projectId);
			const now = Date.parse(at);
			if (project) {
				const row = projectTotals(sessions, config, now).find((item) => item.id === project.id);
				if (row.tokenBudget) {
					if (!row.complete) findings.push(finding("budget-coverage", "warning", 0, ["project dates incomplete"], "partial", "project"));
					else if (row.status !== "within") findings.push(finding("budget-pressure", row.status === "exceeded" ? "error" : "warning", total(row.rolling), [`rollingUTC: ${row.start} .. ${row.end}`, `budgetTokens: ${row.tokenBudget}`], "complete", "project", row.tokenBudget));
				}
			}
			for (const scope of ["global", "project"]) {
				const budgets = scope === "global" ? config.moneyBudgets : project?.moneyBudgets ?? [];
				const scoped = scope === "global" ? sessions : sessions.filter((session) => config.assignments.some((item) => item.sessionId === session.id && item.projectId === project?.id));
				for (const budget of budgets) {
					const estimate = rollingMoney(scoped, config, budget.currency, now), status = moneyBudgetStatus(estimate, budget.amount);
					if (status !== "within") findings.push(finding(status === "unavailable" ? "budget-coverage" : "budget-pressure", status === "exceeded" ? "error" : "warning", estimate.amount ?? estimate.lower ?? 0, [
						`currency: ${budget.currency}`,
						`knownLower: ${estimate.lower ?? "unknown"}`,
						`budget: ${budget.amount}`,
						"basis: current-rate revaluation"
					], estimate.status === "complete" ? "complete" : "partial", scope, budget.amount));
				}
			}
			return findings;
		}
		//#endregion
		//#region src/workbench/weekly.ts
		/** Only distinct, complete pairs with explicit acceptance in BOTH groups enter improvement totals. */
		function improvementSummary(runs, start, end) {
			const byPair = /* @__PURE__ */ new Map();
			for (const run of runs) {
				const key = JSON.stringify([
					run.experiment,
					run.pair,
					run.task,
					run.size,
					run.conditions
				]);
				byPair.set(key, [...byPair.get(key) ?? [], run]);
			}
			let pairs = 0, excluded = 0, baselineTokens = 0, candidateTokens = 0, retriesBefore = 0, retriesAfter = 0, durationBefore = 0, durationAfter = 0;
			const used = /* @__PURE__ */ new Set();
			for (const values of byPair.values()) {
				const baseline = values.filter((run) => run.variant === "baseline"), candidates = values.filter((run) => run.variant === "candidate" && run.generatedAt.slice(0, 10) >= start && run.generatedAt.slice(0, 10) < end);
				if (!candidates.length) continue;
				if (baseline.length !== 1 || candidates.length !== 1) {
					excluded++;
					continue;
				}
				const a = baseline[0], b = candidates[0];
				if (!a.complete || !b.complete || a.accepted !== true || b.accepted !== true || a.revision === b.revision || used.has(a.revision) || used.has(b.revision)) {
					excluded++;
					continue;
				}
				used.add(a.revision);
				used.add(b.revision);
				pairs++;
				baselineTokens += total(a.usage);
				candidateTokens += total(b.usage);
				retriesBefore += a.retries;
				retriesAfter += b.retries;
				durationBefore += a.durationMs;
				durationAfter += b.durationMs;
			}
			return {
				pairs,
				excluded,
				baselineTokens,
				candidateTokens,
				tokenReduction: baselineTokens - candidateTokens,
				tokenReductionShare: baselineTokens ? (baselineTokens - candidateTokens) / baselineTokens : null,
				retriesBefore,
				retriesAfter,
				retryReduction: retriesBefore - retriesAfter,
				durationBefore,
				durationAfter,
				qualityConstraint: "both-human-accepted",
				windowBasis: "candidate-started-in-window",
				exploratory: true
			};
		}
		function numericOutput(value, now = Date.now()) {
			return {
				status: value?.status ?? "unavailable",
				tokensPerSecond: value?.status === "ready" && Number.isFinite(value.allTokensPerSecond) && value.allTokensPerSecond >= 0 ? value.allTokensPerSecond : null,
				observedAt: new Date(now).toISOString(),
				windowMs: 1e4,
				cadenceMs: 5e3
			};
		}
		function budgetSummary(sessions, config, now) {
			const projects = projectTotals(sessions, config, now);
			const counts = {
				within: 0,
				warning: 0,
				exceeded: 0,
				unavailable: 0,
				disabled: 0
			};
			for (const row of projects.filter((row) => row.id !== "unassigned")) counts[row.status]++;
			return {
				projectTokenStatusCounts: counts,
				money: ["USD", "CNY"].map((currency) => {
					const budget = config.moneyBudgets.find((item) => item.currency === currency);
					return {
						currency,
						status: budget ? moneyBudgetStatus(rollingMoney(sessions, config, currency, now), budget.amount) : "disabled"
					};
				})
			};
		}
		/** Version 2 is published on a separate event; v1 consumers keep their original contract. */
		function richSummary(sessions, state, output = numericOutput(null), now = Date.now()) {
			const activity = shareSummary(sessions, now);
			return {
				...activity,
				schema: "dsh-token-usage/public-summary-v2",
				improvements: improvementSummary(state.config.experiments, activity.from, activity.to),
				budgets: budgetSummary(sessions, state.config, now),
				confirmedOutput: output
			};
		}
		function improvementSvg(summary, chinese) {
			const i = summary.improvements;
			const words = chinese ? [
				"可验证的优化周报",
				"双方人工验收通过的不同快照配对",
				"Token 减少量（可为负）",
				"重试次数减少量（可为负）",
				"探索性比较；不是因果证明或模型排名",
				"不满足条件的配对不纳入"
			] : [
				"Measured optimization weekly",
				"Distinct snapshot pairs accepted in both groups",
				"Token reduction (may be negative)",
				"Retry reduction (may be negative)",
				"Exploratory; not causal proof or model ranking",
				"Ineligible pairs are excluded"
			];
			const rows = [
				[words[1], i.pairs],
				[words[2], i.tokenReduction],
				[words[3], i.retryReduction],
				[words[5], i.excluded]
			];
			return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600"><rect width="960" height="600" fill="#f7f8fb"/><g font-family="system-ui,sans-serif" fill="#17263d"><text x="60" y="78" font-size="32">${words[0]}</text><text x="60" y="116" font-size="18">${summary.from} — ${summary.to} UTC</text>${rows.map(([label, value], index) => `<text x="60" y="${198 + index * 74}" font-size="18">${label}</text><text x="875" y="${198 + index * 74}" text-anchor="end" font-size="30">${i.pairs || index === 3 ? Number(value).toLocaleString("en-US") : "—"}</text>`).join("")}<text x="60" y="550" font-size="16">${words[4]}</text></g></svg>`;
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
		//#region src/workbench/port.ts
		const money = number$1().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
		const receiptSchema = object({
			estimate: object({
				currency: _enum(["USD", "CNY"]),
				mode: _enum([
					"historical-reference",
					"revaluation",
					"scenario"
				]),
				amount: money,
				lower: money,
				upper: money,
				coveredTokens: integer,
				totalTokens: integer,
				status: _enum([
					"complete",
					"partial",
					"unavailable",
					"range"
				]),
				cards: array(string().max(96)).max(128),
				verifiedAt: array(string().max(64)).max(128),
				unavailable: array(string().max(256)).max(128)
			}).strict().refine((value) => value.amount === null || value.status === "complete"),
			revision: identifier,
			priceRevision: integer,
			priceDigest: string().max(128).optional(),
			largestPricedNode: object({
				id: identifier,
				amount: number$1().finite().nonnegative()
			}).strict().nullable()
		}).strict();
		function makeWorkbenchPort(call) {
			const request = async (endpoint, payload, schema, signal) => {
				signal.throwIfAborted();
				const value = await call(endpoint, payload, signal);
				signal.throwIfAborted();
				return boundedParse(schema, value);
			};
			return {
				read: (signal) => request("workbench/read", {}, stateSchema, signal),
				save: (revision, config, signal) => request("workbench/config", boundedParse(configRequestSchema, {
					revision,
					config
				}), stateSchema, signal),
				snapshot: async (sessionId, signal, offset = 0, revision) => {
					const result = await request("workbench/snapshot", snapshotRequestSchema.parse({
						sessionId,
						offset,
						...revision ? { revision } : {}
					}), snapshotSchema, signal);
					if (result.sessionId !== sessionId || result.offset !== offset || revision && result.revision !== revision) throw new Error("Snapshot identity changed; refresh the inspection");
					return result;
				},
				receipt: async (sessionId, revision, currency, mode, at, signal) => {
					const result = await request("workbench/receipt-cost", {
						sessionId,
						revision,
						currency,
						mode,
						at
					}, receiptSchema, signal);
					if (result.revision !== revision) throw new Error("Receipt revision does not match the snapshot");
					return result;
				},
				rollback: (revision, targetPriceRevision, signal) => request("workbench/price-rollback", {
					revision,
					targetPriceRevision,
					confirm: "restore-price-revision"
				}, stateSchema, signal),
				clear: (signal) => request("workbench/ledger-clear", { confirm: "clear-analysis-ledger" }, stateSchema, signal)
			};
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
		//#region src/workbench/cost-attribution.ts
		/** Ordered counterfactual decomposition, not a reconstruction of a provider invoice.
		* Route volume at old input mix -> current input mix -> new reference rates. */
		function costAttribution(sessions, config, length, currency, now = Date.now()) {
			const activity = changes(sessions, length, now);
			const beforeAt = (/* @__PURE__ */ new Date(Date.parse(activity.window.start) - 1)).toISOString(), afterAt = (/* @__PURE__ */ new Date(Date.parse(activity.window.end) - 1)).toISOString();
			const rows = [];
			let complete = activity.complete, missingRoutes = 0;
			for (const row of activity.routes) {
				if (!row.current && !row.previous) continue;
				const side = (start, end) => sessions.filter((session) => session.dailyUsageReliable && session.modelDailyUsageReliable).flatMap((session) => session.modelDays).filter((item) => item.provider === row.provider && item.model === row.model && item.date >= start && item.date < end).reduce((sum, item) => add(sum, item.usage), zero());
				const before = side(activity.window.previousStart, activity.window.start), after = side(activity.window.start, activity.window.end);
				const q1 = quote(config.cards, row, before, {
					currency,
					mode: "revaluation",
					at: beforeAt,
					timingKnown: true,
					requestInputKnown: false
				});
				const q2 = quote(config.cards, row, after, {
					currency,
					mode: "revaluation",
					at: afterAt,
					timingKnown: true,
					requestInputKnown: false
				});
				if (q1.status !== "complete" || q2.status !== "complete" || !row.model) {
					complete = false;
					missingRoutes++;
					continue;
				}
				const rates = ratesAt(config.cards.find((card) => card.id === q1.cards[0]), before, Date.parse(beforeAt));
				const inputKeys = bucketKeys.filter((key) => key !== "outputTokens");
				const inputBefore = inputKeys.reduce((sum, key) => sum + before[key], 0), inputAfter = inputKeys.reduce((sum, key) => sum + after[key], 0);
				const mixed = Object.fromEntries(bucketKeys.map((key) => [key, key === "outputTokens" ? after[key] : inputBefore ? inputAfter * before[key] / inputBefore : after[key]]));
				if (bucketKeys.some((key) => (after[key] || mixed[key]) && rates[key] === null)) {
					complete = false;
					missingRoutes++;
					continue;
				}
				const cost = (b) => bucketKeys.reduce((sum, key) => sum + b[key] * (rates[key] ?? 0) / 1e6, 0);
				const scaled = cost(mixed), samePrice = cost(after);
				rows.push({
					provider: row.provider,
					model: row.model,
					before: q1.amount,
					after: q2.amount,
					volume: scaled - q1.amount,
					cacheMix: samePrice - scaled,
					rate: q2.amount - samePrice
				});
			}
			const sums = rows.reduce((sum, row) => ({
				before: sum.before + row.before,
				after: sum.after + row.after,
				volume: sum.volume + row.volume,
				cacheMix: sum.cacheMix + row.cacheMix,
				rate: sum.rate + row.rate
			}), {
				before: 0,
				after: 0,
				volume: 0,
				cacheMix: 0,
				rate: 0
			});
			return {
				schema: "dsh-token-usage/cost-attribution-v1",
				currency,
				beforeAt,
				afterAt,
				window: activity.window,
				complete,
				missingRoutes,
				rows,
				knownSubset: sums,
				totalDelta: complete ? sums.after - sums.before : null,
				order: [
					"route-volume",
					"input-cache-mix",
					"reference-rates"
				],
				notAnInvoice: true
			};
		}
		//#endregion
		//#region src/workbench/scenarios.ts
		/** Bounds across every tariff/version touched by a hypothetical request (maximum seven days).
		* Unknown billing semantics use per-bucket extremes, not invented uniform Token emission. */
		function intervalScenario(cards, route, usage, currency, start, end, hypothesis = "unknown") {
			bucketsSchema.parse(usage);
			stamp.parse(start);
			stamp.parse(end);
			const from = Date.parse(start), to = Date.parse(end);
			if (to < from || to - from > 7 * 864e5) throw new Error("Scenario interval must be between zero and seven days");
			if (hypothesis !== "unknown" && hypothesis !== "start" && hypothesis !== "end") throw new Error("Unknown billing hypothesis");
			if (hypothesis !== "unknown") return {
				start,
				end,
				hypothesis,
				segments: [],
				segmentCount: 0,
				estimate: quote(cards, route, usage, {
					currency,
					mode: "scenario",
					at: hypothesis === "start" ? start : end,
					timingKnown: true,
					requestInputKnown: false
				})
			};
			const matching = cards.filter((card) => card.provider === route.provider && card.model === route.model && card.currency === currency);
			const instants = new Set([from, to]);
			for (const card of matching) for (const time of [Date.parse(card.effectiveFrom), ...card.effectiveTo ? [Date.parse(card.effectiveTo)] : []]) if (time >= from && time <= to) {
				instants.add(time);
				if (time > from) instants.add(time - 1);
			}
			if (matching.some((card) => card.periods.length)) for (let time = Math.floor(from / 6e4) * 6e4 + 6e4; time <= to; time += 6e4) instants.add(time);
			const samples = [];
			const segments = [];
			const used = /* @__PURE__ */ new Map();
			let previous = "", contextMissing = false;
			const missingRates = {
				uncachedInputTokens: null,
				outputTokens: null,
				cacheReadTokens: null,
				cacheWriteTokens: null
			};
			for (const time of [...instants].sort((a, b) => a - b)) {
				const active = matching.filter((card) => time >= Date.parse(card.effectiveFrom) && (!card.effectiveTo || time < Date.parse(card.effectiveTo)));
				const card = active.length === 1 ? active[0] : void 0;
				if (card) used.set(card.id, card);
				if (card?.tiers.length) contextMissing = true;
				const rates = card && !card.tiers.length ? ratesAt(card, usage, time) : missingRates;
				const signature = JSON.stringify([card?.id, rates]);
				if (signature !== previous) {
					samples.push(rates);
					segments.push({
						at: new Date(time).toISOString(),
						cardId: card?.id ?? null
					});
					previous = signature;
				}
			}
			let covered = 0, lower = 0, upper = 0, unavailable = false;
			for (const key of bucketKeys) {
				if (!usage[key]) continue;
				const values = samples.map((rate) => rate[key]);
				if (values.some((value) => value === null)) {
					unavailable = true;
					continue;
				}
				covered += usage[key];
				lower += usage[key] * Math.min(...values) / 1e6;
				upper += usage[key] * Math.max(...values) / 1e6;
			}
			if (![lower, upper].every((value) => Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER)) throw new Error("Scenario amount overflow");
			const status = unavailable ? covered ? "partial" : "unavailable" : lower === upper ? "complete" : "range";
			return {
				start,
				end,
				hypothesis,
				segments: segments.slice(0, 256),
				segmentCount: segments.length,
				estimate: {
					currency,
					mode: "scenario",
					amount: status === "complete" ? lower : null,
					lower: covered || total(usage) === 0 ? lower : null,
					upper: unavailable ? null : upper,
					coveredTokens: covered,
					totalTokens: total(usage),
					status,
					cards: [...used.keys()],
					verifiedAt: [...new Set([...used.values()].map((card) => card.verifiedAt))],
					unavailable: [
						...unavailable ? ["interval-price-coverage-incomplete"] : [],
						...contextMissing ? ["request-context-size-unavailable"] : [],
						"billing-instant-hypothetical"
					]
				}
			};
		}
		//#endregion
		//#region src/client/workbench/parts.tsx
		const number = (value) => value === null || value === void 0 ? "—" : new Intl.NumberFormat(void 0, { maximumFractionDigits: 5 }).format(value);
		function download(filename, content, type) {
			const url = URL.createObjectURL(new Blob([content], { type }));
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1e3);
		}
		function Field({ label, children }) {
			const id = (0, react.useId)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "wbField",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					id,
					children: label
				}), react.Children.map(children, (child) => (0, react.isValidElement)(child) && typeof child.type === "string" && [
					"input",
					"select",
					"textarea"
				].includes(child.type) ? (0, react.cloneElement)(child, { "aria-labelledby": id }) : child)]
			});
		}
		function JsonDetails({ label, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: JSON.stringify(value, null, 2) })] });
		}
		//#endregion
		//#region src/client/workbench/completion.tsx
		function NodeExplorer({ snapshot, t }) {
			const [view, setView] = (0, react.useState)("nodes");
			const [selected, setSelected] = (0, react.useState)("");
			const node = snapshot.nodes.find((node) => node.id === selected);
			const rows = view === "nodes" ? snapshot.nodes.map((node) => ({
				id: node.id,
				label: `#${node.seq} · ${node.kind} · ${node.provider}/${node.model}`,
				value: total(node.usage),
				finality: node.finality
			})) : view === "buckets" ? bucketKeys.map((key) => ({
				id: key,
				label: key,
				value: snapshot.totals.usage[key],
				finality: ""
			})) : view === "kinds" ? [
				"ordinary",
				"retry",
				"compaction"
			].map((key) => ({
				id: key,
				label: key,
				value: total(snapshot.totals[key]),
				finality: ""
			})) : snapshot.routes.map((route) => ({
				id: JSON.stringify([route.provider, route.model]),
				label: `${route.provider}/${route.model}`,
				value: total(route.usage),
				finality: ""
			}));
			const maximum = Math.max(1, ...rows.map((row) => row.value));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wbExplorer",
				"aria-label": t("Token 节点图", "Token node explorer"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wbActions",
						children: [
							[
								"nodes",
								"节点",
								"Nodes"
							],
							[
								"buckets",
								"四类 Token",
								"Buckets"
							],
							[
								"kinds",
								"调用类别",
								"Call kinds"
							],
							[
								"routes",
								"模型路由",
								"Routes"
							]
						].map(([id, zh, en]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"aria-pressed": view === id,
							onClick: () => {
								setView(id);
								setSelected("");
							},
							children: t(zh, en)
						}, id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("条宽按当前视图最大值归一化。节点视图仅当前页，其余视图覆盖完整快照；不同分类不会混合相加。", "Bar widths are normalized to this view’s largest value. Nodes show the current page; other views cover the full snapshot. Classification dimensions are not added together.") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wbTable",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("项目（点击节点查看证据）", "Item (select a node for evidence)") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "Token" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("相对消耗", "Relative usage") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("最终性", "Finality") })
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: view === "nodes" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => setSelected(row.id),
								"aria-pressed": node?.id === row.id,
								children: row.label
							}) : row.label }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.value) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
								"aria-label": row.label + " Token",
								max: maximum,
								value: row.value
							}) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.finality })
						] }, row.id)) })] })
					}),
					snapshot.reconciliation !== "matched" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						role: "status",
						children: [
							t("对账存在差异；下面是有符号残差，不能视为普通请求或零费用。", "Reconciliation differs. The signed residual is not an ordinary request or a zero cost."),
							": ",
							number(total(snapshot.totals.usage) - total(snapshot.totals.attributed))
						]
					}),
					node && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						"aria-label": t("节点证据", "Node evidence"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", { children: [
								"#",
								node.seq,
								" · ",
								node.id
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								node.status,
								" · ",
								node.finality,
								" · ",
								node.time ?? t("时间未知", "Unknown time")
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", { children: bucketKeys.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: key }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: number(node.usage[key]) })] }, key)) })
						]
					}),
					!rows.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("此视图没有已观测节点。", "No observed nodes in this view.") })
				]
			});
		}
		function ObservablePanel({ sessions, state, t }) {
			const [days, setDays] = (0, react.useState)(30);
			const summary = observableTotals(sessions, state, days);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("合计可观测用量", "Combined observable usage") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
					label: t("合计窗口（包含今天）", "Combined window (including today)"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						value: days,
						onChange: (event) => setDays(Number(event.target.value)),
						children: [
							7,
							30,
							90
						].map((n) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: n }, n))
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
					summary.start,
					" → ",
					summary.end,
					" UTC · ",
					t("右端不含；全部会话，不受浏览筛选影响。辅助调用按开始时间归属，跨日调用不会伪造分日 Token。", "Exclusive end; all sessions, independent of browsing filters. Auxiliary calls are attributed by start time, without inventing intra-call daily splits.")
				] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wbMetricGrid",
					children: [
						[t("会话已观测 Token", "Observed session Tokens"), total(summary.sessionUsage)],
						[t("分析自身已观测 Token", "Observed analysis Tokens"), total(summary.auxiliaryUsage)],
						[t("合计已观测 Token", "Combined observed Tokens"), total(summary.combined)]
					].map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(Number(value)) })] }, String(label)))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
					t("分析占已观测合计", "Analysis / observed total"),
					": ",
					summary.analysisShare === null ? "—" : number(summary.analysisShare * 100) + "%",
					" · ",
					t("日期未知会话 / 未上报分析", "Undated sessions / unreported analyses"),
					": ",
					summary.unknownSessions,
					" / ",
					summary.unknownAnalysis
				] }),
				!summary.complete && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					role: "status",
					children: [t("仅为可观测子集，不是完整消费或提供方账单。缺口：", "Observed subset only, not complete consumption or a provider invoice. Gaps: "), summary.reasons.join(" · ")]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
					t("辅助记账最早记录 / 上次清空 / 淘汰条数", "Earliest tracked analysis / last clear / evictions"),
					": ",
					summary.ledgerStartedAt ?? "—",
					" / ",
					summary.ledgerClearedAt ?? "—",
					" / ",
					summary.evictedEntries
				] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					onClick: () => download("observable-usage.json", JSON.stringify({
						schema: "dsh-token-usage/observable-v1",
						...summary
					}, null, 2), "application/json"),
					children: t("导出合计口径", "Export observable totals")
				})
			] });
		}
		function PriceHistory({ state, restore, busy, t }) {
			const [revision, setRevision] = (0, react.useState)(""), [confirmed, setConfirmed] = (0, react.useState)(false);
			const target = state.priceHistory.find((item) => item.revision === Number(revision));
			const changes = target ? [...new Set([...state.config.cards.map((card) => card.id), ...target.cards.map((card) => card.id)])].flatMap((id) => {
				const before = state.config.cards.find((card) => card.id === id), after = target.cards.find((card) => card.id === id);
				return JSON.stringify(before) === JSON.stringify(after) ? [] : [{
					id,
					operation: !before ? "restore" : !after ? "remove" : "replace",
					before: before ?? null,
					after: after ?? null
				}];
			}) : [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("价卡修订记录与回滚", "Price revisions and restore") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("每次费率变化追加新修订。回滚也生成新版本，不改写旧记录和实验费用。保留最近 16 份；淘汰数量明确显示，导出后可长期留存。", "Each price change appends a revision. Restoring creates a new version without changing old records or experiment costs. The latest 16 books are retained; evictions are disclosed and history can be exported.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
					t("当前价卡修订 / 淘汰修订", "Current price revision / evictions"),
					": ",
					state.priceRevision,
					" / ",
					state.evictedPriceRevisions
				] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wbTable",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("修订", "Revision") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("记录时间", "Recorded at") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("原因", "Reason") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("价卡数量", "Cards") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("指纹", "Digest") })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: [...state.priceHistory].reverse().map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: item.revision }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: item.at }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: item.reason }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: item.cards.length }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: item.digest.slice(0, 16) }) })
					] }, item.revision)) })] })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
					label: t("要恢复的修订", "Revision to restore"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						value: revision,
						onChange: (event) => {
							setRevision(event.target.value);
							setConfirmed(false);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: "—"
						}), state.priceHistory.filter((item) => item.revision !== state.priceRevision).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
							value: item.revision,
							children: [
								item.revision,
								" · ",
								item.at
							]
						}, item.revision))]
					})
				}),
				revision !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
					label: t("恢复前差异预览", "Restore diff preview"),
					value: changes
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
					label: t("我已检查将被恢复或移除的价卡", "I reviewed cards to restore or remove"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: confirmed,
						onChange: (event) => setConfirmed(event.target.checked)
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "wbActions",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						disabled: busy || !confirmed || revision === "" || !target,
						onClick: () => void restore(Number(revision)).then(() => {
							setConfirmed(false);
							setRevision("");
						}).catch(() => {}),
						children: t("恢复并创建新修订", "Restore as new revision")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						onClick: () => download("price-revision-history.json", JSON.stringify({
							schema: "dsh-token-usage/price-history-v1",
							priceRevision: state.priceRevision,
							evicted: state.evictedPriceRevisions,
							revisions: state.priceHistory
						}, null, 2), "application/json"),
						children: t("导出价卡修订历史", "Export price revision history")
					})]
				})
			] });
		}
		function ExperimentDetails({ comparison, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": t("实验完整指标", "Full experiment metrics"),
				children: [
					!comparison.uniqueSnapshots && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("存在重复快照，不能把同一次运行当作独立基线和候选。", "Duplicate snapshots are present. The same run is not an independent baseline and candidate.")
					}),
					!comparison.samePriceBasis && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("价格依据缺失或不一致：费用可以逐项查看，但不据此宣称金额改善。", "Pricing evidence is missing or differs. Recorded costs remain inspectable, but no monetary improvement is asserted.") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wbTable",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("分组", "Variant") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("平均重试 Token 占比", "Mean retry Token share") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("平均重试次数占请求", "Mean retries / requests") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("平均活跃秒数", "Mean active seconds") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("重试占比有效样本", "Retry-share samples") })
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: comparison.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.variant }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.retryTokenShare.mean === null ? "—" : number(group.retryTokenShare.mean * 100) + "%" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.requestRetryShare.mean === null ? "—" : number(group.requestRetryShare.mean * 100) + "%" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.durationMs.mean === null ? "—" : number(group.durationMs.mean / 1e3) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
								group.retryTokenShare.n,
								" / ",
								group.n
							] })
						] }, group.variant)) })] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wbTable",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("配对 / 配置", "Pair / configuration") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("任务 / 输入规模", "Task / input size") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("运行条件", "Conditions") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("Token / 重试", "Tokens / retries") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("活跃秒数 / 人工验收", "Active seconds / acceptance") })
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: comparison.observations.map((run) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
								run.pair,
								" · ",
								run.variant,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: run.configLabel })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
								run.task,
								" / ",
								run.size
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: run.conditions }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
								number(total(run.usage)),
								" / ",
								run.retries
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
								number(run.durationMs / 1e3),
								" / ",
								run.accepted === null ? t("未验收", "Not evaluated") : run.accepted ? t("通过", "Passed") : t("失败", "Failed")
							] })
						] }, run.id)) })] })
					})
				]
			});
		}
		function LongScenario({ config, usage, t }) {
			const [id, setId] = (0, react.useState)(""), [share, setShare] = (0, react.useState)(0), [start, setStart] = (0, react.useState)((/* @__PURE__ */ new Date()).toISOString()), [baseline, setBaseline] = (0, react.useState)((/* @__PURE__ */ new Date()).toISOString()), [minutes, setMinutes] = (0, react.useState)(60), [hypothesis, setHypothesis] = (0, react.useState)("unknown"), [now, setNow] = (0, react.useState)(Date.now());
			const card = config.cards.find((card) => card.id === id) ?? config.cards[0];
			const result = (0, react.useMemo)(() => {
				if (!card) return null;
				try {
					const finish = (value) => new Date(Date.parse(value) + minutes * 6e4).toISOString();
					return {
						baseline: intervalScenario(config.cards, card, usage, card.currency, baseline, finish(baseline), hypothesis),
						candidate: intervalScenario(config.cards, card, simulateCache(usage, share), card.currency, start, finish(start), hypothesis)
					};
				} catch {
					return null;
				}
			}, [
				config.cards,
				card,
				usage,
				share,
				start,
				baseline,
				minutes,
				hypothesis
			]);
			const clock = (0, react.useMemo)(() => card ? tariffClock(config.cards, card, now) : null, [
				config.cards,
				card,
				now
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("跨时段情景对比与错峰时钟", "Interval scenarios and tariff clock") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("相同用量按不同运行时段和缓存假设比较，最长七天。默认不假设计费时点和 Token 发出速度：逐桶取覆盖区间的费率上下界。", "Compare the same usage across execution intervals and cache hypotheses, up to seven days. The default makes no billing-instant or Token-emission assumption: bounds span all touched per-bucket rates.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "wbGrid",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("试算价卡", "Scenario card"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: card?.id ?? "",
								onChange: (event) => setId(event.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: "—"
								}), config.cards.map((card) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
									value: card.id,
									children: [
										card.label,
										" · ",
										card.currency
									]
								}, card.id))]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("基线开始时刻", "Baseline start time"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								value: baseline,
								onChange: (event) => setBaseline(event.target.value)
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("候选开始时刻（ISO 8601）", "Candidate start time (ISO 8601)"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								value: start,
								onChange: (event) => setStart(event.target.value)
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("任务持续分钟", "Duration in minutes"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: "0",
								max: "10080",
								value: minutes,
								onChange: (event) => setMinutes(Number(event.target.value))
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("计费时点假设", "Billing instant hypothesis"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: hypothesis,
								onChange: (event) => setHypothesis(event.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "unknown",
										children: t("未知：保守区间", "Unknown: conservative range")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "start",
										children: t("假设按开始时刻", "Assume request start")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "end",
										children: t("假设按结束时刻", "Assume request end")
									})
								]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Field, {
							label: t("迁移为缓存读取的未缓存输入比例", "Uncached input hypothetically moved to cache reads"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "range",
								min: "0",
								max: "1",
								step: "0.05",
								value: share,
								onChange: (event) => setShare(Number(event.target.value))
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [Math.round(share * 100), "%"] })]
						})
					]
				}),
				result ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wbGrid",
						children: ["baseline", "candidate"].map((key) => {
							const value = result[key];
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbQuote",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: key === "baseline" ? t("基线", "Baseline") : t("候选试算", "Candidate scenario") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
										value.estimate.currency,
										" ",
										number(value.estimate.amount)
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: value.estimate.status }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										t("下界 / 上界", "Lower / upper"),
										": ",
										number(value.estimate.lower),
										" / ",
										number(value.estimate.upper)
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										value.start,
										" → ",
										value.end
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: value.estimate.unavailable.join(" · ") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
										label: t("实际覆盖的费率版本与时点", "Touched price versions and instants"),
										value: {
											segments: value.segments,
											count: value.segmentCount
										}
									})
								]
							}, key);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("原始 / 假设 Token（必须守恒）", "Original / hypothetical Tokens (conserved)"),
						": ",
						number(total(usage)),
						" / ",
						number(total(simulateCache(usage, share)))
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						onClick: () => download("interval-scenarios.json", JSON.stringify({
							schema: "dsh-token-usage/scenarios-v1",
							assumptions: {
								cacheMigrationShare: share,
								billingInstant: hypothesis,
								durationMinutes: minutes
							},
							...result
						}, null, 2), "application/json"),
						children: t("导出情景对比", "Export scenario comparison")
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("请选择有效价卡、ISO 时间和七天以内的持续时间。", "Choose a valid card, ISO timestamps and duration no greater than seven days.") }),
				clock && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("提供方时区 / 下次切换", "Provider timezone / next transition"),
						": ",
						clock.timezone,
						" / ",
						clock.next ?? "—"
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("本地时间", "Local time"),
						": ",
						clock.next ? new Date(clock.next).toLocaleString() : "—"
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
						label: t("当前四类参考费率", "Current reference rates"),
						value: clock.current
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						onClick: () => setNow(Date.now()),
						children: t("刷新时钟", "Refresh clock")
					})
				] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("缓存命中、模型输出和任务质量不会因试算而得到保证。不会调用模型、修改真实账本或移动任务；缺少费率与上下文证据时保持不可用。", "Cache hits, model output and task quality are not guaranteed. No model calls, ledger changes or task rescheduling occur; missing rates and context evidence remain unavailable.") })
			] });
		}
		function OptimizationWeekly({ sessions, state, t, chinese }) {
			const summary = richSummary(sessions, state, numericOutput(null)), i = summary.improvements;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("全局配对实验的优化成果", "Global paired-experiment outcomes") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("活动窗口内的候选实验，与其基线配对；仅纳入不同快照、完整数据且双方人工验收通过的配对。不随上方项目筛选改变，不将 Token 减少自动等同于能力提高。", "Candidates started in the activity window are paired with their baselines. Only distinct, complete snapshots accepted in both groups qualify. This global evidence is independent of browsing filters; fewer Tokens do not automatically mean better capability.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wbMetricGrid",
					children: [
						[t("合格配对 / 排除", "Qualified pairs / excluded"), `${i.pairs} / ${i.excluded}`],
						[t("Token 减少量", "Token reduction"), i.pairs ? number(i.tokenReduction) : "—"],
						[t("重试减少次数", "Retry reduction"), i.pairs ? number(i.retryReduction) : "—"]
					].map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: value })] }, label))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("负值表示增加，而不是节省；没有合格配对时不生成优化结论。", "Negative values mean an increase, not savings. No improvement conclusion is produced without eligible pairs.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
					label: t("优化与预算的全部脱敏字段", "All numeric improvement and budget fields"),
					value: summary
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "wbActions",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						onClick: () => download("optimization-weekly.svg", improvementSvg(summary, chinese), "image/svg+xml"),
						children: t("导出优化成果卡 SVG", "Export improvement SVG")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						onClick: () => download("optimization-weekly.json", JSON.stringify(summary, null, 2), "application/json"),
						children: t("导出优化成果 JSON", "Export improvement JSON")
					})]
				})
			] });
		}
		function CostChanges({ sessions, config, days, t }) {
			const [currency, setCurrency] = (0, react.useState)("USD");
			const result = costAttribution(sessions, config, days, currency);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("参考费用变化拆解：用量、缓存结构、费率", "Reference cost changes: volume, cache mix, rates") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("双基准重估，不是历史账单。按路由先改变用量，再改变输入缓存结构，最后改变参考费率；基准是各完整周期末的 UTC 时点。顺序影响分解结果。", "Two-benchmark revaluation, not historical billing. Per route: change volume, then input cache mix, then reference rates. Benchmarks are the UTC ends of the complete windows. Attribution depends on this order.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
					label: t("参考变化币种", "Reference change currency"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						value: currency,
						onChange: (event) => setCurrency(event.target.value),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: "USD" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: "CNY" })]
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
					result.beforeAt,
					" → ",
					result.afterAt
				] }),
				!result.complete && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					role: "status",
					children: [
						t("仅展示可定价子集，缺失路由不会被当作零费用。", "Only the priceable subset is shown. Missing routes are not treated as zero cost."),
						" ",
						result.missingRoutes
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wbTable",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("模型路由", "Route") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("用量效应", "Volume effect") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("缓存结构效应", "Cache-mix effect") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("费率效应", "Rate effect") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("总变化", "Delta") })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: result.rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
							row.provider,
							"/",
							row.model
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.volume) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.cacheMix) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.rate) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.after - row.before) })
					] }, JSON.stringify([row.provider, row.model]))) })] })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					onClick: () => download("reference-cost-attribution.json", JSON.stringify(result, null, 2), "application/json"),
					children: t("导出参考费用拆解", "Export reference cost attribution")
				})
			] });
		}
		//#endregion
		//#region src/client/workbench/offline-cache.ts
		const OFFLINE_KEY = "dsh-token-usage/offline-receipts-v1";
		const cacheSchema = object({
			schema: literal(OFFLINE_KEY),
			snapshots: array(snapshotSchema).max(8),
			evicted: number$1().int().nonnegative()
		}).strict();
		function readOffline(storage) {
			const raw = storage.getItem(OFFLINE_KEY);
			if (!raw) return cacheSchema.parse({
				schema: OFFLINE_KEY,
				snapshots: [],
				evicted: 0
			});
			if (raw.length > 1e6) throw new Error("Offline receipt cache exceeds its size limit");
			return boundedParse(cacheSchema, JSON.parse(raw), 1e6);
		}
		function saveOffline(storage, snapshot) {
			const parsed = snapshotSchema.parse(snapshot);
			const previous = readOffline(storage);
			const snapshots = [...previous.snapshots.filter((value) => value.sessionId !== parsed.sessionId || value.revision !== parsed.revision || value.offset !== parsed.offset), parsed];
			let evicted = previous.evicted;
			while (snapshots.length > 8 || JSON.stringify({
				schema: "dsh-token-usage/offline-receipts-v1",
				snapshots,
				evicted
			}).length > 1e6) {
				if (snapshots.length === 1) throw new Error("This receipt page is too large to store offline");
				snapshots.shift();
				evicted++;
			}
			const next = cacheSchema.parse({
				schema: OFFLINE_KEY,
				snapshots,
				evicted
			});
			storage.setItem(OFFLINE_KEY, JSON.stringify(next));
			return next;
		}
		function removeOffline(storage, revision, offset) {
			const current = readOffline(storage);
			const next = {
				...current,
				snapshots: current.snapshots.filter((value) => value.revision !== revision || value.offset !== offset)
			};
			storage.setItem(OFFLINE_KEY, JSON.stringify(next));
			return next;
		}
		//#endregion
		//#region src/client/workbench/OfflineReceipts.tsx
		/** Opt-in local metadata storage is visible even when Host settings or the session index is unavailable. */
		function OfflineReceipts({ snapshot, t }) {
			const [items, setItems] = (0, react.useState)([]), [evicted, setEvicted] = (0, react.useState)(0), [selected, setSelected] = (0, react.useState)(), [error, setError] = (0, react.useState)(""), [confirmed, setConfirmed] = (0, react.useState)(false);
			const operate = (run) => {
				try {
					const value = run();
					setItems(value.snapshots);
					setEvicted(value.evicted);
					setError("");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: "wbOffline",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("离线收据缓存（无需 Host）", "Offline receipts (no Host required)") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("仅在你点击保存时把当前页的事件元数据保存在本浏览器，不保存提示词或工具正文。最多 8 页、1 MB；旧页淘汰数量可见。缓存是过去的快照，不会更新。", "Only explicit saving stores this page’s event metadata in this browser, never prompts or tool bodies. Up to eight pages and 1 MB, with visible evictions. Cached snapshots do not update.") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wbActions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: !snapshot,
							onClick: () => snapshot && operate(() => saveOffline(localStorage, snapshot)),
							children: t("保存当前页供离线查看", "Save current page offline")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							onClick: () => operate(() => readOffline(localStorage)),
							children: t("读取离线缓存", "Load offline cache")
						})]
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("缓存页数 / 淘汰页数", "Cached / evicted pages"),
						": ",
						items.length,
						" / ",
						evicted
					] }),
					items.map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wbActions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							onClick: () => setSelected(value),
							children: [
								value.generatedAt,
								" · ",
								t("页偏移", "Page offset"),
								" ",
								value.offset
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							onClick: () => {
								operate(() => removeOffline(localStorage, value.revision, value.offset));
								setSelected(void 0);
							},
							children: t("删除缓存页", "Delete cached page")
						})]
					}, value.revision + value.offset)),
					selected && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("离线历史快照", "Offline historical snapshot") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
							selected.generatedAt,
							" · ",
							selected.reconciliation,
							" · ",
							t("仅此缓存页可浏览，不能离线加载其他页或重新定价。", "Only this cached page is available; offline mode cannot load other pages or reprice.")
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NodeExplorer, {
							snapshot: selected,
							t
						})
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						label: t("确认清除本浏览器的全部离线收据", "Confirm clearing all offline receipts in this browser"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: confirmed,
							onChange: (event) => setConfirmed(event.target.checked)
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						disabled: !confirmed,
						onClick: () => {
							try {
								localStorage.removeItem(OFFLINE_KEY);
								setItems([]);
								setSelected(void 0);
								setEvicted(0);
								setConfirmed(false);
								setError("");
							} catch (error) {
								setError(String(error));
							}
						},
						children: t("清除离线收据", "Clear offline receipts")
					})
				]
			});
		}
		//#endregion
		//#region src/client/workbench/components.tsx
		function PriceEditor({ config, save, busy, t, reportError }) {
			const draftValue = () => ({
				id: `rate-${crypto.randomUUID()}`,
				label: "",
				provider: "",
				model: "",
				currency: "USD",
				effectiveFrom: (/* @__PURE__ */ new Date()).toISOString(),
				verifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
				source: "user-defined",
				rates: {
					uncachedInputTokens: null,
					outputTokens: null,
					cacheReadTokens: null,
					cacheWriteTokens: null
				},
				timezone: "UTC",
				periods: [],
				tiers: []
			});
			const [importConfirmed, setImportConfirmed] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)(draftValue), [editing, setEditing] = (0, react.useState)(false), [json, setJson] = (0, react.useState)("");
			const attempt = async (action) => {
				try {
					await action();
				} catch (error) {
					reportError(error instanceof Error ? error.message : String(error));
				}
			};
			const update = (cards) => save(configurationSchema.parse({
				...config,
				cards: cardsSchema.parse(cards)
			}));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				"aria-label": t("价卡管理", "Price cards"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("版本化价卡", "Versioned price cards") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("按精确 provider/model、币种和生效区间匹配。空白单价表示未知，0 表示明确免费。估算不等于提供方账单。", "Exact provider/model, currency and validity matching. A blank rate is unknown; zero is explicitly free. Estimates are not provider invoices.") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wbActions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy,
							onClick: () => void attempt(() => update([...config.cards, ...publicTemplates().filter((template) => !config.cards.some((card) => card.id === template.id))])),
							children: t("载入 DeepSeek 空白模板", "Load blank DeepSeek templates")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							onClick: () => download("token-price-cards.json", JSON.stringify({
								schema: "dsh-token-usage/price-cards-v1",
								cards: config.cards
							}, null, 2), "application/json"),
							children: t("导出价卡", "Export price cards")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("模板不预填价格。请核对提供方官方价目表、实际路由与生效时间后填写；空白费率不可用，不会按零计费。", "Templates contain no prices. Verify the official tariff, actual route and validity before entering rates. Unknown rates are not zero.") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wbTable",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("名称 / 路由", "Name / route") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("币种 / 有效期", "Currency / validity") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("操作", "Actions") })
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: config.cards.map((card) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [card.label, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
								card.provider,
								" / ",
								card.model
							] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [card.currency, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
								card.effectiveFrom,
								" → ",
								card.effectiveTo ?? "∞"
							] })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									onClick: () => {
										setDraft(structuredClone(card));
										setEditing(true);
									},
									children: t("编辑", "Edit")
								}),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									disabled: busy,
									onClick: () => void attempt(() => update(config.cards.filter((value) => value.id !== card.id))),
									children: t("删除价卡", "Delete card")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
									label: t("费率与来源", "Rates and provenance"),
									value: card
								})
							] })
						] }, card.id)) })] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						onSubmit: (event) => {
							event.preventDefault();
							attempt(async () => {
								const parsed = rateCardSchema.parse({
									...draft,
									verifiedAt: (/* @__PURE__ */ new Date()).toISOString()
								});
								await update([...config.cards.filter((card) => card.id !== parsed.id), parsed]);
								setDraft(draftValue());
								setEditing(false);
							});
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: editing ? t("编辑所选版本（已有实验快照不变）", "Edit selected version (experiment snapshots stay unchanged)") : t("新增价卡", "Add a price card") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbGrid",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: t("价卡名称", "Card name"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											required: true,
											maxLength: 100,
											value: draft.label,
											onChange: (event) => setDraft({
												...draft,
												label: event.target.value
											})
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: "Provider",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											required: true,
											maxLength: 256,
											value: draft.provider,
											onChange: (event) => setDraft({
												...draft,
												provider: event.target.value
											})
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: "Model",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											required: true,
											maxLength: 256,
											value: draft.model,
											onChange: (event) => setDraft({
												...draft,
												model: event.target.value
											})
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: t("币种", "Currency"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											value: draft.currency,
											onChange: (event) => setDraft({
												...draft,
												currency: event.target.value
											}),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: "USD" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: "CNY" })]
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: t("生效时间（ISO 8601，含时区）", "Effective from (ISO 8601 with timezone)"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											required: true,
											value: draft.effectiveFrom,
											onChange: (event) => setDraft({
												...draft,
												effectiveFrom: event.target.value
											})
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: t("结束时间（留空表示持续有效）", "Effective until (blank for open-ended)"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: draft.effectiveTo ?? "",
											onChange: (event) => {
												const next = { ...draft };
												if (event.target.value) next.effectiveTo = event.target.value;
												else delete next.effectiveTo;
												setDraft(next);
											}
										})
									}),
									bucketKeys.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: `${key} / 1M`,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "number",
											step: "any",
											min: "0",
											max: "1000000",
											value: draft.rates[key] ?? "",
											onChange: (event) => setDraft({
												...draft,
												rates: {
													...draft.rates,
													[key]: event.target.value === "" ? null : Number(event.target.value)
												}
											})
										})
									}, key))
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("编辑保留该版本原有的分时、阶梯和缓存写入规则；高级规则可在下方 JSON 编辑器中完整修改。", "Editing preserves the selected version’s time, context-tier and cache-write rules. Advanced rules can be edited in the JSON editor below.") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbGrid",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("价格来源（无查询参数的官方 HTTPS 链接）", "Price source (official HTTPS URL without query parameters)"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "url",
										value: draft.sourceUrl ?? "",
										onChange: (event) => {
											const next = { ...draft };
											if (event.target.value) next.sourceUrl = event.target.value;
											else delete next.sourceUrl;
											setDraft(next);
										}
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("来源类别", "Source type"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: draft.source,
										onChange: (event) => setDraft({
											...draft,
											source: event.target.value
										}),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "user-defined",
											children: t("自定义/合同费率", "Custom / contracted")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "public",
											children: t("人工核对的公开参考价", "Manually reviewed public reference")
										})]
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("保存表示你已核对本次费率和生效日期；插件不会声称自动核验。历史修订可在下方查看与回滚。", "Saving confirms your manual review of rates and validity. The plugin does not claim automatic verification. Revisions can be inspected and restored below.") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								disabled: busy,
								type: "submit",
								children: t("保存价卡", "Save price card")
							}),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									setDraft(draftValue());
									setEditing(false);
								},
								children: t("清空表单", "Reset form")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("高级规则 / 导入 JSON", "Advanced rules / JSON import") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("支持分时 periods、上下文 tiers、cacheWriteVariants。只接受白名单结构；重叠时段、非法数值和超限数组会被拒绝。", "Supports periods, context tiers and cacheWriteVariants. Overlapping periods, invalid rates and oversized arrays are rejected.") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							onClick: () => setJson(JSON.stringify(config.cards, null, 2)),
							children: t("载入当前价卡", "Load current cards")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("价卡 JSON", "Price-card JSON"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								rows: 12,
								maxLength: 1e6,
								value: json,
								onChange: (event) => {
									setJson(event.target.value);
									setImportConfirmed(false);
								}
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("已检查导入价卡的路由、来源、费率和生效区间", "I reviewed imported routes, sources, rates and validity"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: importConfirmed,
								onChange: (event) => setImportConfirmed(event.target.checked)
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy || !importConfirmed,
							onClick: () => void attempt(async () => {
								const parsed = JSON.parse(json);
								await update(Array.isArray(parsed) ? parsed : parsed?.cards);
							}),
							children: t("校验并替换价卡", "Validate and replace cards")
						})
					] })
				]
			});
		}
		const Scenario = LongScenario;
		function Experiments({ config, snapshot, costs, save, busy, t, reportError }) {
			const [name, setName] = (0, react.useState)(""), [variant, setVariant] = (0, react.useState)("baseline"), [pair, setPair] = (0, react.useState)(""), [task, setTask] = (0, react.useState)(""), [size, setSize] = (0, react.useState)(""), [conditions, setConditions] = (0, react.useState)(""), [label, setLabel] = (0, react.useState)(""), [accepted, setAccepted] = (0, react.useState)("unknown");
			const [selected, setSelected] = (0, react.useState)("");
			const names = [...new Set(config.experiments.map((run) => run.experiment))];
			const comparison = experimentComparison(config.experiments, selected || names[0] || "");
			const submit = async () => {
				if (!snapshot) return;
				try {
					const run = experimentRunSchema.parse({
						id: crypto.randomUUID(),
						experiment: name,
						variant,
						pair,
						task,
						size,
						conditions,
						configLabel: label,
						accepted: accepted === "unknown" ? null : accepted === "yes",
						generatedAt: snapshot.generatedAt,
						revision: snapshot.revision,
						requests: snapshot.totals.requests,
						retryUsage: snapshot.totals.retry,
						toolCalls: snapshot.totals.toolCalls,
						toolErrors: snapshot.totals.toolErrors,
						usage: snapshot.totals.usage,
						retries: snapshot.totals.retries,
						durationMs: snapshot.totals.activeDurationMs,
						complete: snapshot.nodeCount > 0 && snapshot.reconciliation === "matched" && snapshot.totals.openTurns === 0 && snapshot.totals.openSteps === 0 && snapshot.provisionalNodeCount === 0,
						costs: costs.filter((cost) => cost.revision === snapshot.revision).map((cost) => ({
							currency: cost.estimate.currency,
							amount: cost.estimate.amount ?? cost.estimate.lower ?? 0,
							complete: cost.estimate.status === "complete",
							...cost.priceDigest ? { fingerprint: cost.priceDigest + ":" + cost.estimate.mode } : {},
							basis: `${cost.estimate.mode}; price revision ${cost.priceRevision}; ${cost.estimate.verifiedAt.join(",")}`.slice(0, 200)
						}))
					});
					await save({
						...config,
						experiments: [...config.experiments, run]
					});
					setSelected(name);
				} catch (error) {
					reportError(error instanceof Error ? error.message : String(error));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("优化实验室", "Optimization experiments") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("为可比任务保存不可变统计快照。验收由你标注，回合完成不等于业务正确。结果是探索性对比，不是模型能力排名或因果证明。", "Capture immutable statistics for comparable tasks. Acceptance is explicitly labeled by you. A completed turn is not proof of task correctness. Comparisons are exploratory, not rankings or causal proof.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					onSubmit: (event) => {
						event.preventDefault();
						submit();
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wbGrid",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("实验名称", "Experiment name"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									required: true,
									maxLength: 80,
									value: name,
									onChange: (event) => setName(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("分组", "Variant"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: variant,
									onChange: (event) => setVariant(event.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "baseline",
										children: t("基线", "Baseline")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "candidate",
										children: t("候选", "Candidate")
									})]
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("配对任务编号", "Paired task ID"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									required: true,
									maxLength: 80,
									value: pair,
									onChange: (event) => setPair(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("任务类别", "Task category"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									required: true,
									maxLength: 80,
									value: task,
									onChange: (event) => setTask(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("输入规模区间", "Input size band"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									required: true,
									maxLength: 40,
									value: size,
									onChange: (event) => setSize(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("运行条件标签", "Run conditions label"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									required: true,
									maxLength: 160,
									value: conditions,
									onChange: (event) => setConditions(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("配置 / preset 版本标签（非正文）", "Configuration / preset version label (not content)"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									required: true,
									maxLength: 80,
									value: label,
									onChange: (event) => setLabel(event.target.value)
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("人工验收", "Human acceptance"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: accepted,
									onChange: (event) => setAccepted(event.target.value),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "unknown",
											children: t("未验收", "Not evaluated")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "yes",
											children: t("通过", "Passed")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "no",
											children: t("未通过", "Failed")
										})
									]
								})
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						disabled: busy || !snapshot,
						children: t("保存当前会话快照", "Save current session snapshot")
					})]
				}),
				!snapshot && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("请先在本地体检中读取一个会话。", "Inspect a session first.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
					label: t("选择实验", "Select experiment"),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
						value: selected || names[0] || "",
						onChange: (event) => setSelected(event.target.value),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "",
							children: "—"
						}), names.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: name }, name))]
					})
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
					t("有效配对", "Valid pairs"),
					": ",
					comparison.pairedCount,
					" · ",
					t("可比条件完整", "Comparable conditions complete"),
					": ",
					String(comparison.comparable),
					" · ",
					t("验收信号完整", "Acceptance observed"),
					": ",
					String(comparison.qualityObserved)
				] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wbTable",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("分组", "Variant") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "N" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("平均 / 中位 Token", "Mean / median Tokens") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("标准差", "Standard deviation") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("验收通过率", "Acceptance") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("每个通过任务费用", "Cost per accepted task") })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: comparison.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.variant }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.n }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
							number(group.tokens.mean),
							" / ",
							number(group.tokens.median)
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(group.tokens.sd) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.acceptance === null ? "—" : `${number(group.acceptance * 100)}%` }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: group.costs.map((cost) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							cost.currency,
							" ",
							number(cost.perAccepted)
						] }, cost.currency)) })
					] }, group.variant)) })] })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("每个通过任务费用包含失败尝试的已知费用；零通过、未验收或价格覆盖不完整时不可用。", "Cost per accepted task includes failed attempts. It is unavailable with zero passes, unevaluated runs or incomplete pricing.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExperimentDetails, {
					comparison,
					t
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
					label: t("配对差值与完整统计", "Paired differences and full statistics"),
					value: comparison
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wbTable",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("快照", "Snapshot") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("验收", "Acceptance") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("操作", "Actions") })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: config.experiments.filter((run) => run.experiment === (selected || names[0])).map((run) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
							run.variant,
							" · ",
							run.pair,
							" · ",
							run.configLabel,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: run.generatedAt })
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("修改人工验收", "Update human acceptance") + " " + run.id,
							disabled: busy,
							value: run.accepted === null ? "unknown" : run.accepted ? "yes" : "no",
							onChange: (event) => {
								const accepted = event.target.value === "unknown" ? null : event.target.value === "yes";
								save({
									...config,
									experiments: config.experiments.map((item) => item.id === run.id ? {
										...item,
										accepted,
										acceptanceAt: (/* @__PURE__ */ new Date()).toISOString()
									} : item)
								}).catch((error) => reportError(String(error)));
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "unknown",
									children: t("未验收", "Not evaluated")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "yes",
									children: t("通过", "Passed")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "no",
									children: t("失败", "Failed")
								})
							]
						}) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy,
							onClick: () => void save({
								...config,
								experiments: config.experiments.filter((item) => item.id !== run.id)
							}).catch((error) => reportError(String(error))),
							children: t("删除快照", "Delete snapshot")
						}) })
					] }, run.id)) })] })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					onClick: () => download("token-experiments.json", JSON.stringify({
						schema: "dsh-token-usage/experiments-v1",
						runs: config.experiments
					}, null, 2), "application/json"),
					children: t("导出本地实验记录", "Export local experiment records")
				})
			] });
		}
		//#endregion
		//#region src/client/workbench/styles.ts
		/** Scoped CSS shipped in the client bundle; inherits the host's color scheme and fonts. */
		const workbenchCss = `
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
.wbRoot .wbExplorer progress { width: clamp(100px,18vw,260px); max-width: 100%; accent-color: var(--wb-accent); }
.wbRoot .wbExplorer dl > div { display:flex; justify-content:space-between; gap:12px; padding:5px 0; }
.wbRoot .wbOffline { margin-bottom:18px; }
.wbRoot footer { border-top: 1px solid var(--wb-line); padding: 20px 0 0; margin-top: 28px; font-size: 12px; opacity: .65; }
@media(max-width:600px) { .wbRoot { padding: 16px 12px; } .wbRoot .wbHeader { flex-direction: column; gap: 6px; } .wbRoot .wbTabs { gap: 3px; } .wbRoot .wbTabs button { font-size: 12px; padding: 7px 9px; } .wbRoot td { max-width: 240px; } }
@media(prefers-reduced-motion:reduce) { .wbRoot * { scroll-behavior: auto; } }
`;
		//#endregion
		//#region src/client/workbench/App.tsx
		const views = [
			[
				"inspect",
				"本地体检 / 收据",
				"Inspection / receipt"
			],
			[
				"prices",
				"价卡",
				"Price cards"
			],
			[
				"ledger",
				"辅助分析账本",
				"Analysis ledger"
			],
			[
				"changes",
				"变化归因",
				"Changes"
			],
			[
				"projects",
				"项目与预算",
				"Projects / budgets"
			],
			[
				"scenario",
				"情景试算",
				"Scenarios"
			],
			[
				"experiments",
				"优化实验室",
				"Experiments"
			],
			[
				"share",
				"周报与联动",
				"Weekly / integration"
			]
		];
		const labels = {
			uncachedInputTokens: ["未缓存输入", "Uncached input"],
			outputTokens: ["输出", "Output"],
			cacheReadTokens: ["缓存读取", "Cache reads"],
			cacheWriteTokens: ["缓存写入", "Cache writes"],
			complete: ["完整", "Complete"],
			partial: ["部分覆盖", "Partial"],
			unavailable: ["不可用", "Unavailable"],
			range: ["区间参考", "Range"],
			exceeded: ["已超预算", "Exceeded"],
			warning: ["接近预算", "Warning"],
			within: ["预算内", "Within"],
			disabled: ["未启用", "Disabled"],
			"budget-pressure": ["预算压力", "Budget pressure"],
			"budget-coverage": ["预算覆盖不完整", "Incomplete budget coverage"],
			"time-coverage": ["时间覆盖缺口", "Timestamp coverage gap"],
			"route-coverage": ["路由覆盖缺口", "Route coverage gap"],
			"retry-share": ["重试占比偏高", "High retry share"],
			"compaction-share": ["压缩占比偏高", "High compaction share"],
			reconciliation: ["用量对账差异", "Reconciliation mismatch"],
			"tool-errors": ["存在工具错误", "Tool errors"],
			"orphan-tools": ["存在未配对工具事件", "Unpaired tool events"],
			"open-lifecycle": ["仍有未结束回合或步骤", "Open turns or steps"],
			"unresolved-approvals": ["仍有待处理审批", "Pending approvals"],
			"usage-unavailable": ["没有可观测用量", "No observed usage"]
		};
		function word(key, t) {
			return labels[key] ? t(...labels[key]) : key;
		}
		function QuoteView({ value, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wbQuote",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
						value.currency,
						" ",
						number(value.amount)
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: word(value.status, t) }),
					value.amount === null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("已知下界 / 上界", "Known lower / upper"),
						": ",
						number(value.lower),
						" / ",
						number(value.upper)
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
						t("可计价 Token", "Priced Tokens"),
						": ",
						number(value.coveredTokens),
						" / ",
						number(value.totalTokens),
						" · ",
						value.mode
					] }),
					value.unavailable.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: value.unavailable.join(" · ") })
				]
			});
		}
		function MoneyBudgets({ values, submit, busy, t }) {
			const [usd, setUsd] = (0, react.useState)(values.find((value) => value.currency === "USD")?.amount.toString() ?? "");
			const [cny, setCny] = (0, react.useState)(values.find((value) => value.currency === "CNY")?.amount.toString() ?? "");
			(0, react.useEffect)(() => {
				setUsd(values.find((value) => value.currency === "USD")?.amount.toString() ?? "");
				setCny(values.find((value) => value.currency === "CNY")?.amount.toString() ?? "");
			}, [values]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				className: "wbInline",
				onSubmit: (event) => {
					event.preventDefault();
					const next = [];
					if (usd) next.push({
						currency: "USD",
						amount: Number(usd)
					});
					if (cny) next.push({
						currency: "CNY",
						amount: Number(cny)
					});
					submit(next).catch(() => {});
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						label: t("30 日 USD 预算（空白关闭）", "30-day USD budget (blank disables)"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "number",
							min: "0.000001",
							max: "1000000000",
							step: "any",
							value: usd,
							onChange: (event) => setUsd(event.target.value)
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
						label: t("30 日 CNY 预算（空白关闭）", "30-day CNY budget (blank disables)"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "number",
							min: "0.000001",
							max: "1000000000",
							step: "any",
							value: cny,
							onChange: (event) => setCny(event.target.value)
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						disabled: busy,
						type: "submit",
						children: t("保存金额预算", "Save money budgets")
					})
				]
			});
		}
		function Projects({ config, sessions, save, busy, t, selected, error }) {
			const [name, setName] = (0, react.useState)(""), [budget, setBudget] = (0, react.useState)("0"), [editing, setEditing] = (0, react.useState)("");
			const assignment = config.assignments.find((value) => value.sessionId === selected);
			const [project, setProject] = (0, react.useState)(assignment?.projectId ?? ""), [tags, setTags] = (0, react.useState)(assignment?.tags.join(", ") ?? "");
			(0, react.useEffect)(() => {
				setProject(assignment?.projectId ?? "");
				setTags(assignment?.tags.join(", ") ?? "");
			}, [selected, assignment]);
			const rows = projectTotals(sessions, config);
			const attempt = (action) => void action().catch((cause) => error(cause instanceof Error ? cause.message : String(cause)));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("项目与滚动 30 日预算", "Projects and rolling 30-day budgets") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("统计所有可观测会话，不受上方浏览筛选影响。一个会话只能归属一个主项目；标签只用于筛选，不重复加总。金额采用当前费率重估，不是历史账单。", "All observable sessions, independent of the browsing filter. One primary project per session; tags never duplicate totals. Money is revalued at current rates, not historical billing.") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: "wbInline",
					onSubmit: (event) => {
						event.preventDefault();
						attempt(async () => {
							const id = editing || crypto.randomUUID(), existing = config.projects.find((item) => item.id === id);
							await save({
								...config,
								projects: [...config.projects.filter((item) => item.id !== id), {
									id,
									name: name.trim(),
									tokenBudget: Number(budget),
									moneyBudgets: existing?.moneyBudgets ?? []
								}]
							});
							setName("");
							setBudget("0");
							setEditing("");
						});
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("项目名称", "Project name"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								required: true,
								maxLength: 80,
								value: name,
								onChange: (event) => setName(event.target.value)
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("30 日 Token 预算（0 关闭）", "30-day Token budget (0 disables)"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								required: true,
								min: "0",
								max: Number.MAX_SAFE_INTEGER,
								step: "1",
								value: budget,
								onChange: (event) => setBudget(event.target.value)
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy,
							type: "submit",
							children: editing ? t("保存项目", "Save project") : t("新建项目", "Create project")
						}),
						editing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setEditing("");
								setName("");
								setBudget("0");
							},
							children: t("取消编辑", "Cancel edit")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: "wbInline",
					onSubmit: (event) => {
						event.preventDefault();
						attempt(() => save({
							...config,
							assignments: [...config.assignments.filter((value) => value.sessionId !== selected), ...project ? [{
								sessionId: selected,
								projectId: project,
								tags: [...new Set(tags.split(/[,，]/u).map((tag) => tag.trim()).filter(Boolean))]
							}] : []]
						}));
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("当前会话主项目", "Selected session primary project"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: project,
								onChange: (event) => setProject(event.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("未分组", "Unassigned")
								}), config.projects.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: item.id,
									children: item.name
								}, item.id))]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
							label: t("标签（逗号分隔，最多 12 个）", "Tags (comma separated, maximum 12)"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								maxLength: 500,
								value: tags,
								disabled: !project,
								onChange: (event) => setTags(event.target.value)
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy || !selected,
							type: "submit",
							children: t("保存会话归属", "Assign session")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wbTable",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("项目", "Project") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("会话", "Sessions") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("全部 / 30 日 Token", "All / 30-day Tokens") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("Token 预算", "Token budget") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("状态", "Status") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("操作", "Actions") })
					] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.name || t("未分组", "Unassigned") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.sessions }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", { children: [
							number(total(row.total)),
							" / ",
							row.complete ? number(total(row.rolling)) : t("日期不完整", "Incomplete dates")
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.tokenBudget) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: word(row.status, t) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.id !== "unassigned" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => {
									setEditing(row.id);
									setName(row.name);
									setBudget(String(row.tokenBudget));
								},
								children: t("编辑", "Edit")
							}),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								disabled: busy,
								onClick: () => attempt(() => save({
									...config,
									projects: config.projects.filter((item) => item.id !== row.id),
									assignments: config.assignments.filter((item) => item.projectId !== row.id)
								})),
								children: t("删除并解除分组", "Delete and unassign")
							})
						] }) })
					] }, row.id)) })] })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("全局金额预算", "Global money budgets") }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MoneyBudgets, {
					values: config.moneyBudgets,
					busy,
					t,
					submit: (moneyBudgets) => save({
						...config,
						moneyBudgets
					})
				}),
				config.moneyBudgets.map((budget) => {
					const estimate = rollingMoney(sessions, config, budget.currency);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuoteView, {
						value: estimate,
						t
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						t("预算状态", "Budget status"),
						": ",
						word(moneyBudgetStatus(estimate, budget.amount), t),
						" · ",
						budget.currency,
						" ",
						number(budget.amount)
					] })] }, budget.currency);
				}),
				config.projects.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
						item.name,
						" · ",
						t("项目金额预算", "Project money budgets")
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MoneyBudgets, {
						values: item.moneyBudgets,
						busy,
						t,
						submit: (moneyBudgets) => save({
							...config,
							projects: config.projects.map((value) => value.id === item.id ? {
								...value,
								moneyBudgets
							} : value)
						})
					}),
					item.moneyBudgets.map((budget) => {
						const estimate = rollingMoney(selectSessions(sessions, config, item.id), config, budget.currency);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuoteView, {
							value: estimate,
							t
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
							word(moneyBudgetStatus(estimate, budget.amount), t),
							" · ",
							budget.currency,
							" ",
							number(budget.amount)
						] })] }, budget.currency);
					})
				] }, item.id)),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("预算只提示，不会停止、取消或延迟你的任务。80% 起预警；缺少日期或完整定价时不会显示“预算内”。", "Budgets notify only: they never stop, cancel or delay tasks. Warnings start at 80%; missing dates or pricing cannot produce a “within budget” result.") })
			] });
		}
		function WorkbenchApp({ port, sessions, chinese = false }) {
			const t = (zh, en) => chinese ? zh : en;
			const [state, setState] = (0, react.useState)(), [error, setError] = (0, react.useState)(""), [notice, setNotice] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [view, setView] = (0, react.useState)("inspect");
			const [selected, setSelected] = (0, react.useState)(sessions[0]?.id ?? ""), [projectFilter, setProjectFilter] = (0, react.useState)(""), [tagFilter, setTagFilter] = (0, react.useState)("");
			const [snapshot, setSnapshot] = (0, react.useState)(), [costs, setCosts] = (0, react.useState)([]), [mode, setMode] = (0, react.useState)("historical-reference");
			const [days, setDays] = (0, react.useState)(7), [clearConfirmed, setClearConfirmed] = (0, react.useState)(false), [anonymize, setAnonymize] = (0, react.useState)(true);
			const controller = (0, react.useRef)(null), alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
					controller.current?.abort();
				};
			}, []);
			const run = async (operation) => {
				if (controller.current && !controller.current.signal.aborted) throw new Error(t("已有操作运行中。", "Another operation is running."));
				const current = new AbortController();
				controller.current = current;
				setBusy(true);
				setError("");
				setNotice("");
				try {
					const result = await operation(current.signal);
					current.signal.throwIfAborted();
					return result;
				} catch (cause) {
					if (alive.current && !current.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
					throw cause;
				} finally {
					if (controller.current === current) {
						controller.current = null;
						if (alive.current) setBusy(false);
					}
				}
			};
			const refresh = () => run(async (signal) => {
				const result = await port.read(signal);
				signal.throwIfAborted();
				if (alive.current) setState(result);
			});
			(0, react.useEffect)(() => {
				refresh().catch(() => {});
				return () => controller.current?.abort();
			}, [port]);
			(0, react.useEffect)(() => {
				if (!selected && sessions[0]) setSelected(sessions[0].id);
			}, [sessions, selected]);
			const chooseSession = (id) => {
				controller.current?.abort();
				setSelected(id);
				setSnapshot(void 0);
				setCosts([]);
				setError("");
			};
			const save = (config) => run(async (signal) => {
				if (!state) throw new Error("Workbench has not loaded");
				const next = configurationSchema.parse(config), result = await port.save(state.revision, next, signal);
				signal.throwIfAborted();
				if (!alive.current) return;
				if (next.thresholds.retryShare !== state.config.thresholds.retryShare || next.thresholds.compactionShare !== state.config.thresholds.compactionShare) setSnapshot(void 0);
				setState(result);
				if (result.priceRevision !== state.priceRevision) setCosts([]);
				setNotice(t("已保存到本地 Host。", "Saved to the local Host."));
			});
			const inspect = (offset = 0) => run(async (signal) => {
				if (!selected) throw new Error(t("请选择会话。", "Select a session."));
				const result = await port.snapshot(selected, signal, offset, offset ? snapshot?.revision : void 0);
				signal.throwIfAborted();
				if (!alive.current) return;
				setSnapshot(result);
				if (!offset) setCosts([]);
			});
			const price = () => run(async (signal) => {
				if (!snapshot) throw new Error("Inspect the session first");
				const at = (/* @__PURE__ */ new Date()).toISOString();
				const values = await Promise.all(["USD", "CNY"].map((currency) => port.receipt(snapshot.sessionId, snapshot.revision, currency, mode, at, signal)));
				signal.throwIfAborted();
				if (alive.current) setCosts(values);
			});
			const config = state?.config;
			const filtered = (0, react.useMemo)(() => config ? selectSessions(sessions, config, projectFilter, tagFilter) : [...sessions], [
				sessions,
				config,
				projectFilter,
				tagFilter
			]);
			const report = (0, react.useMemo)(() => changes(filtered, days), [filtered, days]);
			const usage = (0, react.useMemo)(() => sumSessionUsage(filtered), [filtered]);
			const weekly = (0, react.useMemo)(() => shareSummary(filtered), [filtered]);
			const validCosts = costs.filter((cost) => cost.revision === snapshot?.revision && cost.priceRevision === state?.priceRevision && cost.estimate.mode === mode);
			(0, react.useEffect)(() => {
				if (config?.shareSummary) window.dispatchEvent(new Event("dsh-token-usage:summary-request"));
			}, [config?.shareSummary, sessions]);
			const csv = () => download("token-changes.csv", "﻿" + changesCsv(filtered, days), "text/csv;charset=utf-8");
			const annotatedSnapshot = (0, react.useMemo)(() => snapshot && config ? {
				...snapshot,
				findings: [...snapshot.findings, ...budgetFindings(sessions, config, snapshot.sessionId, snapshot.generatedAt)]
			} : snapshot, [
				snapshot,
				config,
				sessions
			]);
			const restorePrices = (target) => run(async (signal) => {
				if (!state) return;
				const next = await port.rollback(state.revision, target, signal);
				signal.throwIfAborted();
				if (alive.current) {
					setState(next);
					setCosts([]);
				}
			});
			const status = (text) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "wbPill",
				children: text
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "wbRoot",
				lang: chinese ? "zh-CN" : "en",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: workbenchCss }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "wbHeader",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "wbEyebrow",
								children: "LOCAL USAGE · 0.5"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: t("用量工作台", "Usage workbench") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("从一次调用，到可核对的优化决策。", "From individual calls to auditable optimization decisions.") })
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "wbActions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								disabled: busy,
								onClick: () => void refresh().catch(() => {}),
								children: t("刷新配置与账本", "Refresh settings and ledger")
							}), busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => controller.current?.abort(),
								children: t("取消当前读取", "Cancel current operation")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "status",
						"aria-live": "polite",
						children: busy ? t("正在读取或保存…", "Reading or saving…") : notice
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "alert",
						className: "wbError",
						children: [error, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("可刷新后重试；现有数据不会被自动覆盖。", "Refresh and retry; existing data is not automatically overwritten.") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OfflineReceipts, {
						snapshot: annotatedSnapshot,
						t
					}),
					!state ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("等待本地 Host 配置。", "Waiting for local Host configuration.") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
							className: "wbTabs",
							"aria-label": t("工作台功能", "Workbench views"),
							children: views.map(([id, zh, en]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								"aria-pressed": view === id,
								onClick: () => setView(id),
								children: t(zh, en)
							}, id))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "wbToolbar",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("当前会话", "Selected session"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: selected,
										onChange: (event) => chooseSession(event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: "—"
										}), sessions.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: session.id,
											children: session.title
										}, session.id))]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("浏览项目筛选", "Browsing project filter"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: projectFilter,
										onChange: (event) => {
											setProjectFilter(event.target.value);
											setTagFilter("");
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: t("全部项目", "All projects")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "unassigned",
												children: t("未分组", "Unassigned")
											}),
											state.config.projects.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: project.id,
												children: project.name
											}, project.id))
										]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("浏览标签筛选", "Browsing tag filter"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: tagFilter,
										onChange: (event) => setTagFilter(event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: t("全部标签", "All tags")
										}), [...new Set(state.config.assignments.flatMap((item) => item.tags))].map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { children: tag }, tag))]
									})
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "wbScope",
							children: [
								t("浏览范围", "Browsing scope"),
								": ",
								filtered.length,
								" / ",
								sessions.length,
								" ",
								t("会话", "sessions"),
								" · ",
								t("Token", "Tokens"),
								" ",
								number(total(usage)),
								" · ",
								t("体检使用当前会话；预算始终使用完整项目范围。", "Inspection uses the selected session; budgets always use complete project scope.")
							]
						}),
						view === "inspect" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("无需模型的本地体检", "Local inspection without a model") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("仅读取会话事件元数据和提供方上报用量，不发送提示词，不产生模型费用。读取后得到固定版本快照；正在运行的会话需要重新读取。", "Reads event metadata and reported usage only. No prompts are sent and no model is called. The result is an immutable snapshot; re-inspect active sessions for updates.") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbActions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									disabled: busy || !selected,
									onClick: () => void inspect().catch(() => {}),
									children: t("读取并体检", "Inspect session")
								}), snapshot && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("价格口径", "Pricing basis"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: mode,
										onChange: (event) => {
											setMode(event.target.value);
											setCosts([]);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "historical-reference",
											children: t("历史参考 / 时点不确定用区间", "Historical reference / uncertain time uses ranges")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "revaluation",
											children: t("当前费率重估", "Current-rate revaluation")
										})]
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									disabled: busy,
									onClick: () => void price().catch(() => {}),
									children: t("计算收据参考费用", "Price receipt")
								})] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("体检阈值", "Diagnostic thresholds") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
								className: "wbInline",
								onSubmit: (event) => {
									event.preventDefault();
									const data = new FormData(event.currentTarget);
									save({
										...state.config,
										thresholds: {
											retryShare: Number(data.get("retry")),
											compactionShare: Number(data.get("compaction"))
										}
									}).catch(() => {});
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: t("重试占比阈值（0–1）", "Retry share threshold (0–1)"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											name: "retry",
											required: true,
											type: "number",
											min: "0",
											max: "1",
											step: "0.01",
											defaultValue: state.config.thresholds.retryShare
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: t("压缩占比阈值（0–1）", "Compaction share threshold (0–1)"),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											name: "compaction",
											required: true,
											type: "number",
											min: "0",
											max: "1",
											step: "0.01",
											defaultValue: state.config.thresholds.compactionShare
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										disabled: busy,
										type: "submit",
										children: t("保存体检阈值", "Save diagnostic thresholds")
									})
								]
							})] }),
							snapshot && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("用量收据", "Usage receipt") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wbMetricGrid",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("总 Token", "Total Tokens") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(total(snapshot.totals.usage)) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("模型请求 / 重试", "Model requests / retries") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
											snapshot.totals.requests,
											" / ",
											snapshot.totals.retries
										] })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("活跃时长（秒）", "Active seconds") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(snapshot.totals.activeDurationMs / 1e3) })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("对账", "Reconciliation") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: snapshot.reconciliation })] })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									snapshot.generatedAt,
									" · ",
									t("事件", "events"),
									" ",
									snapshot.eventCount,
									" · ",
									t("暂定用量节点", "provisional nodes"),
									" ",
									snapshot.provisionalNodeCount
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "wbTable",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("Token 类别", "Token bucket") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("总计", "Total") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("普通", "Ordinary") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("重试", "Retry") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("压缩", "Compaction") }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("差异", "Delta") })
									] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: bucketKeys.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: word(key, t) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(snapshot.totals.usage[key]) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(snapshot.totals.ordinary[key]) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(snapshot.totals.retry[key]) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(snapshot.totals.compaction[key]) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(snapshot.totals.delta[key]) })
									] }, key)) })] })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("可复核诊断", "Auditable findings") }),
								!annotatedSnapshot.findings.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("未命中当前规则；不代表业务结果正确。", "No current rules fired; this does not certify task correctness.") }),
								annotatedSnapshot.findings.map((finding, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
										status(finding.severity),
										" ",
										word(finding.ruleId, t),
										" · ",
										finding.coverage
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										t("规则版本", "Rule version"),
										": ",
										finding.ruleVersion,
										" · ",
										t("值 / 阈值", "Value / threshold"),
										": ",
										number(finding.value),
										" / ",
										number(finding.threshold)
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										t("作用范围", "Scope"),
										": ",
										finding.scope
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: chinese ? finding.suggestedAction.zh : finding.suggestedAction.en }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: finding.evidence.join("\n") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "wbActions",
										children: finding.nodes.map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											disabled: busy,
											onClick: () => void run(async (signal) => {
												const page = await port.snapshot(selected, signal, Math.floor(ref.index / 200) * 200, snapshot.revision);
												signal.throwIfAborted();
												if (alive.current) setSnapshot(page);
											}).catch(() => {}),
											children: [
												t("跳到证据节点所在页", "Go to evidence page"),
												" #",
												ref.seq
											]
										}, ref.id))
									})
								] }, finding.ruleId + finding.scope + index)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "wbGrid",
									children: validCosts.map((cost) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuoteView, {
											value: cost.estimate,
											t
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
											t("已计价节点中最大费用", "Largest fully priced node"),
											": ",
											cost.largestPricedNode ? `${cost.largestPricedNode.id} · ${number(cost.largestPricedNode.amount)}` : "—"
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
											label: t("价卡证据与版本", "Price evidence and revision"),
											value: cost
										})
									] }, cost.estimate.currency))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("请求与压缩节点图", "Request and compaction nodes") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NodeExplorer, {
									snapshot,
									t
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wbActions",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											snapshot.nodeCount ? snapshot.offset + 1 : 0,
											"–",
											snapshot.offset + snapshot.nodes.length,
											" / ",
											snapshot.nodeCount
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											disabled: busy || snapshot.offset === 0,
											onClick: () => void run(async (signal) => {
												const result = await port.snapshot(selected, signal, Math.max(0, snapshot.offset - 200), snapshot.revision);
												if (alive.current) setSnapshot(result);
											}).catch(() => {}),
											children: t("上一页", "Previous page")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											disabled: busy || snapshot.nextOffset === null,
											onClick: () => void inspect(snapshot.nextOffset ?? 0).catch(() => {}),
											children: t("下一页", "Next page")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("导出时隐藏会话与路由标识", "Hide session and route identifiers in export"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: anonymize,
										onChange: (event) => setAnonymize(event.target.checked)
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wbActions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: () => download("token-receipt.json", JSON.stringify(receiptDocument(annotatedSnapshot, validCosts, anonymize), null, 2), "application/json"),
										children: t("导出收据 JSON", "Export receipt JSON")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: () => download("token-receipt.md", receiptMarkdown(annotatedSnapshot, validCosts), "text/markdown"),
										children: t("导出收据 Markdown", "Export receipt Markdown")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("JSON 节点明细只包含当前页，总计覆盖整个快照。参考费用不是账单；辅助分析费用另列。", "JSON node details contain the displayed page; totals cover the entire snapshot. Reference estimates are not invoices. Auxiliary analysis is separate.") })
							] })
						] }),
						view === "prices" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PriceEditor, {
							config: state.config,
							save,
							busy,
							t,
							reportError: setError
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PriceHistory, {
							state,
							restore: restorePrices,
							busy,
							t
						})] }),
						view === "ledger" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ObservablePanel, {
							sessions,
							state,
							t
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("辅助分析账本", "Auxiliary analysis ledger") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("仅记录本版本启用之后，通过插件发起的 AI 用量分析和轨迹分析。与原会话账本隔离；本地体检不计入。未上报用量与取消调用的暂定用量不会伪装为完整账单。", "Records plugin-initiated AI usage and trajectory analysis since this version was enabled. Separate from session accounting. Local inspection adds no entries. Missing or cancelled-call usage is not presented as a complete invoice.") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbMetricGrid",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("已知 Token", "Known Tokens") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(total(ledgerTotals(state.ledger).usage)) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("未知用量记录", "Unknown usage entries") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: ledgerTotals(state.ledger).unknown })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("暂定记录", "Provisional entries") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: ledgerTotals(state.ledger).provisional })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("已淘汰历史记录", "Evicted entries") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: state.evictedEntries })] })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
								label: t("按分析类型汇总", "Totals by analysis kind"),
								value: ledgerTotals(state.ledger).byKind
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "wbTable",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("开始时间", "Started") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("分析类型", "Analysis kind") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("状态", "Status") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: "Token" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("证据", "Evidence") })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: [...state.ledger].reverse().map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: entry.startedAt }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: entry.kind }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: entry.status }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: entry.usage ? number(total(entry.usage)) : "—" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: entry.finality })
								] }, entry.id)) })] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => download("auxiliary-analysis-ledger.json", JSON.stringify({
									schema: "dsh-token-usage/analysis-ledger-v1",
									entries: state.ledger,
									evictedEntries: state.evictedEntries
								}, null, 2), "application/json"),
								children: t("导出辅助账本", "Export analysis ledger")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("清空辅助账本", "Clear auxiliary ledger") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: t("确认永久清空本地辅助账本，不影响原会话账本", "Confirm permanent clearing of the auxiliary ledger only"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: clearConfirmed,
										onChange: (event) => setClearConfirmed(event.target.checked)
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									disabled: busy || !clearConfirmed,
									onClick: () => void run(async (signal) => {
										const result = await port.clear(signal);
										if (alive.current) {
											setState(result);
											setClearConfirmed(false);
										}
									}).catch(() => {}),
									children: t("确认清空辅助账本", "Confirm clear auxiliary ledger")
								})
							] })
						] })] }),
						view === "changes" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CostChanges, {
								sessions: filtered,
								config: state.config,
								days,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("消耗变化归因", "Usage change attribution") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("完整周期天数", "Complete-day window"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									value: days,
									onChange: (event) => setDays(Number(event.target.value)),
									children: [
										7,
										30,
										90
									].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value,
										children: value
									}, value))
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
								report.window.previousStart,
								" → ",
								report.window.start,
								" ",
								t("对比", "versus"),
								" ",
								report.window.start,
								" → ",
								report.window.end,
								" · UTC · ",
								t("右端日期不含在内，排除今天。", "End dates are exclusive; today is excluded.")
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbMetricGrid",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("前周期", "Previous") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(total(report.previous)) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("本周期", "Current") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(total(report.current)) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("差额", "Delta") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(report.delta) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("日期不明而排除的 Token", "Excluded undated Tokens") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: number(total(report.excludedUndated)) })] })
								]
							}),
							!report.complete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "status",
								children: t("仅比较日期可靠的子集，不能代表全部用量变化。", "Only the reliably dated subset is compared, not all usage.")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "wbTable",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("类别", "Bucket") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("前周期", "Previous") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("本周期", "Current") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("差额", "Delta") })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: report.buckets.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: word(row.key, t) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.previous) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.current) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.delta) })
								] }, row.key)) })] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "wbTable",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("模型路由", "Model route") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("前周期", "Previous") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("本周期", "Current") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("差额", "Delta") })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: report.routes.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: row.model ? `${row.provider} / ${row.model}` : t("路由未归属残差", "Unattributed route residual") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.previous) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.current) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.delta) })
								] }, JSON.stringify([row.provider, row.model]))) })] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "wbTable",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("贡献会话", "Contributing session") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("前周期", "Previous") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("本周期", "Current") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("差额", "Delta") })
								] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: report.contributors.slice(0, 100).map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										onClick: () => {
											chooseSession(row.id);
											setView("inspect");
										},
										children: sessions.find((session) => session.id === row.id)?.title ?? row.id
									}) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.previous) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.current) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: number(row.delta) })
								] }, row.id)) })] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("页面展示绝对变化最大的 100 个会话，导出包含全部贡献项。这里只做算术分解，不推断业务因果。", "The page shows the 100 largest absolute changes; exports contain all contributors. This is arithmetic decomposition, not causal attribution.") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: csv,
								children: t("导出完整变化 CSV", "Export full changes CSV")
							})
						] }),
						view === "projects" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Projects, {
							config: state.config,
							sessions,
							save,
							busy,
							t,
							selected,
							error: setError
						}),
						view === "scenario" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Scenario, {
							config: state.config,
							usage: snapshot?.totals.usage ?? usage,
							t
						}),
						view === "experiments" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Experiments, {
							config: state.config,
							snapshot,
							costs: validCosts,
							save,
							busy,
							t,
							reportError: setError
						}),
						view === "share" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("本地周报与只读联动", "Local weekly report and read-only integration") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("周报只包含时间窗口和数字统计，不含会话标题、路径、路由或正文。下载使用当前浏览筛选；同窗口事件使用全部可观测会话。", "Weekly reports contain only dates and numeric statistics, never session titles, paths, routes or content. Downloads follow browsing filters; same-window events use all observable sessions.") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbWeekly",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
										weekly.from,
										" — ",
										weekly.to,
										" UTC"
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: [number(weekly.tokens), " Token"] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										weekly.sessions,
										" ",
										t("活跃会话", "active sessions"),
										" · Δ ",
										number(weekly.delta)
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										t("缓存读取占输入", "Cache reads / input"),
										": ",
										weekly.cacheReadShare === null ? "—" : `${number(weekly.cacheReadShare * 100)}%`,
										" · ",
										weekly.complete ? t("日期覆盖完整", "Complete dated coverage") : t("仅可靠子集", "Reliable subset only")
									] })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wbActions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									onClick: () => download("token-weekly.svg", shareSvg(weekly, chinese), "image/svg+xml"),
									children: t("导出周报 SVG", "Export weekly SVG")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									onClick: () => download("token-weekly.json", JSON.stringify(weekly, null, 2), "application/json"),
									children: t("导出周报 JSON", "Export weekly JSON")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: t("允许同一页面中的插件读取脱敏数字摘要（默认关闭）", "Allow plugins in this page to read the numeric summary (off by default)"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									disabled: busy,
									checked: state.config.shareSummary,
									onChange: (event) => void save({
										...state.config,
										shareSummary: event.target.checked
									}).catch(() => {})
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OptimizationWeekly, {
								sessions,
								state,
								t,
								chinese
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("不开启 HTTP 服务，不接受跨窗口消息，不执行指令；关闭后停止发送新摘要。已经收到摘要的同页面代码无法被追回。", "No HTTP service, cross-window messages or command execution. Disabling stops new summaries; data already received by same-page code cannot be revoked.") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(JsonDetails, {
								label: t("将被共享的全部字段", "All shared fields"),
								value: shareSummary(sessions)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("同窗口集成示例", "Same-window integration example") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: "window.addEventListener('dsh-token-usage:summary-v2', event => {\n  console.log(event.detail); // allowlisted numeric summary\n});\nwindow.dispatchEvent(new Event('dsh-token-usage:summary-v2-request'));" })] })
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", { children: t("本地保存 · 不上传遥测 · 不替代提供方账单或人工验收", "Stored locally · No telemetry upload · Not a provider invoice or human acceptance") })
					] })
				]
			});
		}
		//#endregion
		//#region src/client/workbench/summary-bridge.ts
		/** Same-window requests only. The Host re-authorizes every response; both versions use an explicit whitelist. */
		function installSummaryBridge(target, port, sessions, now = () => Date.now(), output = () => numericOutput(null, now())) {
			const lifecycle = new AbortController();
			let inFlight = false, lastRequest = -Infinity;
			const listener = () => {
				if (lifecycle.signal.aborted || inFlight || now() - lastRequest < 1e3) return;
				lastRequest = now();
				inFlight = true;
				port.read(lifecycle.signal).then((state) => {
					if (lifecycle.signal.aborted || !state.config.shareSummary) return;
					const data = sessions();
					if (data !== null) {
						target.dispatchEvent(new CustomEvent("dsh-token-usage:summary", { detail: shareSummary(data, now()) }));
						target.dispatchEvent(new CustomEvent("dsh-token-usage:summary-v2", { detail: richSummary(data, state, output(), now()) }));
					}
				}).catch(() => {}).finally(() => {
					inFlight = false;
				});
			};
			target.addEventListener("dsh-token-usage:summary-request", listener);
			target.addEventListener("dsh-token-usage:summary-v2-request", listener);
			return () => {
				lifecycle.abort();
				target.removeEventListener("dsh-token-usage:summary-request", listener);
				target.removeEventListener("dsh-token-usage:summary-v2-request", listener);
			};
		}
		//#endregion
		//#region src/client/workbench/register.tsx
		function WorkbenchSection({ useSessions, port, getLanguage }) {
			const phase = useSessions((state) => state.phase);
			const ids = useSessions((state) => state.ids);
			const byId = useSessions((state) => state.byId);
			const data = (0, react.useMemo)(() => aggregateUsage(ids.map((id) => byId[id]).filter((value) => value !== void 0)), [ids, byId]);
			const chinese = getLanguage().toLowerCase().startsWith("zh");
			if (phase !== "ready") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "wbRoot",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: workbenchCss }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: chinese ? "会话索引尚未就绪；仅可查看已保存的离线收据。" : "The session index is not ready; only saved offline receipts are available."
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OfflineReceipts, {
						snapshot: void 0,
						t: (zh, en) => chinese ? zh : en
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkbenchApp, {
				port,
				sessions: data.sessions,
				chinese
			});
		}
		function registerWorkbench(ctx, connection, throughput) {
			const port = makeWorkbenchPort(async (endpoint, payload, signal) => {
				if (!connection.isLoopback) throw new Error("The usage workbench is available only from the local DSH page.");
				const result = await connection.rpc.call(TOKEN_USAGE_RPC_CHANNEL, endpoint, payload, signal);
				if (!result.ok) throw new Error(result.error.message);
				return result.value;
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "token-usage-workbench",
				order: 31,
				locale: NS,
				label: () => ctx.locale.getLocale().active.toLowerCase().startsWith("zh") ? "用量工作台" : "Usage workbench",
				inject: () => ({
					port,
					getLanguage: () => ctx.locale.getLocale().active
				})
			}, WorkbenchSection));
			ctx.effect(() => {
				if (typeof window === "undefined") return () => {};
				return installSummaryBridge(window, port, () => {
					const state = ctx.sessions.list.getSnapshot();
					if (state.phase !== "ready") return null;
					return aggregateUsage(state.ids.map((id) => state.byId[id]).filter((value) => value !== void 0)).sessions;
				}, () => Date.now(), () => numericOutput(throughput?.getSnapshot() ?? null));
			}, "token usage: opt-in same-window summary bridge");
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
			registerWorkbench(ctx, connection, throughput);
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