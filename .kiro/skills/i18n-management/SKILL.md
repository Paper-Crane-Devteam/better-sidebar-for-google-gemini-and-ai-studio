---
name: i18n-management
description: >-
  管理和维护项目的国际化 (i18n) 与多语言翻译。
  当需要添加、修改、删除翻译词条，执行多语言健康检查 (check/missing/unused/drift)，
  批量生成或写入翻译 (scripts/i18n.mjs)，或者在 React/TypeScript 代码中使用 useI18n / t() 时使用此 skill。
  关键词：i18n, 国际化, 本地化, locale, translation, 翻译, 多语言, en.json, zh-CN.json, scripts/i18n.mjs, useI18n.
---

# 项目国际化 (i18n) 管理与开发指南

本项目基于 `i18next` 与 `react-i18next` 实现了多语言国际化支持，并配有专门为 AI Agent / 开发者设计的 CLI 维护工具（`scripts/i18n.mjs`）。

---

## 1. 目录结构与语言文件

- **源语言基准（Source of Truth）**：`src/locale/en.json`（所有 key 和层级结构以它为基准）
- **多语言翻译文件**（共 13 种支持语言）：
  - `src/locale/zh-CN.json`（简体中文）
  - `src/locale/zh-TW.json`（繁体中文）
  - `src/locale/ja.json`（日语）
  - `src/locale/ko.json`（韩语）
  - `src/locale/de.json`（德语）
  - `src/locale/fr.json`（法语）
  - `src/locale/es.json`（西班牙语）
  - `src/locale/pt.json`（葡萄牙语）
  - `src/locale/it.json`（意大利语）
  - `src/locale/pl.json`（波兰语）
  - `src/locale/tr.json`（土耳其语）
  - `src/locale/ru.json`（俄语）
- **配置文件**：
  - `src/locale/i18n.ts`（主配置与初始化）
  - `src/locale/i18n-lite.ts`（轻量级无额外依赖的配置，适用于特定 worker/context）
- **CLI 维护脚本**：`scripts/i18n.mjs`（及 `scripts/i18n/` 模块）

---

## 2. 在代码中使用翻译

### 2.1 基础用法 (`useI18n`)

```tsx
import { useI18n } from '@/shared/hooks/useI18n';

function MyComponent() {
  const { t } = useI18n();
  
  return (
    <div>
      <h1>{t('tabs.files')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### 2.2 带插值参数的翻译

在语言文件中定义带 `{{param}}` 占位符的文案：
```json
// en.json
"imported": "Imported {{count}} conversations"

// zh-CN.json
"imported": "已导入 {{count}} 条对话"
```

在组件中传入参数对象：
```tsx
const { t } = useI18n();
toast.success(t('toast.imported', { count: 10 }));
```

### 2.3 切换语言与读取当前语言

```tsx
const { changeLanguage, currentLanguage } = useI18n();

// 切换到简体中文
changeLanguage('zh-CN');

// 切换到英文
changeLanguage('en');
```

---

## 3. 添加新翻译的标准工作流

1. **永远以 `en.json` 为第一源头**：
   在 `src/locale/en.json` 中添加英文词条及层级结构。
2. **在代码中引用**：
   在组件或逻辑中使用 `t('path.to.key')`。
3. **避免手工在大文件（1800+行）中翻查定位**：
   不要手工在各个语言的 JSON 中人肉定位插入，使用下方的 CLI 工具自动处理。
4. **生成翻译待办与回填**：
   使用 `scripts/i18n.mjs todo` 导出待翻译骨架，填好译文后使用 `scripts/i18n.mjs apply` 批量安全写回。

---

## 4. i18n CLI 工具使用指南 (`scripts/i18n.mjs`)

通过命令 `node scripts/i18n.mjs <command>` 或 `npm run i18n -- <command>` 执行：

### 4.1 概览与体检
```bash
# 总览：检查每个语言有多少词条、缺多少、有多少废弃
node scripts/i18n.mjs check
```

### 4.2 缺失词条检测
```bash
# 查看缺失词条，按缺失语言分组展示，附带 en 英文源文本
node scripts/i18n.mjs missing

# 指定语言与前缀过滤
node scripts/i18n.mjs missing --locale ja,ru --prefix agent
```

### 4.3 生成待翻译骨架 (Skeleton)
```bash
# 输出指定语言待翻译的 payload 骨架（方便填词后供 apply 使用）
node scripts/i18n.mjs todo --locale ja > todo_ja.json
```
> 注：`todo` 生成的 `_source(en)` 行在 `apply` 时会被自动忽略，无需手动删除。

### 4.4 批量应用翻译 (Apply)
```bash
# 将翻译 payload 写入各语言文件
node scripts/i18n.mjs apply payload.json

# 仅填补空缺，不覆盖已有翻译
node scripts/i18n.mjs apply payload.json --only-missing

# 试运行（只输出变更计划，不改动文件）
node scripts/i18n.mjs apply payload.json --dry-run
```

**支持的 Payload 格式（支持嵌套或点分 key）：**
```json
// 格式 A（按语言分组）
{
  "ja": { "agent.browser.name": "ブラウザエージェント" },
  "ru": { "agent.browser.name": "Браузерный агент" }
}

// 格式 B（按 Key 分组）
{
  "agent.browser.name": {
    "ja": "ブラウザエージェント",
    "ru": "Браузерный агент"
  }
}
```

### 4.5 漂移与占位符检查 (Drift)
```bash
# 检查 {{placeholder}} 缺失/不一致，以及非英文语言中与英文完全相同的词条
node scripts/i18n.mjs drift
```

### 4.6 查询词条当前值 (Get)
```bash
# 查询特定 key 或通配符前缀在所有语言中的当前取值
node scripts/i18n.mjs get common.save
node scripts/i18n.mjs get 'agent.browser.*'
```

### 4.7 废弃与未引用的词条 (Unused)
```bash
# 扫描代码仓库，找出未被任何代码引用的废弃词条
node scripts/i18n.mjs unused
```

### 4.8 批量删除词条 (Rm)
```bash
# 试运行删除
node scripts/i18n.mjs rm 'old.feature.*'

# 确认删除并写盘
node scripts/i18n.mjs rm 'old.feature.*' --yes
```

### 4.9 对齐 Key 顺序 (Sort)
```bash
# 将各语言文件的 key 顺序对齐 en.json
node scripts/i18n.mjs sort
```

---

## 5. 核心约定与自动化机制

- **兄弟节点对齐**：通过 `apply` 插入的新词条会自动定位到 `en.json` 中对应兄弟节点的位置，确保 git diff 只产生新增行，不造成大面积文件重排。
- **占位符校验**：写入时会自动比对 `{{placeholder}}`，与英文不一致时会给出 warning。
- **保守判定**：`unused` 扫描会识别静态调用 `t('a.b')`、点分字符串、模板拼接 `t(\`a.b.${x}\`)` 以及复数后缀（`_one`/`_other` 等），防止误删动态拼接词条。
- **复数按语言判定**：`missing`/`check` 只要求该语言真正用到的复数类别（按 `Intl.PluralRules` 对 0–1000 的结果），`_other` 始终必需；`_zero`/`_two`/`_few`/`_many` 在该语言已有 base key 时可省略（i18next 会回退到 base key）。所以波兰语这类复杂语言可以把 base/`_one`/`_other` 写成“名词: {{count}}”的中性句式，不必补 `_few`/`_many`；俄语保留完整变体。
- **语言检测策略**：应用初始化时优先读取 Chrome Storage 中用户的偏好语言；首次进入自动识别浏览器语言（若是 `zh-*` 则使用中文，否则回退为英文）。
