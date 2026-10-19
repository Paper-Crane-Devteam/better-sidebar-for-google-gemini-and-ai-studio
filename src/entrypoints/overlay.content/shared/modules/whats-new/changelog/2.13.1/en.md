# 🔧 v2.13.1 — Easier-to-Read Search Results & Gemini Fixes

A small follow-up to 2.13.0.

## ✨ Improved

*   **🔍 Search results are easier to read:** The preview under each result used to show raw Markdown, and the part that matched was often cut off at the end. Now the preview is plain text, the match sits near the start with a bit of context before it, and lines no longer break in the middle of a word. A message with several matches shows up to two snippets plus the total match count, and the role and date are no longer repeated for every hit from the same message.

## 🐞 Fixes

*   **📜 Gemini page stuck scrolled up:** Sometimes the whole Gemini page shifted up, leaving a blank strip at the bottom until you reloaded. This happened more often if you have a long chat history. It's fixed now.
*   **⌨️ Input box cut off next to Canvas / Deep Research:** When a side panel was open, the input box could be partly hidden behind it. It now shrinks to fit.

If anything still looks off, please let me know. Thanks ☕
