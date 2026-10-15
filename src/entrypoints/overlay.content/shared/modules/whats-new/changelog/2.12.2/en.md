# 🔧 v2.12.2 — Fixes & More Languages

A small update with a few fixes and additions.

## 🐞 Fixes
*   **🔄 Background message sync no longer gets stuck:** If a chat had been deleted or no longer existed, sync could stall on it. It now skips it and keeps going.

## ✨ New
*   **🌍 More languages:** Added German, French, Italian, Korean, Polish and Turkish.
*   **🔍 Check for updates manually:** You'll find a new entry for it on the About page.

## ⚡ Performance
*   **🪶 A lighter sidebar:** Renaming, moving, tagging or deleting something used to reload everything. Now only the parts that actually changed get refreshed, and the rest of the panel stays put instead of redrawing.
*   **💬 Smoother agent replies:** While a reply is streaming, the page does a lot less extra work in the background.
*   **📦 Faster startup:** The extension is a bit smaller now, and languages load more efficiently.

This round touched some pretty core code. I've tested it as carefully as I could, but if anything looks off (a list not updating, something missing after an edit), please let me know. I'll fix it as soon as I can.

## 💌 One more thing
I made another small extension: **[Better Playlists](https://chromewebstore.google.com/detail/better-playlists-youtube/dbkjpepjgmodcoanoaokohenmkdldffa?utm_source=better-sidebar&utm_medium=extension&utm_campaign=changelog)**. It's for organizing YouTube playlists, with a sidebar plus batch move, copy and remove. If you've ever struggled to keep your playlists tidy, maybe give it a try.
