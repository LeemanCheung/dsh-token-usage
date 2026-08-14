import { z } from "zod";
//#region src/projection.ts
const bucketsSchema = z.object({
	uncachedInputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
	cacheReadTokens: z.number().int().nonnegative(),
	cacheWriteTokens: z.number().int().nonnegative()
}).strict();
const projectionSchema = z.object({
	assistantRequests: z.number().int().nonnegative(),
	compactionRequests: z.number().int().nonnegative(),
	usage: bucketsSchema,
	models: z.array(z.object({
		provider: z.string(),
		model: z.string(),
		assistantRequests: z.number().int().nonnegative(),
		compactionRequests: z.number().int().nonnegative(),
		usage: bucketsSchema
	}).strict()),
	days: z.array(z.object({
		date: z.string(),
		usage: bucketsSchema
	}).strict())
}).strict();
/** Create detached zero buckets for projection state. */
function zeroBuckets() {
	return {
		uncachedInputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0
	};
}
/** Normalize optional provider fields into the four disjoint buckets. */
function bucketsFrom(usage) {
	return {
		uncachedInputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
		cacheReadTokens: usage.cacheReadTokens ?? 0,
		cacheWriteTokens: usage.cacheWriteTokens ?? 0
	};
}
/** Compare buckets without counting reasoning output a second time. */
function bucketsEqual(left, right) {
	return left.uncachedInputTokens === right.uncachedInputTokens && left.outputTokens === right.outputTokens && left.cacheReadTokens === right.cacheReadTokens && left.cacheWriteTokens === right.cacheWriteTokens;
}
/** Add or subtract one bucket set. */
function addBuckets(current, value, direction) {
	return {
		uncachedInputTokens: current.uncachedInputTokens + direction * value.uncachedInputTokens,
		outputTokens: current.outputTokens + direction * value.outputTokens,
		cacheReadTokens: current.cacheReadTokens + direction * value.cacheReadTokens,
		cacheWriteTokens: current.cacheWriteTokens + direction * value.cacheWriteTokens
	};
}
/** Stable UTC calendar day for one durable event timestamp. */
function dayKey(time) {
	return new Date(time).toISOString().slice(0, 10);
}
/** Add or remove one usage sample from a daily aggregation table. */
function adjustDay(days, day, usage, direction) {
	const next = addBuckets(days[day] ?? zeroBuckets(), usage, direction);
	if (bucketsEqual(next, zeroBuckets())) delete days[day];
	else days[day] = next;
}
/** Stable collision-free object key for one provider/model pair. */
function routeKey(route) {
	return JSON.stringify([route.provider, route.model]);
}
/** Whether a route record became empty after replacing its only sample. */
function recordEmpty(record) {
	return record.assistantRequests === 0 && record.compactionRequests === 0 && bucketsEqual(record.usage, zeroBuckets());
}
/** Apply one signed model-attributed usage sample to a cloned model table. */
function adjustModel(models, route, usage, direction, kind) {
	const key = routeKey(route);
	const current = models[key] ?? {
		...route,
		assistantRequests: 0,
		compactionRequests: 0,
		usage: zeroBuckets()
	};
	const next = {
		...current,
		assistantRequests: current.assistantRequests + (kind === "assistant" ? direction : 0),
		compactionRequests: current.compactionRequests + (kind === "compaction" ? direction : 0),
		usage: addBuckets(current.usage, usage, direction)
	};
	if (recordEmpty(next)) delete models[key];
	else models[key] = next;
}
/** Resolve the best durable route identity available on an assistant event. */
function assistantRoute(event, fallback) {
	if (event.type === "assistant/message" && event.data.message.source.kind === "model") return {
		provider: event.data.message.source.provider,
		model: event.data.message.source.model
	};
	return fallback ?? {
		provider: "unknown",
		model: "unknown"
	};
}
/** Total billed tokens across the four disjoint buckets. */
function totalTokens(usage) {
	return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.outputTokens;
}
/** Durable all-request token usage projection, including context compactions. */
const tokenUsageRecorderProjectionDefinition = {
	key: "tokenUsageRecorder",
	schema: projectionSchema,
	init: () => ({
		route: null,
		assistantRequests: 0,
		compactionRequests: 0,
		usage: zeroBuckets(),
		models: {},
		days: {},
		lastAssistant: null
	}),
	apply: (state, event) => {
		if (event.type === "request/context") {
			const route = {
				provider: event.data.provider,
				model: event.data.model
			};
			if (state.route?.provider === route.provider && state.route.model === route.model) return state;
			return {
				...state,
				route
			};
		}
		if (event.type === "request/header") {
			const route = {
				provider: event.data.header.config.provider,
				model: event.data.header.config.model
			};
			if (state.route?.provider === route.provider && state.route.model === route.model) return state;
			return {
				...state,
				route
			};
		}
		if (event.type === "llm/retry") {
			const current = state.lastAssistant;
			if (current === null || current.turn !== event.data.turn || current.step !== event.data.step) return state;
			return {
				...state,
				lastAssistant: null
			};
		}
		if (event.type === "compaction/summary" && event.data.usage !== void 0) {
			const usage = bucketsFrom(event.data.usage);
			const route = {
				provider: event.data.provider,
				model: event.data.model
			};
			const models = { ...state.models };
			const days = { ...state.days };
			adjustModel(models, route, usage, 1, "compaction");
			adjustDay(days, dayKey(event.time), usage, 1);
			return {
				...state,
				compactionRequests: state.compactionRequests + 1,
				usage: addBuckets(state.usage, usage, 1),
				models,
				days
			};
		}
		let turn;
		let step;
		let rawUsage;
		if (event.type === "assistant/chunk" && event.data.chunk.type === "usage") {
			turn = event.data.turn;
			step = event.data.step;
			rawUsage = event.data.chunk.usage;
		} else if (event.type === "assistant/message" && event.data.usage !== void 0) {
			turn = event.data.turn;
			step = event.data.step;
			rawUsage = event.data.usage;
		} else return state;
		const route = assistantRoute(event, state.route);
		const day = dayKey(event.time);
		const usage = bucketsFrom(rawUsage);
		const previous = state.lastAssistant !== null && state.lastAssistant.turn === turn && state.lastAssistant.step === step ? state.lastAssistant : null;
		if (previous !== null && previous.route.provider === route.provider && previous.route.model === route.model && bucketsEqual(previous.usage, usage)) return state;
		const models = { ...state.models };
		const days = { ...state.days };
		let total = state.usage;
		if (previous !== null) {
			total = addBuckets(total, previous.usage, -1);
			adjustModel(models, previous.route, previous.usage, -1, "assistant");
			adjustDay(days, previous.day, previous.usage, -1);
		}
		total = addBuckets(total, usage, 1);
		adjustModel(models, route, usage, 1, "assistant");
		adjustDay(days, day, usage, 1);
		return {
			...state,
			assistantRequests: state.assistantRequests + (previous === null ? 1 : 0),
			usage: total,
			models,
			days,
			lastAssistant: {
				turn,
				step,
				route,
				day,
				usage
			}
		};
	},
	view: (state) => ({
		assistantRequests: state.assistantRequests,
		compactionRequests: state.compactionRequests,
		usage: state.usage,
		models: Object.values(state.models).sort((left, right) => totalTokens(right.usage) - totalTokens(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
		days: Object.entries(state.days).map(([date, usage]) => ({
			date,
			usage
		})).sort((left, right) => left.date.localeCompare(right.date))
	}),
	stateVersion: 3
};
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "token-usage-recorder";
/** Host services required for projection registration and historical replay. */
const inject = [
	"sessionProjections",
	"sessionProjectionCache",
	"sessionQuery",
	"sessions"
];
/** Refresh one readable session without letting an operational failure stop later records or leave an attach race stale. */
async function warmRecord(ctx, record, signal) {
	try {
		const live = ctx.sessions.get(record.header.id);
		if (live !== void 0) await ctx.sessionProjectionCache.write(live);
		else if (record.persisted) {
			await ctx.sessionProjectionCache.coldSnapshot(record.header.id, signal);
			if (signal.aborted) return;
			const attached = ctx.sessions.get(record.header.id);
			if (attached !== void 0) await ctx.sessionProjectionCache.write(attached);
		}
	} catch (error) {
		if (signal.aborted) return;
		ctx.logger.warn(`token usage: failed to refresh session "${record.header.id}": ${String(error)}`);
	}
}
/** Populate the new projection's cache sequentially without delaying plugin activation. */
async function warmHistory(ctx, signal) {
	let records;
	try {
		records = await ctx.sessionQuery.listSessions(signal);
	} catch (error) {
		if (signal.aborted) return;
		ctx.logger.warn(`token usage: failed to list historical sessions: ${String(error)}`);
		return;
	}
	for (const record of records) {
		if (signal.aborted) return;
		await warmRecord(ctx, record, signal);
	}
}
/** Register the projection and start cancellable fail-soft history warming. */
function apply(ctx) {
	ctx.sessionProjections.register(tokenUsageRecorderProjectionDefinition);
	ctx.effect(() => {
		const controller = new AbortController();
		const operation = warmHistory(ctx, controller.signal);
		return async () => {
			controller.abort(/* @__PURE__ */ new Error("token usage plugin disposed"));
			await operation;
		};
	}, "token usage: warm historical projections");
}
//#endregion
export { apply, inject, name };
