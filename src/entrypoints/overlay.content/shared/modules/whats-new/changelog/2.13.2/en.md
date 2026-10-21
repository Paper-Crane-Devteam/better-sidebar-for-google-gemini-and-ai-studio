# 🔧 v2.13.2 — Prompt Library in Instruction Boxes & Gemini Capture Fix
A small update after 2.13.1, with one new feature, a few fixes, and a peek at what's coming next.
## ✨ New
*   **📚 Use your prompt library in instruction boxes:** The Gem editor, Notebook settings and AI Studio's system instructions now have a **Prompts** dropdown. You can search or browse your folders, fill in variables, and append a prompt (with an undo toast if you change your mind). A preview of the full prompt shows beside the dropdown. There's also a **Save as prompt** button, and `/` works in these boxes too.
*   **🔀 AI Studio system instructions:** You can switch between AI Studio's own list and your Better Sidebar library. The first time, your saved AI Studio instructions are imported once, without duplicates. In library mode, the extension only writes to a dedicated "⚡ Better Sidebar" entry, so your other instructions stay untouched.
## 🐞 Fixes
*   **💬 New Gemini chats not being saved:** Gemini changed how it sends messages again on October 20, so new chats and replies stopped reaching the sidebar. They're captured again now.
*   **✏️ AI Studio renames reverting:** A chat renamed from the sidebar could go back to its old title after the next reply. The new name now sticks.
*   **🪟 Menus hidden behind AI Studio panels:** Popovers, dialogs, toasts and tooltips could end up behind AI Studio's side drawers. They now stay on top.
*   **🖱 Right-click menu flashing:** The context menu could briefly appear in the wrong spot before jumping to the pointer. It now opens right where you click.
*   **🔍 Missing highlights in search previews:** Searches that include Markdown (like `**bold**`) or regexes spanning formatting matched correctly but showed no highlight in the preview. They're highlighted now.
*   **💾 Database backup download blocked:** Chrome sometimes blocked the backup file from downloading. The export now waits in a toast for you to click download.
*   **🧭 Outline cursor:** Only items that can actually expand show the pointer cursor now.
## 🔭 Coming Soon: Web Agent
I've been working on a **Web Agent** that lets the AI work on web pages for you from Chrome's side panel: reading a page, clicking, typing, moving between tabs, with you able to watch and stop it at any time. It runs through a small companion extension, **Better Sidebar Web Agent Connector**, which is still waiting for Chrome Web Store review, so the feature is hidden for now. I'll turn it on as soon as it's approved, and I hope you'll enjoy it.
If anything looks off, please let me know. Thanks ☕
