# 国际化 (i18n) 使用指南

本项目使用 `i18next` 和 `react-i18next` 进行国际化支持，支持 13 种语言：`en`、`zh-CN`、`zh-TW`、`ja`、`ko`、`de`、`fr`、`es`、`pt`、`it`、`pl`、`tr`、`ru`。

## 文件结构

```
src/locale/
  ├── en.json          # 英文基准（Source of Truth）
  ├── zh-CN.json …     # 其余 12 种语言翻译
  ├── i18n.ts          # 扩展上下文用（overlay / content / background）：只内联 en，
  │                    #   其余语言运行时 fetch /locales/<lng>.json（构建时由 viteStaticCopy 拷贝）
  ├── i18n-bundled.ts  # main-world 专用：拿不到 runtime.getURL，所有语言内联
  ├── i18n-lite.ts     # 懒加载轻量 i18n 配置（popup / onboarding）
  └── language.ts      # 语言检测、dayjs locale、语言切换订阅（上面几个共用）
```

## 使用方法

### 1. 在组件中使用翻译

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

### 2. 带参数的翻译

```tsx
const { t } = useI18n();

// 在 zh.json 中: "imported": "已导入 {{count}} 条对话"
// 在 en.json 中: "imported": "Imported {{count}} conversations"
toast.success(t('toast.imported', { count: 10 }));
```

### 3. 切换语言

```tsx
const { changeLanguage, currentLanguage } = useI18n();

// 切换到中文
changeLanguage('zh');

// 切换到英文
changeLanguage('en');
```

## 添加新的翻译

1. 在 `en.json` 中添加词条（其余语言由 Sync Translations hook 补齐）
2. 在组件中使用 `t('your.key.path')` 来引用翻译

## 维护工具：`scripts/i18n.mjs`

不要手工在 1800 行的 JSON 里找行号，用这个 CLI（`npm run i18n -- <command>`）：

```bash
node scripts/i18n.mjs check                  # 总览：每个语言有多少词条、缺多少、有多少废弃
node scripts/i18n.mjs missing --locale ja,ru # 缺失词条，按「缺哪些语言」分组，带源文本
node scripts/i18n.mjs todo --locale ja       # 输出待填的 payload 骨架（给 apply 用）
node scripts/i18n.mjs unused                 # 源码里没人引用的废弃词条（整棵子树会折叠成 a.b.*）
node scripts/i18n.mjs drift                  # {{占位符}} 不一致 / 与英文完全相同的词条
node scripts/i18n.mjs get common.save 'agent.browser.*'   # 看某个 key 在各语言的值
node scripts/i18n.mjs apply payload.json     # 批量写入（自动定位插入位置）
node scripts/i18n.mjs rm 'a.b.*' --yes       # 批量删除，不加 --yes 只打印计划
node scripts/i18n.mjs sort                   # 把各语言的 key 顺序对齐 en.json（可选）
```

`apply` 接受两种 payload，嵌套写法也可以（可以直接从 en.json 里粘一段）：

```json
{ "ja": { "agent.foo.bar": "テキスト" }, "ru": { "agent.foo.bar": "Текст" } }
{ "agent.foo.bar": { "ja": "テキスト", "ru": "Текст" } }
```

也支持 stdin：`node scripts/i18n.mjs todo --locale ja > p.json`，填好后 `node scripts/i18n.mjs apply p.json`。
`todo` 输出里的 `_source(en)` 行和留空的值会被 `apply` 自动忽略，不用手动清理。

几个行为上的约定：

- 新词条会插到「英文里对应的兄弟节点位置」，所以 diff 只有新增的那一行，不会打乱整个文件。
- `--only-missing` 只补空缺、不覆盖已有译文；`--dry-run` 只报告不写盘。
- 写入时会检查 `{{placeholder}}` 与英文是否一致，不一致会 warn（不阻断）。
- `unused` 的判定偏保守：`t('a.b')`、任意点分字符串字面量、模板拼接 `t(\`a.b.${x}\`)`、
  i18next 复数后缀（`_one`/`_other` …）都算「在用」，避免误删活着的文案。

## 语言检测

- 首次加载时会自动检测浏览器语言
- 如果浏览器语言是中文（zh-*），则使用中文
- 否则默认使用英文
- 用户选择的语言会保存到 Chrome Storage 中

