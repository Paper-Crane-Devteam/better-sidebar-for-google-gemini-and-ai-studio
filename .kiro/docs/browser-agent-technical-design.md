# Browser Agent 技术方案

> 状态：设计基线。实现以本文为准；代码与本文不一致的地方按本文调整。

## 1. 它要成为什么

Browser Agent 让用户对着聊天框说一句「把我这些标签整理一下」，然后得到一个整理好的浏览器。
标签、标签组、收藏夹三类对象，AI 负责分类和命名，扩展负责把方案变成真实操作并保证可退回。

它**不做**：网页正文/元数据抓取、修改 `document.title`、任意 SQL、浏览器现场保存恢复。
Data Agent 的工具在这里不可见，反之亦然。

**标签备注推迟。** 一个只有扩展界面看得见、绑在标签 id 上、浏览器重启就失效的备注，
恰好在用户需要它的时候（下次找这个标签）不存在，却要占一个写操作、一次批准、一条审计和一条撤销路径。
它重新进入范围的条件是找到稳定的载体：绑到 URL 上持久化，或者用 Firefox 的
[`sessions.setTabValue`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sessions/setTabValue)
这类跨重启存活的通道（Chrome 无对应能力，所以它只能是增强，不能是基线）。

### 主线（读完这一节就知道整个功能长什么样）

```
用户在 Gemini/AI Studio 输入框打 > 选「整理标签页」
  ↓
AI 调 browser_list_tabs → 拿到当前窗口 84 个标签（标题 + URL + 组关系 + 重复标记）
  ↓
AI 出方案，一次 browser_arrange_tabs + 一次 browser_manage_tab_groups
  ↓
扩展生成预览（不是操作清单，是「整理后的样子」）：
    新建 4 个组：文档(蓝) 12 · 待读(黄) 23 · 工作(绿) 9 · 购物(粉) 5
    移出组：3 个标签
    保持不动：32 个标签
    ⚠️ 无
  ↓
用户点批准（这批全是无损操作 → 可以选「本次任务不再问」）
  ↓
扩展逐步执行，每步只校验这一步涉及的对象没被改动
  ↓
结果回传给 AI：4 组已建，49 个标签就位，0 失败
  ↓
AI complete_task；侧边栏留一条本机记录，可撤销
```

有损操作（关闭标签、删除收藏夹）不在这条主线上，走 §6 的独立路径。

⚠️ 这一节是其余所有约束的锚。任何一条规则如果不能说清它在保护上面哪一步，就不该存在。

## 2. 浏览器支持

Chrome 和 Firefox 同一套代码，**按运行时能力探测，不按 build target 分叉**。
`import.meta.env.BROWSER` 只用来决定 manifest 里申请哪些 optional permission。

| 能力 | Chrome | Firefox | 探测方式 |
|---|---|---|---|
| 标签读写 | 88+ | 109+ | `browser.tabs.move` 存在 |
| 会话标识（epoch） | 102+ | [115+](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session) | `browser.storage.session` 存在 |
| 收藏夹读写 | 88+ | 109+ | `browser.bookmarks` 存在 |
| 分组 / 取消分组 | 88+ | [138+](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/group) | `browser.tabs.group` 存在 |
| 组属性（读、改名、改色、折叠、移动组） | 89+ | [139+](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups) | `browser.tabGroups` 存在 |
| 恢复已关闭标签 | 37+ | [52+](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sessions/restore) | `browser.sessions.restore` 存在 |

结论：Firefox **139+ 全功能**，138 只差组属性（此时整组能力一起隐藏，不做半残的分组），
115–137 只有标签和收藏夹能力，115 以下 Browser Agent 整体不可用并提示升级。
manifest 的 `strict_min_version` 保持 109 不变 —— 门禁在运行时，不在安装时。

⚠️ 探测的是**函数是否存在**，不是版本号。版本号会因为渠道和 backport 说谎，
而 `optional_permissions` 里写了一个宿主不认识的权限，整个 manifest 会被拒。
Firefox 的 `tabGroups`、`tabs`、`bookmarks`、`sessions` 都在
[官方可选权限清单](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions)
里，所以 `optional_permissions` 两个浏览器写同一份。

⚠️ Firefox 授予 `tabGroups` 是**静默**的（不弹窗），`tabs` / `bookmarks` / `sessions` 会弹。
所以权限设置页不能假设「点了就一定有弹窗」，一切以 `permissions.contains()` 的回答为准。
另外 Firefox 要求 `permissions.request()` 来自用户手势 —— 独立设置窗口里的点击满足这一条，
后台自发申请不满足，这也是权限入口必须是独立页面而不是 AI 能触发的动作的原因之一。

跨浏览器的**行为**差异（不是 API 有无）集中在 §12，那些差异会影响预览里的承诺措辞。

## 3. 能力与权限

能力默认全部关闭，由用户在独立设置窗口逐项点开。前端只注入已授权的工具，
后台在 prepare 和执行每一步时重新核对 `permissions.contains()` 和能力开关。
隐身/私有窗口的对象一律不返回、不可操作。

| 能力 | 浏览器权限 | 能做什么 | 档位 |
|---|---|---|---|
| `tabs.read` | tabs | 标题、URL、窗口、位置、固定、组关系、重复标记 | 读 |
| `tabs.arrange` | tabs | 排序、移窗口、固定/取消固定、激活、新建标签 | 低损 |
| `tabs.close` | tabs + sessions | 关闭标签，以及恢复自己关掉的标签 | 有损 |
| `groups.read` | tabGroups | 组的标题、颜色、折叠状态、位置 | 读 |
| `groups.write` | tabGroups | 分组、取消分组、改名、改色、折叠、移动组 | 低损 |
| `bookmarks.read` | bookmarks | 读取和搜索 | 读 |
| `bookmarks.arrange` | bookmarks | 新建、重命名、移动 | 低损 |
| `bookmarks.delete` | bookmarks | 删除 | 有损 |

依赖关系（勾选时自动带上，取消时自动收回下游）：

```
tabs.arrange  → tabs.read
tabs.close    → tabs.read
groups.read   → tabs.read              （组只有配上成员才有意义）
groups.write  → groups.read, tabs.arrange
bookmarks.*   → bookmarks.read
```

⚠️ `tabs.close` 单独成一档而不是并进 `tabs.arrange`，是因为它是标签侧**唯一**真正有损的操作，
而它恰好也是「整理」这个词最容易被理解成的动作。把它和「换个位置」放在同一个开关后面，
用户授权时无法表达「你可以整理，但别关我东西」——这是这个功能最常见的诉求。
`bookmarks.delete` 同理。

⚠️ 档位是**从能力推导**出来的，不再单独维护一张操作风险表。一个操作的档位 = 它所属能力的档位，
一批操作的档位 = 其中最高的那一档。§4 的批准规则只读这一个值。

⚠️ Chrome 侧 `tabs.arrange` 和 `tabs.close` 映射到同一个 `tabs` 权限，
所以这两档的区分是**产品闸门而非系统闸门**。文档必须承认这点：撤销 `tabs.close` 能力后，
浏览器权限可能仍然在，扩展靠自己的能力检查拒绝执行。这不降低价值（越权路径只有扩展自己），
但决定了实现上「能力检查」和「权限检查」两处都不能省。

## 4. 批准

纯读取不批准。每一次实际修改都要批准，但**批准的有效范围按档位**：

| 档位 | 范围选项 | 能被设置豁免吗 |
|---|---|---|
| 低损（arrange / groups.write） | 本批 / 本次任务 | 能：`autoRunWrites` 和 `speedMode` 对它有效 |
| 有损（tabs.close / bookmarks.delete） | 只有本批 | 不能：忽略一切自动执行开关 |

⚠️ 低损必须允许「本次任务放行」。整理 80 个标签在冲突重算后可能变成三四次提交，
每次都问一遍会让用户直接把整个保护关掉 —— 那比放行低损操作危险得多。
而低损操作的定义就是「用户看得见、扩展能完整退回、没有数据丢失」，它承受得起这个信任。

⚠️ 有损档不接受任何豁免，包括用户自己在别处点过的「本次任务不再问」。
一批操作的档位取其中最高的一档，所以「顺手关掉 5 个重复标签」会把整批拖进有损档 ——
这是刻意的：AI 不能靠把有损操作混进一批无损操作来降低它的门槛。

批准绑定的是 `planId` + 该 plan 的前置条件快照，不是「一类操作」。
宿主标签不同、plan 过期、前置条件失配，一律拒绝执行并要求重新批准。

### 冲突之后：在同一张卡上重算，而不是重跑一轮 AI

前置条件失配是**常态**（用户一边整理一边在用浏览器），所以它不能走错误路径：

```
预览卡上有「按当前状态重算」
  ↓ 走 background 的 refresh，沿用同一份 AI 意图
新 planId（审计里记 supersedes 旧的），重新算前置条件和预览
  ↓
低损 + 用户已选「本次任务放行」 → 直接继续执行，不再问
低损 + 未放行 / 有损            → 重新批准
```

⚠️ 重算不回到 AI。AI 的产出是**意图**（哪些标签归哪一组、按什么顺序），
意图不会因为用户开了个新标签而失效；失效的只是扩展算出来的具体 index 和 id 绑定，
那是扩展自己的账。让 AI 重跑一轮既慢又可能给出不一样的分类，用户看到的方案会变。

⚠️ 已经尝试过（`applying` 之后）的 plan 永远不能再次提交，重算产生的是新 plan。
这条和上面不矛盾：重算是「用新状态重新落地同一个意图」，不是重试一个结果不明的执行。

## 5. 预览：批准的对象是结果，不是操作

预览由扩展从真实对象生成，AI 不能影响它的内容。它必须回答「我的浏览器会变成什么样」，
而不是「扩展会调用哪些 API」。

```ts
interface PlanPreview {
  id: string;
  tier: 'low' | 'lossy';          // §4 的档位，UI 据此决定能不能给「本次任务放行」
  expiresAt: number;
  summary: PreviewSection[];      // 按结果分组，见下
  lossy: LossyItem[];             // 有损项单独一段，永远展开
  untouched: number;              // 范围内但不动的对象数
  aiExplanation?: string;         // AI 的 change_summary，渲染成 markdown
}
interface PreviewSection {
  kind: 'group_create' | 'group_update' | 'reorder' | 'move_window' | 'pin' | 'bookmark_create' | 'bookmark_move' | 'bookmark_rename';
  label: string;                  // 「新建组：待读（黄）」
  objects: PreviewObject[];       // 最多列 20 个，其余压成计数
  objectCount: number;
}
```

规则：

- 低损段默认折叠成一行标题 + 计数，点开看对象；**有损段永远展开**，逐个列出标题和地址。
- `untouched` 必须显示。用户需要知道这次整理的**范围**，「84 个标签里有 32 个不动」
  和「只看到 52 个标签被动了」是完全不同的信息量。
- 不出现 `tab_id`、`index`、`groupId` 这类内部标识。对象用标题 + 地址指认，
  位置用「移到『待读』组末尾」这类相对说法。
- 所有文案走 i18n，不在组件里硬编码中文。
- 恢复限制写在对应的段落上，不写在全局脚注 —— 只有关标签那段需要「无法恢复表单和滚动位置」，
  贴在有损段里用户才会读。

⚠️ 扩展的预览负责**「什么」**，AI 的 `change_summary` 负责**「为什么」**（「按站点域名归类，
文档类合并成一组」）。两者都显示，位置分开，谁都不能替代谁：程序讲不出分类依据，
AI 说不准真实数量。有损批次必须带 `change_summary`，缺失就拒绝 prepare；低损批次可选。

## 6. 有损操作走独立路径：默认不做

「整理」在用户心里通常不包含「删东西」。所以扩展给 AI 的默认路径是**把要清理的东西挪到一处，
让用户自己按删除键**：

| AI 的意图 | 默认路径 | 需要什么 |
|---|---|---|
| 关掉这些标签 | 移入「待清理」组并折叠 | `groups.write`（低损） |
| 关掉这些标签（没有组能力） | 存入「待清理」书签目录，标签保持打开 | `bookmarks.arrange`（低损） |
| 删掉这个书签目录 | 移入「待清理」书签目录 | `bookmarks.arrange`（低损） |
| 真的关闭 / 真的删除 | 逐批批准的有损操作 | `tabs.close` / `bookmarks.delete` |

⚠️ 这不是给有损操作加一层包装，而是**换掉默认值**。一次整理 80 个标签，
用「移进一个折叠的组」实现的清理感和真关闭几乎一样，代价却从「不可逆」降到「再拖回来」。
真关闭仍然提供，因为总有人就是要关，但它需要单独授权 + 逐批批准，摩擦与后果匹配。

### 关闭之后怎么恢复

关闭前记下浏览器给的会话条目，撤销时用
[`sessions.restore(sessionId)`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sessions/restore)
恢复，它会连**前进/后退历史**一起还原，两个浏览器都支持。

降级链和它在预览里的措辞：

| 条件 | 行为 | 预览措辞 |
|---|---|---|
| `sessions` 可用且条目仍在最近关闭列表里 | `sessions.restore` | 「可恢复，含浏览历史」 |
| 条目已被浏览器淘汰或跨了浏览器重启 | 按 URL 重新打开 | 「只能重新打开地址，表单和滚动位置会丢」 |
| 地址不是 http(s) | 拒绝，不假装能恢复 | 「这个页面扩展无法重新打开」 |

⚠️ 措辞按**批准那一刻**的真实条件生成，不用统一的免责文案。
「可恢复，含浏览历史」和「只能重开地址」是两个不同的决定依据，混成一句话等于都没说。

## 7. 冲突检测：对象级，不是浏览器级

每个操作声明**它自己依赖哪些对象的哪些字段**。prepare 时把这些字段的值记为前置条件，
执行每一步前只重读这一步涉及的对象。用户在别处开标签、切窗口、读完一篇文章，
都不构成冲突。

| 操作 | 前置条件（全部必须成立） |
|---|---|
| 排序 / 移窗口 | 每个目标标签存在；`windowId`、`groupId`、`pinned` 与 prepare 时相同 |
| 固定 / 取消固定 | 标签存在；`pinned` 与 prepare 时相同 |
| 激活 | 标签存在 |
| 关闭 | 标签存在；`url` 与 prepare 时相同 |
| 建组 / 取消分组 | 所有成员存在、同窗口、未被固定；`groupId` 与 prepare 时相同 |
| 改组属性 / 移动组 | 组存在；`title`、`color`、`collapsed` 与 prepare 时相同 |
| 新建标签 / 新建书签 | 目标窗口或父目录存在且可写 |
| 书签改名 / 移动 | 节点存在；`parentId`、`title` 与 prepare 时相同；不是受管理或根节点 |
| 书签删除 | 节点存在；`parentId` 相同；**直接子项数量**相同 |

**不参与比较**：与本操作无关的任何对象、`title`（页面加载中会变）、`lastAccessed`、
`favIconUrl`、绝对 `index`（见 §8）、以及正在导航中的标签尚未提交的地址。

⚠️ 这是整个方案里最容易被写错的一条。「整理标签」的典型用户开着几十个标签**并且还在用浏览器**，
整理过程持续几十秒。任何把「整个浏览器状态逐字节相等」当准入条件的做法，在这个场景里等于随机失败，
而且失败率随标签数上升 —— 越需要这个功能的人越用不了。

⚠️ 全窗口快照仍然要采，但它只喂两个地方：预览里的 `untouched` 计数，和审计记录。
**它不进闸门。**

⚠️ 同一批次里前一步造成的变化天然不在视野内 —— 每一步只看自己的前置对象，
不存在「上一步改了东西所以下一步以为有人动了浏览器」这种自伤。跨对象的顺序依赖由 §8 的
相对锚点解决，不靠比对整体状态。

新建对象的 ID 只有执行后才知道。依赖新对象的后续操作放在下一次工具调用里，用返回的真实 ID，
并单独批准。一批之内不允许引用「本批将要创建的东西」。

## 8. 位置用相对锚点，不用绝对下标

绝对 `index` 在有人同时用浏览器时必然漂移，而且漂移的后果是**静默放错位置**，不是报错。
所以工具协议里不接受绝对下标：

| 意图 | 参数形态 | 扩展做什么 |
|---|---|---|
| 这些标签按这个顺序排列 | `{type:'order', tab_ids:[...], into?: group_id \| window_id}` | 读当前位置，算出最少的 move 调用 |
| 这个组放到那个组前面 | `{type:'move_group', group_id, before_group_id?}`（都省略 = 末尾） | 算实际下标 |
| 这个书签放到那个书签后面 | `{type:'move', id, parent_id, after_id?}`（省略 = 目录末尾） | 算实际下标 |

⚠️ `order` 的语义是「这些标签在它们的容器里**按此相对顺序连续排列**」，
不是「第 3 个标签去第 12 位」。前者在浏览器状态变化后仍然是同一个意图，后者不是。
新建标签允许指定「插在某个标签之后」，同样不用下标。

### 重复标签：识别，但不代替用户决定

`browser_list_tabs` 每个条目带两个可选字段：

| 字段 | 判据 |
|---|---|
| `duplicate_of` | 完整 URL 逐字符相同（含 query 和 fragment），指向组内 id 最小的那个 |
| `similar_to` | 去掉 fragment 后相同，或去掉 query 后相同 |

⚠️ 两个字段必须分开。`similar_to` 里躺着「同一份文档的不同章节」和「同一个搜索的不同关键词」，
把它当重复处理会丢东西。AI 可以据此建议，但**不能把 `similar_to` 当成等价**，prompt 里明写。

⚠️ 识别和删除是两件事。找出重复是「整理标签」最主要的诉求之一，必须提供；
怎么处置它们仍然走 §6 的默认路径（进「待清理」组），而不是自动关闭。

## 9. URL 与隐私

默认把完整 URL 发给当前对话。这是功能成立的前提：`https://docs.google.com/…` 分不出是哪份文档，
只给域名的话 AI 只能按站点归类，而用户想要的是按主题归类。

隐私的**主手段是排除，不是降精度**：

- 排除清单按域名（`*.bank.com`）和按窗口配置，在权限设置窗口里维护。
- 被排除的对象**完全不出现**在任何列表、预览、结果里，也不可被操作。
- 同时告诉 AI「当前窗口有 6 个标签被你的排除规则挡住了」—— 只藏内容，不藏存在，
  否则 AI 会以为整理完了，而用户看到窗口里还剩一堆没动的标签。
- 另提供一个「只发送域名」的严格模式，并在开关旁如实写明它会明显降低分类质量。
  它是给「我知道会变差但我就要」的人准备的，不是隐私的主线方案。

授权那一屏必须一次性说清：标签标题和地址会作为消息内容进入当前 AI 对话，
已经发出去的内容无法通过事后关开关收回。这句话说一次就够，不需要在每个开关旁边重复免责。

⚠️ 如果当前模型自己有联网能力，它可能自行访问这些链接。扩展不提供页面访问工具，
也无法阻止模型的自带能力 —— 这一句放在授权屏，不放在开关说明里。

本机审计保留完整地址（否则撤销无法工作）。发给 AI 的一切 —— 列表、预览、执行结果、
审计查询 —— 统一执行当前策略，包括错误消息（浏览器的错误字符串里可能带完整 URL）。

标题、URL、书签名称、以及模型联网取回的内容，全部是**不可信数据**：不作为指令、
不作为授权、不作为「用户同意了」的证据。prompt 里明写，后台也不解析它们做任何决策。

## 10. 工具协议

沿用 Agent 的字符串参数协议：`operations` 是 JSON 数组字符串，后台解析后逐项严格验证，
拒绝未知操作类型和多余字段。一批最多 30 个操作、涉及最多 500 个对象；
规划规模上限 2,000 个普通标签 / 10,000 个书签节点；列表每页最多 100 项。

| 工具 | 能力 | 档位 |
|---|---|---|
| `browser_list_tabs` | tabs.read | 读 |
| `browser_list_tab_groups` | groups.read | 读 |
| `browser_list_bookmarks` | bookmarks.read | 读 |
| `browser_query_changes` | 按记录类型对应的读能力 | 读 |
| `browser_arrange_tabs` | tabs.arrange | 低损 |
| `browser_manage_tab_groups` | groups.write | 低损 |
| `browser_arrange_bookmarks` | bookmarks.arrange | 低损 |
| `browser_close_tabs` | tabs.close | 有损 |
| `browser_delete_bookmarks` | bookmarks.delete | 有损 |
| `browser_undo_changes` | 见 §11 | 视情况 |

⚠️ **有损操作是独立的工具，不是某个工具的一个 operation type。** 这样档位可以直接从工具名读出：
权限注入是 1:1，批准 UI 不需要先解析 `operations` 才知道该不该提供「本次任务放行」，
而「把 5 个关闭混进一批移动里」在协议层就不可能发生。工具名同时也是 prompt 里最显眼的标记，
比藏在 JSON 里的 `"type":"close"` 更难被模型忽略。

读工具的形态：

- `browser_list_tabs`：默认当前宿主窗口，可指定 `window_id`；`limit`/`offset` 分页。
  每项含 `id`、`title`、`url`、`window_id`、`group_id`、`pinned`、`active`、`protected`、
  以及 §8 的 `duplicate_of` / `similar_to`。
- `browser_list_tab_groups`：默认当前宿主窗口，返回标题、颜色、折叠状态、成员数。
- `browser_list_bookmarks`：按 `parent_id` 读一层，或按 `query` 搜索。**不返回整棵树。**
  根节点 ID 由扩展解析后提供，AI 不需要也不允许硬编码（见 §12）。
- `browser_query_changes`：分页列出本机批次；带 `batch_id` 返回步骤和受影响对象。不接受 SQL。

## 11. 本机审计与撤销

独立 IndexedDB（`browser-agent-local-v1`），不接入业务 SQLite、不进 Drive 同步、不进备份、
不在任何导出里。Data Agent 的 SQL 碰不到它。按 Chrome/Firefox 配置文件存，与插件业务库同 profile。

**只存撤销和事后核实需要的东西**：

```
批次头   id / owner_tab_id / epoch / tool / tier / operations / createdAt / status / error / supersedes
每一步   operation / 逆操作 / 受影响对象的 before+after / status / 关闭标签的 sessionId
```

⚠️ **不存全窗口快照。** 逆操作和受影响对象足够撤销，而快照的体积随标签数 × 步数增长，
是这个库唯一会失控的部分。预览用的 `untouched` 计数只是个数字，算完就丢。

保留策略：最近 100 个批次或 14 天，取先到者。超出的压成一行摘要
（时间、工具、操作数、最终状态）永久留存，不再可撤销 —— 「我当时到底动了什么」值得长期留着，
「怎么退回去」不值得。

### 状态与异常

`prepared → applying → applied | failed | unknown`。执行前必须先持久化 `prepared`，
持久化失败就不执行。调用浏览器 API 前写 `applying`，成功后写 `applied`。
API 结果或持久化结果不明确时写 `unknown` 并**停止**，不自动重试。
后台重启后发现残留的 `applying`，标为 `unknown` 并保留证据。同一个 planId 不重复执行。

写入串行（一次只跑一个批次），**但读不进这个队列** —— 一次 10,000 节点的书签 prepare
不该把列表查询堵住。一步失败就不开始下一步，已成功的步骤保留，返回逐项结果。
「停止」只承诺不发起下一次调用，不承诺中断已发出的调用，也不自动回滚。

### 撤销

撤销也是写入，也要预览和批准。它的档位单独判定：

| 撤销的内容 | 档位 |
|---|---|
| 恢复位置、组、固定状态、名称、颜色、折叠 | 低损 |
| 用 `sessions.restore` 或重开 URL 恢复被关闭的标签 | 低损 |
| 删掉这次新建出来的标签、书签或目录 | 有损 |

⚠️ 撤销通常比原操作更安全，但**不总是**：撤销一次「新建了 3 个书签目录」要删掉那 3 个目录，
而它们里面可能已经被用户放了东西。所以档位看的是「撤销这个动作本身要做什么」，
不是「原操作有多危险」。

规则：

- 只逆序处理 `applied` 的步骤。`unknown` 的步骤需要人工核实，撤销流程直接跳过并明示。
- 每一步校验当前状态与记录的 `after` 是否匹配（比较范围同 §7：只看相关对象的相关字段）。
  冲突就停，不覆盖。
- 标签和组的 id 只在同一个 `epoch`（`storage.session` 里的 UUID）内有效；
  浏览器重启后这类批次只能查看，不能撤销。书签 id 跨重启稳定，可以撤销。
- 书签恢复会产生新 id，逆操作过程中维护新旧 id 映射，先建父再建子。
- 撤销自身也是一条批次记录（`undoOf`），一个批次只能被撤销一次。
- 原窗口、原组、原父目录已经不存在时停止并说明，绝不改动其它对象来「凑」一个位置。

## 12. 跨浏览器行为差异

API 有无由 §2 的探测解决。这里是**同名 API 行为不同**的地方，它们会影响前置条件的写法
和预览里的承诺措辞。

| 差异 | Chrome | Firefox | 本方案怎么做 |
|---|---|---|---|
| 新建标签的地址 | 未提交前在 `pendingUrl` | 没有 `pendingUrl`，`url` 是 `about:blank` | 地址取 `url \|\| pendingUrl \|\| ''`；正在导航的标签不参与地址比较（§7） |
| 给固定标签分组 | 报错 | [自动取消固定](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/group)后再分组 | 扩展自己先拒绝，两边行为统一，预览里说明「固定的标签不参与分组」 |
| 折叠含活动标签的组 | 活动标签被移出组 | [活动标签保持可见](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups/update)，其余折叠 | 不折叠包含当前活动标签的组；AI 要求折叠时降级为「已建组但未折叠」并在结果里说明 |
| 组 id 跨重启 | 可能变化 | [恢复后可能变化](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups/TabGroup) | 一律靠 `epoch` 判定，跨重启不撤销标签/组批次（§11） |
| 收藏夹根节点 ID | `'0'`、`'1'`、`'2'` | `'root________'`、`'toolbar_____'` 等 | 一律 `bookmarks.getTree()` 解析后使用，代码和 prompt 里都禁止硬编码 |
| 书签节点类型字段 | 无 `type` | 有 `type` | 判断目录一律用 `url === undefined` |
| 分屏标签 | 无 | 149+ 有，分组/取消分组一半会带上另一半 | 同一 `splitViewId` 的标签在前置条件和预览里视为一体 |
| 私有 / 隐身 | 扩展默认不进 | 扩展默认不进私有窗口 | 一律过滤，不返回也不可操作 |

⚠️ 「扩展自己先拒绝」这个做法在上表里出现两次（固定标签分组、折叠活动组）。
理由一致：**两个浏览器都能跑，但结果不一样的操作，是最糟的一类**。
预览必须能对结果说话，而它没法同时对两种结果说话，所以取更保守的那一边并明确告知。

Firefox for Android 没有标签组、窗口模型也不同。能力探测会自然关掉组能力，
不为它做额外适配，也不宣称支持。

## 13. 宿主标签与 UI

跑 Agent 的那个标签（Gemini / AI Studio 页面）**不在整理范围内**：

- `browser_list_tabs` 里标 `protected: true`，prompt 里说明它不参与整理。
- 任何操作不得关闭它、移动它、把它移出或移入组。
- 它所在的组允许改名改色，不允许折叠（见 §12）、不允许移动。
- 预览里显式写一行「当前这个标签不参与整理」。用户会数标签，
  少一个不解释就是一个 bug 报告。

⚠️ **宿主标签导航不取消正在执行的批次。** Gemini 是 SPA，用户切一个对话就是一次地址变化；
把地址变化当取消信号会让批次莫名中断在中途。批次归属靠 `planId` + owner tab id，
而导航不改变 tab id。只有宿主标签**被关闭**才取消（此时结果无处可回传）。

UI 分工沿用 Agent 现有的三处，不新建路径：

| 位置 | 内容 |
|---|---|
| Agent Tab | Data / Browser selector、权限设置入口、本机记录与撤销入口 |
| `>` 弹层 | 整理标签页 / 管理标签组 / 整理收藏夹；缺能力时直接打开权限设置 |
| 聊天流卡片 + Dock | 预览与批准，两处同一个 resolve，谁先答谁算 |

运行期间禁止切换 Agent 类型。Browser Agent 只加载浏览器 prompt、浏览器工具和 `complete_task`；
Data Agent 看不到浏览器工具。权限设置是独立扩展窗口（`permissions.request()` 需要用户手势，
且它不能是 AI 可触发的动作）。

## 14. 实施顺序与验收

1. 能力探测 + 权限设置窗口（Chrome / Firefox 同一份实现）
2. 读工具 + 排除清单 + 重复标记
3. 对象级前置条件 + 相对锚点 + 低损写入 + 结果导向预览
4. 本机审计 + 保留策略 + 撤销
5. 有损工具 + 「待清理」默认路径 + `sessions` 恢复
6. Firefox 真机验证

### 正向验收（这些不过，功能就是不可用）

- 一个 84 标签的窗口，用户**在整理过程中继续正常浏览**（开标签、切窗口、读页面），
  整理能一次走完，不出现冲突失败。
- 预览一屏之内看得懂：说得出会新建几个组、多少标签被动、有没有东西被关掉、多少标签不动。
- 发生冲突时用户点一次「按当前状态重算」就能继续，不需要 AI 重跑一轮。
- 重复标签能被识别、归入「待清理」，用户一次操作完成清理。
- Firefox 139 上以上流程与 Chrome 表现一致；Firefox 138 上组能力整体隐藏并说明原因。

### 安全验收

- 能力默认全关；撤销权限后对应读写立刻失败。
- 有损操作在任何设置下都逐批批准；低损的「本次任务放行」不泄漏到有损批次。
- 批准绑定 plan；旧 plan、不同宿主、前置条件失配一律失败。
- 中断后不重复创建/删除，失败明细可查，`unknown` 不自动重试。
- 排除清单命中的对象不出现在任何发给 AI 的内容里；严格模式下不出现完整地址；错误消息同样脱敏。
- 审计不进业务库、同步、备份和导出；超期记录不可撤销但摘要仍可查。
- 跨浏览器重启不使用旧标签/组 id。
- 宿主标签在任何批次里都不被关闭或移动；宿主导航不中断批次。

### 必须人工真机跑的清单

模拟 API 测不到的都在这里，而这个功能的失败模式几乎全在这里：

- 边整理边开新标签 / 关标签 / 切窗口 / 让页面加载完成
- 整理中途刷新宿主页面；整理中途在 Gemini 里切到另一个对话
- 关闭标签后立即撤销，以及等浏览器淘汰了最近关闭条目之后再撤销
- 含固定标签、含分屏（Firefox 149+）、含受管理书签的窗口
- 折叠一个包含当前活动标签的组（Chrome 和 Firefox 分别验证）
- 浏览器重启后查看旧批次（应可查看、不可撤销）

自动化测试 `node --test scripts/test-browser-agent.cjs` 覆盖协议验证、档位推导、
前置条件判定、锚点换算、脱敏、审计状态机、撤销分支。它保证逻辑，不代替上面的清单。
