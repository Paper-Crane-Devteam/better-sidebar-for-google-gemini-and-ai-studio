# 🔧 v2.13.1 — Catching Up with Gemini's New Plumbing

Right after 2.13.0 went out, Gemini changed how its web page talks to its servers. Nothing looked different on screen, but behind it, the way new messages and chat lists are sent had moved to a new format. So for a little while, new chats and messages quietly stopped being saved to the sidebar. Sorry about that. This update is mostly about catching up.

## 🐞 Fixes
*   **💬 New chats and messages are saved again:** The extension now understands Gemini's new format, so new conversations, replies and titles show up in the sidebar like before.
*   **🔄 Chat list, renames and deletes sync again:** Renaming or deleting a chat, as well as your Gems and notebooks lists, are picked up properly again.
*   **💎 More accurate Gems list:** Your Gems list is now synced as a whole, instead of being guessed at on every page load. Gems that haven't changed are left alone, so they no longer look "updated" for no reason.
*   **👥 Background sync on other Google accounts:** In tabs signed in to a second account (the ones with `/u/1` and so on in the address), background sync used to ask for the wrong account's chats and fail. It now uses the tab's own account. A chat that can't be loaded also no longer holds up the rest of the queue.
*   **⌨️ Input auto-hide:** Reworked so it slides in and out more reliably, and no longer gets stuck half visible.
*   **📐 Reply action buttons:** When you widen the chat, the buttons under each reply now stay on the left where they belong.
*   **✏️ Gems can't be renamed from the sidebar:** Gem names come from Gemini itself, so pressing F2 on a Gem no longer opens a rename box that didn't actually save anything.

## 🧭 AI Studio
*   **Dot scrollbar follows chat switches:** It used to keep showing the previous chat until you reloaded. Now it updates when you switch chats.
*   **No more covering text:** The scrollbar now sits in its own space on the right of the chat, so it doesn't overlap messages, whether the settings panel is open or not.
*   **A more compact look:** Smaller and with rounded corners that match AI Studio's style.

## 🎨 Small Touches
*   **About page:** The version info is now a tidier card, with the update check in its footer.

Gemini is still changing things under the hood, so if something stops being saved or synced, please let me know. I'll look into it quickly ☕
