import z from "@deepseek-ai/schemastery";
import { SessionId } from "@deepseek-ai/dsh-session";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { z as z$1 } from "zod";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
//#region src/budget-settings.ts
/** User-owned settings namespace for the Token usage dashboard. */
const TOKEN_USAGE_SETTINGS_NAMESPACE = "token-usage";
//#endregion
//#region src/projection.ts
const bucketsSchema = z$1.object({
	uncachedInputTokens: z$1.number().int().nonnegative(),
	outputTokens: z$1.number().int().nonnegative(),
	cacheReadTokens: z$1.number().int().nonnegative(),
	cacheWriteTokens: z$1.number().int().nonnegative()
}).strict();
const projectionSchema = z$1.object({
	assistantRequests: z$1.number().int().nonnegative(),
	compactionRequests: z$1.number().int().nonnegative(),
	usage: bucketsSchema,
	models: z$1.array(z$1.object({
		provider: z$1.string(),
		model: z$1.string(),
		assistantRequests: z$1.number().int().nonnegative(),
		compactionRequests: z$1.number().int().nonnegative(),
		usage: bucketsSchema
	}).strict()),
	days: z$1.array(z$1.object({
		date: z$1.string(),
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
function totalTokens$1(usage) {
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
		models: Object.values(state.models).sort((left, right) => totalTokens$1(right.usage) - totalTokens$1(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)),
		days: Object.entries(state.days).map(([date, usage]) => ({
			date,
			usage
		})).sort((left, right) => left.date.localeCompare(right.date))
	}),
	stateVersion: 3
};
//#endregion
//#region src/trajectory-analysis.ts
const MAX_EVENT_CHARS = 2e3;
const MAX_TRAJECTORY_CHARS = 96e3;
const MAX_COLLECTION_ITEMS = 16;
const MAX_OBJECT_DEPTH = 5;
const ANALYSIS_MAX_TOKENS = 3e3;
/** Return whether a value is a JSON-like object. */
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Replace credential-shaped values before a trajectory enters an auxiliary model request. */
function redactTrajectoryText(value) {
	return value.replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, "<private-key-redacted>").replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer <redacted>").replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "<jwt-redacted>").replace(/\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16})\b/g, "<token-redacted>").replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-<redacted>").replace(/((?:api[_-]?key|password|secret|credential|authorization|access[_-]?token|refresh[_-]?token)\s*[=:]\s*)[^\s,;"']+/gi, "$1<redacted>");
}
const SAFE_TOKEN_ACCOUNTING_KEYS = new Set([
	"inputtokens",
	"outputtokens",
	"cachereadtokens",
	"cachewritetokens",
	"reasoningtokens",
	"maxtokens",
	"tokencount",
	"shadowedtokencount",
	"tokensperminute"
]);
/** Whether an object property commonly carries a credential rather than usage accounting. */
function sensitiveKey(key) {
	const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
	if (SAFE_TOKEN_ACCOUNTING_KEYS.has(normalized)) return false;
	return normalized.includes("apikey") || normalized.includes("authorization") || normalized.includes("password") || normalized.includes("secret") || normalized.includes("credential") || normalized.endsWith("token");
}
/** Build a small detached JSON value for model inspection without retaining unbounded payloads. */
function sanitize(value, depth = 0) {
	if (depth >= MAX_OBJECT_DEPTH) return "<depth-limit>";
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) try {
			return JSON.stringify(sanitize(JSON.parse(trimmed), depth + 1)).slice(0, MAX_EVENT_CHARS);
		} catch (_nonJsonToolArgument) {}
		return redactTrajectoryText(value).slice(0, MAX_EVENT_CHARS);
	}
	if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
	if (Array.isArray(value)) {
		const items = value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitize(item, depth + 1));
		if (value.length > MAX_COLLECTION_ITEMS) items.push(`<${value.length - MAX_COLLECTION_ITEMS} more items>`);
		return items;
	}
	if (!isRecord$1(value)) return String(value);
	return Object.fromEntries(Object.entries(value).slice(0, MAX_COLLECTION_ITEMS).map(([key, child]) => [key, sensitiveKey(key) ? "<redacted>" : sanitize(child, depth + 1)]));
}
/** Sum provider-reported usage into the plugin's disjoint buckets. */
function addUsage(target, value) {
	if (!isRecord$1(value)) return;
	const number = (key) => {
		const candidate = value[key];
		return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : 0;
	};
	target.uncachedInputTokens += number("inputTokens");
	target.outputTokens += number("outputTokens");
	target.cacheReadTokens += number("cacheReadTokens");
	target.cacheWriteTokens += number("cacheWriteTokens");
}
/** Count one turn-end reason as failed unless it completed normally. */
function completedReason(value) {
	return isRecord$1(value) && value.kind === "completed";
}
/** Convert one event to a compact trajectory row; raw streaming chunks are summarized separately. */
function eventRow(event) {
	if (String(event.type) === "assistant/chunk") return void 0;
	const data = isRecord$1(event.data) ? event.data : {};
	const location = {
		...typeof data.turn === "number" ? { turn: data.turn } : {},
		...typeof data.step === "number" ? { step: data.step } : {}
	};
	const row = {
		seq: event.seq,
		time: new Date(event.time).toISOString(),
		type: String(event.type),
		...Object.keys(location).length === 0 ? {} : { location },
		data: sanitize(data)
	};
	const serialized = JSON.stringify(row);
	if (serialized.length <= MAX_EVENT_CHARS) return serialized;
	return JSON.stringify({
		seq: event.seq,
		time: new Date(event.time).toISOString(),
		type: String(event.type),
		...Object.keys(location).length === 0 ? {} : { location },
		dataPreview: serialized.slice(0, Math.floor(MAX_EVENT_CHARS * .7)),
		truncated: true
	});
}
/** Compute deterministic trajectory metrics and a bounded model-facing timeline. */
function prepareTrajectory(events) {
	const usage = {
		uncachedInputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0
	};
	let turnCount = 0;
	let completedTurns = 0;
	let failedTurns = 0;
	let stepCount = 0;
	let assistantRequests = 0;
	let toolCalls = 0;
	let toolErrors = 0;
	let retries = 0;
	let compactions = 0;
	let approvalsAsked = 0;
	let approvalsRejected = 0;
	let subagents = 0;
	let omittedChunkEvents = 0;
	const rows = [];
	for (const event of events) {
		const type = String(event.type);
		const data = isRecord$1(event.data) ? event.data : {};
		switch (type) {
			case "turn/start":
				turnCount += 1;
				break;
			case "turn/end":
				if (completedReason(data.reason)) completedTurns += 1;
				else failedTurns += 1;
				break;
			case "step/start":
				stepCount += 1;
				break;
			case "assistant/message":
				assistantRequests += 1;
				addUsage(usage, data.usage);
				break;
			case "assistant/chunk":
				omittedChunkEvents += 1;
				break;
			case "tool/call":
				toolCalls += 1;
				break;
			case "tool/result":
				if (data.error !== void 0) toolErrors += 1;
				break;
			case "llm/retry":
				retries += 1;
				break;
			case "compaction/summary":
				compactions += 1;
				addUsage(usage, data.usage);
				break;
			case "approval/asked":
				approvalsAsked += 1;
				break;
			case "approval/decided":
				if (isRecord$1(data.outcome) ? data.outcome.kind !== "allowed-once" : data.outcome !== "allowed-once") approvalsRejected += 1;
				break;
			case "subagent/descriptor":
				subagents += 1;
				break;
		}
		const row = eventRow(event);
		if (row !== void 0) rows.push(row);
	}
	const firstTime = events[0]?.time;
	const lastTime = events.at(-1)?.time;
	const durationMs = firstTime === void 0 || lastTime === void 0 ? 0 : Math.max(0, lastTime - firstTime);
	const totalTokens = usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
	const minutes = durationMs / 6e4;
	const metrics = {
		eventCount: events.length,
		includedEventCount: rows.length,
		omittedChunkEvents,
		turnCount,
		completedTurns,
		failedTurns,
		stepCount,
		assistantRequests,
		toolCalls,
		toolErrors,
		retries,
		compactions,
		approvalsAsked,
		approvalsRejected,
		subagents,
		durationMs,
		eventsPerMinute: minutes > 0 ? Number((events.length / minutes).toFixed(2)) : 0,
		tokensPerMinute: minutes > 0 ? Number((totalTokens / minutes).toFixed(2)) : 0,
		usage
	};
	const head = [];
	const tail = [];
	let headChars = 0;
	let tailChars = 0;
	const headBudget = Math.floor(MAX_TRAJECTORY_CHARS * .65);
	const tailBudget = MAX_TRAJECTORY_CHARS - headBudget;
	for (const row of rows) {
		if (headChars + row.length + 1 > headBudget) break;
		head.push(row);
		headChars += row.length + 1;
	}
	for (let index = rows.length - 1; index >= head.length; index -= 1) {
		const row = rows[index];
		if (row === void 0 || tailChars + row.length + 1 > tailBudget) break;
		tail.unshift(row);
		tailChars += row.length + 1;
	}
	const truncated = head.length + tail.length < rows.length;
	const timeline = truncated ? `${head.join("\n")}\n{"type":"trajectory/truncated","omittedRows":${rows.length - head.length - tail.length}}\n${tail.join("\n")}` : rows.join("\n");
	return {
		metrics: truncated ? {
			...metrics,
			includedEventCount: head.length + tail.length
		} : metrics,
		timeline,
		truncated
	};
}
/** Translate an unsuccessful terminal model finish into one user-visible analysis error. */
function finishError$1(finish) {
	switch (finish.kind) {
		case "stop": return;
		case "error":
		case "aborted": return Object.assign(new Error(finish.failure.message), { code: finish.failure.code });
		case "max-tokens": return /* @__PURE__ */ new Error("Trajectory analysis reached its output limit. Please retry with a shorter session.");
		case "tool-calls": return /* @__PURE__ */ new Error("Trajectory analysis model unexpectedly requested a tool.");
		default: return /* @__PURE__ */ new Error(`Unsupported model finish reason: ${String(finish.kind)}`);
	}
}
/** Convert auxiliary-call usage into dashboard-compatible buckets. */
function analysisUsage$1(value) {
	return value === void 0 ? void 0 : {
		uncachedInputTokens: value.inputTokens,
		outputTokens: value.outputTokens,
		cacheReadTokens: value.cacheReadTokens ?? 0,
		cacheWriteTokens: value.cacheWriteTokens ?? 0
	};
}
/** Create the model instruction for the requested report language and analysis dimensions. */
function systemPrompt$1(language) {
	const chinese = language.toLowerCase().startsWith("zh");
	return `You are a senior AI-agent observability, security, and performance auditor. Analyze one DeepSeek Harness session trajectory.\n\nWrite the report in ${chinese ? "简体中文" : "English"} as concise Markdown. Use these exact top-level sections:\n${chinese ? "1. 执行摘要\n2. 调用链与委派\n3. 合规与安全审查\n4. 异常与故障恢复\n5. 速率、延迟与吞吐\n6. Token、缓存与上下文效率\n7. 工具与子代理成效\n8. 可靠性与生命周期完整性\n9. 分级改进建议" : "1. Executive summary\n2. Call chain and delegation\n3. Compliance and safety review\n4. Anomalies and failure recovery\n5. Rate, latency, and throughput\n6. Token, cache, and context efficiency\n7. Tool and subagent effectiveness\n8. Reliability and lifecycle integrity\n9. Prioritized recommendations"}\n\nRequirements:\n- Ground every material claim in event seq numbers, event types, or supplied metrics.\n- Distinguish observed facts from hypotheses. Never invent policy violations, timings, costs, or missing events.\n- Review approval decisions, sandbox or permission changes, possible secret exposure, destructive actions, and whether tool use matches user intent.\n- Detect retries, repeated calls, loops, orphaned calls/results, interrupted turns, compaction pressure, model switches, bursty activity, stalls, and recovery behavior.\n- Explain rates in context; a high rate is not automatically bad.\n- Include a compact Mermaid flowchart for the principal call chain when the evidence supports it.\n- End with 3-7 recommendations ranked P0/P1/P2, each tied to evidence and an expected benefit.\n- Treat redacted and truncated markers as unavailable evidence, not suspicious behavior.`;
}
/** Analyze one immutable trajectory through a user-selected registered model route. */
async function analyzeTrajectory(ctx, sessionId, events, selection, language, signal) {
	signal.throwIfAborted();
	const prepared = prepareTrajectory(events);
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: `Session: ${sessionId}\nDeterministic metrics:\n${JSON.stringify(prepared.metrics, null, 2)}\n\nBounded trajectory (JSON Lines):\n${prepared.timeline}`
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-token-usage"
		}
	})];
	const preparedCall = await ctx.llm.prepareCall({
		provider: selection.provider,
		model: selection.model,
		maxTokens: ANALYSIS_MAX_TOKENS
	}, signal);
	const assembler = new BlockAssembler();
	for await (const chunk of preparedCall.stream({
		...preparedCall.config,
		messages,
		system: systemPrompt$1(language),
		sessionId,
		signal
	})) {
		signal.throwIfAborted();
		assembler.push(chunk);
	}
	signal.throwIfAborted();
	const terminalError = finishError$1(assembler.finish);
	if (terminalError !== void 0) throw terminalError;
	const blocks = assembler.blocks();
	if (blocks.some((block) => block.type === "tool-call")) throw new Error("Trajectory analysis must return text only.");
	const report = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (report.length === 0) throw new Error("Trajectory analysis model returned no report text.");
	const auxiliaryUsage = analysisUsage$1(assembler.usage);
	return {
		schema: "dsh-token-usage/trajectory-analysis-v1",
		sessionId: String(sessionId),
		generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		model: {
			provider: preparedCall.config.provider,
			model: preparedCall.config.model
		},
		truncated: prepared.truncated,
		metrics: prepared.metrics,
		...auxiliaryUsage === void 0 ? {} : { analysisUsage: auxiliaryUsage },
		report
	};
}
//#endregion
//#region src/usage-analysis.ts
const MAX_ANALYSIS_TOKENS = 2600;
const MAX_MODEL_ROWS = 48;
/** Return one four-bucket sum without retaining a source reference. */
function totalTokens(usage) {
	return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}
/** Return a small detached usage bucket. */
function copyUsage(usage) {
	return {
		uncachedInputTokens: usage.uncachedInputTokens,
		outputTokens: usage.outputTokens,
		cacheReadTokens: usage.cacheReadTokens,
		cacheWriteTokens: usage.cacheWriteTokens
	};
}
/** Select the largest model routes in stable contribution order. */
function modelEvidence(models) {
	return models.slice().sort((left, right) => totalTokens(right.usage) - totalTokens(left.usage) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model)).slice(0, MAX_MODEL_ROWS).map((model) => ({
		provider: model.provider,
		model: model.model,
		assistantRequests: model.assistantRequests,
		compactionRequests: model.compactionRequests,
		usage: copyUsage(model.usage)
	}));
}
/** Select the latest UTC date records in chronological order. */
function dailyEvidence(days) {
	return days.slice().sort((left, right) => left.date.localeCompare(right.date)).slice(-366).map((day) => ({
		date: day.date,
		usage: copyUsage(day.usage)
	}));
}
/** Build the only aggregate evidence supplied to the selected model. */
function usageAnalysisEvidence(input) {
	return {
		usage: copyUsage(input.usage),
		models: modelEvidence(input.models),
		days: dailyEvidence(input.days)
	};
}
/** Convert provider usage from one auxiliary call into dashboard-compatible buckets. */
function analysisUsage(value) {
	return value === void 0 ? void 0 : {
		uncachedInputTokens: value.inputTokens,
		outputTokens: value.outputTokens,
		cacheReadTokens: value.cacheReadTokens ?? 0,
		cacheWriteTokens: value.cacheWriteTokens ?? 0
	};
}
/** Return a terminal model error when the stream did not finish normally. */
function finishError(reason) {
	if (reason === void 0 || reason.kind === "stop") return void 0;
	return /* @__PURE__ */ new Error(`Usage analysis model finished with ${reason.kind}.`);
}
/** Create a constrained, evidence-first Token efficiency review instruction. */
function systemPrompt(language) {
	const chinese = language.toLowerCase().startsWith("zh");
	return `You are a senior LLM FinOps and performance analyst. Analyze aggregate DeepSeek Harness Token-usage evidence only.\n\nWrite concise Markdown in ${chinese ? "简体中文" : "English"} with these exact top-level sections:\n${chinese ? "1. 用量概览\n2. 输入、输出与缓存效率\n3. 模型与路由贡献\n4. 时间趋势、峰值与波动\n5. 风险与不确定性\n6. 分级优化建议\n7. 后续观测重点" : "1. Usage overview\n2. Input, output, and cache efficiency\n3. Model and route contribution\n4. Time trends, peaks, and volatility\n5. Risks and uncertainty\n6. Prioritized optimization recommendations\n7. Next measurement focus"}\n\nRequirements:\n- Use only the supplied aggregate Token buckets, model routes, request counts, compaction counts, and UTC daily records. Do not claim to have session titles, prompts, responses, prices, latency, quality, or user intent.\n- State the evidence behind each material claim with an exact bucket, route, UTC date, count, or trend. Distinguish facts from hypotheses.\n- Explain uncached input, output, cache reads, and cache writes separately. Do not treat cache reads as free or claim a monetary cost without price data.\n- Analyze concentration, compaction pressure, cache behavior, output-to-input balance, peaks, volatility, and changes in the supplied date coverage.\n- End the optimization section with 3-7 P0/P1/P2 recommendations. For each give evidence, expected Token-efficiency benefit, confidence, and implementation effort.\n- When the evidence is insufficient, say what additional aggregate measurement would resolve it. Never invent savings, costs, or causal explanations.`;
}
/** Analyze bounded aggregate Token usage through one user-selected model route. */
async function analyzeTokenUsage(ctx, input, selection, language, signal) {
	signal.throwIfAborted();
	const evidence = usageAnalysisEvidence(input);
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: `Aggregate Token usage evidence (no session identifiers or content):\n${JSON.stringify(evidence)}`
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-token-usage"
		}
	})];
	const preparedCall = await ctx.llm.prepareCall({
		provider: selection.provider,
		model: selection.model,
		maxTokens: MAX_ANALYSIS_TOKENS
	}, signal);
	const assembler = new BlockAssembler();
	for await (const chunk of preparedCall.stream({
		...preparedCall.config,
		messages,
		system: systemPrompt(language),
		signal
	})) {
		signal.throwIfAborted();
		assembler.push(chunk);
	}
	signal.throwIfAborted();
	const terminalError = finishError(assembler.finish);
	if (terminalError !== void 0) throw terminalError;
	const blocks = assembler.blocks();
	if (blocks.some((block) => block.type === "tool-call")) throw new Error("Token usage analysis must return text only.");
	const report = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (report.length === 0) throw new Error("Token usage analysis model returned no report text.");
	const auxiliaryUsage = analysisUsage(assembler.usage);
	return {
		schema: "dsh-token-usage/usage-analysis-v1",
		generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		model: {
			provider: preparedCall.config.provider,
			model: preparedCall.config.model
		},
		...auxiliaryUsage === void 0 ? {} : { analysisUsage: auxiliaryUsage },
		report
	};
}
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "token-usage-recorder";
/** Host services required for projection registration and historical replay. */
const inject = [
	"sessionProjections",
	"sessionProjectionCache",
	"sessionQuery",
	"sessions",
	"sessionPersistence",
	"settings",
	"connection",
	"llm",
	"agentDefaultModel"
];
const BUDGET_NAMESPACE = settingsNamespace(TOKEN_USAGE_SETTINGS_NAMESPACE);
const BudgetSettingsSchema = z.object({ rolling30DayBudget: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(0) });
/** Read one safe whole-token budget from a client RPC payload. */
function budgetFrom(payload) {
	if (typeof payload !== "object" || payload === null) return void 0;
	const budget = payload.rolling30DayBudget;
	return typeof budget === "number" && Number.isSafeInteger(budget) && budget >= 0 ? budget : void 0;
}
/** Build one standard internal error response for the private loopback channel. */
function rpcError(message) {
	return {
		ok: false,
		error: {
			code: "internal",
			message,
			details: {}
		}
	};
}
/** Build one settings-rejected response for an invalid budget preference. */
function budgetError(message) {
	return {
		ok: false,
		error: {
			code: "settings-rejected",
			message,
			details: { ns: BUDGET_NAMESPACE }
		}
	};
}
/** Return whether one wire value is a plain JSON record. */
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Read one bounded string from a client wire record. */
function text(value, maximum, allowEmpty = false) {
	return typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0) ? value : void 0;
}
/** Read one non-negative whole Token count from the client wire. */
function count(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
/** Read exactly four detached Token buckets from the client wire. */
function usageFrom(payload) {
	if (!isRecord(payload)) return void 0;
	const uncachedInputTokens = count(payload.uncachedInputTokens);
	const outputTokens = count(payload.outputTokens);
	const cacheReadTokens = count(payload.cacheReadTokens);
	const cacheWriteTokens = count(payload.cacheWriteTokens);
	if (uncachedInputTokens === void 0 || outputTokens === void 0 || cacheReadTokens === void 0 || cacheWriteTokens === void 0) return void 0;
	return {
		uncachedInputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens
	};
}
/** Read one detached model aggregate from the client wire. */
function modelUsageFrom(payload) {
	if (!isRecord(payload)) return void 0;
	const provider = text(payload.provider, 256, true);
	const model = text(payload.model, 256, true);
	const assistantRequests = count(payload.assistantRequests);
	const compactionRequests = count(payload.compactionRequests);
	const usage = usageFrom(payload.usage);
	if (provider === void 0 || model === void 0 || assistantRequests === void 0 || compactionRequests === void 0 || usage === void 0) return void 0;
	return {
		provider,
		model,
		assistantRequests,
		compactionRequests,
		usage
	};
}
/** Read one UTC calendar-day aggregate from the client wire. */
function dailyUsageFrom(payload) {
	if (!isRecord(payload)) return void 0;
	const date = text(payload.date, 10);
	const usage = usageFrom(payload.usage);
	if (date === void 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || usage === void 0) return void 0;
	const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return void 0;
	return {
		date,
		usage
	};
}
/** Read one model route selected from the server-provided integrated-model catalog. */
function modelSelectionFrom(payload) {
	if (!isRecord(payload)) return void 0;
	const provider = text(payload.provider, 256);
	const model = text(payload.model, 256);
	return provider === void 0 || model === void 0 ? void 0 : {
		provider,
		model
	};
}
/** Read and validate one trajectory-analysis request from the private wire. */
function trajectoryAnalysisRequest(payload) {
	if (!isRecord(payload)) return void 0;
	const sessionId = text(payload.sessionId, 256);
	const language = text(payload.language, 32);
	const model = modelSelectionFrom(payload.model);
	if (sessionId === void 0 || language === void 0 || model === void 0) return void 0;
	return {
		sessionId: SessionId(sessionId),
		language,
		model
	};
}
/** Read and validate one aggregate-only Token usage analysis request. */
function usageAnalysisRequest(payload) {
	if (!isRecord(payload)) return void 0;
	const language = text(payload.language, 32);
	const model = modelSelectionFrom(payload.model);
	const input = payload.input;
	if (language === void 0 || model === void 0 || !isRecord(input)) return void 0;
	const usage = usageFrom(input.usage);
	const rawModels = input.models;
	const rawDays = input.days;
	if (usage === void 0 || !Array.isArray(rawModels) || rawModels.length > 512 || !Array.isArray(rawDays) || rawDays.length > 3660) return;
	const models = rawModels.map(modelUsageFrom);
	const days = rawDays.map(dailyUsageFrom);
	if (models.some((model) => model === void 0) || days.some((day) => day === void 0)) return void 0;
	return {
		language,
		model,
		input: {
			usage,
			models,
			days
		}
	};
}
/** List every registered model the user may explicitly select for an auxiliary analysis. */
async function analysisModels(ctx) {
	const groups = await Promise.all(ctx.llm.listProviders().map(async (provider) => {
		try {
			return (await ctx.llm.listModels(provider.id)).map((model) => ({
				provider: provider.id,
				providerName: provider.name,
				model: model.id,
				modelName: model.name
			}));
		} catch (error) {
			ctx.logger.warn(`token usage: failed to list analysis models for "${provider.id}": ${String(error)}`);
			return [];
		}
	}));
	const seen = /* @__PURE__ */ new Set();
	return groups.flat().filter((entry) => {
		const key = `${entry.provider}\u0000${entry.model}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	}).sort((left, right) => left.providerName.localeCompare(right.providerName) || left.modelName.localeCompare(right.modelName) || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model));
}
/** Return whether a user-selected route still belongs to the integrated-model catalog. */
function isKnownModel(models, selection) {
	return models.some((model) => model.provider === selection.provider && model.model === selection.model);
}
/** Expose persistent preferences and explicit configured-model trajectory analysis to the local Web client. */
function installRpc(ctx) {
	const budget = ctx.settings.register(BUDGET_NAMESPACE, BudgetSettingsSchema);
	ctx.effect(() => {
		const lifecycle = new AbortController();
		const dispose = ctx.connection.rpc.handle("/token-usage", async (endpoint, payload, signal) => {
			const operationSignal = AbortSignal.any([signal, lifecycle.signal]);
			switch (endpoint) {
				case "budget/read": return {
					ok: true,
					value: budget.get()
				};
				case "budget/write": {
					const rolling30DayBudget = budgetFrom(payload);
					if (rolling30DayBudget === void 0) return budgetError("Budget must be a non-negative whole Token count.");
					try {
						await budget.update({ rolling30DayBudget });
					} catch (error) {
						return budgetError(error instanceof Error ? error.message : String(error));
					}
					return {
						ok: true,
						value: budget.get()
					};
				}
				case "analysis/models": {
					const models = await analysisModels(ctx);
					const defaultSelection = ctx.agentDefaultModel.currentSelection();
					return {
						ok: true,
						value: {
							models,
							...isKnownModel(models, defaultSelection) ? { default: {
								provider: defaultSelection.provider,
								model: defaultSelection.model
							} } : {}
						}
					};
				}
				case "usage/analyze": {
					const request = usageAnalysisRequest(payload);
					if (request === void 0) return rpcError("A valid aggregate Token usage payload, selected model, and language are required.");
					try {
						if (!isKnownModel(await analysisModels(ctx), request.model)) return rpcError("Select one of the currently integrated models before starting analysis.");
						return {
							ok: true,
							value: await analyzeTokenUsage(ctx, request.input, request.model, request.language, operationSignal)
						};
					} catch (error) {
						if (operationSignal.aborted) throw error;
						return rpcError(error instanceof Error ? error.message : String(error));
					}
				}
				case "trajectory/analyze": {
					const request = trajectoryAnalysisRequest(payload);
					if (request === void 0) return rpcError("A valid session id, selected model, and language are required.");
					try {
						if (!isKnownModel(await analysisModels(ctx), request.model)) return rpcError("Select one of the currently integrated models before starting analysis.");
						const events = ctx.sessions.get(request.sessionId)?.events ?? (await ctx.sessionPersistence.inspect(request.sessionId, operationSignal)).events;
						if (events.length === 0) return rpcError("This session has no trajectory events to analyze.");
						return {
							ok: true,
							value: await analyzeTrajectory(ctx, request.sessionId, events, request.model, request.language, operationSignal)
						};
					} catch (error) {
						if (operationSignal.aborted) throw error;
						return rpcError(error instanceof Error ? error.message : String(error));
					}
				}
				default: return rpcError(`Unknown Token usage endpoint: ${endpoint}`);
			}
		}, { authority: "loopback" });
		return async () => {
			lifecycle.abort(/* @__PURE__ */ new Error("token usage plugin disposed"));
			await dispose();
		};
	}, "token usage: private RPC");
}
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
	installRpc(ctx);
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
