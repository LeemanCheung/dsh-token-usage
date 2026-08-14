# dsh-token-usage

`dsh-token-usage` 是一个 DSH Host + Web Cordis 插件，用持久会话日志生成 Token 使用记录，并在设置中提供统计页。

## 功能

- 汇总输入、输出、缓存读取与缓存写入 Token。
- 按 provider/model 聚合普通对话请求、同一步骤内的每次模型重试和上下文压缩请求。
- 按会话列出历史记录、最近活动时间和使用模型，并按实际请求日期生成最近 52 周的 Token 活跃度热力图。
- 启动后在后台顺序回放历史会话并写入 DSH projection cache，后续随会话事件增量更新；卸载会取消并等待正在进行的回放。
- 不复制或保存提示词、回复正文；事实来源仍是 DSH 自己的 session log。

`reasoningTokens` 已包含在 `outputTokens` 中，不会重复计入总量。总输入为未缓存输入、缓存读取和缓存写入三个互斥 bucket 之和。

## 安装

从 GitHub 安装：

```powershell
dsh plugin --profile web add github:LeemanCheung/dsh-token-usage
```

本机源码开发时，在本目录的上一级运行：

```powershell
dsh plugin --profile web add ./dsh-token-usage
```

安装后重启当前 `dsh web` 进程并刷新 `http://127.0.0.1:3080`，然后打开“设置 → Token 用量”。本地安装使用 `link:` 指向本源码目录。只有 Client HMR receiver 与同一 DSH checkout 的 `pnpm run dev:web` 构建监听器同时运行时，重新构建的 `lib/client.js` 才会自动加载；否则需要重启并刷新。

## 开发

这是一个本机源码插件，不发布到 npm；本机源码与 DSH checkout 并排放置，因此 `tsdown.config.ts` 复用 DSH 的官方 Client bundle preset。构建产物为 `lib/index.js` 与 `lib/client.js`。

## 限制

历史列表依赖 DSH 的 session projection cache；插件启动时会尽力回放并刷新所有可读取会话。预热完成前，页面会把仅有 DSH 内置 projection 的总量列为“未归因用量”，刷新后即可读取新缓存中的模型明细。损坏或不可读取的单个历史会话只会记录警告，不阻止插件启动。
