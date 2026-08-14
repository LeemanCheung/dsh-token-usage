window.__ModuleLoader__.load({
	id: "dsh-token-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:C:\Users\zhanglimin202307\Desktop\dsh\dsh-token-usage\src\client\TokenUsageSection.module.css.mjs
		const css = ".hGAOSW_section{width:100%;max-width:960px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:22px;display:flex}.hGAOSW_header h2,.hGAOSW_header p,.hGAOSW_block h3,.hGAOSW_status{margin:0}.hGAOSW_header h2{font-size:18px;font-weight:600;line-height:26px}.hGAOSW_header p{max-width:720px;color:var(--dsw-alias-label-tertiary);margin-top:5px;font-size:13px;line-height:20px}.hGAOSW_metrics{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;display:grid}.hGAOSW_metric{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:7px;min-width:0;padding:13px 14px;display:flex}.hGAOSW_metric span{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:16px;overflow:hidden}.hGAOSW_metric strong{font-variant-numeric:tabular-nums;text-overflow:ellipsis;font-size:20px;line-height:26px;overflow:hidden}.hGAOSW_activity{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-direction:column;gap:10px;min-width:0;padding:14px;display:flex}.hGAOSW_activityHead{justify-content:space-between;align-items:flex-end;gap:14px;display:flex}.hGAOSW_activityHead h3,.hGAOSW_activityHead p{margin:0}.hGAOSW_activityHead h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_activityHead p{color:var(--dsw-alias-label-tertiary);margin-top:2px;font-size:11px;line-height:17px}.hGAOSW_activityGrid{box-sizing:border-box;grid-template-rows:repeat(7,minmax(0,1fr));grid-template-columns:repeat(30,minmax(0,1fr));grid-auto-flow:column;gap:3px;width:100%;min-width:0;padding:2px;display:grid}.hGAOSW_activityGrid i,.hGAOSW_activityLegend i{background:var(--dsw-alias-bg-module-platform);border-radius:2px;flex:none;display:block}.hGAOSW_activityGrid i{aspect-ratio:1;width:100%;min-width:0}.hGAOSW_activityLegend i{width:10px;height:10px}.hGAOSW_activityGrid i[data-future=true]{background:0 0}.hGAOSW_activityGrid i[data-level=\"1\"],.hGAOSW_activityLegend i[data-level=\"1\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityGrid i[data-level=\"2\"],.hGAOSW_activityLegend i[data-level=\"2\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 42%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityGrid i[data-level=\"3\"],.hGAOSW_activityLegend i[data-level=\"3\"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 64%, var(--dsw-alias-bg-module-platform))}.hGAOSW_activityGrid i[data-level=\"4\"],.hGAOSW_activityLegend i[data-level=\"4\"]{background:var(--dsw-alias-state-business-primary)}.hGAOSW_activityLegend{color:var(--dsw-alias-label-tertiary);white-space:nowrap;align-items:center;gap:4px;font-size:10px;line-height:14px;display:flex}.hGAOSW_block{flex-direction:column;gap:10px;min-width:0;display:flex}.hGAOSW_block h3{font-size:14px;font-weight:600;line-height:22px}.hGAOSW_blockHead{justify-content:space-between;align-items:center;gap:16px;display:flex}.hGAOSW_blockHead input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:min(280px,45%);height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 11px;font-size:12px}.hGAOSW_blockHead input::placeholder{color:var(--dsw-alias-label-tertiary)}.hGAOSW_blockHead input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.hGAOSW_tableWrap{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;min-width:0;overflow:auto}.hGAOSW_tableWrap table{border-collapse:collapse;width:100%;min-width:0;font-size:12px;line-height:18px}.hGAOSW_tableWrap .hGAOSW_modelTable{table-layout:fixed;min-width:580px}.hGAOSW_tableWrap .hGAOSW_sessionTable{min-width:660px}.hGAOSW_modelTable th:first-child,.hGAOSW_modelTable td:first-child{width:30%}.hGAOSW_modelTable th:nth-child(2),.hGAOSW_modelTable td:nth-child(2){width:18%}.hGAOSW_tableWrap th,.hGAOSW_tableWrap td{border-bottom:1px solid var(--dsw-alias-border-l1);text-align:right;vertical-align:middle;white-space:nowrap;padding:10px 12px}.hGAOSW_tableWrap th{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500}.hGAOSW_tableWrap th:first-child,.hGAOSW_tableWrap td:first-child{text-align:left;max-width:270px}.hGAOSW_tableWrap tbody tr:last-child td{border-bottom:0}.hGAOSW_tableWrap tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}.hGAOSW_tableWrap td{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}.hGAOSW_tableWrap td strong,.hGAOSW_tableWrap td span{text-overflow:ellipsis;max-width:260px;display:block;overflow:hidden}.hGAOSW_tableWrap td strong{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600}.hGAOSW_tableWrap td span{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}.hGAOSW_tableWrap td .hGAOSW_tokenValue{max-width:none;color:inherit;font-size:inherit;line-height:inherit;display:inline}.hGAOSW_tableWrap td .hGAOSW_cacheDetail{margin-top:2px}.hGAOSW_status{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);border-radius:10px;padding:16px;font-size:13px;line-height:20px}@media (width<=860px){.hGAOSW_metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (width<=580px){.hGAOSW_metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.hGAOSW_activityHead,.hGAOSW_blockHead{flex-direction:column;align-items:stretch;gap:8px}.hGAOSW_blockHead input{width:100%}}";
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
			"status": "hGAOSW_status",
			"activity": "hGAOSW_activity",
			"block": "hGAOSW_block",
			"sessionTable": "hGAOSW_sessionTable",
			"cacheDetail": "hGAOSW_cacheDetail",
			"activityLegend": "hGAOSW_activityLegend",
			"header": "hGAOSW_header",
			"tokenValue": "hGAOSW_tokenValue",
			"tableWrap": "hGAOSW_tableWrap",
			"modelTable": "hGAOSW_modelTable",
			"blockHead": "hGAOSW_blockHead",
			"section": "hGAOSW_section",
			"metrics": "hGAOSW_metrics",
			"metric": "hGAOSW_metric",
			"activityHead": "hGAOSW_activityHead"
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
		function ActivityHeatmap({ days, t }) {
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
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
							role: "gridcell",
							"data-level": day.level,
							"data-future": day.future ? "true" : void 0,
							...details === void 0 ? {} : {
								title: details,
								"aria-label": details
							}
						}, day.date);
					})
				})]
			});
		}
		/** Render durable Token usage across all listed sessions. */
		function TokenUsageSection({ useSessions, t }) {
			const phase = useSessions((state) => state.phase);
			const ids = useSessions((state) => state.ids);
			const byId = useSessions((state) => state.byId);
			const [query, setQuery] = (0, react.useState)("");
			const data = (0, react.useMemo)(() => aggregateUsage(ids.map((id) => byId[id]).filter((value) => value !== void 0)), [byId, ids]);
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const filteredSessions = (0, react.useMemo)(() => data.sessions.filter((row) => {
				if (normalizedQuery.length === 0) return true;
				return row.title.toLocaleLowerCase().includes(normalizedQuery) || row.id.toLocaleLowerCase().includes(normalizedQuery) || row.models.some((model) => routeLabel(model).toLocaleLowerCase().includes(normalizedQuery));
			}), [data.sessions, normalizedQuery]);
			const billedInput = inputTokens(data.usage);
			const cacheHit = billedInput === 0 ? "—" : `${Math.round(data.usage.cacheReadTokens / billedInput * 100)}%`;
			if (phase !== "ready" && ids.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: TokenUsageSection_module_css_default.status,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: TokenUsageSection_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
					className: TokenUsageSection_module_css_default.header,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("intro") })] })
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivityHeatmap, {
						days: data.days,
						t
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
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("output") })
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
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TokenValue, { value: row.usage.outputTokens }) })
								] }, row.id)) })]
							})
						})]
					})
				] })]
			});
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
			activityIntro: "最近 30 周，颜色越深表示当日 Token 使用量越高。悬停查看明细。",
			activityTooltip: "{date}\n总计 {total} Token\n输入 {input} · 输出 {output}\n缓存：读 {cacheRead} · 写 {cacheWrite}",
			less: "少",
			more: "多",
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
			activityIntro: "Last 30 weeks. Darker cells represent higher daily Token usage. Hover for details.",
			activityTooltip: "{date}\nTotal {total} tokens\nInput {input} · Output {output}\nCache: read {cacheRead} · write {cacheWrite}",
			less: "Less",
			more: "More",
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
			loading: "Reading session usage…"
		};
		//#endregion
		//#region src/client/index.ts
		/** Client services required by the Settings contribution. */
		const inject = ["slots", "locale"];
		/** Contribute a localized Token usage page to Settings. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "token-usage: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "token-usage",
				order: 30,
				label: () => t("nav"),
				locale: NS
			}, TokenUsageSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map