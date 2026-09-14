---

# 非文本文档（Office / PDF / 字幕）读写方案

目标场景不是「支持更多文件类型」，而是两句话：

- 研究生把 `thesis.docx` 拖进工作区，跟 AI 讨论，让 AI 改论文；
- 研究者把 `data.xlsx` 拖进去，让 AI 做统计、加列、改公式。

这两句话决定了整套设计。它们要求的不是「能解析」，而是**便宜地读懂 + 精确地改动 + 用户能审查**。

---

## 一、先说硬约束，方案是从约束里推出来的

| 约束 | 数值 / 位置 | 对方案的影响 |
|------|------|------|
| 一轮结果总预算 | `ROUND_BUDGET = 29998` 字符（`engine/stages/handoff/budget.ts`） | **一篇论文永远塞不进一轮**。30 页中文论文 ≈ 5 万字符，是预算的 1.7 倍。所以「读文档」必须先给目录，再按需取段，全文 dump 这条路从一开始就不存在 |
| 超预算是静默截断 | 见 `agent-loop-architecture.md`「结果有多大」 | 不能靠 prompt 劝 AI 少读，必须在工具里就分页 |
| 文本读上限 | `MAX_READ_BYTES = 2MB`（`fs.ts`） | 与文档无关，但说明现有 `read_file` 从没打算处理二进制 |
| 桥接传输上限 | `MAX_TRANSFER_BYTES = 20MB`，且要 base64（+33%） | ⚠️ 决定了**文档解析不能放在 content script**，否则一次编辑要来回搬 2 份 base64 |
| Service Worker 无 DOM | MV3 SW 和 Web Worker 都**没有 `DOMParser` / `XMLSerializer`** | OOXML 处理必须是「无 DOM」实现，或者放在 offscreen 文档主线程 |
| content script 注入到每个页面 | `overlay.content` | ⚠️ 决定了 pdfjs（解包 34MB）这类大库不能进 content script bundle |
| 免费额度 | `FREE_MAX_FILES = 5`（`limits.ts`） | 一篇论文 + 一份数据就用掉 2/5，文档能力天然是 Power Pack 的卖点 |
| MV3 禁远程代码 | 商店政策 | ⚠️ 排除 tesseract.js OCR（语言包要从 CDN 拉 15MB+），排除任何 CDN 加载的 wasm |

还有一条不是技术约束但同样硬：**用户不会逐字校对 AI 改过的论文**。所以「改」的默认形态不能是
直接覆盖正文，必须是 Word 里能一条条接受/拒绝的**修订（tracked changes）+ 批注**。这一条比任何
库的选择都重要。

---

## 二、功能清单（用户视角）

### 2.1 Word（.docx）—— 优先级最高

读：

- **文档概览**：标题层级目录、段落/字数/表格/图片数、有没有已有修订和批注、样式清单。
- **按段读**：`p12–p48` 或「第 3 章」这样的范围，返回带段落号的 Markdown 投影（标题层级、加粗、
  列表、表格、脚注、公式占位都保留成 Markdown 记号）。
- **搜索**：跨段落正则/关键词定位，返回段落号 + 命中行，等价于文档里的 `grep_files`。
- **表格单独读**：`t3` → CSV，避免把宽表压进 Markdown 里变成一团。

改（**默认走修订模式**）：

- 改写段落里的一句话 / 整段替换 / 插入新段 / 删除段落 —— 全部记为 `w:ins` / `w:del`，作者标成
  `AI (Better Sidebar)`，用户在 Word 里逐条接受。
- **加批注**（`w:comment`）：这是「帮我审论文」的主要输出形态 —— 不改字，只在有问题的句子上挂
  意见。比改动更安全，也更符合导师式反馈。
- 应用样式（`w:pStyle`，比如把误标为正文的一行改成 `Heading 2`）、加脚注、改页眉页脚文本。
- 替换全文里的术语（`replace_all` 语义，同样记为修订）。
- 接受/拒绝已有修订（可选，做起来不难，属于顺手）。

写新文件：Markdown → docx（导出综述、回信、大纲）。

### 2.2 Excel（.xlsx / .csv）

读：

- **工作簿概览**：每个 sheet 的名字、已用区域、行列数、是否有图表/透视表/合并单元格/冻结窗格。
- **表头 + 类型推断 + 抽样**：前 N 行 + 每列推断类型（数值/日期/文本/公式），这是 AI 做统计前
  唯一需要的东西，成本几百字符。
- **按区域读**：`Sheet1!A1:F200` → TSV。公式单元格同时给公式和缓存值。
- **查找**：值/公式的跨表搜索，返回 A1 引用。

改：

- 写单元格（字面值 / 公式 / 批量区域），**不破坏其它单元格的格式、图表、条件格式**。
- 加列并填公式、加 sheet、改 sheet 名。
- ~~加批注、设置数字格式~~ —— 落地时砍掉了，理由进第九节。
- 排序 / 筛选后的结果另存为新 sheet（原表不动，这比原地排序安全得多）。
- 插入/删除行列 —— 见第七节，风险最高，**最终是按名字拒绝并给出替代方案**。

写新文件：CSV/Markdown 表格 → xlsx。

### 2.3 PDF

读：

- 书签目录 + 页数 + 是否为扫描件（有无文字层）。
- 按页取文字（保留段落切分和粗略排版），支持页范围。
- 取已有批注（别人给的审阅意见）。
- 取表单字段。

改（**明确不改正文文字**，理由见第九节）：

- 加批注 / 高亮 / 便签（这就是「PDF 加批注」的需求）。
- 填 AcroForm 表单。
- 页面级操作：删页、抽页、合并、旋转、加水印/页码。
- 扫描件：不做 OCR，改为「把这页渲染成图片交给宿主的多模态模型看」（Gemini 本身就会读图）。

### 2.4 PowerPoint（.pptx）

读：每页标题 + 正文文字 + 演讲者备注 + 形状清单。改：替换文字、改备注、删/复制/重排幻灯片。
新建：Markdown 大纲 → pptx。

### 2.5 字幕（.srt / .vtt / .ass / .ssa）

这些**现在就被当纯文本**（`file-kinds.ts` 里 `srt`/`vtt` 在文本白名单），所以 AI 已经能读写。
缺的是「按 cue 操作」：

- 解析成带编号的 cue 列表（时间轴 + 文本），只读文本时不带时间码（省一半 token）。
- 整体平移 / 缩放时间轴、修正首帧偏移。
- 逐条翻译且**保证时间轴一字不动**（现在让 AI 直接编辑 srt，它会顺手改坏时间码）。
- 合并过短 cue、拆分过长 cue、检查阅读速度（CPS）与行长。
- 格式互转 srt ↔ vtt ↔ ass。

### 2.6 顺带能覆盖的

- **ODF（.odt/.ods/.odp）**：和 OOXML 一样是 zip + XML，基建做完后是增量工作，不是新工程。
- **.doc/.xls（97-2003 二进制）**：不做，让用户先在 Office 里另存为新格式。理由见第九节。

---

## 三、工具面：只加 3 个 tool，细节放进 skill

⚠️ **不能一个格式一套工具。** 每个 tool schema 都要进**每一轮**的 prompt，五种格式各三四个工具
就是 15 个 schema 常驻，等于给所有不碰文档的用户加税。现有 `manage_files` 已经立了规矩：低频操作
用一个 `action` 参数收口。

沿用这个规矩，加一个可以整体关掉的 MCP server（理由同 `workspace-mcp.ts` 的注释）：

```
DOCUMENT_MCP  id: 'builtin-documents'   name: 'Documents'
├── doc_read    读：概览 / 范围 / 搜索，一个 schema 覆盖所有格式
├── doc_edit    改：ops 数组，按格式解释
└── doc_create  从 markdown / csv 生成新的 docx / xlsx / pptx / srt
```

`doc_read` 参数：`path` / `mode`(outline|range|search|raw) / `range`(段落号、`Sheet1!A1:F99`、
`p3-p9`、页码) / `query` / `include_formatting`。默认 `mode=outline` —— **第一次读一个文档，
返回的一定是目录而不是内容**，这是从 30k 预算直接推出来的默认值。

`doc_edit` 参数：`path` / `ops`（JSON 数组）/ `mode`(track|direct，docx 默认 `track`) /
`change_summary`（审批卡要用，非可选）。

⚠️ **每种格式的 op 清单不写进 schema，写进 skill。** `skills/` 机制就是为这个存在的：
prompt 里只留一句「文档编辑的完整操作清单在 `docx-review` / `spreadsheet-analysis` skill 里」，
AI 需要时 `activate_skill` 拉进来。基础 prompt 成本 ≈ 3 个 schema，实际能力 ≈ 30 个操作。

配套 skill（顺带就是产品化的入口）：

| skill | 内容 |
|------|------|
| `builtin-docx-review` | 论文/文稿评审工作流：先 outline，再逐章读，问题挂批注，改动走修订，最后汇总一份「我改了什么」 |
| `builtin-spreadsheet-analysis` | 先 overview + 抽样 + 类型推断，再决定读哪块；写公式而不是写死值；加列而不是改原列 |
| `builtin-subtitle-polish` | 字幕翻译/校对：时间轴只读，只改文本，最后跑一遍 CPS 检查 |

---

## 四、跑在哪：offscreen 里的 doc worker

```
content script (tools/document-tools.ts)
      │  DOCUMENT_OP  { workspaceId, path, op, args }   ← 只走「指令 + 投影文本」
      ▼
background (handlers/document.ts)  ── 只做转发，不解析
      │
      ▼
offscreen.html ──► doc-worker.ts        （OOXML / 字幕：无 DOM 实现）
                └► offscreen 主线程      （PDF：pdf.js 需要 DOM，自带 worker）
                        │
                        └──► 直接开 OPFS 里的 agent-workspace/<id>/<path>
```

四个理由，按重要程度：

1. **字节不过桥。** offscreen 文档是扩展 origin，看到的 OPFS 就是 background 那个（`fs.ts` 里
   `WORKSPACE_ROOT` 那棵树）。所以文档引擎自己读、自己写，桥上只走「A1:F200 的 TSV」这种几 KB 的
   投影。放在 content script 就得 `readBytes` → base64 → 改 → base64 → `writeBytes`，一次编辑
   两趟 20MB 上限，而且真的会顶到上限。
2. **不污染 content script bundle。** content script 注入到每个 gemini/aistudio 页面，
   ⚠️ 而且 WXT 打的 content script 做**动态 import 分包不可靠**（chunk 得走
   `web_accessible_resources`，还不是 module script）—— 也就是说放进去就是常驻，pdfjs 解包 34MB
   这种东西没有「用到才加载」的退路。
3. **SW 会被回收，offscreen 不会。** 解析一个 20MB 的 xlsx 是 CPU 密集活儿，SW 空闲 30s 就死，
   长任务里没有 await 的空档反而更危险。offscreen 的生命周期已经有人管（`shared/db/index.ts`）。
4. **worker 里可以用 sync access handle**，大文件读写快一个量级；而且解析卡死也卡不到侧边栏 UI。

⚠️ **必须新开一个 worker，不能挂到 `db-worker` 上。** db-worker 是串行队列，一个 30 秒的文档解析
会把整条 SQL 通道堵死 —— 而 agent 的每一步都在读数据库账本。

Firefox 没有 offscreen API，现有代码已经有 fallback（background 页里 `new Worker()`，见
`shared/db/index.ts` 的 `ensureWorker`）。doc-worker 走同一套 fallback，所以**这也是「必须无 DOM」
的第二个理由**：fallback 里拿到的还是 Worker，还是没有 `DOMParser`。

---

## 五、选型：调研结果与结论

### 5.1 候选清单（2026-09 查 npm registry）

| 包 | 版本 / 最后发布 | 许可 | 解包体积 | 结论 |
|---|---|---|---|---|
| `fflate` | 已是本项目依赖 | MIT | — | ✅ **zip 层直接用它**。OOXML 全是 zip，这一层零新增依赖 |
| `xlsx` (SheetJS CE) | 0.18.5 / **2022-03** | Apache-2.0 | 7.3MB | ⚠️ npm 上冻结在 2022，`CVE-2023-30533`（原型污染，≤0.19.2 全中）只在 cdn.sheetjs.com 的新版修了。**我们的输入正是「用户拖进来的任意文件」，这个 CVE 的触发条件就是它** → 不用；要用只能从 cdn tarball 装，等于自己维护一个供应链 |
| `exceljs` | 4.4.0 / **2023-10** | MIT | 21MB | ⚠️ 事实上停更；round-trip 会丢图表/透视表/部分条件格式。只考虑当「只读 fallback」或「新建工作簿」 |
| `xlsx-populate` | 1.21.0 / **2020** | MIT | 14.8MB | 死了，不考虑 |
| `mammoth` | 1.12.2 / 2026-08 | BSD-2 | 2.1MB | ✅ 活跃。docx → HTML，**只读**。适合「预览」和「兜底文本提取」，但它丢掉与原 XML 的位置对应，**不能拿来做编辑定位** |
| `docx` (dolanmiu) | 9.7.1 / 2026-05 | MIT | 4.5MB | ✅ 活跃，**只能从零生成**，不能编辑已有文件。用于 `doc_create` |
| `docx-preview` | 0.4.0 / 2026-07 | Apache-2.0 | 952KB | ✅ 侧边栏里渲染 docx 预览用，可选 |
| `docxmlater` | 12.1.0 / 2026-06 | MIT | 17.5MB | 🟡 号称能安全 round-trip 带修订/批注的 docx。**单人新项目**，体积也大。值得挖它的实现思路，不建议直接依赖 |
| `dealfluence/adeu` | npm 上 0.0.1 是 **0KB 占位** | MIT | — | 🟡 「docx ↔ Markdown 投影，改动回写成修订」—— **和我们要做的架构完全一致**，当参考实现读，不能当依赖 |
| `pdfjs-dist` | 6.3.289 / 2026-08 | Apache-2.0 | **34MB** | ✅ PDF 读取唯一选择。必须懒加载 + 本地打包 worker |
| `pdf-lib` | 1.17.1 / **2021** | MIT | 19MB | ⚠️ 原仓库停更（issue #1423「Is this thing still on?」） |
| `@cantoo/pdf-lib` | 2.9.1 / 2026-08 | MIT | 21MB | ✅ 维护中的 fork（作者原话是「维护到我们自己不需要为止」，预期值放低）。批注/表单/页面操作用它 |
| `pptxgenjs` | 4.0.1 / 2025-06 | MIT | 2.5MB | ✅ 只写不读，用于 `doc_create` |
| `subsrt-ts` | 2.1.2 / 2023-10 | MIT | **86KB** | ✅ srt/vtt/ass/ssa/sub/smi 双向。体积可以忽略，性价比最高的一笔 |
| `fast-xml-parser` | 5.11.1 / 2026-08 | MIT | 1.3MB | 🟡 无 DOM，可在 worker 跑。备选，见 5.3 |
| `hyperformula` | 3.4.0 | **GPL-3.0-only** | 12.6MB | ❌ 许可不兼容闭源扩展。公式重算另有办法，见 7.2 |
| `tesseract.js` | 7.0.0 | Apache-2.0 | 1.4MB + 远程语言包 | ❌ MV3 不能拉远程资源；本地打包 15MB+ 语言包也不现实 |

### 5.2 结论：三类活儿，三种态度

| 活儿 | 做法 | 为什么 |
|---|---|---|
| zip 拆包/打包 | `fflate`（已有） | 已经在依赖里，无 DOM，worker 里能跑 |
| **OOXML 定位与局部替换** | **自研，约 800–1200 行** | 见 5.3 |
| 从零生成新文件 | `docx` / `pptxgenjs` / 自研最小 xlsx | 生成是纯输出，没有「别弄坏原文件」的风险，用现成库最划算 |
| PDF 读 / PDF 批注 | `pdfjs-dist` / `@cantoo/pdf-lib` | 自研 PDF 是明确的坑，不碰 |
| 字幕 | `subsrt-ts` | 86KB 买六种格式，没有自研的理由 |
| 公式重算 / OCR / PDF 正文重排 | **不做** | 见第九节 |

### 5.3 为什么 OOXML 这一层自研（这是全篇最需要论证的决定）

先说清楚自研的**范围有多小**：不做对象模型、不做全量序列化、不做排版。只做两件事 ——

1. 把 `word/document.xml` 之类的 part **切成带原始字节偏移的 token 流**（标签开/闭/文本），
2. 编辑就是往原始字符串里 **splice**，改动区域之外**一个字节都不动**。

四个理由：

1. **保格式这件事，只有 splice 能保住。** 任何「解析成对象 → 改 → 重新序列化」的库都会重写整份
   XML：命名空间前缀、属性顺序、自闭合写法、`xml:space="preserve"` 都可能变，图表 / 透视表 /
   已有修订 / 批注 / 域代码这些它没建模的东西直接消失。exceljs 丢图表就是这个原因。而用户拖进来
   的论文和数据表，恰恰是**满是我们没建模的东西**的文件。
2. **无 DOM 是硬要求。** worker 和 SW 都没有 `DOMParser`；用 `fast-xml-parser` 或 `@xmldom/xmldom`
   能绕过，但它们都是「解析成对象再序列化」，回到问题 1。
3. **体积。** 现成方案要 17–21MB 解包量换一个我们只用 5% 的对象模型。
4. **OOXML 在这件事上其实很温和**：机器生成、格式规整、没有自定义 DTD、实体只有标准那五个、
   没有 CDATA。所以 tokenizer 是**有限工作量**而不是无底洞 —— ⚠️ 顺便，因为我们不展开实体，
   billion-laughs 这类 XML 炸弹对我们天然免疫，而换成 `DOMParser` 就要单独防。

🟡 唯一真正难的一块是 **run 拆分**，单独说：

Word 会把一句话切成任意多个 `<w:r>`（拼写检查、修订历史、格式变化都会切），所以
「在 `document.xml` 里搜索用户看到的那句话」几乎必然搜不到。做法是：

```
段落 → 展平成「可见文本 + 每个字符属于哪个 run 的偏移表」
       ↓ 在展平文本里定位（这时才能用 old_text 匹配）
       ↓ 命中区间映射回 run：首 run 尾部拆开、尾 run 头部拆开、中间的整段替换
       ↓ 新 run 继承被替换区间第一个 run 的 rPr（格式跟着走）
```

这段逻辑是这个方案唯一「写错了会静默出错」的地方，所以它必须：单独一个模块、
带真实样本文件的回归用例（带修订的、带批注的、带公式的、中日韩混排的、带书签的）。

Anthropic 官方 docx skill、`adeu`、`docXMLater` 三个独立实现走的都是这条路
（unzip → 直接改 `word/document.xml` → 修订形式回写），这条路是有人走通过的。

---

## 六、代码结构

```
src/shared/documents/                    ★ 新增，纯函数层，无 DOM，可在任意 context 跑
├── index.ts                 # 注册表：扩展名 → handler
├── types.ts                 # DocOutline / DocProjection / DocOp / DocEditResult
├── zip.ts                   # fflate 封装：readPart / writePart / listParts + 解压炸弹防护
├── ooxml/
│   ├── xml-cursor.ts        # ★ 保偏移的 tokenizer + splice。全篇的地基
│   ├── runs.ts              # ★ run 展平 / 定位 / 拆分（5.3 那段逻辑）
│   └── rels.ts              # .rels 与 [Content_Types].xml 的增删（加批注/加 part 时要动）
├── docx/
│   ├── outline.ts           # 目录 + 统计
│   ├── project.ts           # 段落 → Markdown 投影（带段落号）
│   ├── edit.ts              # 段落级 ops
│   ├── revisions.ts         # ★ w:ins / w:del 包装（修订模式）
│   └── comments.ts          # ★ comments.xml + commentRangeStart/End
├── xlsx/                    # ★ 已落地，实际比原计划细，见第十节
│   ├── refs.ts              # ★ A1 引用：解析 / 格式化 / 开区间收敛 / sheet 名引号
│   ├── numfmt.ts            # ★ 样式表 → 是不是日期；序列号 → ISO（双纪元）
│   ├── sheet.ts             # ★ 走 sheetData：行全记、单元格按窗口建
│   ├── model.ts             # workbook / sheet / sharedStrings / styles
│   ├── values.ts            # 单元格语义合成 + 列类型推断
│   ├── outline.ts           # sheet 清单 / 已用区域 / 表头与列类型 / 特性探测
│   ├── read.ts              # 区域投影（双轴 TSV）、公式清单、截断续读、跨表搜索
│   ├── cells.ts             # ★ 单元格与行的 splice 原语
│   ├── recalc.ts            # ★ calcChain 失效 + fullCalcOnLoad + dimension + 包装件增删
│   ├── sheets.ts            # 新建 / 改名 sheet 的四处联动与守卫
│   └── edit.ts              # op 分派；每个 sheet 只 splice 一次
├── pptx/ …
├── pdf/                     # 只有这个目录允许 import pdfjs / pdf-lib（懒加载）
└── subtitle/                # subsrt-ts 封装 + cue 级操作

src/entrypoints/offscreen/doc-worker.ts  ★ 新增：串行队列 + OPFS 直读直写 + 备份
src/entrypoints/background/handlers/document.ts  ★ 新增：DOCUMENT_OP 转发
src/shared/documents/client.ts           ★ 新增：content script 侧的 typed wrapper
.../agent-loop/tools/document-tools.ts   ★ 新增：3 个 tool 的参数解析与结果成文
.../agent-loop/mcp/document-mcp.ts       ★ 新增：可关闭的 MCP server
.../agent-loop/mcp/providers/document-provider.ts
```

要改的现有文件：

| 文件 | 改什么 |
|---|---|
| `shared/workspace/file-kinds.ts` | docx/xlsx/pptx/pdf 原先被归到 `BINARY_EXTENSIONS`，注释里说它们对 agent 是「dead weight」。加一类 `DOCUMENT_EXTENSIONS`：仍然不是文本（`read_file` 不能读），但**图标、预览、以及 AI 的可用性提示要区分对待** —— 否则文件树还在告诉用户「这文件没用」。⚠️ 一个扩展名进这个集合，就是在向 UI 承诺 handler 已注册；提前加会让界面许诺 AI 随后会拒绝的事 |
| `shared/types/messages.ts` | 加 `DOCUMENT_OP` 消息类型 |
| `agent-tab/workspace/WorkspaceFileDrawer.tsx` | 目前 `isProbablyBinary` 直接判 `skipped: 'binary'`。文档类应该走预览（后期）或至少显示「概览」而不是「无法预览」 |
| `src/locale/en.json` | 新增文案（其它语言有 hook 处理） |

---

## 七、每种格式的实现要点与坑

### 7.1 docx

- **段落号 `p12` 只是导航用的，不是编辑地址。** 编辑地址是 `old_text`，规则跟 `edit_file` 完全
  一致：命中多处就拒绝，让 AI 补上下文。⚠️ 理由是插入一段之后所有后续段落号都会漂移，AI 手里的
  号在下一次调用时就已经过期了 —— 以段落号为地址等于给自己造一类「改错了段」的静默 bug。
  `scope` 只用来把 `old_text` 的搜索范围缩小，可以是段落 `p12`、表格 `t3`、**单元格 `t3r2c1`**
  或**部件 `hd1` / `fn`**。
- ⚠️ **可寻址的位置必须等于用户看得见的文字，否则会得到「自信的错答案」。** 这条是从一个真实
  反馈里补出来的，值得记住它的形状：表格的空单元格既没有 `old_text` 可匹配，投影里也没有任何
  地址，于是「把自查结果填进第 3 列」这件事无法表达 —— AI 唯一能写出来的调用是拿第 2 列的文字
  做 `old_text`，结果值就落在第 2 列。同一个形状还有一个更大的实例：页眉/页脚/脚注正文以前完全
  不在模型里，用户问「改一下页眉的日期」，body 搜不到，AI 就回答「文档里没有这个日期」。
  所以现在：
  - 每个单元格有坐标 `tNrRcC`，投影带 `r\c` 轴，空单元格渲染成 `∅`（行里不存在的格子是 `—`）；
  - `set_text` 专门往空段落 / 空单元格写字，**且拒绝非空目标** —— 它是唯一按 id 寻址的 op，
    允许它覆盖已有文字等于把 `old_text` 挡住的那类静默错误重新放回来；
  - `header*.xml` / `footer*.xml` / `footnotes.xml` / `endnotes.xml` 全部纳入模型，前缀寻址
    `hd1:p2` / `ft1:p1` / `fn:p3`，且 outline 的 facts 里**必须点名它们存在** —— 不点名就等于
    没有，AI 不会去猜。
- ⚠️ **一个 op 只能落在一个 part 上。** 偏移量只对算出它的那个字符串有意义，所以 `doc_edit` 按
  part 分组 splice，跨 part 的 `all: true` 改名直接拒绝，而不是挑一个应用。
- ⚠️ **`replace_text` 默认只搜 body。** 把默认放宽到页眉会让「正文和页眉都出现的术语」变成
  「命中 2 处，拒绝」，而这个歧义加多少上下文都消不掉 —— 两处真的是同一句话。改为：默认 body，
  结果里点名「hd1 里也有，没动」，要改就再发一个 `scope="hd1"` 的 op。
- ⚠️ **批注只能挂在 body。** `comments.xml` 是从主 part 关联出去的，页眉里的
  `w:commentReference` 在 Word 里什么都不显示 —— 文件能打开、工具报成功、用户看不到，是所有失败
  形态里最坏的一种，所以在 op 层就拒绝。
- ⚠️ **`mc:Fallback` 不编号。** Word 把形状里的文字在 `mc:AlternateContent` 里写两遍
  （`mc:Choice` 给新版，`mc:Fallback` 给 Word 2007 的 VML）。两边都编号会让每个文本框的文字有
  两个地址、内容完全相同，`replace_text` 永远判「歧义，拒绝」。
- ⚠️ **`footnotes.xml` 开头那两条 `w:type="separator"` 不编号**，否则每条真脚注的地址都要往后
  挪 2，`fn:p1` 指向一个用户看不见的空段落。
- ⚠️ **`verify` 必须严格重开每个 side part。** 读的时候 `openParts` 对解析失败的部件是**跳过**
  的（一个坏页眉不该让整篇论文打不开），这个宽容对写入是灾难：刚被我们写坏的页眉会在校验读里被
  跳过，于是保存报成功。所以 `verifyDocx` 单独再严格 tokenize 一遍。
- **默认 `mode=track`。** 直接覆盖（`mode=direct`）要在审批卡上单独说明。
- 加批注要同时动四处：`word/comments.xml`（可能不存在，要新建）、`[Content_Types].xml`、
  `word/_rels/document.xml.rels`、正文里的 `commentRangeStart/End` + `commentReference`。
  ⚠️ 漏掉 Content_Types 的结果是 Word 报「文件已损坏」，这是最容易踩的一脚。
- 投影里公式（OMML）、图片、图表转成 `[公式]` `[图 3]` 这种占位符并保留 id —— 让 AI 知道那里有
  东西但不试图编辑它。
- 中日韩：`w:rFonts` 有 eastAsia 区分，新插入的 run 直接继承原 rPr 就不用管这件事。

### 7.2 xlsx（已落地，见第十节）

- **单元格写入用 `t="inlineStr"`，绕开 sharedStrings。** 改 `xl/sharedStrings.xml` 要维护引用计数
  和索引重排，代价大且容易错；inlineStr 是标准里合法的写法，Excel/WPS/Numbers 都认。
- **公式重算交给 Excel。** 写完之后删掉 `xl/calcChain.xml`（连 rels 和 Content_Types 一起清），
  并在 `workbook.xml` 的 `<calcPr>` 上加 `fullCalcOnLoad="1"`。⚠️ 不这么做的后果是：AI 改了 B2，
  但依赖 B2 的 C2 还显示旧的缓存值，用户打开看到的是**自相矛盾的表**。JS 侧自己算是另一条路，但
  `hyperformula` 是 GPL-3.0，用不了。
  ⚠️ `<calcPr>` 的位置有讲究：`CT_Workbook` 是 sequence，它必须排在 `definedNames` 之后、
  `oleSize` 之前。落错槽位的合法元素照样被 Excel 判成「内容不可读」。
- **日期是序列号。** 单元格里是 `45678`，得查 `numFmt` 才知道它是日期；还要看工作簿是不是 1904
  日期系统（Mac 老文件）。读的时候统一还原成 ISO 字符串，否则 AI 会把日期当普通数字做统计。
  ⚠️ 判日期不能只看 `numFmts` 里的自定义码：**内建 id 在 styles.xml 里根本没有条目**，而中日韩
  工作簿大量用 27–36 / 50–58 这批内建 CJK 日期格式 —— 「日期读出来是一串数字」多半就是漏了它们。
  反方向的坑是自定义码 `0" m"`（米），裸扫一个 `m` 就会把整列测量值「还原」成时间戳，所以引号内
  的字面量、`\x` 转义、`[Red]` / `[$-409]` 这些方括号块都得先剥掉再匹配。
- **共享公式 `t="shared"`**：一个单元格写 `<f t="shared" si="0" ref="C2:C99">`，其余只引用 si。
  ⚠️ **原计划是「改 host 时把公式实体化到别的单元格」，实际做成了拒绝写 host。** 实体化要按目标
  单元格重写相对引用，等于自己实现一小半公式引用翻译，而这一层写错是静默的（整列变 `#REF!` 或
  静默清空）。拒绝的代价是用户少一个能改的格子，收益是拒绝信息里直接给出「加一列」这个更符合
  意图的替代路径。加列本来就该是首选。
  ⚠️ 还有一个更细的形状：follower 单元格的 `<f t="shared" si="0"/>` **没有公式正文**，所以
  「这一列是不是算出来的」不能靠公式字符串判断 —— 空字符串是 falsy，一整列共享公式会被判成普通
  数字列，而普通数字列是可以随手覆盖的。`CellValue` 因此拆出 `computed` 和 `formula` 两个字段。
- ⚠️ **插入/删除行列是最危险的操作**：要同步改公式引用、合并区域、表（ListObject）范围、
  条件格式范围、数据验证范围、图表引用。**做成了按名字拒绝而不是「未知操作」** —— 听到「不是合法
  操作」的 AI 会以为工具能力有限就停手，听到「那会挪动公式/图表/合并区域引用的每个地址，改用
  add_column」的 AI 下一轮就做对了。拒绝信息本身是教学时机，所以必须带上原因和替代方案。
- 大表的读取预算：一个 5000 行 × 20 列的区域是 ~100 万字符，是一轮预算的 30 倍。所以
  区域读必须自己截断并在结尾说明剩多少行（照 `budget.ts` 的 `buildNotice()` 那套话术），
  并且**先按列截断再按行截断** —— 太宽没法翻页续读，只能让调用方缩窄。
- ⚠️ **行内单元格必须按列号升序。** 乱序的 `<row>` 被 Excel 判为损坏并提示修复。所以一次
  `doc_edit` 里所有落到同一个 sheet 的写入要**合并成一次 splice**，而不是每个 op 各来一次：
  行的插入点和 `spans` 属性都是行级记账，两个 op 各自插一格到第 1 行会各生成一条同范围的
  `spans` 编辑，`applyEdits` 正确地把整次调用判成重叠 —— 于是「加一列备注、顺手填个表头」这种
  完全正常的请求会因为跟请求本身无关的理由失败。
- **`spans` 是可选的提示属性**，行长变了就把它删掉，不要试图算对。Excel 容忍不一致，别的读取器
  不一定。
- **新单元格的样式从左邻居继承。** 加列填进去的值要长得像它旁边那一列，否则一张排过版的表上会
  多出一列裸格子。这跟 docx `insert_row` 的「按结构克隆」是同一条理由。
- 写数字要**只在无损时才当数字存**：`007`、`1.10`、电话号码、指数写法在 JS 里都能 parse 成数字，
  存进去再读出来就变了样。要求规范形式（`String(Number(v)) === v`）是最省事的判据。

### 7.3 pdf

- pdfjs 必须**本地打包 worker**（`pdf.worker.mjs`）并走 `web_accessible_resources`；⚠️ 从 CDN 加载
  会直接违反 MV3 远程代码政策，商店审核会挂。
- ⚠️ 只能用 `pdfjs-dist/build/*`，**不要用 `pdfjs-dist/legacy/build/*`**。legacy 构建内联了 core-js
  polyfill，其中 `object-create` 模块会用字符串拼接造 `javascript:` URL、`document.write()` 一个
  `<script>` 标签、还去摸 `ActiveXObject("htmlfile")`。Chrome Web Store 的自动扫描把这一段判成
  「obfuscated code / 隐藏功能」，2.10.0 就是因此被拒（violation ref: Red Titanium）。
  主线程 import 和 `wxt.config.ts` 里 copy 的 worker 必须来自同一个 build。
- 只做文字提取时不需要 canvas；一旦要渲染页面为图片就需要 `OffscreenCanvas`。
- 高亮批注需要文字的坐标：pdfjs 的 `getTextContent({ includeMarkedContent: false })` 给每个 item
  的 transform + width/height，据此算出 QuadPoints 交给 pdf-lib。⚠️ 跨行高亮要拆成多个 quad，
  不能画一个大矩形。
- 扫描件判定：整份文档文字层字符数 / 页数 < 阈值就判扫描件，明确告诉用户「这份是图片，我只能
  看图，不能改字」。

### 7.4 pptx / 字幕

pptx 的文字都在 `ppt/slides/slideN.xml` 的 `a:t` 里，结构比 docx 简单；删/重排幻灯片要同步
`presentation.xml` 的 `sldIdLst` 和对应 rels，漏了就是打不开。

字幕交给 `subsrt-ts`，我们只加两条自己的规则：**时间轴字段在「只改文本」的 op 里是只读的**，
以及输出时保留原文件的换行风格和 BOM（srt 对这个敏感，播放器行为不一致）。

---

## 八、安全网：改二进制文件比改文本危险，所以要多一层

现有的 undo 只管数据库（`undo/snapshot-store.ts` 是表级快照），**工作区文件写入根本没有 undo**。
文本文件还能靠 AI 自己改回来；一个被写坏的 docx 是**打不开**的，用户失去的是原始论文。

所以文档编辑必须自带回退：

1. **首次改动前自动备份**：`.history/<原名>.<时间戳>.<扩展名>`，同一个 session 只备份一次
   （理由同 `snapshot-store.ts` 的「first write 就是 session 起点」）。
2. `.history/` 在文件树里默认折叠/隐藏，**且不计入 `FREE_MAX_FILES`** —— 安全网不能变成付费墙。
   保留 3 份，超了删最旧。
3. **写入用「写临时文件 → 校验能重新打开 → 改名替换」**。⚠️ 直接 `createWritable()` 覆盖原文件，
   中途失败就是一个 0 字节的论文。
4. 写完立刻做一次自检：能不能重新解包、`[Content_Types].xml` 里声明的 part 是否都在、
   XML 是否仍然良构。任何一项不过就回滚并把失败原因作为 `ERROR:` 返回给 AI。
5. 审批卡（`change_summary` 那条链路）对文档编辑显示**逐条 op 的 before → after 片段**，不是整份
   文件。用户能审的只有句子级别的 diff。
6. 解压炸弹：`fflate` 解每个 part 时设上限（单 part 50MB / 总量 200MB / part 数 2000），
   OOXML 正常文件离这些数字很远。

---

## 九、明确不做，以及为什么

| 不做 | 理由 |
|---|---|
| **改 PDF 正文文字** | 文字在 content stream 里，改一个字要重排整个 text-showing 操作符序列、处理字体子集（要加的字形可能根本不在嵌入的子集里）、可能还要改 CMap。这是真正的无底洞。替代方案：批注 + 高亮，或者「我给你出一份修订版的 docx」 |
| **OCR 扫描件** | MV3 不能拉远程语言包，本地打包 15MB+ 不现实；而宿主就是个多模态模型，把页面渲染成图片给它看是更好的答案 |
| **JS 侧公式重算** | `hyperformula` 是 GPL-3.0-only；自己实现 Excel 函数语义（含数组公式、迭代计算、区域引用）性价比为负。交给 Excel 的 `fullCalcOnLoad` |
| **.doc / .xls / .ppt（97-2003 二进制）** | 完全不同的 CFB 二进制格式，跟 OOXML 那套基建零复用。让用户在 Office 里另存为，一句提示就够 |
| **docx 排版还原 / 分页** | 「第 12 页」这种定位需要完整排版引擎。用段落号和章节代替，AI 和用户都不吃亏 |
| **在侧边栏里做可编辑的文档编辑器** | 这是另一个产品。我们做的是「AI 改，用户在 Word/Excel 里审」 |
| **xlsx 图表的创建/修改** | 读的时候知道「有一个图表引用了 A1:C20」就够了；生成图表 XML 属于另一个量级 |
| **xlsx 数字格式 / 字体 / 合并单元格** | 写一个格式要动 `styles.xml` 的 `numFmts` + `cellXfs`，并且**重排后面每一个样式索引** —— 而索引是被全表单元格按位置引用的。收益（一个日期显示成日期）远小于风险（全表格式错位）。替代：值继承目标格原有的 `s`，新格继承左邻居 |
| **xlsx 单元格批注** | 一条批注要 `comments1.xml` + 一份 legacy VML drawing + 两处 Content_Types + rels，缺 VML 时 Excel 未必显示那个小红角。四个 part 换一个悬停才看得见的东西，不如让 AI 加一列写在明面上 |
| **xlsx 就地排序 / 筛选** | 按地址搬数据，公式、图表、透视范围全指错，而且用户看不出动了什么。读出来 → 在回答里排好 → `add_sheet` 落一份副本 |

---

## 十、分期

### 当前状态（P0 + P1 + P2 已落地）

#### P1：docx

「帮我改论文」这条链路通了：`doc_read`（outline / range / search）和 `doc_edit`
（修订式替换、填空、批注、增删段落、改样式）都挂在可开关的 `Documents` MCP 上，
细则在 `builtin-docx-review` skill 里。地址覆盖 body + 页眉页脚 + 脚注尾注 + 表格单元格，
理由与踩过的坑见 §7.1。

表格结构操作也做了：`insert_table` / `insert_row` / `delete_row` / `delete_table`，行有自己的
地址 `t3r2`。⚠️ **仍然缺的是合并单元格和加列** —— 加列要同步改 `w:tblGrid`、每一行的 `w:tc` 数、
以及所有 `gridSpan`，是另一个量级。

⚠️ **明确不走「删掉整张表重建」这条路来改表**，即使 op 已经齐了。一个 `w:tbl` 上挂着 `w:tblPr`
（边框、表样式、宽度）、`w:tblGrid`（列宽，丢了 Word 就均分，一眼可见）、`w:trPr`（行高、跨页
重复表头）、每个 `w:tcPr`（底纹、对齐、合并）、单元格里的段落与 run 格式，还有 bookmark（目录 /
交叉引用 / Zotero 引文的目标）、批注锚点、别人的修订、超链接、脚注引用。重建全部丢失，而且丢得
静默 —— 能打开、能 tokenize、`verifyDocx` 全过，只有用户看到表格变形。这就是 §5.3 论证过的
「解析 → 重新序列化」失败形态，只是尺度从整份文件缩到一张表。另外修订模式下它会显示成「整表删除
+ 整表插入」，用户没法逐行 Accept，而默认走修订的全部理由就是「没人会逐字校对」。
所以 `insert_row` 是**按结构克隆**而不是按字符串克隆:只复制 `w:trPr` / `w:tcPr` /
`w:pPr`,不复制单元格内容 —— 这样天然不会复制出重复的 bookmark id 或批注锚点(复制出重复 id
的后果是 Word 静默「修复」,然后告诉用户文件被我们损坏过)。复制时还要剥掉 `w:vMerge`
(复制的 `restart` 会开出第二个纵向合并,新行被上一行吞掉,看起来像什么都没做)、
`w:cellIns` / `w:cellDel` / `w:tcPrChange` / `w:trPrChange`(别人的修订记录),
以及 `w:tblHeader` / `w:cnfStyle`(否则新数据行会每页重复并套上表头的条件格式)。

⚠️ **两张相邻的表 = 一张表。** Word 静默合并,而且 body 或单元格不能以表格结尾
(`w:sectPr` 不算 block 内容,所以表格紧贴 sectPr 也算结尾)。所以插表时按需要在两侧垫
`<w:p/>`,删表时若删掉会让前后两张表贴上则原地留一个空段落。

已经在跑的东西：

| 位置 | 干什么 |
|---|---|
| `shared/documents/zip.ts` | 惰性解包（只解要用的 part）、炸弹上限、媒体不重压、**无改动时原字节返回** |
| `shared/documents/ooxml/xml-cursor.ts` | 保偏移 tokenizer + splice，`applyEdits` 拒绝重叠改动 |
| `shared/documents/ooxml/runs.ts` | run 展平（非文字内容映射成 U+FFFC 当墙）、定位、`splitRunsAt` 按 hit 边界拆 run |
| `shared/documents/storage.ts` | 写前纯函数自检 → `.history/` 备份 → 写 → 读回复检 → 失败自动回滚 |
| `shared/documents/docx/revisions.ts` | `w:ins` / `w:del` 包装、段落标记修订、`w:pPrChange` |
| `shared/documents/docx/comments.ts` | comments.xml + Content_Types + rels + commentRange，四处一起动 |
| `shared/documents/docx/edit.ts` | op 分派；地址是 `old_text` 而非段落号，歧义拒绝；edits 按 part 分组 |
| `shared/documents/docx/parts.ts` | 哪些 part 有可见文字（body / header / footer / footnotes / endnotes）+ 前缀地址 |
| `shared/documents/docx/blocks.ts` | 单次 token 走查编号：段落、表格、**行 `tNrR`**、**单元格 `tNrRcC`**；跳过 `mc:Fallback` 与 separator 脚注 |
| `shared/documents/docx/tables.ts` | 建表 XML、按结构克隆行、修订式删行删表、相邻表格的 `<w:p/>` 垫片 |
| `shared/documents/docx/` 其余 | 主 part 走 `_rels/.rels` 找、标题识别四级回退、投影与搜索 |
| `shared/workers/doc-worker.ts` | 串行队列，直接开 OPFS，无 DOM |
| `shared/offscreen-host.ts` | offscreen 文档创建收口，db 与 documents 共用一个 |

spike 状态：第 1 个（offscreen worker 能否直接看到 background 那棵 OPFS 树）仍需在浏览器里验；
第 2 个的**读**侧由 `zip.ts` 的「无改动就返回原 `source`」在结构上保证，**改**侧已用合成 fixture
（六 run 跨切 + bookmark + proofErr + CJK eastAsia + 他人修订 + 空段落）验过 bookmark/proofErr/sectPr
零丢失，但**真实样本（Zotero、LaTeX 转出、WPS、Google Docs 导出）仍未跑过**，这仍是上线前的必做项。

⚠️ 验证过程中修掉四个会静默出错的 bug，都值得记在这里，因为它们的形状会重复出现：

1. **parser 白名单漏了 `doc_read`。** `engine/parser/tool-schema.ts` 的 `SUPPORTED_TOOLS`
   是独立于 MCP registry 的第二份名单，缺名字的工具一律判 "Unknown tool"。schema 写得再对也没用。
2. **修订 id 在 per-run 循环里分配。** 一句话跨四个 run 就变成四处独立修订，用户要点四次
   「接受」，只接受一部分还会留下半句话。一个逻辑改动必须共享一个 `w:id`。
3. **自闭合 `<w:p/>` 的 `innerStart` 在 `/>` 之后。** 往那里插 `w:pPr` 会落到段落*外面*，
   产物仍能 tokenize、仍然平衡，所有结构校验都放行，只有 Word 会说文件损坏。
4. **`<w:comment\s[^>]*\sw:id` 这个正则永不匹配**（标签名后的空格已被 `\s` 吃掉），
   于是二次编辑同一文件时批注编号从 1 重新开始，两条批注撞 id。

#### P2：xlsx

「帮我处理统计数据」这条链路通了，跑在同一套 `zip.ts` / `storage.ts` / `applyEdits` 上，
零新增依赖。细则在 `builtin-spreadsheet-analysis` skill 里。

**地址空间是 Excel 自己的**，这是它跟 docx 最大的差别，也省掉了一整类 bug：`Sheet1!C2` 是坐标，
用户在屏幕上看得见，编辑前后含义不变。docx 那条「段落号只能导航、编辑必须靠 `old_text`」的规矩
在这里不需要 —— 所以安全功夫全部挪到「**什么不许覆盖**」上（共享公式 host、插删行列、就地排序）。

概览的重心也因此不同：文档的 outline 是目录，工作簿的 outline 是**schema**。
「有三个 sheet」帮不到任何人，`A 序号(num) B 姓名(text) C 日期(date) D 分数(fx)` 才是 AI 做统计
前唯一需要的东西 —— 代价是抽样前 30 行、每个 sheet 一百来字符，替代的是「读一千行才知道列是什么」。
`fx` 这个标记是结构事实（这列是算出来的，别覆盖），比任何值类型都重要。

| 位置 | 干什么 |
|---|---|
| `xlsx/refs.ts` | A1 解析与格式化：`$A$1`、`A:C`、`2:40`、`'My Sheet'!B7`（`''` 转义），开区间靠已用区域收敛 |
| `xlsx/numfmt.ts` | `cellXfs` → `numFmtId` → 是不是日期；内建 CJK 日期 id；剥字面量再判自定义码；1900/1904 双纪元 + 1900-02-29 那个假日期 |
| `xlsx/sheet.ts` | 单遍走 `sheetData`：行总是记，**单元格按窗口才建**（大表读 50 行只付 50 行的钱）；单次扫描读整个标签的属性，不用 per-attr 正则 |
| `xlsx/model.ts` | workbook 走 `_rels/.rels` 找、sheet 走 rels 找 part、sharedStrings / styles 惰性加载、按名/按序号找 sheet |
| `xlsx/values.ts` | `t` + sharedStrings + numFmt 合成一个 `CellValue`；`computed` 与 `formula` 分开；列类型推断 |
| `xlsx/read.ts` | TSV + 列字母/行号双轴投影、公式单列表、先列后行截断、`nextRange` 续读、跨表搜索（值 **和** 公式） |
| `xlsx/cells.ts` | 单元格/行 splice：改已有格保 `s`、新格按列序插入、自闭合 `<row/>` 展开、`spans` 失效 |
| `xlsx/recalc.ts` | 删 calcChain（连 Override 和 rel）、`fullCalcOnLoad="1"` 塞对槽位、`<dimension>` 只增不减、Content_Types / rels 增删 |
| `xlsx/sheets.ts` | 新建 sheet 的四处联动、Excel 那套命名规则、改名前先查引用（查到就拒绝） |
| `xlsx/edit.ts` | op 分派；跨 op 收集写入后**每个 sheet 只 splice 一次**；策略（拒绝）在这层，机制（XML）在 `cells.ts` |

op：`set_cell` / `set_cells` / `add_column` / `clear_cells` / `add_sheet` / `rename_sheet`。
`add_column` 是这一期真正的主角 —— 「帮我算个增长率」的正确编译结果是加一列写**公式**
（`=(C{row}-B{row})/B{row}`，`{row}` 逐行替换），而不是把算好的数字贴进去：用户改了 B2 之后，
公式还对，数字就成了谎话。

⚠️ 验证过程中（合成 fixture：共享公式 + 内建 CJK 日期 + 「米」单位自定义码 + 自闭合行 + inlineStr
+ 中文 sheet 名）修掉五个 bug，形状同样值得记：

1. **共享公式 follower 的 `formula` 是空字符串，而空字符串是 falsy。** 于是一整列共享公式被判成
   普通数字列 —— 而普通数字列是「可以随手覆盖」的。判「算出来的」必须用独立的布尔字段。
2. **行级编辑跨 op 撞车。** 两个 op 各插一格到第 1 行，各自生成一条同范围的 `spans` 删除编辑，
   `applyEdits` 正确判重叠，整次调用失败。修法不是放宽重叠检查，而是把写入收集到调用级、
   每个 sheet 只 splice 一次。
3. **`range="数据"`（裸 sheet 名）解析失败。** 而 outline 恰恰是按 sheet 名列出来并告诉 AI
   「拿这个 id 当 range」的 —— 工具在自我矛盾。解析顺序定为：`!` 优先 → 匹配 sheet 名 → 当矩形。
4. **`set_cells` / `clear_cells` 忽略独立的 `sheet` 参数**，只认 range 里的 `!`。于是
   `sheet="汇总" range="A1:B2"` 静默写到了第一个 tab。
5. **`add_sheet` 的 `rows` 取错了 key**，一律报「rows 必填」。

`add_column` 与 `set_cell` 在同一次调用里瞄同一列是**设计使然而非 bug**：ops 互相看不到结果，
`add_column` 的落点算自「加载时的已用区域」。所以 skill 里写明「一次调用只放一个 `add_column`」。
另外单行摘要在部分单元格被拒时会夸大战果，所以拒绝数会追加一行说明 —— 摘要不能替 `applied` 撒谎。

**仍未做的**：真实样本（Excel 各版本、WPS、Numbers、Google Sheets 导出）的零改动 round-trip 与
编辑后用 Excel 打开，跟 docx 的第 2 个 spike 一样是上线前必做项。

#### P3：PDF（已落地）

PDF 已落地；PPTX 读改也已补齐（见下节），doc_create 仍待实现。

- `shared/documents/pdf/`：pdfjs-dist 兼容构建读取目录、页数、文字层统计、页范围、文字搜索、已有批注和 AcroForm 字段；投影有字符上限。
- `pdf/edit.ts`：comment / note / highlight / fill_form / delete_pages / extract_pages / merge / rotate_pages / watermark / page_numbers。PDF 不支持修改正文。
- `pdf-host.ts`：Chrome offscreen 主线程与 Firefox background 页懒加载并串行执行，直接访问 OPFS。PDF 库不进入 content script 或 doc-worker。PDF.js worker、CMap、标准字体与 WASM 均打包在本地 `pdf/`。
- `builtin-pdf-review` 提供完整参数和工作流；复用 doc_read / doc_edit，不增加常驻工具。
- handler 和保存自检支持异步；写失败、读回自检失败都恢复本次写前字节；备份失败拒绝覆盖。底层 writeBytes 在失败时 abort，不提交部分写入。

边界：抽页在当前文件保留所选页（原顺序），另存请先复制文件；删页/抽页移除旧书签和页标签。
有表单字段的 PDF 不做页面删除/复制/合并；XFA、加密文件及签名字段拒绝编辑。
高亮按命中的完整 text item 生成独立 quad，可能包含同一 item 内相邻文字，不支持竖排；跨行不合并成大矩形。
便签/批注支持 Unicode；表单文字、水印和页码使用 Helvetica/WinAnsi，不支持的字符明确拒绝。
坐标使用未旋转 PDF 的左下角原点。OCR 和页面渲染仍属于后续范围。

验证：`node scripts/test-pdf.mjs` 使用生成文件交叉重读文字/批注/表单，检查页面操作与错误参数；
`node scripts/test-document-storage.mjs` 检查异步自检、同 session 后续写入回滚、写入中断和备份失败。
`node scripts/test-document-tool-parser.mjs` 覆盖 ops 双层引号、摘要内引号、Markdown 转义标签、渲染/执行解析一致性，以及 type → op 兼容。PDF 高亮匹配忽略文字投影引入的空白差异，仍要求页内唯一命中。
Chrome/Firefox 构建验证本地资源和分包；真实扩展 offscreen/Firefox OPFS 以及 Acrobat/WPS 的显示效果仍需浏览器/真实文件验收。

#### P3：PPTX 读改（已落地）

零新增第三方依赖，复用 `fflate`、保偏移 XML tokenizer、doc-worker、文档备份和写回复检。
`shared/documents/pptx/` 分为 package/model/read/edit/index，注册到现有 doc_read / doc_edit；
完整参数在 `builtin-pptx-review`，不增加工具 schema。

- 读取：按 presentation.xml 的实际页序返回标题概览；按页范围读取正文、形状 ID/类型/名称、
  演讲者备注；支持字面量搜索和 `nextRange` 字符偏移续读，单次投影最多 16000 字符。
- `replace_text`：slide、old_text、new_text，可选 shape ID；要求段落内唯一匹配，支持跨 run，
  替换文字继承首个命中 run 的格式，保留未命中文字的原 run 格式；不跨字段/换行，不自动缩放文本框。
- `set_notes`：slide、text；替换正文备注为纯文本，换行变成段落，保留页码等其它占位符；
  无备注时创建 notesSlide、关系和 Content Type，有 notesMaster 时复用它。
- `duplicate_slide`：slide，可选 after（0 表示插到最前）；克隆备注、图表和嵌入工作簿等可编辑依赖，
  共享母版/布局/媒体，备注回链指向副本；未知依赖类型明确拒绝。
- `delete_slides`：slides 数组；只从展示页序移除，至少保留一页。**保留底层 part 和关系，
  不保证缩小文件，也不是内容安全擦除；原有超链接仍可能访问被移除的页。**
- `reorder_slides`：order 数组，必须包含当前所有页且无重复。

ops 顺序执行，后续页码以当前顺序为准；任何一项无效，整批不保存。零改动返回原始字节。
签名文件拒绝编辑；自定义放映/分节文件拒绝结构操作。当前只支持标准 p/a/r 前缀的 Transitional
PPTX，Strict/其它命名空间前缀明确拒绝；带 mc:AlternateContent 的页不做文字替换。
不渲染、不读取图片/图表/SmartArt 内部文字、不新建演示文稿。

保存自检覆盖 XML 标签嵌套、Content Types 声明、内部关系目标、关系 ID 和幻灯片 ID 唯一性。
`node scripts/test-pptx.mjs` 验证跨 run/CJK/实体转义、格式与未改 part 保留、分页续读、
备注、深层复制隔离、顺序操作、歧义/字段拒绝、零改动及错误批次不落盘。
另用运行环境自带 python-pptx 生成带图表/备注的独立样本，编辑后由 python-pptx/lxml
交叉重读全部 XML、核对文本/备注、修改副本图表并验证原图表不变，重新保存通过；未引入产品依赖。
构建体积对比（同一工作区开发前后 Chrome 构建）：doc-worker 增加 14,438 字节，逐文件 gzip
口径约增加 5,065 字节；content script 仅增加 skill/工具说明 2,426 字节，未包含 PPTX 解析器。
Office handler 注册从通用 engine 移到 doc-worker 后，PDF/background 不再重复打包 Office 解析代码，
整体构建文件合计反而减少 200,487 字节（逐文件 gzip 合计减少 72,226 字节；不是扩展 ZIP 实测）。
Chrome/Firefox 构建与 PPTX/PDF/备份/参数解析回归通过；全项目 tsc 仍有 6 处未改动文件的既有错误。
浏览器内 offscreen/Firefox OPFS 和 PowerPoint/WPS 实际布局仍需真机验收。

参考：[Microsoft PresentationML 结构](https://learn.microsoft.com/en-us/office/open-xml/presentation/structure-of-a-presentationml-document)、
[Microsoft Notes Slide 说明](https://github.com/OfficeDev/open-xml-docs/blob/main/docs/presentation/working-with-notes-slides.md)。

### 路线

| 期 | 内容 | 交付的场景 |
|---|---|---|
| **P0 基建** | `zip.ts` + `xml-cursor.ts` + `runs.ts` + doc-worker + `DOCUMENT_OP` + 备份/原子写 + 3 个 tool 骨架 + `file-kinds` 分类修正 | 无用户可见功能，但后面每一期都便宜 |
| **P1 论文场景** | docx 读（outline / 按段 / 搜索）+ 批注 + 修订式编辑 + `docx-review` skill。⚠️ 字幕 cue 级工具当时列在这一期，**没做** —— 它跟 docx 一行代码都不共享，塞在同一期只会让这期的验证面变大。挪到 P2 或单独一期 | ✅ **「帮我改论文」跑通** |
| **P2 数据场景** | xlsx 概览 / 区域读 / 类型推断 / 单元格与公式写入 + 加列 + 加 sheet + `spreadsheet-analysis` skill。⚠️ 批注与数字格式**没做**，理由进了第九节 | ✅ **「帮我处理统计数据」跑通** |
| **P3 补齐** | PDF 读 + 批注/表单/页面操作；pptx 读改；`doc_create`（md→docx / csv→xlsx / md→pptx） | 文献阅读、汇报材料 |
| **P4 加分项** | 侧边栏文档预览（docx-preview / 表格 / pdf canvas）；PDF 页面渲染成图交给多模态模型；xlsx 区域导入临时 sqlite 让 AI 用 SQL 做统计 | 信任感与大表分析能力 |

P4 那两条各有一个前置：**渲染成图要 adapter 新增「往输入框贴图片」的能力**（现在
`AgentPlatformAdapter` 只有 `insertText` / `stageResultCapsules`，没有附件通道，而且两个平台的
composer 差别很大）；**sqlite 那条必须与应用自己的库隔离**（独立 db 文件或临时表命名空间 +
只读保护），否则 AI 在用户数据表上跑 SQL 会碰到我们自己的账本。

---

## 十一、动手前要先验的三件事（spike，各半天）

1. **offscreen worker 能不能直接读到 background 那棵 OPFS 树。** 整个「字节不过桥」的设计押在
   这一条上。写个最小验证：background 写一个文件，doc-worker 读出来。Firefox fallback 路径同样验。
2. **`xml-cursor` 对真实文件的存活率。** 找 10 份真实 docx（带修订的、Zotero 插过引文的、
   LaTeX 转出来的、WPS 存的、Google Docs 导出的）跑「解包 → tokenize → 原样重打包 → 用 Word 打开」，
   ⚠️ 必须先证明**零改动 round-trip 是逐字节相同的**，再谈编辑。
3. **pdfjs 在 offscreen 文档里的可用性与真实体积。** 打一次包看 content script 和 offscreen 的
   bundle 各涨多少；确认 worker 走本地 `web_accessible_resources` 能起来。

## 参考

- [anthropics/skills — docx skill](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md)：官方 docx skill，思路是 unzip → 改 `word/document.xml` → 用 docx-js 新建 → redlining 做修订
- [dealfluence/adeu](https://github.com/dealfluence/adeu)：docx ↔ Markdown 投影、改动回写成修订的开源实现（npm 包是空占位）
- [ItMeDiaTech/docXMLater](https://github.com/ItMeDiaTech/docXMLater)：声称能安全 round-trip 带修订/批注的 docx，可挖实现细节
- [CVE-2023-30533](https://scout.docker.com/v/CVE-2023-30533)：SheetJS CE ≤0.19.2 读取构造文件时的原型污染
- [SheetJS 安装说明](https://docs.sheetjs.com/docs/getting-started/installation/nodejs)：新版只在 cdn.sheetjs.com 发布，npm 停在 0.18.5
- MV3 service worker 没有 DOMParser：[Chrome extension: DOMParser is not defined with Manifest v3](https://stackoverflow.com/questions/68964543/)

（以上外部内容均为转述整理，非原文引用。）
