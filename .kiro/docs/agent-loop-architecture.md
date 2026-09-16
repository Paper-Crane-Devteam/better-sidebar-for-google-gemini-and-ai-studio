

---

## 目录结构

三块 UI，职责不重叠：

| 位置 | 角色 | 内容 |
|------|------|------|
| 设置 → Agent | 装备库 | Skills CRUD、MCP 开关（低频、跨会话） |
| Agent Tab（侧边栏） | 教学 | **只有**「怎么开始一个任务」：三步说明 + 范例句 + 工作区/设置入口 |
| Agent Dock（贴输入框） | 决策 | 状态一行 + Stop、批准、继续、check-in、中断、结束卡 |
| 聊天流内（renderer） | 内容 | 工具卡片、结果详情、Agent 定制视图 |

判断准则：**聊天流回答"发生了什么"，Dock 回答"我现在要你做什么"，Tab 回答"怎么开始"。**

⚠️ **Agent Tab 永远是同一个样子。** 以前它在「启动器」和「运行状态面板」之间切换，
于是所有决策都藏在两个前提后面：侧边栏是开的 **且** 停在 Agent tab 上。侧边栏一关，
批准请求压根没有可见的出口，引擎就在后台永远挂着等一个用户看不见的按钮。

⚠️ **Tab 里没有输入框。** 唯一入口是聊天输入框打 `>`；Tab 只负责把这件事说清楚，
并给出足够细的范例句。以前 Tab 自带 textarea + 技能卡，等于同一个动作有两个入口，
侧边栏那个还得自己实现转发、清空和各种失败提示。范例句点击后只是**填进**输入框
（不自动发送），入口依旧只有一个。

Tab 唯一对运行中的让步是**范例变灰**：`start()` 会清空 store，运行中再填一条等于
把正在跑的会话无声顶掉。以前靠「整个面板被状态面板替换」挡住了，现在必须显式拒绝。

```
src/entrypoints/overlay.content/shared/
├── lib/
│   └── quill-editor.ts            # ★ Quill 编辑器操作统一入口
├── features/
│   └── trigger-popup/
│       ├── useTriggerPopup.ts     # 通用触发检测状态机
│       ├── useEditorIntegration.ts # 事件拦截层（import quill-editor）
│       └── PopupFooterHints.tsx
├── modules/
│   ├── agent-loop/                # 引擎 + 领域逻辑
│   │   ├── index.ts               # Public API（barrel）
│   │   ├── types.ts               # AgentLoopStatus / ToolCallResult / AgentEndReason
│   │   ├── agent-loop-store.ts    # 运行时状态（非持久化）
│   │   ├── agent-view-store.ts    # ★ 视图 override（持久化：conversationId → 手动选择）
│   │   ├── agent-policy-store.ts  # 执行策略（持久化：autoRunReads / autoRunWrites）
│   │   ├── agent-config-store.ts  # 用户自定义 skill / MCP 开关（持久化）
│   │   ├── agent-record-store.ts  # ★ 账本读侧：joinKey → 结果 + owed（跑了但没送出去）
│   │   ├── records.ts             # ★ 账本写侧：toolCallRecorder，全部 best-effort
│   │   ├── ledger-client.ts       # ★ 账本的唯一出口：发消息给 background（**别碰 @/shared/db**）
│   │   ├── recovery.ts            # ★ 把未送达的行重新拼回 payload
│   │   ├── execution-policy.ts    # requiresApproval / shouldAutoSend / getToolRisk
│   │   │                          #   buildToolCallKey ★ 是 wire format，见「join key」
│   │   ├── agent-entry.ts         # ★ `>` 列表数据源：一行一个 agent，不含 skill
│   │   ├── event-bus.ts           # 类型安全事件总线
│   │   ├── useAgentTrigger.ts     # `>` 前缀检测
│   │   ├── AgentCommandPopup.tsx  # `>` 弹出选择列表
│   │   ├── adapters/              # 平台适配（gemini-adapter 等）
│   │   │   └── response-wait.ts   # ★ ResponseWaitError：timeout / not_delivered
│   │   ├── engine/
│   │   │   ├── index.ts           # ★ 对外唯一出口，别深引 stages/context
│   │   │   ├── AgentLoopEngine.ts # 状态机 + 生命周期（start/stop/resume/continueNow）
│   │   │   ├── context.ts         # ★ LoopContext：store/事件/abort/熔断的门面
│   │   │   ├── engine-registry.ts # ★ 模块级 engine handle（供 Agent Tab 控制）
│   │   │   ├── stages/            # 一轮的四个阶段，顺序即数据流
│   │   │   │   ├── await-response.ts   # ① 等 AI 回复（静默超时 / 没送到 → 两种结局）
│   │   │   │   ├── parse-response.ts   # ② 解析 tool call / 格式事故 nudge / 无 tool 则结束
│   │   │   │   ├── execute-tools.ts    # ③ 执行 + 熔断 + 记账 + 终止信号
│   │   │   │   ├── approval-gate.ts    # ★ awaiting_approval：等卡片/侧边栏放行
│   │   │   │   └── handoff/            # ④ 结果回传（唯一碰 Quill DOM 的地方）
│   │   │   │       ├── index.ts        #   ResultHandoff：staging → 等发送 → 成功/暂停
│   │   │   │       ├── staging.ts      #   capsule 写入 + 落地校验 + 纯文本降级
│   │   │   │       ├── formatter.ts    #   结果 markdown 拼装 / 切段（互为逆运算）
│   │   │   │       ├── budget.ts       #   ★ 输入框 31998 字符硬上限 + 注水式截断
│   │   │   │       └── send-watcher.ts #   ★ 两步确认送达：离开输入框 + 送达正证据
│   │   │   ├── guards/
│   │   │   │   ├── circuit-breaker.ts  # 重复调用 / 连续失败 / 无进展
│   │   │   │   └── abort.ts            # AbortToken + AbortError
│   │   │   └── parser/
│   │   │       ├── index.ts            # parseToolCalls
│   │   │       ├── tool-schema.ts      # ★ SUPPORTED_TOOLS / REQUIRED_PARAMS
│   │   │       └── fallbacks.ts        # Gemini 吞格式时的兜底解析
│   │   ├── agents/                # ★ 有哪些 agent：registry.ts + types.ts（AgentDefinition）
│   │   ├── renderer/              # 聊天流内的定制渲染 + 工具卡片
│   │   ├── prompts/               # prompt-assembler.ts + souls/（一个 agent 一个 soul）
│   │   ├── skills/                # builtin-skills + skill-registry
│   │   ├── mcp/                   # MCP registry + providers（工具真正的注册处）
│   │   ├── tools/                 # execute-sql / export / sync / complete-task / workspace / browser
│   │   ├── workspace/             # Workspace agent 的领域状态（binding / file-viewer）
│   │   └── browser/               # Browser agent 的领域状态
│   │       ├── browser-store.ts        # ★ 权限与设置的镜像 + 唯一的 background 出口
│   │       └── BrowserPlanPreview.tsx  # ★ 批准预览（dock 和卡片共用，所以不在 agent-tab 里）
│   ├── agent-tab/                 # 侧边栏 Agent Tab —— 一个 agent 一个面板，永不变样
│   │   ├── AgentTab.tsx           # 顶部 AgentSwitcher + 三个面板之一
│   │   ├── workspace/             # Workspace 面板：文件树
│   │   ├── browser/BrowserView.tsx        # Browser 面板：权限摘要 + 本地流水 + 撤销
│   │   └── components/
│   │       ├── AgentSwitcher.tsx          # ★ 只换面板，不换正在跑的会话
│   │       ├── AgentLauncher.tsx          # 布局 + 工作区/设置入口 + 不可用提示
│   │       ├── WorkspaceIntro.tsx         # 文件树上方那一行（含问号弹窗）
│   │       ├── BrowserIntro.tsx           # 同上，Browser 面板的那一行
│   │       ├── LauncherCta.tsx            # 「输入框打 > 」三步图示（唯一入口）
│   │       ├── LauncherExamples.tsx       # 范例句轮播（7s 自动轮换，hover 暂停+出箭头）
│   │       └── agent-examples.ts          # 范例句数据：每个模块一条，故意写得很细
│   ├── agent-dock/                # ★ 贴在输入框右上角的决策浮层（页面级）
│   │   ├── AgentDock.tsx          # 可见性 / 自动展开 / 会话与对话绑定
│   │   ├── useComposerAnchor.ts   # 轮询输入框 rect（Angular 会换掉节点）
│   │   └── components/
│   │       ├── AgentDockPill.tsx          # ★ 常驻一行：状态 + Stop + speedMode 撤回
│   │       ├── AgentApproval.tsx          # ★ 批准的第二入口（卡片是主场）
│   │       ├── AgentContinuePrompt.tsx    # awaiting_send 的「继续」CTA
│   │       ├── AgentCheckIn.tsx           # ★ 无人值守 20 轮后的例行 check-in（中性，非故障）
│   │       ├── AgentInterruptNotice.tsx   # 暂停 / 报错原因 + Retry
│   │       ├── AgentSessionSummary.tsx    # 结束卡（含 paywall upsell）
│   │       ├── AgentPolicyControls.tsx    # 读自动 / 写自动 / 自动继续（齿轮里，默认折叠）
│   │       ├── AgentOwedResults.tsx       # ★ 跑了但没送到 AI 的结果 → 补发（唯一无 session 也显示的卡）
│   │       └── AgentInstructionInput.tsx  # 中途给 AI 补充说明
│   └── slash-command/             # `/` snippets（与 `>` 互斥）
```

入口组件：
```
src/entrypoints/overlay.content/gemini/enhanced-features/AgentLoopFeature.tsx  # 渲染 <AgentDock />
src/entrypoints/overlay.content/gemini/enhanced-features/SlashCommandFeature.tsx
src/entrypoints/overlay.content/gemini/OverlayPanel.tsx   # 渲染 <AgentTab />
```

⚠️ `<AgentDock />` 挂在 **AgentLoopFeature**（页面级 shadow DOM）而不是侧边栏里 ——
它得在侧边栏关掉时也在。`hidden={triggerState.isOpen}`：`>` 弹窗锚在输入框的同一个角，
两个浮层抢一个位置比暂时看不见 dock 更糟，而输入 `>` 只发生在空闲态，藏起来是安全的。

### 触发符

| 符号 | 归属 | 说明 |
|------|------|------|
| `/` | slash-command | Snippets / prompt 库 |
| `>` | agent-loop | **一行一个 agent**，没有 skill 也没有快捷条目 |

`!` 触发符已移除。它等价于"不预选 skill 的 agent"，却需要第二个 `useEditorIntegration` 实例，
而 `registerBeforeSendHandler` 是模块级单槽，两个实例只有一个能接管发送按钮点击。
现在统一走 `>` + `agent-entry.ts` 的 `AGENT_AUTO_ID`。

---

## 核心执行流程

```
唯一启动入口是聊天输入框：
  A. 用户输入 ">" → useAgentTrigger → AgentCommandPopup → 选择条目
  B. Agent Tab 点范例句 → emit('launcher:run-entry', { autoSend: false })
     → AgentLoopFeature 监听 → 只是替用户把 capsule + 句子填进同一个输入框
       ↓
capsule 写入编辑器（insertCapsuleAtRange 或 appendCapsule）
       ↓ 用户按 Enter / 点发送按钮（autoSend 目前只有恢复流程用）
composeAndSend():
  读 capsule 的 data-prompt-id → getAgentEntryById()
  assembleFinalPrompt(soul + skill + tool schemas) → adapter.triggerSend()
       ↓
AgentLoopEngine.start(20, { conversationId, title })
  setActiveEngine(engine)   ← Agent Tab 由此拿到控制权
       ↓ ────────────────────────────────────────────────┐
① stages/await-response.ts                                │
  status = waiting_ai                                     │
  adapter.observeAIResponseComplete(30s 静默)              │
       ↓ AI 回复完成（静默超时 → pause + return）           │
② stages/parse-response.ts                                │
  取文：selectSettledAnswer(model-stream-store)            │
        ← API 流原文；为空才回落 DOM（有 warn）             │
  status = parsing → parseToolCalls()                     │
  无 tool call：                                           │
    标签未闭合 / JSON 解析失败                              │
      → claimFormatRetry() 成功 → nudge（每会话仅 1 次）    │
      → 预算用尽 → finish('no_tool_call')                  │
    纯散文 → finish('no_tool_call')  ← 会话直接结束         │
       ↓ 有 tool call                                      │
  shouldAutoSend(toolCalls)  ← 在③之前算，见下文            │
       ↓                                                  │
③ stages/execute-tools.ts                                 │
  status = executing，逐个执行                             │
    熔断：重复调用 / 连续失败 → 'halted'（结果仍要回传）     │
      → holdForRetry(payload) + pauseAndEnd                │
    requiresApproval() → approval-gate（卡片放行）          │
      拒绝 → CANCELLED 段落（带理由）→ 下一个 call          │
    complete_task / PAYWALL → finish() + return           │
       ↓                                                  │
④ stages/handoff/ — ResultHandoff.deliver(payload, auto)   │
  stageResults() 把结果写回编辑器（capsule，失败降级纯文本） │
  store.awaitSend(!autoSend)  ← 正常检查点，不是故障         │
  autoSend ? 引擎自己 triggerSend()   ← autoContinue ∩ 无待批准 │
           : 等用户 Enter / Tab 的「继续」                  │
       ↓                                                  │
  waitForSend() → 'sent' → unattendedStreak 记账 → advanceRound() ┘
                → 'still-staged'（没发出去 / 5min 超时）→ pause
                → 'unconfirmed'（输入框空了但没有任何送达迹象）→ pause
```

### 20 轮上限只管无人值守的轮次

`maxRounds`（20）**不是**总轮数上限，而是**连续无人值守轮数**的上限。引擎里一个字段：

```ts
this.unattendedStreak = autoSend ? this.unattendedStreak + 1 : 0;
...
if (this.unattendedStreak >= ctx.maxRounds) {
  ctx.pause(`The agent has run ${n} steps on its own. Continue?`);
  return;
}
```

理由：这个上限存在的意义是**没人看着时别失控**。用户自己按回车的轮次里本来就有人，
让他每 20 轮清一次「步数上限」是纯摩擦——他自己就是刹车。所以手动模式下这个天花板
压根不存在（计数器涨不起来）。

⚠️ **判定用 `shouldAutoSend` 的结果，不要读那三个开关。** 读开关的话 `speedMode`
会漏：用户在批准提示里点了「本次任务不用再问」，`autoRunWrites` 仍然是 `false`，
但会话从那一刻起完全无人值守——而「别再问了」恰恰是想走开的人最可能点的按钮。
只有看「这一轮实际有没有停下来等过人」才盖得住。

⚠️ **是 `ctx.checkIn()`，不是 `pause` 也不是 `pauseAndEnd`。** 达到上限既不是完成
也不是失败，只是问一句「还继续吗」。以前用 `pauseAndEnd` 广播了 `loop:ended`，
文案却写着 "Continue?" —— 对外宣告结束、UI 上却显示可 Retry 的中断卡，三种说法
互相矛盾。现在 `AgentEndReason` 里已经**没有** `max_rounds` 这个值了。

`checkIn` 走 `store.requestCheckIn(steps)`，写 `checkInSteps` 而**不写**
`errorMessage`。`checkInSteps !== null` 是"这次 pause 是 check-in 而不是故障"的
唯一判据，三个地方读它：

| 组件 | 行为 |
|------|------|
| `AgentCheckIn` | 中性配色 + 眼睛图标 +「跑了 N 步」+「继续 / 就停这」 |
| `AgentInterruptNotice` | `checkInSteps !== null` 时**不渲染**，否则两张卡会叠在一起 |
| `AgentDockPill` | 状态文案换成「等你确认」，而不是「已暂停」 |

⚠️ 一个字段兼两个职责（是不是 check-in + 跑了几步）是故意的：check-in 一定带步数，
拆成 `pauseKind` + `steps` 两个字段只会多一种它们不一致的状态。
⚠️ `store.pause()` 会把 `checkInSteps` 清成 null —— check-in 之后真的出故障了，
显示的必须是故障卡。

⚠️ `resume()` 会把 `unattendedStreak` 归零。用户点「继续」就是明确的「继续跑」，
不归零的话下一轮立刻又停。



### 无 tool call = 会话结束，不是失败

Gemini 是被动的：不给它发消息，它永远不会再说话。而 ④ 只在有结果时才发送。所以
「AI 回了一段散文」这件事，唯一诚实的处理是**结束会话**——若循环继续转，①
会去等一个永远不来的回复，60 秒后超时，用户看到的是一次假报错。

`finish` 而不是 `pause`：pause 会给出 Retry，而 Retry 会重新进 ①，等的还是那个
不存在的回复。

唯一的例外是**格式事故**：`hasUnclosedToolBlock()`（流被切断在标签中间）或
`errors.length > 0`（有 `<bs_agent_tool>` 块但 JSON 解析失败）。这不是模型的决定
而是意外，所以熔断器给每个会话 **1 次** 重发机会（`FORMAT_RETRY_BUDGET`）。
两种事故的 nudge 文案分开：告诉它「你忘了格式」会让它从头重写整个回复，
浪费一轮还可能重跑前半段；告诉它「你被截断了」它只补尾巴。

⚠️ 早期版本把「无 tool call」当成任务完成，导致第一轮就报「Task finished」；
后来改成 nudge 两次再兜成提问。现在两者都不做了 —— 靠 `soul.ts` 把
「没有 tool call 的回复会直接终止任务」写成最硬的一条约束来防。

阶段之间只通过 `LoopContext` 通信；**任何自己已经 pause / finish 过的阶段都返回
一个 stop 型结果**，循环见到就直接 return，不重复判断。

`ResultHandoff` 是唯一有状态的阶段：它记着「已 staged 但还没确认发出」的 payload。
`resume()` 靠这个决定是先补发上一轮结果还是直接进下一轮 —— 少了它，Retry 会去等一个
根本没发出去的消息的回复，表现为卡到 60s 超时。

### 模型回复从哪读：API 流，不是 DOM

两个平台都把模型输出先过一遍 CommonMark 渲染器再进文档，而渲染器会吃掉自己的语法。
实测：`\"` 变成 `"`（ASCII 标点的反斜杠转义被消费），`\\` 变成 `\`，`*a*` 变成 `a`；
Gemini 上裸 HTML 标签直接消失、URL 被换成链接组件。所以 `write_file` 的 content 本身
是 JSON 时，`JSON.parse` 会失败 —— 一个真实会话里 15 个调用挂了 11 个。**能解析的那些
也可能已经被静默改坏**：`tailwind.config.js` 的 `*/` 丢了一个 `*`，照那样写进了磁盘。

所以 stage ② 读 `selectSettledAnswer(model-stream-store)`，也就是拦截器抓的原文，
只在它为空时才回落 DOM（并打 warn）。两个平台的原文都验证过与模型输出逐字一致。

喂这个 store 的是两个读取器，线格式完全不同，差异在读取器里就被吸收掉了：

| | 端点 | 文本语义 | 完成信号 |
|---|---|---|---|
| AI Studio | `GenerateContent` | **增量**，要累加 | payload 里的 `finishReason` |
| Gemini | `StreamGenerate` | **全量快照**，要替换 | `readyState 4`（线上没有等价字段） |

⚠️ **这不只是解析问题，还是身份问题。** `buildToolCallKey` / `buildToolCallFingerprint`
是对 params 做的摘要，而引擎和渲染卡片的组件**各自独立算一遍**。两边读到的字节不同，
摘要就不同，后果是：审批时引擎 publish 的 fingerprint 对不上任何卡片，**审批按钮不会
出现在任何地方**，引擎在等一个用户从没被询问过的决定；`records[joinKey]` 同样查不到，
跑过的调用显示成 Not run。所以渲染层必须和引擎同源 —— 见
`renderer/useConversationMessages.ts` 的 `verbatimModelText`。

DOM 那条路**刻意保留**：这些是 Google 的私有格式、按数组下标寻址，会变。下标一旦对不上，
代价应该是「降级的 agent」而不是「死掉的 agent」，所以 `response-text.ts` 和 parser 里的
转义容忍都还在，只是不在默认路径上了。

### 怎么判断「AI 回复完了」

`gemini-adapter.observeAIResponseComplete()`。主信号是**按钮的边沿**,不是电平:

```
每 400ms 采样一次
  按钮 === 'stop'         → sawGenerating = true，续命，return
  没有新一轮 且 没见过 stop 且 按钮 'absent' 且 已过 5s
                          → reject('not_delivered')  ← 压根没送到，等下去没意义
  没有新一轮               → 归零，return（还在看开始等待前的那一轮）
  文本变了                 → 归零，续命，return
  文本没变                 → stableTicks++
                             SETTLE_TICKS(2)：见过 stop，或按钮已消失
                             BLIND_SETTLE_TICKS(5)：按钮读不出来，纯靠文本
tick 开头统一查一次 deadline，超了 reject('timeout')
```

「新一轮」= 存在回复元素 且 文本非空 且 (元素 ≠ baseline 或 文本 ≠ baseline)。

**为什么必须是边沿而不是电平**:引擎是点完发送之后才开始等的,那一瞬间 Gemini 还没把
按钮翻成 stop。所以"按钮读到 send"在任何事情发生之前就是 true —— 按电平判断会立刻
resolve,拿到**上一轮**的回复。

文本采样降级成两个职责:

| 职责 | 怎么做 |
|------|--------|
| 防拿到上一轮 | `baselineElement` / `baselineText`,文本必须和开始等待时不同 |
| 按钮失灵时兜底 | `getSendButtonState()` 是四级降级(`gem-icon-button.stop` → `mat-icon[fonticon]` → `aria-label`/`mattooltip` → 容器 class),Gemini 改一次可能全落空返回 `'unknown'`。这时 `sawGenerating` 一直是 false,判定退化成纯文本稳定,阈值从 2 提到 5(约 2 秒),因为没有权威信号背书,得熬过流式输出中途的停顿 |

### `absent` ≠ `unknown`

`SendButtonState` 有四个值，其中这两个含义**相反**，早期版本把它们并成一个 `'unknown'`：

| 值 | 含义 | 可信度 |
|----|------|--------|
| `stop` | 正在生成 | 权威 |
| `send` | 输入框里有内容，可以发 | 权威 |
| `absent` | DOM 里压根没有这个按钮 | **权威**：Gemini 只在输入框有内容或有回合在跑时才渲染它，所以「没有」= 没在生成 且 没人在输入 |
| `unknown` | 找到按钮了但四级降级全认不出 | **完全不可信**：选择器丢了 |

⚠️ 实测：发送被接受的那一瞬间按钮**直接翻成 stop**，慢网速下也一样，不存在「点完之后按钮短暂消失」的空窗。所以 `absent` 不需要为「刚点完还没起来」留额外的宽限；5 秒的 `IDLE_DELIVERY_GRACE_MS` 只是为了盖住我们自己那次点击和 Angular 的重渲染。

`absent` 在 ① 里有两个用途：

- **加速完成判定**：有新一轮 + 按钮消失 = 回合结束，`stableTicks` 阈值走 2 而不是 5。这条覆盖「我们开始等的时候已经错过 stop 边沿」。
- **判定没送到**：没有新一轮 + 从没见过 stop + 按钮消失 → `reject('not_delivered')`。见下。

### 「AI 没回复」和「消息没送到」是两回事

`observeAIResponseComplete` 用 `ResponseWaitError` 带一个 `kind` 拒绝
（`adapters/response-wait.ts`）：

| kind | 现实 | 文案 / 行为 |
|------|------|------------|
| `timeout` | 有回合在跑（或读不出来），然后静默烧完预算 | 「AI 30 秒没回复」+ Retry |
| `not_delivered` | 页面明确静止且这一轮压根没开始 | 「消息没送到」+ Retry **重发** |

`awaitAIResponse` 返回 `AwaitOutcome`（`response` / `stalled` / `undelivered`），
`not_delivered` **故意不在阶段里 pause** —— 只有引擎知道自己手上还有没有可以重发的
payload，而这决定了话该怎么说、Retry 又该干什么（`engine.reportUndelivered()` →
`handoff.rearmLastDelivered()` → pause）。

⚠️ 别把 `not_delivered` 也说成「AI 没回复」。用户会去 Gemini 那边找问题，而实际上消息
根本没离开输入框；更糟的是 Retry 会重新进 ①，等的还是那个不存在的回复，看起来就是
「点 Retry 没反应」。

边沿之后还要等 2 个采样,是因为**按钮翻转 ≠ 渲染完成**:按钮跟的是流式请求结束,而
Gemini 还要渲染 markdown 和代码块。在翻转那一刻读文本可能拿到没渲染完的尾巴,
然后被当成完整回复解析 —— 这正是历史上「resolve 在半截回复上,里面没 tool call,
第一轮就报 Task finished」那个 bug。

⚠️ **超时是"静默"预算,不是整轮预算。** 任何证明这一轮还活着的迹象(文本在变、
按钮读到 stop)都会把 deadline 往后推。所以 Pro 开 thinking 想十分钟再写五分钟完全
没问题。原来是 60s 整轮硬超时,长回复会在**正常生成中途**被掐掉并报"AI 响应超时",
那是 bug 不是设计。

⚠️ **但超时不能删。** 完成信号真的可能永远不来:Gemini 报错/限流时压根不会有回合
完成;`getSendButtonState()` 退化成 `unknown` 且回复元素也拿不到时同理。没有超时的话
引擎会永远停在 `waiting_ai` 转圈,用户只能点 Stop 而且不知道为什么。

⚠️ **为什么是轮询而不是 MutationObserver。** 要判断的是"文本不再变化",而"什么都没
发生"MutationObserver 天生观测不到,必须有时钟。既然时钟是刚需,顺手在同一个 tick 里
读按钮成本是零。而且历史上试过 debounced MutationObserver:Gemini 流式输出中途会停顿
超过 500ms,debounce 一到就误判成完成。另外按钮节点会被 Angular **整个换掉**,
observer 绑上去就成了聋子,还得再起个定时器检查绑的是不是当前节点 —— 绕回定时器。

已删的死代码:`STREAMING_VETO_TICKS` 常量、`adapter.isStreaming()`(实现就是
`getSendButtonState() === 'stop'`,在原来的判定里上一行已经 return 过,条件恒为
false;唯一的外部消费者是已删掉的 ask-user-gate)。需要这个信号直接用
`getSendButtonState()`。

### 发送按钮：send 与 stop 是同一个按钮

Gemini 用同一个按钮承担「发送」和「停止生成」，class 和 disabled 状态都一样，
只能靠 `mat-icon` 文本 / `aria-label` / 容器 class 区分 —— 见 `getSendButtonState()`。
生成中点它 = 掐掉这一轮回答，而不是发消息，这会让 agent loop 直接丢一整轮。

所以 `triggerSend()` 有三层保护：

1. 等 150ms 让 Quill 把输入变更 flush 进 Delta
2. 轮询等按钮离开 stop 态（`waitForSendState`，上限 120s）
3. `humanDelay` 时随机停 0.8–2s，**点击前再查一次状态** —— 这段延迟里图标完全可能翻回 stop

返回值是「有没有真的点下去」。被拒绝时引擎会 pause 并说明原因，而不是继续空等回复。

| 调用方 | humanDelay | 原因 |
|--------|-----------|------|
| 引擎自动继续（`autoSend`） | on | 给 DOM 留渲染时间，同时避免固定节奏被风控 |
| 用户按 Enter / 点发送 / 点「继续」 | off | 用户已经表达意图，额外延迟只会像卡住 |

这个按钮状态同时也是 ① 判断回复完成的主信号，见上文。

⚠️ 「无 tool call」不等于任务完成。协议要求以 `complete_task` 结束，所以没有工具调用
只说明 AI 忘了格式或在闲聊 —— 早期版本把它当成 complete，导致任务第一轮就报「Task finished」。

### 怎么确认「消息真的送到了」——两步，不是一步

`send-watcher.ts` 的 `waitForSend()` 返回 `SendOutcome`：

```
① 等 payload 离开输入框     MutationObserver（编辑器 + 父节点，SPA 会换掉编辑器）
     ↓ 没离开 → 'still-staged'
② 等送达的正证据（最多 4s）  按钮读到 'stop'  或  user-query 条数变多
     ↓ 都没有 → 'unconfirmed'
   'sent'
```

⚠️ **只有第①步是不够的**，这是历史上最贵的一个 bug。输入框变空**也是**消息被悄悄丢掉
时的样子：staging 自己打自己、SPA 导航重建编辑器、Gemini 报错清空输入。只看第①步会把
这些全判成成功，`pending` 被清掉、轮次照常推进，然后 ① 去等一个不存在的回复，30 秒后
报「AI 没回复」，而 Retry 会再等 30 秒。

⚠️ **两个证据里 `countUserTurns()` 更硬。** 按钮的 `stop` 是瞬时的，回合结束就没了；
而 `<user-query>` 只可能因为消息真的落地才出现，而且**不会消失**。所以它对「答得太快，
我们看的时候已经结束了」同样成立。`adapter.countUserTurns()` 是接口方法，用
`document.querySelectorAll('user-query')` 而不是在滚动容器里查 —— 容器会被 SPA 换掉，
查不到会被读成「零条」，也就是一次不存在的失败。

⚠️ **送达 ≠ 会有回答。** Gemini 可以收下消息然后什么都不产出（限流、错误 toast）。
所以 `ResultHandoff` 除了 `pending` 还留了一份 `lastDelivered`，`rearmLastDelivered()`
把它放回 `pending`，这才让「没送到」那一档的 Retry 真的会重发。第 1 轮没有这份东西
（那是用户自己发的 prompt，handoff 没见过），文案会退化成「自己在输入框重发一次」。

### 状态语义（重要）

`awaiting_send` 必须和 `paused` 分开，UI 依赖这个区分。
另外 `awaitingUserSend` 把 `awaiting_send` 又切成两半 —— **每一轮都会经过这个状态**，
包括引擎自己发的那些，所以只看 status 的 UI 会在无人值守的整个跑动过程中每轮闪一次
「要你按回车」：

| status | 含义 | Dock 呈现 |
|--------|------|----------|
| `awaiting_approval` | 某个 tool call 等你放行 | 卡片高亮 + Dock 里一份 |
| `awaiting_send` + `awaitingUserSend` | 每轮正常结束，结果在输入框等**你**发 | 「继续」CTA |
| `awaiting_send` + `!awaitingUserSend` | 同上，但引擎马上自己点发送 | **什么都不显示** |
| `paused` + `checkInSteps !== null` | 无人值守跑够 20 轮，例行 check-in | 中性卡 + 继续 / 就停这 |
| `paused` | 超时 / 断点 / 熔断 | 原因 + Retry / Dismiss |
| `error` | 引擎异常 | 原因 + Retry / Dismiss |
| `idle` + 账本有 `delivered = 0` 的行 | 上一次页面生命里跑完但没送出去 | 补发卡（⚠️ 没有 session 也要显示） |

会话结束时 `endReason` 记录原因（`complete` / `infeasible` / `user_stop` /
`circuit_breaker` / `paywall` / `no_tool_call`），
`AgentSessionSummary` 据此决定显示完成卡、"做不到"说明还是升级引导。
注意里面**没有** `max_rounds` —— 见下文，那是 check-in 不是结束。

### complete_task 不接受「跟活儿写在同一轮」

AI 经常一口气发三条 UPDATE 加一个 `complete_task`。问题是**它写这轮回复的时候还没看到那三条
的结果** —— 结果是下一轮才回传的，而 `complete_task` 让循环就地结束，那一轮的 results 连同
session 一起被丢掉。所以只要有一条写失败了（或者被用户拒了），最终状态是：库没改成，
而对话里留着一句自信的「已完成」。

现在 ③ 里拦这一种：**这一轮有任何失败或被拒的调用 + 出现 `complete_task` → 不结束，改成
把结果回传**。AI 读到真实情况，然后要么修，要么用 `partial` / `infeasible` 老实报。

```
completion && trouble.length > 0
  → results.pop()                  ← 把 __TASK_COMPLETE__ 那段扔掉
  → push「### ⚠️ Completion Not Accepted」+ 说明
  → return { kind: 'results' }     ← 走 ④ 回传，轮次继续
```

⚠️ **只拦失败那一种。** 全成功时它的判断算数，直接结束 —— 去质疑一次干净的执行只会白烧一轮。

⚠️ **`results.pop()` 是必需的。** 不摘掉那段，AI 会读到自己发出的 `__TASK_COMPLETE__`
标记，然后认为任务已经关闭了。

⚠️ **prompt 里也写了**（soul.ts 的「Never call complete_task in the same response as work」
+ 规则 11/16 + `task-provider` 的 schema description），但 prompt 不能是唯一防线：这类错误
的后果是「留下错数据同时告诉用户没事」，而 Gemini 对长 prompt 的遵循度本来就不稳。两边都要有。

### 一轮回复只有两种合法结尾

| 结尾 | 工具 | 引擎行为 |
|------|------|----------|
| 继续干活 | 任意工具 | 执行 → 结果回传 |
| 结束 | `complete_task`（`status`: success / partial / infeasible） | `finish()` |

没有第三种。AI 需要用户判断时唯一的出路是 `complete_task('infeasible')` 把缺什么
说清楚 —— 那会留在结束卡上，用户看得到。

⚠️ 曾经有过 `ask_user`（`awaiting_user` 状态 + 三路 race + bonusRounds + 侧边栏
问答面板 + 散文提问兜底），整套删掉了。它要求引擎在等回复的同时观测「用户是不是
直接在聊天框答了」，为此背了 `carryOver`（问题前已产出但没送出的结果）、
`observed`（回复已经生成完，① 的 baseline 会等一个已发生的回合）、
以及提问不占 `maxRounds` 的额度豁免 —— 三个机制都只为这一条路径存在。

### 批准看的是 change_summary，不是 SQL

`description` 是**这一步**的一行标签（「link candidate conversations to tags」）—— 它不说
哪些对话、哪些标签、多少条，所以拿它没法做决定。`execute_sql` 因此多了一个
`change_summary`：AI 写的 markdown，说清楚用户的数据会变成什么样。

批准框（`AgentApproval` 和卡片）的主体就是它，**完整展开而不是折叠** —— 它就是决定本身，
不是决定背后的细节。

| 情况 | 批准框里显示 |
|------|-------------|
| 有 `change_summary` | 渲染成 markdown，**不显示**「查看 SQL」 |
| 没给（AI 漏了） | 回退成原来那个「查看 SQL」折叠按钮 |

⚠️ **有 summary 时故意不给 SQL 入口。** 99% 的用户读不懂 SQL，放在决策路径上是干扰而不是
保护。要看语句就在 agent 视图里展开那张卡 —— 卡片的展开区是 summary 在上、语句在下。
但**「一句人话都没有」比「只有 SQL」更糟**，所以 AI 没给的时候那个按钮要回来。

⚠️ `change_summary` 是**可选**的，没进 `REQUIRED_PARAMS`。设成必填会让格式事故变多
（doc 里那条「Gemini 对格式遵循度不稳」同样适用），而 SELECT 压根不需要它。
硬性要求写在 prompt 里（soul.ts 的「Every write must explain itself」+ 规则 17 +
sql-provider 的 schema description），代码这边靠上面那个回退兜。

### ⚠️ 它不能参与「谁是同一个调用」的判定

`NON_IDENTITY_PARAMS`（tool-schema.ts）+ `identityParams()`，两个消费者共用一个 helper：

| 消费者 | 不排除的后果 |
|--------|-------------|
| `circuit-breaker.toolCallSignature` | AI 只要**换个说法**，同一条坏语句就不算重复调用，循环检测直接瞎掉 |
| `buildToolCallFingerprint` → `buildToolCallKey` | 同一个调用每次算出不同 join key，卡片找不到自己的结果 |

第一条更要命：那恰好是这个检测存在的场合。

### ⚠️ markdown 进 JSON 字符串 = 新的格式事故来源

`change_summary` 要求 markdown（要有 bullet 才好读），而它得待在 JSON 字符串里 ——
模型经常直接敲真换行而不是 `\n`。真换行在 JSON 字符串里是**非法**的，
`JSON.parse` 会拒掉**整个 block**，于是一个写操作因为「只给人看的那部分」排版没弄好而
整个被丢掉。

`fallbacks.ts` 的 `escapeRawControlChars` 修这个：扫一遍，只把**字符串内部**的
`\n` `\r` `\t` 转义掉。安全性来自「字符串里的真换行本来就非法」—— 修它只可能把
不可解析变成可解析，不可能弄坏本来正确的 JSON。token 之间的换行是合法的，所以必须跟踪
字符串状态，不能全局替换。

⚠️ `describeJsonFault` 判定这一档**直接调用 `escapeRawControlChars` 看有没有变**，
不再写第二个正则 —— 两边对「什么算这个错」不会有分歧。

### 写确认这一条闸

`requiresApproval()` 是唯一的用户闸门：宿主发起，问的是"这条操作允许落地吗"，
用户可以关（`autoRunReads` / `autoRunWrites` / `speedMode`）。

拒绝时 AI 拿到的是带理由的 `CANCELLED:` 段落，并附一句"不要原样重试" ——
只回一个 `CANCELLED:` 的话，AI 最可能原样再发一次然后撞上 `checkRepeatedToolCall`。

### 没有 token 估算，也没有耗时统计

都删掉了。`tokenEstimation` / `estimateTokens` / `formatTokenCount` 从来没有任何 UI
在读，是纯死代码；耗时（`sessionStartedAt` + `useElapsedTime` + `tool:executed` 的
`durationMs`）除了在 header 上跳个秒数没有别的用途。

⚠️ 别顺手删 `ToolCallResult.timestamp` / `ExecutedCall.timestamp` —— 那两个是**记录
顺序**用的，`AgentSessionSummary` 靠 history 顺序倒着找最后一条 `complete_task`。

### UI 如何控制引擎

engine 实例在 `AgentLoopFeature` 里创建，Stop / Retry / 继续 的按钮在 Dock 里。
两者通过 `engine/engine-registry.ts` 的模块级 handle 连接：

```ts
setActiveEngine(engine);            // AgentLoopFeature 创建时
getActiveEngine()?.stop();          // Dock 的 Stop
getActiveEngine()?.resume();        // Dock 的 Retry（paused | error 可用）
getActiveEngine()?.continueNow();   // Dock 的「继续」→ triggerSend()
```

批准是唯一的例外：决定通过 `pendingApproval.resolve(decision)` 回给引擎，不走
engine 方法。

⚠️ 只改 store 不叫 engine 是无效的：engine 持有自己的 abortController 和
`waitForUserSend()` promise。历史上 Stop 只改 store，引擎会在后台继续跑。

### Dock 什么时候出现、什么时候自己展开

```
可见 = 不在 `>` 弹窗打开时
       且 ( (status !== 'idle' || endReason !== null)   ← 有会话
              且 会话属于当前对话
              且 (还在跑 或 结束了但有事要办)
            或 当前对话有未送达的结果 )                  ← ★ 没有 session 也算
展开 = 有待决策 ? 用户没手动折叠 : 齿轮打开
       或 没有 session（补发卡就是全部内容，没什么可折的）
```

⚠️ **`hasOwedResults` 是独立的一支，不能塞进 `hasSession`。** 它描述的是上一次页面生命
留下的欠账，那时候没有任何 session。同时 pill 改成只在 `hasSession` 时渲染 ——
它读 status，而这种情况下 status 是 `idle`，显示出来就是一行谎话。

⚠️ 箭头按钮的行为跟着上面这条分叉：有决策时它折叠决策，没有决策时它开关那组开关。
两种情况都接 `collapsed` 的话，整个跑动过程里它是个死控件 —— 没有待决策，点几次都不出东西。

⚠️ **不能做成「只有待决策才出现」。** `speedMode`（「本次任务别再问了」）一开，就再也
不会有任何东西需要决策 —— 那 Stop 和「撤回 speedMode」的入口会一起消失，跑飞了没法刹车。
所以常驻一行 `AgentDockPill`，Stop 和那个闪电图标都在上面，不在折叠区里。

⚠️ **自动展开靠 `decisionKey` 而不是布尔量。** 用布尔量的话：批准完一个写操作、下一个
接着问，dock 仍然是折叠的，一个活着的问题被藏在收起的箭头后面。key 里带上
`pendingApproval.fingerprint` / `checkInSteps`，换了一个决策就重新展开。

⚠️ **dock 在两次会话之间是 `return null` 而不是卸载**，所以 `settingsOpen` / `collapsed`
得自己清，否则下一个任务开场就带着上一次拉开的抽屉。

⚠️ 步骤列表（原 `AgentExecutionHistory`）**已删除**。它和聊天流里的工具卡片是同一份信息，
而卡片长在那条 SQL 旁边、带真实输出、刷新还在（`tool-outcomes.ts` 从对话里读回来），
侧边栏那份是内存里的、刷新就没。`AgentCheckIn` 里原来写「往下看看」的文案也跟着改成指向聊天流。

### 只有一条执行路径：引擎执行，卡片批准

**引擎是唯一执行工具的东西。** 消息卡片上的按钮不执行任何东西 —— 它是引擎那个
`await` 的回答入口。

```
execute-tools 逐个处理 tool call
  requiresApproval(call)?
    否 → 直接执行
    是 → stages/approval-gate.ts
           status = awaiting_approval
           store.pendingApproval = { fingerprint, toolName, params, risk, remaining, resolve }
           ↓ 等 resolve（卡片 / 侧边栏 / abort）
         批准 → 执行
         拒绝 → 生成 CANCELLED 段落（带用户理由）回传，继续下一个 call
```

卡片靠 `pendingApproval.fingerprint === 自己的 fingerprint` 判断"轮到我了"，
所以批准就发生在你正在读的那条 SQL 旁边。

批准范围三档，在提问那一刻选，不是设置项：

| 范围 | 效果 | 存哪 |
|------|------|------|
| `once` | 只这一条 | — |
| `round` | 本次回复剩下的都放行 | `approveRestOfRound`（`nextRound()` 清零） |
| `task` | 本次任务全放行 | `speedMode`（会话级） |

`round` 这档是必需的：一次回复经常带好几条 SELECT，一条条批是会让人干脆把整个
保护关掉的那种摩擦。

**之前是两条路径**：引擎自动执行，以及卡片上的「执行」按钮自己跑一遍工具、把结果
`appendCapsule` 到输入框让用户手动发送。为了让两条路不撞同一个操作，需要
`executedCalls` 指纹账本做去重、引擎 busy 时禁用按钮、而且仍有 check-then-act
竞态（引擎是执行**完**才写指纹）。合成一条之后这些全部消失，
`renderer/helpers/tool-executor.ts` 整个删掉。

`executedCalls` 保留但降级为**纯展示** —— 卡片用它显示「已执行 / 执行失败 / 已拒绝」。

### 卡片状态有三个来源，按「第一手程度」排序

```
executedCalls        →  agent_tool_calls 表   →  deriveToolOutcomes
（当前 tab 的会话）       （落盘的账本）             （从对话里推）
```

`executedCalls` 只认识**当前这个 tab 里正在跑的会话**：`start()` 会清空它，刷新页面也没了。
所以以前打开旧对话，每张卡片都写着「未执行」—— 而那次调用的输出就在下面一条消息里。

**中间那层是 `agent_tool_calls` 表**，见下面「落盘的是我们干了什么」。它第一手但可能过期。

**最后一层是结果消息本身。** ④ 把结果作为一条真实的 user 消息发回给 AI
（`<bs_agent_result>` … `### label [[bs:key]]` … body），所以对话 DOM 也是一份持久层。
它排最后但**不能删**，因为只有它覆盖得到：在别的浏览器里跑过的、这个功能上线之前的、
以及库被清掉之后的会话。

⚠️ 三层的顺序不能反。账本知道「跑了但结果从没进过消息」这种调用，对话不知道；
对话知道那些没有账本行的历史，账本不知道。谁在自己覆盖不到的地方让位，就是这个顺序。

```
renderer/helpers/tool-outcomes.ts   ← engine/stages/handoff/formatter.ts 的逆运算
  parseToolResults()    拆出 ### 段落，顺手读出每段的 join key
  deriveToolOutcomes()  把 model 轮的 tool calls 和下一条 user 消息的段落对齐
```

### join key：段落自己说它答的是哪个 call

每个 `### ` 标题末尾带一个 `[[bs:xxxxxxxxxx]]`，就是那个 call 的
`buildToolCallKey()` —— `buildToolCallFingerprint` 的 10 位十六进制摘要。
卡片**自己算得出**这个 key（它手里就有那个 call），所以对齐是一次查表。

为什么是摘要而不是随机 id：随机 id 只在「DB 行还在」的前提下有意义，换个浏览器、
重装、或者恢复备份没带上这两张表，它就是个悬空指针。摘要自描述，对话本身就够。

⚠️ **于是 `buildToolCallFingerprint` 变成了 wire format。** 改它对 params 的归一化方式，
所有已经写进对话的 key 全部失配。失配会降级到下面的启发式，所以不会静默出错，但这是一道单向门。

⚠️ **写一种形式，读要宽松。** payload 要经过 Quill → Gemini 渲染 → `htmlToMarkdown`
才被解析，这趟往返已经有过塞进零宽字符、空行塌陷的前科（`SECTION_SEPARATOR` 也是因此
只能按形状匹配）。所以 `KEY_RE` 只找标题行里的 `bs:` 标记，不管周围的括号、反引号、
大小写还剩下什么。

⚠️ **token 不能进 label。** `splitSections` 拿 label 当 capsule 的显示文字，`stripSectionKey`
必须先把它摘掉，否则用户会在输入框的胶囊上看到一串十六进制。

### 对不上的时候还是走启发式

`### ⚠️ Loop Warning` 这种不属于任何 call 的段落故意**不带 key**，所以它在第一趟里
天然被忽略 —— 这正是它以前会把纯位置匹配整体错开一位的那个坑。

第二趟是老规则，只在两边的剩余项上跑：**先按 label，条数相等才信位置**。它留着不是为了
兜格式意外，主要是为了**没有 key 的历史对话**：别的浏览器跑的、功能上线前的。

对不上就是 `null`（显示「未执行」）。在一个真的跑过的调用上写「未执行」，比在一个没跑过的
调用上写「已执行」要小的谎。

⚠️ 实测过：key 真正比老启发式强的场景是**段落顺序和 call 顺序不一致**。重复 label、
结果正文里的表格边框这两种，老规则其实扛得住 —— 别拿它们当引入 key 的理由。

卡片的取值顺序是 `executedCalls[fingerprint] ?? derivedOutcome`：账本是第一手的，而且知道
那些结果从没进过消息的调用；其余情况由对话回答，刷新之后它是唯一的来源。

⚠️ `formatResults` 的语法常量（`RESULTS_HEADER` / `SECTION_SEPARATOR` /
`PARSE_ERRORS_HEADER` / `USER_INSTRUCTION_HEADER`）从 `formatter.ts` **import**，不要重打一遍。
两头一漂，症状是所有卡片悄悄退回「未执行」。

⚠️ `isolateSections()` 要先切掉 `## User Instruction` 前缀块和 `## Parse Errors` 尾块。
直接对整个 payload 按分隔符 split 会把它们当成伪段落，条数一变，位置兜底就跟着错。

⚠️ 成功/失败用 `body.startsWith('ERROR:' / 'CANCELLED:')` 判，不要用多行搜索 —— 查询自己的
输出里完全可以出现 ERROR 这个词，只有第一行是判词。递进错误提示是**追加在结果后面**的，
所以前缀不受影响。

⚠️ 卡片只存在于 **custom 渲染视图**，用户可以中途切回 Gemini 原生渲染；而且长回复里
卡片会被滚出屏幕。所以 `AgentApproval` 在 Dock 里留了第二份，同一个 `resolve`，谁先答
谁算。不然切回原生视图就找不到批准的地方，引擎会一直挂着。

⚠️ 这一份**曾经在侧边栏**，那是最差的位置：侧边栏可以整个关掉，也可能停在别的 tab 上，
两种情况下批准都无处可答。Dock 贴着输入框，永远在。

⚠️ 审批门在**引擎**里，不在工具里。以前 `execute-sql` 自己调
`requestUserConfirmation` —— 工具去开 UI，而且请求里只有 SQL 字符串，没有任何东西
能说清"这是哪一次调用"，所以批准只能是一个转述式的独立弹窗，没法长在卡片上。

### 落盘的是「我们干了什么」，不是消息

两张表，建在 `shared/workers/migrations.ts` 的 `create agent ledger tables` 里：

| 表 | 装什么 |
|----|--------|
| `agent_sessions` | 一次任务：conversation_id / title / status / end_reason / rounds / 起止时间 |
| `agent_tool_calls` | 一次调用：join_key / round / order_index / tool_name / params / status / result_body / delivered |

**故意不复制 message。** 对话仍然是「说了什么」的记录，这两张表只装从对话里推不出来的东西：
这条调用有没有跑过，以及它的结果有没有到过 AI 手里。理由有三条，从弱到强：

1. AI 的上下文是 Gemini 的对话，不是我们的库。payload 还是得拼成那个格式塞进输入框，
   `formatResults` / 31998 预算 / staging / send-watcher 一行都省不掉 —— 落盘省不掉这些。
2. 两份真相没有对账机制。用户能在 Gemini 里删一轮、编辑重发、切 response 草稿。
   对话当真相有个天然好处：永远和用户眼前看到的一致，不需要维护。
3. `SYNC_TABLES` 已经明确排除了 `messages`。复制一份同样面临「同不同步」，
   同步是体积和隐私，不同步换浏览器就是空的 —— 于是还得留 DOM 兜底，比现在更复杂。

**也不进 `SYNC_TABLES`。** `result_body` 大且私密，和 `messages` 同一个理由。
换台机器打开同一个对话就是没有账本行，退回读对话。

写入时机三个，缺一不可（`agent-loop/records.ts` 的 `toolCallRecorder`）：

```
① 批准通过、执行之前   → INSERT status='running'      ← await，行必须早于工具
② 执行完                → UPDATE status + result_body   ← fire-and-forget
③ 送达确认（'sent'）    → delivered=1, result_body=NULL ← handoff 的 settle()
```

⚠️ **① 必须 await，而且必须在工具之前。** 「执行写操作的中途刷新」是唯一没有任何其它
线索能还原的情形：库已经变了，结果不存在于任何地方。留在 `running` 的行就是下次加载时
唯一的证据，卡片据此显示「可能执行了」而不是「未执行」—— 后者会招来重跑。

⚠️ **③ 顺手把正文清掉。** 送达之后对话里就有了，留第二份是这张表唯一会无界增长的来源。
反过来说，`delivered = 0` 期间那份正文是**世上唯一的一份**（payload 在已经不存在的输入框里）。

### 什么样的行才算「欠着」

`result_body` 的含义是**「AI 还需要这个」**，不是「这是执行结果」。这个区分踩过一次坑：
`complete_task` 也被存了正文，于是刷新回来 Dock 弹出一张卡，问你要不要把 AI 自己发的
`__TASK_COMPLETE__` 标记发给它 —— 而任务在上一条消息里已经明明白白结束了。

两道闸，缺一不可：

| 闸 | 规则 |
|----|------|
| 写入时 | `deliversResultToAI(name)` 为 false 的工具**不存正文**。`complete_task`（CONTROL_TOOLS）和 handoff 工具就地结束会话，结果永远不回传，所以它们不欠任何东西 |
| 结束时 | `endSession()` 把这个 session 剩下的 `delivered = 0` 全部清掉 —— **结束了的会话不欠任何东西** |

第二道闸管的是另一半：一轮里 `[UPDATE, UPDATE, complete_task]`，那两条 UPDATE 的正文也存了
而且永远不会回传。它们的正确归宿是被丢弃，不是被当成待补发。

⚠️ 真正会产生欠账的只有**页面中途消失**（刷新），而那条路径压根到不了 `finish()` ——
这正是这条规则成立的原因。`pauseAndEnd`（熔断）也不走 `endSession`，因为它手上那份报告
就是等着 Retry 去送的。

⚠️ **`markRoundDelivered` 按轮，不按条。** 一轮所有段落在同一条消息里走，送达是一个事件。
`ResultHandoff` 为此专门记了 `pendingRound` —— 不能读 store 的当前轮，重试路径上
两者会错开，标错轮会让真正欠着的那一轮永远欠着。

⚠️ **所有写都是 best-effort，异常一律吞掉。** 账本是辅助不是机制：丢一行只是退回读对话，
而让一个失败的 INSERT 抛出去，会掐掉一个已经成功的工具调用 —— 从那段本来是为了
「记住它成功了」的代码里。

### 「跑了但没送出去」怎么恢复

这是这张表存在的首要理由。场景：用户批准了写操作，执行完，结果 staged 在输入框里，
还没发送就刷新了页面。库已经改了，payload 只活在那个输入框里，等回复的引擎也没了。

**恢复动作是补发，不是重跑。** auto-pickup 干的恰好相反：它看到一条 model 回复的 tool call
后面没有对应结果，就起一个新 session 把它们执行掉 —— 对写操作就是做第二遍。更别扭的是
第二遍还会再问一次批准，用户刚批过，大概率再批一次，于是界面主动引导出这次重复写。

```
AgentLoopFeature 加载 agent-record-store
     ↓ recordsReady（⚠️ 见下）
pickup 的守卫：账本里有这些 key → 直接不 pickup
     ↓
Dock 出 AgentOwedResults 卡（⚠️ 这是唯一没有 session 也会显示的卡）
     ↓ 用户点「发给它」
emit('recovery:deliver-owed')  ← 走事件，因为刷新后压根没有 engine
     ↓ AgentLoopFeature 建 engine
buildOwedPayload(rows)         ← recovery.ts，重走 formatResults 复用语法和预算
engine.deliverOwedResults()    ← holdForRetry + resend + advanceRound + runRounds
     ↓ 返回「送出去了没」
confirmOwedDelivered(rowIds)   ← ⚠️ 按 id，见下
```

⚠️ **`recordsReady` 这道门是必需的。** 读库要过一趟 worker，而 pickup 那个 effect 由 DOM
驱动 —— DOM 先到。少了这道门，守卫会在最要紧的那一帧读到一个空账本，然后重跑掉它本来
要保护的调用。判据是拿 store 自己的 `conversationId` 比，所以「导航快过查询」也算没就绪，
而不是算成「没有记录」。

⚠️ **收尾要按 row id，不能用 `markRoundDelivered`。** 补发的行属于**被中断的那个 session**，
而这次发送发生在一个新 session 名下。按 session+round 标记够不到它们，结果是下次加载
又把同一批结果拿出来问一遍 —— 而 AI 早就读过了。

⚠️ **`deliverOwedResults` 的返回值只表示「送出去了没」**，不代表后面几轮的成败。
结果一到 AI 手里就算结清，三轮之后报错不该把它们退回欠账堆。

⚠️ **`pauseAndEnd` 故意不关账本 session。** 那条路径总是还欠 AI 一份报告
（`holdForRetry` 正拿着），Retry 就是去送它的，关掉会让重试要 settle 的行变成孤儿。

### 会话与对话的绑定

store 是全局单例，所以 `start()` 会记下 `sessionConversationId`。
`AgentDock` 只在 session 属于当前对话时显示；离开该对话且已 idle 时自动 `reset()`。
新对话里启动的会话一开始没有 id（`null` 视为属于当前对话），发出第一条消息拿到 id 后
由 `attachSessionConversation()` 认领 —— 结束之后也要认领，否则一个没绑定的会话会
跟着用户出现在每个对话里。

### 用哪个视图：推导出来的，不是记下来的

`viewMode`（运行时 store）是**现在屏幕上是什么**；`agent-view-store` 的
`overrides[conversationId]` 是**用户手动选过什么**。两者分开，因为默认值是推导的：

```ts
desired = override ?? (hasAgentContent || isRunning ? 'custom' : 'original')
```

`hasAgentContent` 直接看当前对话 DOM 里有没有 prompt marker / tool call / tool result。
所以刷新页面、切回旧对话都会自动进 Agent 视图 —— 依据就在页面上，常见情况什么都不用记。

⚠️ 以前是「conversationId 变化且 idle → 强制 original」。刷新（null → id）和打开旧对话
走的是同一条路径，于是**每次**都得手动点一下切换按钮，哪怕页面里明摆着是 agent 对话。

⚠️ 只有「用户亲手覆盖」才落盘。在一个 agent 对话上切回原生视图是关于**这个对话**的
决定，下次刷新又跳回去会像按钮没生效。所以 override 一条一条按对话存，只在点按钮时写。

⚠️ `hasAgentContent` 必须进 effect 的依赖：mount 时它是 false，DOM 解析完（一两个 tick 后）
才变 true。

⚠️ **清 override 在 `agent-loop-store.start()` 里，不在组件的 effect 里。** 之前那条
「给我看原生 DOM」是为了读历史，现在要跑任务了，它就过期了。放在 `start()` 里是因为
那儿本来就已经在设 `viewMode: 'custom'` —— 同一个决定放一处。写成组件里的第二个 effect
会和「应用 override」那个 effect 抢同一帧，视图先闪一下 original 再跳回 custom。

---

## AI Studio 上的 `>`：没有 capsule，标记自描述

textarea 装不了节点，所以选中条目后写进输入框的就是纯文本 `>条目标题 `。
关键决定是**条目 id 从文本本身反推**（`matchAgentEntryInText`），不存在任何配套 state：

⚠️ 用 React state 存 id 的话，组件一重挂载 state 就没了，而标记还在输入框里 ——
下一次发送会把 `>条目标题 用户那句话` 当普通消息发出去。这个失败**用户完全看不见**，
表现就是「这个技能坏了」。文本自描述顺带还让用户手打标记也能用。

两个配套机制，缺一个都会出问题：

| 机制 | 没有它会怎样 |
|------|-------------|
| `maskEntryMarker()`（喂给触发检测前把标记打成零宽空格） | 标记自己的 `>` 会在后面每敲一个字时重新弹出选择框。Gemini 靠 capsule 元素 + `getTextExcludingCapsules` 绕开，textarea 只能在字符串上做同一件事。用零宽空格而不是删掉，是为了标记后面的偏移量还对得上光标 |
| `composeAndSend` 里先查 `RESULT_OPEN_TAG` 再找标记 | 引擎的结果在 AI Studio 上是纯文本躺在输入框里，正文里完全可能出现一行像标记的东西（markdown 引用了一个标题）。先匹配到标记就会走进「已有会话在跑」分支，**拦掉运行中的循环正在等的那次发送** |

### 发送拦截：按钮 + 键盘，两个都要

`aistudio-editor.ts` 的 `installRunInterceptor()`，document capture：

- **Run 按钮点击** —— 主路径。选择器要经 `footer` 收窄，因为 `ms-run-button`
  在每个 chat turn 上也有一个（单轮重跑），抓错了「发送」会变成静默重跑一轮旧的。
- **Enter 键** —— 不可省。AI Studio 允许用户自己选 Enter 还是 Ctrl/Cmd+Enter 发送，
  而这个偏好我们读不到，所以只拦按钮的话另一半按键会把原始 `>标题` 直接发出去。
  于是**有待发送标记时，带不带 modifier 的 Enter 都拦**，代价是那期间非配置的那个键
  插不了换行。Shift+Enter 不碰（任何设置下都是换行）。

⚠️ document capture 的 keydown 比输入框上的 popup handler **先**执行，
所以 `composeAndSend` 第一件事是「弹窗开着就返回 false」——那一下 Enter 的语义是
「确认选中项」不是「发送」。返回 false 不 preventDefault，popup 自己的 handler 接着跑。

⚠️ `registerBeforeRunHandler` 和 Gemini 侧一样是**模块级单槽**：`/` 不注册，`>` 注册。

### `<textarea>` 的内容变化 MutationObserver 看不见

`send-watcher` 的第①步（等 payload 离开输入框）在 AI Studio 上**必须靠轮询**：
textarea 的内容在 `value` 属性里，属性写入不产生任何 mutation record。
只用 observer 的话，一次完全成功的发送会在那儿干等满 5 分钟，然后报「结果没送出去」。
现在 observer 和 200ms 轮询并存，Gemini 走 observer，AI Studio 走轮询，不分平台。

⚠️ 同理，`setValue` 必须走 `HTMLTextAreaElement.prototype` 的**原生 setter**：
Angular 在元素上覆盖了 `value`，直接赋值写进错误的地方，模型不更新 ——
症状是输入框看着有内容而 Run 按钮一直 disabled。

---

## 消息发送的两条路径（Gemini）

### 路径 1: Enter 键

由 `useEditorIntegration` 的 `onKeyDown` handler 拦截（capture 阶段）：

1. 检查 result capsule → 有则合并 + replaceAllContent + triggerSend
2. 检查 prompt capsule（匹配 triggerChar）→ 有则调用 `onBeforeSend`
3. `onBeforeSend` 返回 true → preventDefault，由 adapter 自行发送
4. `onBeforeSend` 返回 false → expandCapsules 展开后让 Gemini 原生发送

⚠️ **`composeAndSend` 一旦看到 `>` capsule 就必须返回 true，包括各种失败情形。**
返回 false 会走到第 4 步：capsule 就地展开成 skill 的原文，由 Gemini 当普通消息发出去 ——
没有 soul、没有 tool schema、没有 `[#bs-agent:...#]` marker。用户看到的现象就是
「这个技能坏了」：AI 拿到一段没有工具可用的任务描述，会话也不切 agent 视图。
所以所有失败分支（会话未 idle / entry 不存在 / prompt 组装抛错 / 文本没落进输入框）
都走 `abort()`：拦下发送 + toast 说明原因，capsule 留在原地供重试。

⚠️ **prompt 组装要放在 `expandAllCapsules()` 之前。** 反过来的话，组装抛错时编辑器里
已经是展开后的 skill 原文，异常又逃出了 click handler（`preventDefault` 还没调用），
Gemini 就把那段原文发出去了。

### 路径 2: 发送按钮点击

由 `installSendButtonInterceptor()` 注册的 document capture click 拦截：

1. 检测 click target 匹配 `.text-input-field .send-button-container>gem-icon-button>button`
2. 有 prompt capsule → expandCapsules（就地展开，Quill 同步后 Gemini 原生发送）
3. 有 result capsule → preventDefault → 合并 + replaceAllContent + triggerSend

⚠️ **必须在 capture 阶段拦截**，否则 Gemini 的 Angular handler 先执行，读到的是 Quill Delta 里的显示文本而非真实 prompt 内容。

---

## 关键组件详解

### 平台适配层

`adapters/types.ts` 的 `AgentPlatformAdapter` 是引擎看世界的唯一窗口。
**引擎里不许再直接 import `quill-editor`**（或 `aistudio-editor`）——这条以前破了三个口子，
所以 AI Studio 无论适配器写成什么样都跑不起来：

| 原来 | 现在 |
|------|------|
| `send-watcher` import `getSendButtonState` | `adapter.getComposerState()` |
| `handoff/index` import `triggerSend` | `adapter.triggerSend()` |
| `staging.ts` import 一堆 capsule helper | `adapter.stageResultCapsules?()` / `hasStagedCapsules?()` |

`getComposerState()` 返回 `ComposerState`（`send` / `stop` / `absent` / `unknown`）。
⚠️ **`absent` 是语义而不是「元素不存在」**：Gemini 输入框空的时候把按钮整个删掉，
AI Studio 留着按钮但打上 `aria-disabled="true"`。两种 DOM，同一个权威事实
（没在生成 + 没人在输入），所以都映射到 `absent`——① 靠它区分「答案静默了」和
「消息压根没送出去」，映射错会让 `not_delivered` 那一档失效。

`stageResultCapsules?` 是**可选**的，而「没有」是一个正常答案不是待填的坑：
它需要能容纳非文本节点的编辑器。AI Studio 是纯 `<textarea>`，所以 `staging.ts`
退到纯文本，`<bs_agent_result>` 那段payload 就明晃晃躺在输入框里。这在 AI Studio 上
是**常规路径**，不是降级。

`response-settle.ts` 是「AI 回复完了没」的唯一实现，两个适配器共用，
平台差异只有三个读取函数（`ResponseSettleProbe`）。原来这段 100 行带满注释的逻辑
长在 gemini-adapter 里，抄第二份等于把里面每一个历史坑再学一遍。

| 适配器 | 编辑器 | 结果暂存 | 送出 |
|--------|--------|----------|------|
| `gemini-adapter` | Quill contenteditable | capsule | 发送按钮（send/stop 同一个） |
| `aistudio-adapter` | `<textarea>` | 纯文本 | Run 按钮（Run/Stop 同一个） |

### useEditorIntegration

位于 `trigger-popup/useEditorIntegration.ts`。事件拦截层：
- 监听 `input`, `keydown`(capture), `blur`, `click`
- MutationObserver 检测编辑器重建（SPA 导航）
- 从 `quill-editor.ts` 导入所有 capsule 操作

### AgentLoopEngine

- `insertResultCapsule()` → 调用 `insertMultipleCapsules(editor, capsuleData[])`
- `waitForUserSend()` → MutationObserver 等 result capsule 从编辑器消失，
  同时监听 `abortController.signal` 的 abort 事件（否则 Stop 之后若页面无变动会一直挂着）
- `addResult()` 会带上 AI 给的 `description`，Agent Tab 用它显示人话步骤
- Circuit breaker: 循环检测 + 连续失败熔断

### ConversationRenderer

- `ToolCallWidget` 不执行任何东西，只负责显示状态和承接批准
  （`pendingApproval.fingerprint` 匹配时亮起）
- 结果 capsule 由引擎的 `stages/handoff/staging.ts` 写入，
  显示格式 `Result: {description}`（i18n key: `agentLoop.resultCapsulePrefix`）


---

## 与现有系统的集成点

### 工具失败：错误必须回到 AI 手里

失败的 tool result 和成功的走**完全同一条路**——拼成 `### 段落` 进 `results`，
经 ④ 回传给 AI。`getProgressiveErrorGuidance()` 还会按连续失败次数追加递进提示
（第 1 次「分析错误换个写法」，第 2 次「查 sqlite_master 确认表名」，第 3 次
「必须换方法」）。这是 agent 能自我纠错的唯一机制。

⚠️ 唯一的例外是熔断硬停（连续 6 **轮**失败 / 同一调用 5 次），而这里曾经有个 bug：
`breakCircuit()` 把攒好的 `results` **直接丢掉**然后 pause。后果是双重的——AI 永远
不知道错在哪，而且 `resume()` 看到 `handoff.hasPending() === false` 就直接进 ①，
去等一个**根本没发出去的消息**的回复，静默超时 30 秒后再 pause。用户看到的就是
「SQL 失败 → 卡住 → 点 Retry 没反应」。

现在的形状：

```
③ 返回 { kind: 'halted', results, reason }   ← 区别于 'ended'（complete/paywall，不欠东西）
     ↓
引擎 handoff.holdForRetry(payload)          ← 只记住，不写进输入框
     ↓
ctx.pauseAndEnd(reason, 'circuit_breaker')
     ↓ 用户点 Retry
resume() → hasPending() → resend()          ← 此时才 stage + 发送
        → advanceRound() → 继续跑
```

⚠️ `holdForRetry` **故意不碰输入框**。写进去的话，循环已经 paused 而输入框里躺着
一段文本，用户很自然会按回车——消息发出去了，但没有引擎在等那个回复。`resend()`
自己会在需要时补 stage（`if (!isStagedInEditor()) stageResults(...)`）。

⚠️ `resume()` 会 `breaker.reset()`。用户是看过问题才点的 Retry，不重置的话下一次
失败立刻又触发硬停，Retry 只买到一次工具调用。`maxRounds` 仍然兜着上限，而且每次都
要人点一下，不存在失控。

⚠️ 失败预算按**轮**算,不按调用算(`beginRound()` + `roundFailureCounted`)。一次回复
最多 5 条 SQL,列名猜错的话会一起失败——那是**一个**错误看了五遍,AI 还没机会读到
任何一条。按调用算的话,一个误解就能在第一轮把整个预算烧光(旧的硬阈值是 4,四条
全错当场熔断)。阈值 6 给了 5 轮递进提示的空间,`getProgressiveErrorGuidance` 才有
机会真的起作用。⚠️ 成功时除了归零计数,还要清掉 `roundFailureCounted` —— 否则
「失败→成功→失败」这一轮里第二次失败会被当成"已经算过了"而完全不计数。

⚠️ `executeToolCall()` 用 try/catch 兜住**所有**异常并转成 `ERROR: ...` 字符串。
工具如果抛异常而不是返回 ERROR，异常会一路冲到引擎顶层的 catch，`ctx.fail()`
把会话打成 `error` 且没有 pending，Retry 又是同一个挂法——一个失败的步骤不该有这种
杀伤力。`execute-sql` 自己 catch 了，但别的 provider 不保证。

### 结果有多大：输入框是唯一的硬上限

Gemini 的输入框实测装到 **31998 字符**（UTF-16 length，中文一个字算 1）就不再收了。
④ 的所有结果都要过这个口，所以一轮的 payload 有一道硬预算，在
`engine/stages/handoff/budget.ts`：

```
COMPOSER_CHAR_LIMIT = 31998
SAFETY_MARGIN       = 2000    ← wrapper 标签 + replaceAllContent 的 \u200B + 数不准的部分
ROUND_BUDGET        = 29998
```

⚠️ **必须在代码里拦，不能只靠 prompt。** 超了的后果不是报错而是**静默丢数据**：
`send-watcher` 判送达看的是「payload 离开输入框」+「`user-query` 变多」，截断后的消息
两条都满足，于是判 `'sent'`、轮次照常推进。AI 收到的是尾巴被砍掉的 payload
（`</bs_agent_result>` 闭合标签和末尾几行没了），它和用户都不知道。

两层，都必要：

| 函数 | 角色 |
|------|------|
| `fitSections(sections, reserved)` | 优雅那层：按段分配额度，保住 `### label` 行 |
| `clampPayload(payload, reserved)` | 兜底那层：`reserved` 自己就爆了预算时的钝刀（超长的 mid-round instruction、超长 parse errors） |

**额度是"注水式"分配而不是平均分**：每段先拿等份，小段没用完的份额回流给大段。所以
一个孤零零的巨型结果能吃掉整个预算（实测 100%），而「4 条小查询 + 1 个大 dump」里
大 dump 拿到 28832 而不是被压成 1/5。这正是**单工具固定字符上限**做不对的地方 ——
也是为什么 `execute-sql` 里没有加那个上限，只保留了 `MAX_RESULT_ROWS`。

⚠️ **闸设在 `formatResults` 里**，因为它是所有 payload 的唯一漏斗 —— 包括
`holdForRetry` 为熔断硬停攒下的那份。设在 `staging.ts` 就晚了：那时已经没有可裁的结构。

⚠️ **截断段落必须保住 `### label` 行**。`splitSections` 拿它当 capsule 的标签，
`tool-outcomes.ts` 又靠同一个 label 把历史调用和它的输出对齐。切进标题里，capsule 会
悄悄变成无名的 "Result"，历史卡片跟着退回「未执行」。

⚠️ **截断处要留话给 AI**，`buildNotice()` 干三件事：说明输出不完整（否则 AI 会拿半张表
下结论）、给出拿到剩下部分的办法、以及明确否掉它最可能的下一步 —— 原样重跑同一条查询
（会在同一个位置被砍掉，白烧一轮）。

⚠️ **instruction 和 errors 不裁只算**。它们本来就短，而且是 AI 最需要完整看到的部分；
但它们占掉的字符会计入 `reserved`，所以工具输出会自动让位。

### 开场那条消息也受同一个上限，而且它以前砍错了一头

`>` 送出去的第一条消息是 `marker + system prompt + '\n\n## User Request\n\n' + 用户输入`，
走的是同一个输入框，所以同一个 ~30k 上限。两个平台的 feature 里原本都是这么兜的：

```ts
if (full.length > MAX_MESSAGE_LENGTH) full = full.substring(0, MAX_MESSAGE_LENGTH);
```

⚠️ **用户输入拼在最后，从尾巴砍就是精准砍掉用户的活儿、留下一整套指令。** 而且是静默的：
消息照常发出、`user-query` 照常出现、send-watcher 判送达、引擎照常开始跑一个没人交代过的任务。
用户看到的现象是「命令没发出去，只有系统指令」，控制台里只有一行 `console.warn`。

触发它只需要 prompt 长一点：实测 system prompt 已经在 **28.7k–29.9k**，占掉上限的 96% 以上，
加一个 1249 字符的 tool schema（`doc_read` 的初版）就顶过线了。

现在这段逻辑收在 `prompts/initial-message.ts`，policy 是三条：

| 规则 | 为什么 |
|------|------|
| 用户输入永不为了指令让位 | 被截的指令还描述着大部分工具；被截的任务就是没人提过的任务 |
| 指令最多让出 `USER_RESERVE = 8000` 字符 | 再往下让会砍掉「怎么结束循环」那段；超过这个长度的输入是粘贴的材料，该进工作区文件 |
| 两种截断都在正文里留话 | 只说「有内容被删」模型会照跑；说「你需要的工具可能没写在上面，别猜」它才会问 |

上限从两个文件里各写一遍的 `30000` 改成 import `budget.ts` 的 `ROUND_BUDGET`
（= `COMPOSER_CHAR_LIMIT - SAFETY_MARGIN` = 29998）。同一个输入框，同一个实测数字，
以前是三处真相。

⚠️ **如果正常使用中看到了截断提示，要修的不是上限而是 prompt。** 现在的构成里
`## Database Schema` 一段就 7636 字符（占 1/4），是最该动的地方。新增 tool schema 前
先想清楚：schema 是**每一轮**都进 prompt 的，而放进 skill 的内容是按需加载的。

## 三个 agent：Better Sidebar / Workspace / Browser

`>` 弹出的列表**一行一个 agent**，不再有 skill，也不再有「预先瞄准某类对象」的快捷条目。

| agent | 操作对象 | MCP | Agent tab 显示 |
|------|------|------|------|
| `bettersidebar` | 扩展自己的数据（对话/文件夹/标签/提示词/片段） | `builtin-bettersidebar`（sql/sync/export） | launcher |
| `workspace` | 工作区里的文件与文档 | `builtin-workspace`（Files）+ `builtin-documents` | 简介 + 文件树 |
| `browser` | Chrome 的标签页 / 标签组 / 书签（Chrome only） | `builtin-browser`（Tabs & Bookmarks） | 简介 + 权限摘要 + 本地流水 |

三者都拿到 `builtin-core`（`complete_task` + `activate_skill`）。⚠️ **core 不可关、也不按 agent 列**
—— 少了它的 agent 不是「能力弱一点」，是一个只能靠 Stop 退出的死循环。

### 加一个 agent 要碰的地方（就这几个，别再加特例）

1. `agents/types.ts` 的 `AgentId` 加一个 id —— ⚠️ 这是 wire format，见「旧 id 必须继续解析」
2. `prompts/souls/<id>-soul.ts` 写 soul，协议块从 `souls/shared.ts` 取，别自己写一套
3. `mcp/<id>-mcp.ts` + `mcp/providers/<id>-provider.ts`，然后挂进 `mcp/setup.ts` 的 `OWNED_SERVERS`
4. `tools/<id>-tools.ts` 放真正干活的函数（返回字符串、**不 throw**，照 `workspace-tools.ts`）
5. `agents/registry.ts` 加一条 `AgentDefinition`
6. `engine/parser/tool-schema.ts` 的 `SUPPORTED_TOOLS` / `REQUIRED_PARAMS` 登记工具名
7. `tool-labels.ts` 给每个工具一句人话，否则卡片上写「Running a step」
8. Agent tab 的面板（`tabContent`）+ `agent.agents.<id>.name/description` 两个 i18n key

⚠️ **`prompt-assembler.ts` 和 `tool-registry.ts` 里不许出现 `agentId === '<id>'`。** Browser agent
第一版就是这么写的：assembler 顶上一句短路，于是它绕过了所有共享协议块，`<bs_agent_tool>` 的格式
说明在代码里长出了第二份、而且已经和真的解析器对不上了。agent 的扩展点只有 `buildSoul` 一个。

### 唯一的例外：browser 的写是两段式

别的工具都是一次 `execute`。Browser 的写不行 —— 它中间夹着一个人：

```
prepare（后台按真实对象解析 operations）→ 用户批准这一批 → commit
```

所以 `engine/stages/execute-tools.ts` 里对 `isBrowserWrite` 有一段专门的代码，它**不走**
`tool-registry.executeToolCall`。三个后果，都得记住：

- 归属检查得在那里手动做一次（`toolRefusal()`，从 tool-registry 导出，就是为了两条路措辞一致）。
  少了它，一个 Better Sidebar 会话吐出 `browser_close_tabs` 会直接弹出批准卡。
- provider 里那些写工具的 `execute` 是**故意留着并且会拒绝**的，不是没写完：能走到那儿说明有人绕过了
  批准，静默执行是最坏的结果。
- prepare 出来的 plan 在后台占着一份快照，**从 prepare 之后的每条退出路径都要处理掉它**
  （拒绝 / abort / 报错），否则就是一批用户没答应过的操作一直上着膛。

批准看的是 `BrowserPlanPreview`（后台从真实对象生成，权威），`change_summary` 只是旁边那句人话。

### agent 可能「还不能用」——这是 agent 自己的属性

`AgentDefinition.unavailable?()` 返回 `{ reason, resolve }` 或 null。Browser agent 用它表达
「Chrome 权限还没给」：`reason` 直接顶替 `>` 列表里那一行的描述，点这一行就执行 `resolve`
（打开权限窗口）而**不是**写入 capsule。

⚠️ **pick 时和 send 时都要查。** capsule 会比授权活得久 —— 权限能从 Chrome 自己的 UI 撤销、我们收不到
事件，而手打的标记根本没经过第一道检查。少了第二次检查的症状是：一个只能在发送那一刻失败的
capsule，报错的地方离用户要修的东西隔着好几步。

早期版本把这件事写成了散落在 `agent-entry.ts` 和两个平台 `AgentLoopFeature` 里的
`id === '__browser_tabs__'` 判断，共 5 处。

### agent 不是 skill

以前工作区是个 skill（`builtin-workspace-agent`）。后果是数据库 schema 和文件协议同时在每一轮
prompt 里，模型经常抓错那一套。现在的分界：

- **skill** 是任务中途按需拉进来的细节，`activate_skill` 加载，属于某一个 agent。
- **agent** 是整个会话的上下文，第一条消息之前就定了，会话期间不变。

⚠️ **`activeAgentId` 是会话级不变量。** prompt 是按它组装的，工具层也按它判权限；跑到一半改掉
就会出现「模型手里是 A 的说明书，工具层按 B 收权限」。Agent tab 上的切换器只换**面板**，不换
正在跑的会话，正在跑的那一行会显示 spinner 把这个区别说清楚。

### 权限是两个独立问题

`mcp/registry.ts` 分开存：

| 问题 | 谁决定 | 存在哪 |
|------|------|------|
| **归属** —— 这个 server 属于哪个 agent | 代码（`agents/registry.ts` 的 `mcpServerIds`） | `registry` 的 `ownership` map |
| **开关** —— 用户要不要它进 prompt | 用户 | `agent-config-store.disabledMcpServers` |

两个都点头才能调用。归属检查放在前面，而且**拒绝话术故意不一样**：

- `other-agent` → `ERROR: 不属于这个 agent，别绕，告诉用户该换哪个 agent 然后结束`
- `disabled` → `CANCELLED: 用户关掉了`

合并成一句的后果是模型会反复重试一个永远拿不到的工具。⚠️ 这不只是整洁问题：Workspace agent 的
prompt 里没有 schema，它写出来的任何 SQL 都是对着没见过的表猜的——挡在这里，最坏结果是浪费一轮，
不挡就是写坏用户数据。

还有第三个问题，只有 Browser agent 有：**工具存在，但此刻没被允许**（Chrome 权限没给）。
`MCPServer.promptTools?()` 就是为它加的 —— `tools` 是全集，`promptTools()` 是进 prompt 的子集。

⚠️ **两者不能合并成一个会伸缩的 `tools`。** `tools` 要回答的是「这个工具存不存在、归谁」，而重载
会话（auto-pickup / 补发欠账）靠的正是「从对话里的调用反推当时是哪个 agent」（`agentForTools`）——
一个跟着权限缩水的列表会让昨天那次会话变成无法识别的调用。而反过来，把没授权的工具也写进 prompt，
模型会调它、被拒、然后当成 bug 重试。

### soul 拆成三块

```
prompts/souls/shared.ts              ← 协议：工具格式 / 结果怎么回来 / 一轮怎么结束 / 预算
prompts/souls/bettersidebar-soul.ts  ← schema + 平台过滤 + inbox id + SQL 规则
prompts/souls/workspace-soul.ts      ← 工作区是什么 + 8 条防静默出错的规则
prompts/souls/browser-soul.ts        ← 能碰到什么 + 逐批批准 + 隐私（URL 脱敏那段随设置变）
```

判断一段该放哪的准则：**提到表、文件、工具名或领域概念的，就是 agent 自己的**。
「`complete_task` 必须单独一轮」是协议；「先 SELECT 再改」是 Better Sidebar 的规矩。

⚠️ `skillsBlock()` 在没有 skill 时返回空串，不是空列表。Workspace agent 现在就是这个情况——
给模型看一个空列表，它会用编出来的 id 调 `activate_skill`，白烧一轮。

### 旧 id 必须继续解析

`[#bs-agent:__agent_auto__#]` 写在每一条历史 agent 消息里，`builtin-workspace-agent` 也一样。
`normalizeAgentId` 把它们映射到真 agent（分别是 bettersidebar / workspace），
⚠️ 不这么做的话所有历史 agent 轮次都会变成无法识别的条目、卡片全部丢失。

Browser agent 那四个也在表里：`__browser_agent__` / `__browser_tabs__` / `__browser_groups__` /
`__browser_bookmarks__`，全部映射到 `browser`。后三个是已经删掉的快捷条目 —— 它们看着像四个选择，
其实对「这件事跟你的哪样东西有关」给出的是同一个答案，而「整理标签页」是用户自己打得出来的一句话。

### 「没调用工具」不再弹卡

`no_tool_call` 是最普通的一种结束方式（模型说完话了），而它以前会弹一张只有 Dismiss 按钮的
结束卡——内容等于「点我把我关掉」，读起来像报错。现在这种情况直接不渲染。

⚠️ 唯一的例外是**还有 Undo 可点**：那时卡必须留着，否则快照就没有入口了，改动也没人解释。

### prompt 那一层是「劝」，故意说得宽松

`soul.ts` 的 `getResultBudgetBlock()` 把这个数字告诉 AI，口径是**「额度很大，放开用」**
而不是一串上限。写死的版本副作用更糟：一个被要求「查询要小」的 agent 会每张表抽三行，
然后基于几乎没有的数据给出一个自信的错答案。而截断是**会自己出声**的。

所以这一段里真正硬的建议只有一条：`messages.content` 是唯一能靠一行就吃光预算的字段
（一条长回答几万字符），扫多行时用 `substr(content, 1, 800)`，锁定到某一条了再读全文。
另外三条是软的：`messages_fts` + `snippet()` 做搜索、拿不准规模先
`SELECT COUNT(*), SUM(LENGTH(content))` 探一下、被截断了就收窄或分页而不是重跑。

⚠️ `ROUND_BUDGET` 由 soul.ts **深引** `engine/stages/handoff/budget`，是刻意的例外：
`budget.ts` 是零依赖的常量叶子，而走 `engine/index` 会成环
（engine → tools/tool-registry → prompt-assembler → soul）。prompt 里报的数字必须
就是代码执行的那个，不能各写一份。

### 拒绝要带理由

只回一个 `CANCELLED:`，AI 不知道为什么，最可能原样再试一次然后撞上
`checkRepeatedToolCall`。所以 `ApprovalDecision` 是 `{ approved, scope, reason? }`
而不是 boolean，理由会拼进回传给 AI 的 `CANCELLED:` 段落里，并附一句
"不要重试同一条语句，改方案或者 complete_task('infeasible')"。

### 判词只看第一行

`execute-sql` 的结果里，**只有开头那一截是判词，后面全是数据**。所有读结果的地方都必须用
`startsWith`，不能用 `includes` / 多行搜索：

| 判词 | 常量 | 谁读 |
|------|------|------|
| `ERROR:` | — | `isSuccess`、`readOutcome` |
| `CANCELLED:` | — | 同上 |
| `ERROR: PAYWALL` | `PAYWALL_SIGNAL`（execute-sql 导出） | ③ 的付费拦截分支 |

⚠️ 这三个都栽过同一个跟头。`readOutcome` 早期用多行搜索找 `ERROR`，而查询输出里出现
ERROR 这个词太正常了；付费拦截用的是 `result.includes('PAYWALL')`，于是一条普通 SELECT
只要行里带这个词，会话就结束并弹升级卡 —— 而 dump `messages.content` 是 agent 的日常，
一段聊订阅的对话就够触发。

⚠️ `PAYWALL_SIGNAL` 从 `tools/execute-sql` **import**，别重打。产生方和判定方漂了，
后果是付费拦截静默失效（写操作直接放过去）。

### 数据库层

⚠️⚠️ **content script 里不能 import `@/shared/db`。** 这条是整个模块最容易犯、代价最大的错。

那个 bridge 发 `DB_REQUEST`（offscreen 收得到），但回程的 `DB_RESPONSE` 走
`runtime.sendMessage` —— **content script 收不到**。所以调用不会报错，而是一直挂到
`REQUEST_TIMEOUT_MS`（30 秒）。

实际踩过一次：账本第一版在 `records.ts` 里直接调 repo，而 `begin()` 是在每个工具执行前
`await` 的，于是**每一次 tool call 都要等 30 秒** —— 包括 `activate_skill` 这种压根不碰
数据的。表现是「执行 SQL 要十几二十秒」，但真正的原因跟 SQL 一点关系都没有。

所以 agent-loop 里所有库访问都走 background 消息：

| 用途 | 通道 |
|------|------|
| AI 的 SQL 工具 | `EXECUTE_SQL` → `handlers/db-admin.ts`（带 paywall / blocklist / undo 快照） |
| tool call 账本 | `AGENT_LEDGER` → `handlers/agent-ledger.ts`（`ledger-client.ts` 是唯一出口） |

⚠️ 账本**不要**并进 `EXECUTE_SQL`。那是 AI 自己驱动的工具面，带付费拦截、语句黑名单和撤销
快照 —— 我们自己的记账没理由受这些约束。

⚠️ 走 background 顺带解决了另一件事：`ensureDbForTab` 在那边跑。直接在 content script 写库
会写进「当前恰好开着的那个库」，多账号多标签时是错的 profile。

⚠️ `ledger-client` 给每次调用加了 3 秒上限，超时就当没记上。账本是辅助不是机制 ——
少一行只是卡片少个徽章，而等下去是卡住每一次工具调用。**别把这个上限去掉**，它是上面那个
故障不会再次变成 30 秒的唯一保险。

- `@/shared/db` 的 `runQuery(sql)` / `runCommand(sql)` 只能在 background / offscreen 里用
- Worker 使用 `@subframe7536/sqlite-wasm`，存储在 OPFS 或 IndexedDB

### 付费系统
- `@/shared/lib/license-store.ts` — `LicenseTier`: `'support_pack' | 'power_pack' | 'pro' | 'none'`
- 免费版只能读；写操作在 `execute-sql.ts` 里拦，返回 `ERROR: PAYWALL - ...`
- 引擎识别到 PAYWALL → `stop('paywall')` → `AgentSessionSummary` 显示升级引导
  （之前 endReason 被丢弃，付费拦截和正常完成在 UI 上没有区别）

### 执行策略（谁需要批准）

`execution-policy.ts` 的 `requiresApproval()`，从宽到窄依次短路：

```
speedMode（本次任务全放行，会话级）
  → approveRestOfRound（本轮全放行，每轮清零）
    → getToolRisk(call) === 'write' ? !autoRunWrites : !autoRunReads
```

两个持久化开关，一个工具类别一个：

| 开关 | 默认 | 管什么 |
|------|------|--------|
| `autoRunReads` | 开 | 查询不用问 |
| `autoRunWrites` | **关** | 改数据不用问（撤销还是占位实现，所以默认关） |

`getToolRisk()` 只把**修改数据的 SQL** 算作 write。`export` / `sync` 有副作用但不动
数据库，压在写开关下面只会训练用户去打开它。

### 谁按发送 —— `shouldAutoSend()`

两个**独立**的输入取交集，都说 yes 才自动发：

| 输入 | 尺度 | 问的是 |
|------|------|--------|
| `autoContinue`（持久化，默认开） | 长期偏好 | 我愿不愿意让它无人值守地跑 |
| 本轮有没有调用需要批准 | 单轮事实 | 这一轮有没有东西已经停下来问过我 |

```ts
export function shouldAutoSend(toolCalls: ParsedToolCall[]): boolean {
  if (!isUnattendedAllowed()) return false;                    // 长期偏好
  return !toolCalls.some((call) => requiresApproval(call));    // 本轮事实
}
```

混合轮次（两条 SELECT 加一条 UPDATE）只有一次发送机会，规则是**只要有一个需要批准
就交给用户**——"我刚点完批准它就自己发出去了"比多按一次回车更让人意外。

⚠️ **必须是交集，不能是替代。** `autoSend = autoContinue` 单独用会让开关和批准闸门
互相矛盾：手动批准了一个写操作，结果照样自己飞出去。取交集之后，这个开关只可能让事情
**更手动**，不可能更自动。曾经有一版因为看着像重复把 `autoContinue` 删了，是误判——
它补的是推导覆盖不到的需求：**想盯着每一步再放行，但不想为每条 SELECT 点一次确认**。
打开读批准是重得多的闸门，表达不了这个。

⚠️ `shouldAutoSend` 必须在 ③ **之前**算。`requiresApproval` 会读
`approveRestOfRound`，而③执行到一半时用户可能点了「本轮全部执行」把它设成 true；
事后再问，一个被用户逐条走过的轮次会被判成无人值守然后自己发出去。

⚠️ 格式事故的 nudge 走 `isUnattendedAllowed()`（只看长期偏好）——它是我们自己的
消息，没有"本轮"可看，但「关掉就是每次都我按回车」这个承诺对它也得成立。

工具级开关走 MCP（`mcpRegistry.isToolEnabled`），不要再引入第二套 `disabledTools`。

### i18n
- `agentLoop.resultCapsulePrefix` — Result capsule 显示前缀（en: "Result", zh-CN: "结果"）
  编辑器层用 `i18n.t()` 直接访问（非 React context），import from `@/locale/i18n`
- `agent.*` — Agent Tab 全部文案（launcher / status / continue / confirm / summary…）
  只填了 en、zh-CN、zh-TW，其余语言靠 `fallbackLng: 'en'`；
  组件里一律写 `t(key, { defaultValue })`，缺 key 也不会显示成裸 key

### 设置系统
- 当前暂用 `enhancedFeatures.gemini.slashCommand` 作为功能开关
- TODO: 添加独立的 `agentLoop` 设置

### SlashCommand 互斥
- AgentLoopFeature 通过 MutationObserver 检测 `[data-slash-command-popup]` 判断 slash 是否活动
- `/` 和 `>` 两个 `useEditorIntegration` 实例共存于同一编辑器，通过 `data-trigger` 区分 capsule
- ⚠️ `registerBeforeSendHandler` 是模块级单槽：同一编辑器上再加第三个触发符，
  发送按钮点击只会走最后注册的那个 handler

---

## Gemini DOM 选择器（可能过时）

| 用途 | 选择器 |
|------|--------|
| 编辑器 | `rich-textarea .ql-editor[contenteditable="true"]` |
| 发送按钮 | `.text-input-field .send-button-container>gem-icon-button>button` |
| AI 回复容器 | `model-response .model-response-text` |
| 用户消息轮次 | `user-query`（送达证据，见「两步确认送达」） |
| 对话容器 | `infinite-scroller.chat-history` |
| 生成中 | `gem-icon-button.send-button.stop`（`aria-busy` / `message-actions[hidden]` 在当前版本不存在，已删） |
| 静止（没在生成、输入框空） | 发送按钮**整个不在 DOM 里** → `getSendButtonState() === 'absent'` |
| 暗色主题 | `localStorage: Bard-Color-Theme === 'Bard-Dark-Theme'` |

## AI Studio 的对话从哪读

`renderer/useConversationMessages.ts` 是**两个 reader 加一个平台分派**，解析那半边（marker / tool call / 结果 / outcome 对齐）抽到了 `renderer/turn-assembly.ts` 两边共用。

| 平台 | 数据源 | 理由 |
|------|--------|------|
| Gemini | DOM | 每一轮都在文档里，而且没有 API 侧的捕获 |
| AI Studio | `conversation-messages-store` | 它的对话是**虚拟滚动**的 |

**实测数字**（devtools MCP，一个 16 轮的 agent 对话）：

```
16 个 ms-chat-turn，停在底部时只有 5 个的 .turn-content 有内容
滚到最顶 → 只有 1 个
滚回底部 → 6 个
scrollHeight 9478 → 30698   ← 高度是在滚过去的时候才被量出来的
```

所以在 AI Studio 上读 DOM 不是「拿到不完整的对话」，是**拿到一个自信的错答案**。而 store 在这里也不是退而求其次：它由 API 拦截器喂，文本是模型的原始输出而不是「渲染完再刮回来」，`<bs_agent_tool>` 块一字不差。

⚠️ **store 落后一轮，而且这是接受的取舍。** 拦截器每次生成结束**才**派发一次（实测：切换对话时一次，"hi" 生成完之后 12 秒又一次），带的是**全量**对话不是增量。所以流式过程中用户那条和模型那条都还没进 store。

不去用 DOM 补这个尾巴，理由是时序刚好够：stream 一关 store 就追上，而那时引擎自己的 settle 判定还要再等两个采样（约 800ms）才认定回复结束——**工具卡片在它需要承接批准之前就已经到位了**。中间那几秒 Dock 在报状态。

⚠️ **而且 DOM 补尾巴这条路是不成立的，别再试。** DOM 的 turn 和 store 的消息对不齐：AI Studio 给「思考」单独一个 `ms-chat-turn`（实测 `domRoles` 是 `User/Model/Model/User/Model` 而 store 过滤掉 thought 后只有 4 条），而一个**被虚拟化掉的** thought 轮里连 `ms-thought-chunk` 都没有——内容没渲染，认不出来。任何按下标对齐的方案都会在最需要它的那些对话上悄悄错位。

### 遮盖原生 + portal 宿主挂哪

| 用途 | Gemini | AI Studio |
|------|--------|-----------|
| 遮盖原生（`HIDE_NATIVE_CSS`） | `.conversation-container` 逐轮 | `ms-autoscroll-container .chat-session-content` 一个元素管全部 |
| portal 宿主（`findOverlayHost`） | 滚动容器本身 | **`ms-chat-session`** |
| 钉住原生滚动位置 | 要 | **不要** |

⚠️ **`findOverlayHost` 存在的唯一原因就是最后那一行。** 宿主是 `position:absolute; inset:0`，挂在滚动元素上就是「内容锚定」——它待在 scrollTop 0 的位置，跟着被替换掉的那些轮次一起滑出视野。Gemini 的解法是「overlay 开着期间把原生滚动容器钉在顶部」。

那个解法在 AI Studio 上**有害**：钉在顶部会让虚拟滚动器**卸载最新那一轮的内容**，而最新那一轮正是 `useAIStudioLastModelTurn` 读的、也是引擎 `startFromExistingResponse` 要重放的。照抄的话，overlay 一激活就会静默废掉这个对话里的 auto-pickup。

`ms-chat-session` 绕开了整件事（实测）：它和滚动容器**同一个盒子**（top 68 / 676×823）、本来就是 `position: relative`、而且自己不滚。所以 overlay 视口稳定、不用钉任何东西、原生滚动位置不变、最新轮次保持水合。三次滚动测试里 overlay 的 `top/height` 一动没动。

副产品：宿主的宽度就是原生 turn 的宽度（823 of 863），所以内容区写 `width: 100%` 就自动对齐，不需要给 AI Studio 造一个 `chatWidth` 设置。

⚠️ **AI Studio 强制 Trusted Types。** `shadow.innerHTML = '...'` 会直接抛
`This document requires 'TrustedHTML' assignment`。`applyShadowStyles` 走
`adoptedStyleSheets`、降级走 `style.textContent`，两条都安全；但在这个平台上任何
`innerHTML` / `insertAdjacentHTML` 赋值都是运行时炸弹。

## AI Studio DOM 选择器（可能过时）

| 用途 | 选择器 / 判据 |
|------|--------------|
| 编辑器 | `ms-chunk-editor ms-prompt-box .prompt-box-container textarea` |
| Run / Stop 按钮 | `ms-chunk-editor footer ms-prompt-box ms-run-button button`（⚠️ 必须经 `footer` 收窄，turn 上还有重跑按钮） |
| 生成中 | 按钮里有 `span.spin`，或 `type="button"`（空闲时是 `type="submit"`） |
| 输入框空 | 按钮 `aria-disabled="true"` → 映射成 `absent`（⚠️ 不是 `.disabled` 属性，那个恒为 false） |
| 用户消息轮次 | `ms-chat-turn [data-turn-role="User"]`（送达证据） |
| AI 回复容器 | `ms-chat-turn [data-turn-role="Model"] .turn-content`（⚠️ 不要取整个 turn：`turn-footer` 里的耗时 pill 秒数在跳，文本永远稳定不下来） |
| 思考过程 | `ms-thought-chunk`，读正文前必须剔掉，否则模型「打算调用」的草稿会被当成真调用解析 |
| 对话容器（滚动） | `ms-autoscroll-container` → `div` → `div.chat-session-content` → `ms-chat-turn` × N |
| overlay 宿主（不滚动） | `ms-chat-session`，和滚动容器同盒子、已是 `position: relative` |
| 轮次虚拟化 | `.virtual-scroll-container` + 一个带固定 height 的占位 div；离开视口后 `.turn-content` 是空的。`scrollHeight` 在内容被渲染过之前也是假的（实测 9478 → 30698） |
| 思考轮次 | 独占一个 `ms-chat-turn`，里面是 `ms-thought-chunk`；store 侧 `message_type === 'thought'` 会被过滤掉，所以两边条数**不相等** |
| 暗色 | `document.body.classList.contains('dark-theme')`，和 Gemini 同名（`prefers-color-scheme` 不可信，AI Studio 显式写 class） |

---

## 开发常见操作

### 在 agent-loop 里访问数据库

**别 import `@/shared/db`**，理由见上面「数据库层」（症状是每个工具调用挂 30 秒）。

新增一种账本操作：`shared/types/messages.ts` 的 `AGENT_LEDGER` payload 加一个 `op` →
`handlers/agent-ledger.ts` 加一个 case → `ledger-client.ts` 加一个方法。别的都不用动。

自检一条：**`grep -c DB_REQUEST .output/chrome-mv3/content-scripts/overlay.js` 必须是 0。**
不是 0 就说明有人把库桥接打进 content script 了。

### 新增一个 Tool

1. `mcp/providers/` 下创建 provider（schema + execute）
2. 挂到所属 server 的 `tools` 数组（`builtin-mcp.ts` / `workspace-mcp.ts` / …）
3. `engine/parser/tool-schema.ts` 的 `SUPPORTED_TOOLS` + `REQUIRED_PARAMS` 注册
3.5. 如果新加的 param 是**给人看的**（像 `change_summary`），加进 `NON_IDENTITY_PARAMS`
   —— 否则它会参与重复调用检测和 join key，见「它不能参与谁是同一个调用的判定」
4. 如果它是控制循环而不是干活的（像 `complete_task`），加进 `ENGINE_ONLY_TOOLS`
   —— 否则消息卡片上会出现批准按钮，而这类工具没有什么可批准的

Prompt 里的工具文档由 `mcp/schema-generator.ts` 自动生成，不用手写。schema 的
`description` 就是 AI 唯一读到的说明，协议约束也写在那儿。

⚠️ 光加 schema 不足以让 AI 用它 —— Gemini 对长 prompt 尾部的遵循度不稳。所以
真正的硬约束写在 `soul.ts` 的「How a Response Must End」里，而不是塞在 schema
描述末尾。现在没有运行时 nudge 兜底了（除了格式事故那一次），prompt 是唯一的防线。

### 新增一个内置 Skill

1. 在 `skills/builtin-skills.ts` 追加一条 `Skill`
2. 自动出现在 `>` 弹窗和设置里的 Skills 列表（Agent Tab 不再列技能卡）
3. 顺手在 `agent-tab/components/agent-examples.ts` 加一条范例句 —— Tab 靠范例句
   而不是技能列表告诉用户「这个模块能干什么」，新技能不写范例等于没人知道

### 新增一个启动入口

emit 事件即可，不要直接操作编辑器：

```ts
agentEventBus.emit('launcher:run-entry', { entryId, userInput, autoSend });
```

`AgentLoopFeature` 负责落地（插 capsule、可选自动发送），成功后回 `launcher:staged`，
不可用时回 `launcher:failed` + 原因：`no-editor`（先开一个对话）、`composer-busy`
（引擎的 tool 结果还压在输入框里，先发出去）、`session-busy`（有会话还没结束，先跑完或停掉）、
`unknown-entry`（技能已被删）。

⚠️ **`status !== 'idle'` 时不能落地 capsule。** `composeAndSend` 不会开第二个引擎，
所以那种 capsule 只会让用户按下发送后吃一个警告。启动器自己也拿 `useAgentLoopStore.status`
把卡片和输入框置灰，并给一个「停掉当前任务」的出口 —— `AgentTab` 的注释一直声称有这个守卫，
实际上没有，这就是「第一个技能好使、后面点的技能只把 skill 原文发出去」的来源。

### 改 tool 结果的回传格式

`engine/stages/handoff/formatter.ts` 是唯一的语法定义处，三个消费者：`splitSections`
（切 capsule）、`renderer/helpers/tool-outcomes.ts`（读回历史）、`recovery.ts`（补发时重拼）。
后两个从这里 **import** 常量，不要重打一遍 —— 两头一漂，症状是所有卡片悄悄退回「未执行」。

动 `### ` 标题那一行之前，先确认这四件事还成立：

1. `formatSectionHeading` 写的 key，`readSectionKey` 读得回来（读侧要保持宽松）
2. `stripSectionKey` 把 key 从 label 里摘干净（否则胶囊上出现十六进制）
3. `budget.ts` 的 `truncateSection` 保留整行 header —— key 不能被截断切掉
4. `soul.ts` 里那段「忽略这个标记」还对得上实际写出去的形状

### 修改编辑器交互逻辑

一个平台一个文件，改那一个就够：`quill-editor.ts`（Gemini）/ `aistudio-editor.ts`（AI Studio）。
所有消费者都经由它操作编辑器。⚠️ **引擎里不要直接 import 这两个文件**，走
`AgentPlatformAdapter`——见「平台适配层」，那三个口子就是 AI Studio 一直跑不通的原因。

### 修改发送按钮选择器

Gemini 改 `quill-editor.ts` 的 `SEND_BUTTON_SELECTOR`（`triggerSend()` 和
`installSendButtonInterceptor()` 都引用它）；AI Studio 改 `aistudio-editor.ts` 的
`RUN_BUTTON_SELECTOR`。

### 新增一个平台

1. `shared/lib/<platform>-editor.ts`：编辑器读写 + 发送按钮状态 + 发送拦截
2. `adapters/<platform>-adapter.ts`：实现 `AgentPlatformAdapter`，
   `observeAIResponseComplete` 直接转给 `waitForResponseToSettle`，别重写那套判定
3. `adapters/adapter-factory.ts` 的 `ADAPTER_REGISTRY` 注册
4. `<platform>/enhanced-features/AgentLoopFeature.tsx`：`>` 弹窗 + `composeAndSend` + `<AgentDock />`
5. `agent-dock/useComposerAnchor.ts` 的 `COMPOSER_BOX_SELECTORS` 加一条
6. 渲染层（`renderer/`）单独评估——它的 DOM 假设是 Gemini 的，见 TODO 表

---

## 调试技巧

1. 所有日志带 `[AgentLoop]` / `[Renderer]` / `[QuillEditor]` 前缀
2. `useAgentLoopStore.getState()` 查看运行时状态
3. 检查 capsule DOM: `document.querySelectorAll('.bs-prompt-capsule, .bs-agent-result-capsule')`
3.5. 手动放行挂起的批准: `useAgentLoopStore.getState().pendingApproval?.resolve({ approved: true, scope: 'once' })`
4. 验证 Quill Delta 是否同步: 在 DevTools 里对比 `.ql-editor` 的 innerHTML 和发送的实际内容
5. 强制停止循环: `getActiveEngine()?.stop()`（只调 store 的 `stop()` 停不掉引擎）
5.1. 看账本: `useAgentRecordStore.getState()` —— `records` 是 joinKey → 结果，
     `owed` 非空说明有跑完但没送出去的结果。库里直接查:
     `SELECT round, order_index, tool_name, status, delivered FROM agent_tool_calls WHERE conversation_id = '...' ORDER BY round, order_index`
5.2. 复现「跑了但没送出去」: 让它执行一个写操作、在 `awaiting_send` 卡住的时候（结果已在
     输入框、还没按回车）刷新页面。预期是 Dock 出补发卡、卡片显示「已执行 · 未回传」，
     **不是**重新问你一遍批准
6. 测试 capsule 展开: 手动调用 `expandCapsules(editor, 'bs-prompt-capsule')` 看编辑器内容是否变成真实 prompt

---

## 已知限制 / TODO

| 项目 | 状态 | 说明 |
|------|------|------|
| DB Snapshot / 撤销 | 占位 | `snapshot-manager.ts` 全部返回 false；撤销 UI 已移除，等实现后再加回 |
| sync_conversation_messages | **已封存** | 空闲补录（`content/shared/backfill/runner.ts`）直接调平台接口把缺的 transcript 拉回来，不用导航、不用打开对话，所以这个工具已经没有用户会想要的事情可做。两处注册被注掉：`mcp/builtin-mcp.ts` 的 `syncProvider` 和 `skills/builtin-skills.ts` 里的 `builtin-find-empty-chats`（Agent tab 轮播里那条例子和 `agent.launcher.examples.sync` 一并删了）。**代码全留着**——`tools/sync/`、`HANDOFF_TOOLS`、`execution-policy.ts` 的 handoff 特例、i18n key 都没动，谷歌换接口把补录打死时把那两处注册解开即可。下面这段实现说明因此仍然有效 |
| ↳ 实现（封存中） | 已做 | `tools/sync/`：对话间走 Gemini 自己的路由（`shared/lib/navigation`，同 explorer），整个 run 活在一个 JS 上下文里，所以有常驻进度 toast（`sync-progress.ts`）和即时生效的 Stop。job 仍存 `chrome.storage.local`，供路由打不开时的整页兜底和关标签后 `resumeSyncRun()` 续跑（续跑同样先立进度条，可中断）。到站判据是「message 列表指纹变了」而不是「有没有 message」——旧对话的 DOM 会滞留一拍。滚动目标是 `chat-window infinite-scroller`（同 SmartScrollbar），往上滚到高度不再变为止；选不到该元素时降级为 `no-scroller`，只录打开时那一页，entry 记 `partial`。未在真实长对话上验证过 |
| handoff 工具 | 已做 | `HANDOFF_TOOLS`（只有 sync，即使 sync 已封存也**不要清空这个数组**：历史对话里还留着当初那次 sync 调用，`endsSession()` 靠它把那一轮排除掉，清空了回到旧对话就会被 pickup 当成「没人执行的 tool call」重跑）：调用成功即结束 session，因为页面会被导航走。approval 强制要问一次，见 `requiresApproval()`。**它的 tool 结果永远不会回传**，所以 `toolOutcomes` 恒为 null——任何扫「有没有没人执行的 tool call」的地方都必须用 `renderer/helpers/session-end.ts` 的 `endsSession()` 排除它，否则每次回到该对话都会把 sync 整趟重跑一遍 |
| tool call 落盘 + 补发 | 已做 | `agent_sessions` / `agent_tool_calls` 两张表，见「落盘的是我们干了什么」和「跑了但没送出去怎么恢复」。不进 `SYNC_TABLES` |
| auto-pickup（idle 时接手 tool call） | 已做 | `agent-loop/pickup.ts`（`planPickup` 判定 + `useAutoPickup` 钩子），两个平台共用；平台只提供「最新那条 model 轮」。AI Studio 侧是 `useAIStudioLastModelTurn`——虚拟滚动让 `useConversationMessages` 读不到东西，但 pickup 只看最新一轮，而那一轮正是自动滚动留在屏上的。⚠️ AI Studio 的判据是「整个对话的最后一轮是 model 轮」，比 Gemini 的「最后一条 model 轮」更严：后者依赖能看到紧跟其后的 user 轮里有没有结果，而那个证据可能已经被虚拟化丢掉了。场景：session 结束后用户直接追问，AI 仍用 tool 格式回答，这里起一个新 session（`startFromExistingResponse`）。⚠️ **第三个坑最贵**：刷新后页面看起来和「没跑过」一模一样，所以它会把已经执行过的写操作再跑一遍 —— 现在靠 `recordsReady` + 查账本的 `anyRecorded` 守卫挡住，改这个 effect 前先读那两段。另外两个坑：① 闩锁必须按「对话 + turn + tool call 指纹」做 key，不能用 per-mount 布尔——SPA 跳转后组件永不卸载，布尔一旦置上就把整个标签页后续的 pickup 全废了；② session 绑的 conversationId 要用 `readConversationIdFromPath()` 现读 URL，不能用 `useCurrentConversationId()`（走 500ms 轮询，路由跳转瞬间是旧值），绑错了 Dock 的 `belongsToCurrent` 会判定不属于当前对话，approval 直接没地方显示 |
| settings UI | 未做 | 需在设置面板加 agentLoop 独立开关（现复用 slashCommand）；`AgentPolicyControls` 那三个持久开关按理也该搬过去，现在暂居 Dock 的齿轮里 |
| AI Studio：输入 + 引擎 | 已做 | `adapters/aistudio-adapter.ts` + `shared/lib/aistudio-editor.ts` + `aistudio/enhanced-features/AgentLoopFeature.tsx`。`>` 触发、发送拦截、Dock 都在，见「AI Studio 上的 `>`」 |
| AI Studio：对话渲染 | 已做 | 数据源是 `conversation-messages-store` 而不是 DOM，见「AI Studio 的对话从哪读」。⚠️ 流式过程中落后一轮（生成结束才入库），这是接受的取舍不是遗漏 |
| AI Studio：Agent Tab | 未做 | `launcher:run-entry` 的落地端已经写好了，缺 OverlayPanel 里的 tab 入口 |
| 自动继续 | 已做 | `autoContinue` 开关（默认开）∩ 本轮批准情况，见 `shouldAutoSend()` |
| `awaiting_send` 期间发普通消息 | 未处理 | capsule 消失 + 出现新的 user 轮次即视为已发送，用户此时另发消息会被当成继续 |
| 送达确认 | 已做 | 两步：离开输入框 + `stop` 按钮或 `user-query` 增加，见上文 |
| 手动发送等待 5min 上限 | 未处理 | `autoSend: false` 时 `waitForSend()` 仍有 5 分钟超时，用户离开太久会 pause（可 Retry 补发，不丢数据） |
| ① 的超时 | 已做 | 改成 30s **静默**超时（原来是 60s 整轮硬超时，会误杀长回复）。见下文 |
| `slash-command/capsule.ts` | 废弃 | 已无 import，但文件未删除 |
| SlashCommand `data-` attr | 未加 | 需给 SlashCommandPopup 加 `data-slash-command-popup` |
| Gemini DOM 选择器 | 可能过时 | 需跟随 Gemini UI 更新 |
