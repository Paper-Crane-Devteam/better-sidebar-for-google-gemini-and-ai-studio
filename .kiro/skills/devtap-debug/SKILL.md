---
name: devtap-debug
description: >
  用 scripts/devtap.mjs 排查这个扩展的运行时问题：读取全部 6 个 context 的 console
  历史（含浏览器 MCP 看不到的 background / offscreen / SQLite worker）、查 SQLite 库、
  在任意 context 里执行 JS、发扩展消息、抓一份完整现场快照；抓宿主页面的 XHR/fetch
  请求和响应并解码（batchexecute rpc、WebChannel protobuf），自动往 Gemini 发消息复现。
  任何「为什么没生效 / 报什么错 / 数据对不对 / 流程走到哪了」的问题都先用它，
  不要靠读代码猜，也不要一上手就开浏览器 MCP（MCP 只能看页面且对象参数全丢）。
  Keywords: 调试, debug, 排查, troubleshoot, 定位, 日志, log, logs, console, 控制台,
  报错, error, 异常, exception, 崩溃, crash, 不生效, 没反应, 卡住, stuck, 复现, reproduce,
  数据库, database, sql, sqlite, 查库, 表, table, 数据不对, background, service worker,
  offscreen, worker, dbw, 后台, main-world, content script, 拦截器, interceptor,
  agent loop, 同步, sync, gdrive, 快照, snapshot, 现场, devtap, cdp, 9222,
  详细日志, verbose, trace, __bsTrace, 日志开关, 噪声, noise, 看不到日志, 日志太多,
  生产, 正式环境, production, prod, 商店版, 用户的浏览器, 日常 Chrome, 其他 profile,
  --chrome, relay, 中继, remote-debugging, DevToolsActivePort, Extension context invalidated,
  接口, 接口变了, API 变动, 抓包, 网络请求, network, request, response, xhr, fetch,
  batchexecute, rpcid, rpcids, processSession, WebChannel, protobuf, 逆向, 协议,
  捕捉不到, 没捕获, 抓不到对话, 新对话, 自动发消息, gsend, net dump.
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
这样的调用在 MCP 里只显示 `Array(2)` / `[object Object]`，参数值全丢。**跨 context 的 bug 在
MCP 里没有任何一个地方能完整读到。**

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
node scripts/devtap.mjs reload            # 全量重建 + 重载扩展 + 刷新 Gemini/AI Studio 标签页
```

改完代码、验证之前如果怀疑 dev server 没重新加载（日志里看不到新代码的输出、行为没变），
先 `reload` 再复现。它走 dev server 的 `POST /__dev/reload`（scripts/dev-reload.mjs），
保证磁盘上的产物是新的；`--no-tabs` 只重载扩展不刷新标签页。用户也可以在 `npm run dev`
的终端里输入 `r` + 回车做同样的事。

过滤：`--ctx bg,dbw` `--grep 'AgentLoop|DB Command'` `--level warn` `--since 2m`
`-n 80` `--stack` `--maxval 800` `--noise`。完整说明 `head -80 scripts/devtap.mjs`。

## 抓宿主页面的网络流量 `net`，自动发消息 `gsend`

「Gemini 是不是改接口了 / 拦截器为什么没触发」先用这两个，**不要再手写探针塞进 `eval`**：

```bash
node scripts/devtap.mjs net start --all          # 所有 gem 标签页装探针（--page <url片段> 选一个）
node scripts/devtap.mjs gsend "测试" --page 6c3f # 往输入框打字并发送，等回复结束（--new 先开新对话）
node scripts/devtap.mjs net list --page 6c3f     # 一行一个请求：xhr/fetch、状态、请求/响应字节数、rpcids / RID
node scripts/devtap.mjs net dump --grep 'MaZiqc|processSession'   # 解码后的内容 → .kiro/devlog/net.txt
node scripts/devtap.mjs net dump --id 15,16 --maxstr 120          # 只看指定条目
node scripts/devtap.mjs net clear / net stop
```

`net dump` 会自动解码：`batchexecute` 解成 `→ rpcid <请求 inner JSON>` / `← rpcid <响应 inner JSON>`；
`processSession`（WebChannel）把 base64 protobuf 解成点分字段路径 `.2.7.1.4.4.5.2.1 "正文"`，
这和 `lib/process-session.ts` 里取值用的路径是同一套写法，直接对照着改就行。离线解 protobuf
可以 `import { dumpProto, b64ToBuffer } from './scripts/devtap/proto.mjs'`。

探针已经处理好的坑（自己写探针时最容易踩）：

- **ajax-hook 底下**：扩展把 `window.XMLHttpRequest` 换成了代理，探针 patch 的是代理背后的原生原型
  （`new XMLHttpRequest().__origin_xhr`），扩展有没有转发都能看到。
- **流结束会被 abort**：WebChannel 回复结束后 `abort()` 回传通道，`responseText` 会被清成 ''。
  探针在 `progress` 时就保留最长的文本。拦截器也一样，只能边收边读。
- **fetch 的 body 在 Request 上**：Gemini 调 `fetch(Request)`，`init.body` 是空的，要在发出**之前** clone。
- **Response 要同步 clone**：`resPromise.then(r => r.clone())` 必须在把 promise 还给页面之前注册，
  晚一步页面就把 body 读掉了（`Response body is already used`）。

`gsend` 的坑：输入框是 `<rich-textarea>` 里的 Quill，只认 `execCommand('insertText')`；
发送按钮要在输入区域内找（`aria-label="Send message"`），全页面里还有别的 "Send…" 按钮。
Gemini 在输入框获得焦点时就会**预开**一个 processSession，没发送的话一分钟后自己关掉，
所以只开 session 不代表发了消息，以带 `.2.9.1`（prompt）的上行为准。

**Windows / PowerShell 下长 JS 用 `eval --file`**：PowerShell 会把参数里的双引号吃掉
（`SyntaxError: Unexpected identifier`），把表达式写进 `.kiro/devlog/xxx.js` 再
`node scripts/devtap.mjs eval gem --file .kiro/devlog/xxx.js --page u/2`。
点 Gemini UI（重命名 / 删除对话）就这样写：`button[aria-label="More options for <标题>"]` →
`[role=menuitem]` → `[role=dialog] button`。只对自己建的测试对话做有副作用的操作。

**Gemini 当前接口一览（2026-10 版本 `boq_gemini-web-uiserver_20261015`）**：生成走
`geminiweb-pa.clients6.google.com/v1/processSession`（WebChannel + protobuf，
`interceptors/process-session.ts`）；其余 `batchexecute` rpcid（`MaZiqc` 列表、`hNvQHb` 内容、
`MUAZcd` 改名、`GzXR5e` 删除、`CNgdBe` gem/notebook 列表 …）**没变**，只是从 XHR 改成了 fetch，
在 `main-world/gemini/index.ts` 的 fetch 包装里分发。扩展自己发的请求走 `lib/native-fetch.ts`，
不会被自己的拦截器再处理一遍。

**别连续狂发**：短时间内 reload + 自动发消息太频繁，Google 会把标签页重定向到
`google.com/sorry`（人机验证）。`targets` 里 gem 标签页突然消失就是这个，需要用户手动过验证，
不要尝试自动解验证码。

## 详细日志开关 `__bsTrace`

日志分两层。**默认只打状态变化和结果**（`Captured turn`、`Parsed N chats`、
`[AgentLoop] ...`、`[AutoSync] ...`、所有 warn/error）。**逐条流水默认关闭**，
需要时按 context 打开：

```bash
node scripts/devtap.mjs eval dbw 'globalThis.__bsTrace = true'   # SQL 语句级追踪
node scripts/devtap.mjs eval bg  'globalThis.__bsTrace = true'   # 每条扩展消息
node scripts/devtap.mjs eval gem 'globalThis.__bsTrace = true'   # 拦截器原始 wire dump
```

**开关是 per-context 的**，在哪个 context 打开就只影响那个 context —— 这正好让你单独挑
一层看，而不是把五层流水一起放出来。存在内存里，worker / service worker 重启即失效
（故意的：留在 storage 里的 `true` 会在几周后把噪声悄悄带回来）。

注意 `eval <host page>` 落在页面的**默认世界**（`cmdEval` 不传 `contextId`），
所以 `eval gem` 只开得到 `gem/main` 的拦截器。`gem/ext`（content script + 侧边栏 UI）
在 isolated world，要在页面 devtools console 里把执行上下文切到扩展那一栏，
再敲 `__bsTrace = true`。

关掉时下面这些拿不到，要看就得先开：

| 内容 | 在哪开 |
|------|--------|
| `[DB] SQL:` / `[DB] Result:` 每条语句 + bind | `eval dbw` |
| `[DB Query]` / `[DB Command]` / `[DB Batch]` 调用方视角 | 发起方，通常 `eval bg` |
| `[Background] Received message: ...` | `eval bg` |
| Gemini / ChatGPT 的 chunks、payloads、event stream 原始结构 | `eval gem` / `eval ais` |
| 全量 items / messages 数组（默认只打条数） | 同上 |
| scanner 的 `Started/Stopped listening`、滚动每轮的 scrollTop | isolated world，见上 |
| `[DetectAccount]` 的账号明文 | isolated world，见上 |

SQL 执行失败不受开关影响：`[DB] Failed:` 会带上出错的语句。

## 固定套路

**1. 先 `snapshot`。** 一次性回答「当时扩展在干什么」：哪些 context 活着、哪个 profile
的库开着、每张表多少行、所有 warn/error 带栈、最近 400 条日志。写到
`.kiro/devlog/snapshot.txt` —— 用 grep 去读它，不要整个塞进对话。

**2. 找报错用 `logs --level warn --stack`。** 未捕获异常和 unhandled rejection 也在里面 ——
代码里没有任何地方记录它们，service worker 更是连 window 都没有，所以这是唯一的出口。

**3. 能复现的问题先起 `watch`，再复现。** Chrome 每个 target 只缓存约 1000 条 console。
默认日志量下这够用一阵，但**一旦开了 `__bsTrace`，`bg` 和 `dbw` 几秒就能冲满**
（历史同步一次几千行）—— 等你去看的时候有用的行已经被挤掉了。所以顺序是：
先 `watch`（带上 `--ctx` 收窄），再开 trace，再复现。

**4. 追一条链路用 `--grep` 收窄，不要 `-n 2000`。** 过滤在对象求值之前做，所以命中
12 条就只付 12 次往返；把量拉大只会烧上下文。

按问题类型选起点：

| 症状 | 起点 |
|------|------|
| 数据不对 / 少了 / 串了 | 先 `sql` 查表。要看写入过程就开 `__bsTrace`（`dbw` 或 `bg`），再 `logs --ctx bg,dbw --grep 'DB Command\|DB Batch\|DB\] SQL'` |
| agent 卡住 / 不继续 / 批准没出现 | `logs --grep AgentLoop --stack`，对照 `.kiro/docs/agent-loop-architecture.md` 的四个阶段（这些日志默认就有） |
| 抓不到模型回复 / 解析失败 | 先看默认那行 `Captured turn` / `Parsed N ...` 在不在。不在就 `eval gem 'globalThis.__bsTrace = true'` 拿原始 chunks、payloads、event stream，再 `logs --ctx gem,ais`。注意区分 `/main`（拦截器）和 `/ext`（消费方） |
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

## 连正式环境（日常 Chrome / 其他 profile）

dev 浏览器之外的 Chrome（装商店版的 profile）没有 9222 端口，而且 Chrome 136+
**不允许**在默认 user-data-dir 上用 `--remote-debugging-port`。只能走 Chrome 144+ 的开关：

1. **让用户**在那个 Chrome 打开 `chrome://inspect/#remote-debugging`，勾上允许远程调试。
   Chrome 会在 `~/Library/Application Support/Google/Chrome/DevToolsActivePort` 写入端口。
2. 起中继（后台常驻）：`node scripts/devtap/relay.mjs`。**每个新连接 Chrome 都会弹确认框**，
   中继只连一次，让用户点一次「允许」即可。输出 `relay: connected` 才算连上。
3. 所有命令加 `--chrome`，会自动走中继（`127.0.0.1:9339`）：

```bash
node scripts/devtap.mjs --chrome --bctx 7bbe6cb7 targets
node scripts/devtap.mjs --chrome --bctx 7bbe6cb7 eval bg 'chrome.runtime.getManifest().version'
node scripts/devtap.mjs --chrome --bctx 7bbe6cb7 msg GET_MESSAGE_SYNC_STATUS '{"platform":"gemini"}' --page gemini
```

要点：

- **所有 profile 在同一个浏览器进程里**，每个 profile 是一个 `browserContextId`，
  同一个扩展会出现多份。`--bctx <前缀>` 必须带，不带会混在一起。
  不知道哪个是哪个：对每个前缀 `eval bg` 读 `profile-registry`（里面有账号邮箱）和
  `getManifest().version`。
- **这种模式没有 `/json/list`，也不接受 per-target WebSocket**，全部是在浏览器 socket 上
  `Target.attachToTarget({flatten:true})`（见 `cdp.mjs` 的 browser mode）。
- **`watch` 不支持走中继**（中继一次只跑一条命令）。
- 中继额外有 `POST /js`：请求体是一段 async 函数体，参数 `h = { cdp, contexts }`，
  用于 devtap 命令覆盖不到的临时探针（比如在 main world 里 hook `fetch` 抓原始响应）。
- **中继没有鉴权**，本机任何进程都能借它操纵用户的浏览器。查完立刻停掉。
- 读写边界和 dev 一样：这是用户真实数据，只读；要触发「同步 / 点击」这类有副作用的
  动作，先跟用户说清楚。

### 正式环境常见坑

- **扩展更新后旧标签页里的 content script 变孤儿**：`chrome.runtime` 没了，发消息报
  `Extension context invalidated`。`sql` / `msg` / `snapshot` 会自动跳过这种标签页；
  全是孤儿时让用户刷新标签页。要指定标签页用 `--page <url 片段或 targetId 前缀>`。
- **「unpacked」profile 不等于商店版**：先看 profile 的 `Preferences` 里
  `extensions.settings.<id>.path`。指向 `.output/chrome-mv3` 的是本地构建，重新 build
  之后页面会注入新的 content script，但 service worker 还在跑旧代码，于是出现
  `Unknown message type`。对比运行中代码（`Debugger.getScriptSource`）和磁盘上的
  `background.js` 就能确认；修法是在 `chrome://extensions` 里重载。

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
