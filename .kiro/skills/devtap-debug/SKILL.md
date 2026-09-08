---
name: devtap-debug
description: >
  用 scripts/devtap.mjs 排查这个扩展的运行时问题：读取全部 6 个 context 的 console
  历史（含浏览器 MCP 看不到的 background / offscreen / SQLite worker）、查 SQLite 库、
  在任意 context 里执行 JS、发扩展消息、抓一份完整现场快照。
  任何「为什么没生效 / 报什么错 / 数据对不对 / 流程走到哪了」的问题都先用它，
  不要靠读代码猜，也不要一上手就开浏览器 MCP（MCP 只能看页面且对象参数全丢）。
  Keywords: 调试, debug, 排查, troubleshoot, 定位, 日志, log, logs, console, 控制台,
  报错, error, 异常, exception, 崩溃, crash, 不生效, 没反应, 卡住, stuck, 复现, reproduce,
  数据库, database, sql, sqlite, 查库, 表, table, 数据不对, background, service worker,
  offscreen, worker, dbw, 后台, main-world, content script, 拦截器, interceptor,
  agent loop, 同步, sync, gdrive, 快照, snapshot, 现场, devtap, cdp, 9222.
---

# devtap：读取运行中的扩展

排查这个扩展的第一动作是跑 `scripts/devtap.mjs`，不是读代码推理，也不是开浏览器 MCP。

## 为什么必须用它

扩展同时跑在 6 个地方，每个都有独立的 console：

| 标签 | 是什么 | 浏览器 MCP |
|------|--------|-----------|
| `bg` | background service worker | ❌ 看不到 |
| `off` | offscreen document | ❌ 看不到 |
| `dbw` | SQLite worker（在 off 里面） | ❌ 看不到 |
| `docw` | 文档解析 worker | ❌ 看不到 |
| `gem/main` `ais/main` | main-world 拦截器 | ✅ 但对象参数丢失 |
| `gem/ext` `ais/ext` | content script + 侧边栏 UI | ✅ 但对象参数丢失 |

两个硬伤：MCP 只能看页面，看不到那四个非页面 context；而且 `console.log('[DB Query]', sql, bind)`
在 MCP 里只显示 `Array(2)` / `[object Object]`，参数值全丢。**跨 context 的 bug 在 MCP 里
没有任何一个地方能完整读到。**

devtap 走 CDP，`wxt.config.ts` 已经把 dev 浏览器的端口固定在 9222，
`pnpm dev` 起着就能用，**扩展代码里不需要埋任何东西**。

## 命令

```bash
node scripts/devtap.mjs targets           # 现在哪些 context 活着
node scripts/devtap.mjs logs              # 全部 context 历史日志，合并成一条时间线
node scripts/devtap.mjs snapshot          # 一份完整现场（见下）
node scripts/devtap.mjs watch --ctx bg    # 实时跟，阻塞，放后台跑
node scripts/devtap.mjs sql "SELECT ..."  # 查库
node scripts/devtap.mjs eval bg '<expr>'  # 在任意 context 执行 JS，支持顶层 await
node scripts/devtap.mjs msg GET_FOLDERS   # 发一条扩展消息看回复
```

过滤：`--ctx bg,dbw` `--grep 'AgentLoop|DB Command'` `--level warn` `--since 2m`
`-n 80` `--stack` `--maxval 800` `--noise`。完整说明 `head -80 scripts/devtap.mjs`。

## 固定套路

**1. 先 `snapshot`。** 一次性回答「当时扩展在干什么」：哪些 context 活着、哪个 profile
的库开着、每张表多少行、所有 warn/error 带栈、最近 400 条日志。写到
`.kiro/devlog/snapshot.txt` —— 用 grep 去读它，不要整个塞进对话。

**2. 找报错用 `logs --level warn --stack`。** 未捕获异常和 unhandled rejection 也在里面 ——
代码里没有任何地方记录它们，service worker 更是连 window 都没有，所以这是唯一的出口。

**3. 能复现的问题先起 `watch`，再复现。** Chrome 每个 target 只缓存约 1000 条 console，
而 `[Background] Received message: DB_RESPONSE` 这类日志几秒就能冲满
（实测一次 `logs` 报 `dropped=4135 older`）。等你去看的时候有用的行已经被挤掉了。

**4. 追一条链路用 `--grep` 收窄，不要 `-n 2000`。** 过滤在对象求值之前做，所以命中
12 条就只付 12 次往返；把量拉大只会烧上下文。

按问题类型选起点：

| 症状 | 起点 |
|------|------|
| 数据不对 / 少了 / 串了 | `sql` 查表 + `logs --ctx bg,dbw --grep 'DB Command\|DB Batch'` |
| agent 卡住 / 不继续 / 批准没出现 | `logs --grep AgentLoop --stack`，对照 `.kiro/docs/agent-loop-architecture.md` 的四个阶段 |
| 抓不到模型回复 / 解析失败 | `logs --ctx gem,ais --grep 'stream\|settled\|Parsing'`，注意区分 `/main`（拦截器）和 `/ext`（消费方） |
| 同步 / 备份异常 | `logs --ctx bg --grep 'AutoSync\|Backup\|conflict'` + `state` 看 alarms 和 gdrive_* 键 |
| 侧边栏行为不对 | `logs --ctx gem,ais --level warn`；DOM 长歪了才用 MCP |
| 迁移 / 建表失败 | `logs --ctx dbw`（SQLite 的真实报错只在这里） |

## 边界

- **只读为主。** `sql` 遇到写语句直接拒绝，除非显式 `--write`。这是用户的真实数据。
- **`sql` / `msg` 需要一个 Gemini 或 AI Studio 标签页开着。** 它们走
  `browser.runtime.sendMessage`，而 background 不能给自己发消息，所以必须借 content
  script 的 isolated world 发出去。没有标签页时报错会说清楚。
- **`bg` 睡着是正常的**，Chrome 空闲约 30s 就停掉 service worker。刷一下标签页唤醒。
- **`off` / `dbw` 首次访问数据库前不存在**，`targets` 会注明。
- `.kiro/devlog/` 已 gitignore：里面是真实对话数据。
- `state` / `snapshot` 会把 token、signedPayload 脱敏成 `[redacted N chars]`。
  不要绕过它去打印原值。

## 和浏览器 MCP 的分工

devtap 读不了 DOM 结构和渲染结果。「侧边栏长歪了」「按钮状态不对」「弹窗位置不对」
仍然用 MCP 截图 / snapshot。

**devtap 回答「程序做了什么」，MCP 回答「屏幕上是什么」。**

## 实现要点（改动它之前先看）

`scripts/devtap.mjs` 是入口，`scripts/devtap/` 下五个模块，零依赖（Node 22 自带
全局 `WebSocket`）。三个不显然的地方：

- **`dbw` 只能从 `off` auto-attach 拿到。** `/json/list` 里它是个 url 为空、发消息永不
  回复的僵尸 target。真入口是在 offscreen document 上 `Target.setAutoAttach`，
  子 target 以 `sessionId` 挂在同一个 socket 上 —— 所以 `cdp.mjs` 做了 flat-session 多路复用。
- **对象参数靠 `Runtime.callFunctionOn` 还原**，回放的历史句柄同样有效（只要执行上下文
  还活着）。这是 devtap 比 MCP 强的根本原因。
- **不要用 `replMode: true` 解决顶层 await。** 它会静默关掉 `awaitPromise`，返回的是
  Promise 本身，序列化成 `{}` —— 答案位置上一个空对象，而且哪里都不报错。
  `evaluate()` 改成自动包一层 async IIFE。
