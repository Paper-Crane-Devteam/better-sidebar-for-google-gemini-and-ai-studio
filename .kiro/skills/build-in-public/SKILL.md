---
name: build-in-public
description: >
  运营 X (Twitter) 账号做 build in public：扫 git log 找出上次发推之后改了什么、
  按写作风格指南起草推文/推文串、preview 校验字数与费用、用 scripts/xpost.mjs 发布，
  并把已发内容记进 doc/build-in-public/posted.md 台账。
  用户说「发个推 / 该发推了 / 帮我写条推文 / 最近改了啥可以发 / 发 X」时用这个。
  Keywords: 发推, 推特, twitter, X, tweet, post, 发帖, 发布, 推文, 推文串, thread,
  build in public, buildinpublic, 运营, 账号, 社媒, social, 宣传, 日志, devlog,
  changelog, 更新日志, 素材, 截图, screenshot, 录屏, gif, 视频, xpost, 草稿, draft.
---

# Build in public：发 X

节奏是大约两天一条，由用户发起。工具是 `scripts/xpost.mjs`，读 `doc/build-in-public/`。
完整格式说明在 `doc/build-in-public/README.md`。

## 每次的流程

**1. 先查台账，再看 git**

`doc/build-in-public/posted.md` 最后一条记录里有当时的 HEAD commit。从那里开始读：

```bash
tail -30 doc/build-in-public/posted.md
git log --oneline <上次的commit>..HEAD
git diff --stat <上次的commit>..HEAD
```

台账是空的（第一次发）就退回到最近一两周的 commit。

**2. 挑一件事，不要罗列**

一条推讲一件事。commit 列表是原料不是内容，用户关心的是「这个变化让我少了什么麻烦」，
不是「我改了哪几个文件」。看 commit message 不够时去读实际 diff，搞清楚这个改动
对用户意味着什么再动笔。

值得发的：新功能、用户反馈过的 bug 修好了、性能变化、遇到的技术坑和解法、
数据/里程碑、做取舍时的思考。
不值得单独发的：重构、依赖升级、纯内部清理。

**3. 起草**

先激活 `writing-style-guideline` skill，严格照它写：成熟稳重、不夸张、不卖惨、
不炫技、不用感叹号堆情绪。英文为主（受众在 X 上），除非用户说要中文。

写到 `doc/build-in-public/drafts/YYYY-MM-DD.md`。格式：

```markdown
Chats now land in the folder you have selected, instead of always going to Inbox.

@media: ../assets/2026-09-15-folders.png

---

// 第二条：讲原因
The folder was already known at create time — it just was not being passed down.
```

`---` 分隔推文串，`@media:` 挂素材（相对草稿文件），`//` 是自己看的注释。

字数是加权的：英文 1 个字符算 1，中文和 emoji 算 2，链接不论多长都算 23，上限 280。
所以中文实际只有约 140 字。

链接会让单条推的费用从 $0.015 涨到 $0.20，且 X 对带链接的推有降权倾向。
一般把链接放在推文串的最后一条，正文保持干净。

**4. preview，给用户看，等确认**

```bash
node scripts/xpost.mjs preview doc/build-in-public/drafts/2026-09-15.md
```

把草稿原文贴给用户，说明配了什么素材、预计多少钱。**不要自己决定发布。**

**5. 用户点头后再发**

```bash
node scripts/xpost.mjs post doc/build-in-public/drafts/2026-09-15.md --yes
```

没有 `--yes` 就是 dry run。发出去是公开且花钱的，所以 `--yes` 只在用户明确同意后加。
成功后脚本会自动把 URL 和当前 HEAD commit 追加进 `posted.md`，不用手动记。

## 素材

用户自己准备图和视频，放 `doc/build-in-public/assets/`，命名 `YYYY-MM-DD-描述.png`。

需要的时候可以帮忙：

- **静态截图**：dev 浏览器开着的话，CDP 在 9222 端口上（见 devtap-debug skill），
  可以用 `Page.captureScreenshot` 带 2 倍 DPR 截当前 tab 或某个元素，比手动截图稳定。
- **录屏转 X 友好格式**：X 上 mp4 比 gif 体积小画质好，gif 只在很短的循环里划算。
  用户给原始录屏，用 ffmpeg 裁剪压缩：

  ```bash
  ffmpeg -i raw.mov -ss 2 -t 20 -vf "scale=1280:-2,fps=30" \
    -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart out.mp4
  ```

  `-pix_fmt yuv420p` 和 `+faststart` 是 X 能正常播放的前提，别省。

限制：一条推最多 4 张图，或 1 个 GIF，或 1 个视频，不能混。图 5 MB，GIF 15 MB。

## 边界

- 不主动发。用户说发才发。
- 不编造。没做过的功能、没有的数据，一个字都不写。不确定的先问。
- 不擅自改已发出的内容。发错了告诉用户，删除与否由他决定。
