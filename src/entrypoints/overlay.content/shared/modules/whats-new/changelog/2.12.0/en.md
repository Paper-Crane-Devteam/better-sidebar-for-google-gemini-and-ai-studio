# 2.12.0 Update: A Real Tags View, "Continue in a New Chat", and a Calmer Browser Agent

Hi friends 👋

This one's a small release, more of a "sanding down the rough edges" kind of update. After 2.11.0 went out, I kept using everything myself every day, and a few little things kept nudging at me. So here they are, tidied up.

---

## ⚡ TL;DR

1. **🏷️ Tags You Can Actually Open**: Click a tag to see every chat that carries it, then switch tags, search, and add or remove tags right there.
2. **🔀 Continue in a New Chat**: When a chat gets too long, the BetterSidebar Agent can summarize it and open a fresh chat with the summary waiting in the input box.
3. **✨ Quick Starts for Agents**: Pick an agent with `>` and a row of starter buttons shows you what it can do.
4. **🛡️ Finer Browser Agent Permissions**: Tabs and bookmarks now have separate switches, and the agent finally sees all your windows.
5. **📚 "Files" Is Now "Library"**: A new name for the tab that holds all your chats. Nothing inside has changed.
6. **🐛 AI Studio Sign-In Fix**: No more "account not detected" prompt when you're already signed in.

---

## 🔥 A Little More on the Good Bits

### 🏷️ Tags You Can Actually Open

I'll be honest, the Tags tab used to be a bit of a dead end. You could see your tags, but clicking one did nothing, which made them feel more like decoration than a tool.

Now clicking a tag opens a list of every chat you've tagged with it. From there:

- **Switch tags** from the header without going back to the list.
- **Search within the tag** when it holds a lot of chats.
- **Remove a chat from the tag** with one click, or right-click to add or remove other tags, favorite it, and more.
- **Show in Library** to jump to where these chats live in your folders.

It finally feels like tags are a way to find things, not just a way to label them.

### 🔀 Continue in a New Chat

You probably know this feeling: a conversation runs long enough that the model starts losing the thread, and starting over means retyping all the context by hand.

Now you can just tell the BetterSidebar Agent (there's also a quick-start button for it): *"Summarize this chat and continue it in a new chat."* It writes a handover covering what you're trying to do, what you decided and why, and what's still open. Then it opens a new chat in a new tab, right next to the current one, with that summary waiting in the input box.

A few things I cared about here:

- **Nothing gets sent on its own.** The summary just sits in the input box so you can read and edit it first.
- **It asks before opening the tab**, every time.
- **Same account.** If you're signed into several Google accounts, the new chat opens in the one you're using now.
- **The old chat stays open**, so you can go back to it if the summary missed something.

### ✨ Quick Starts: Know What an Agent Can Do the Moment You Pick It

After typing `>` and picking an agent, I'd often sit there looking at a blinking cursor, thinking "Okay... what do I actually ask it?" So now a small row of starter buttons shows up above the input box, for example:

- **BetterSidebar Agent**: Organize chats, Find chats, Tag chats, Design a theme, Continue in a new chat…
- **Workspace Agent**: Summarize a file, Analyze a spreadsheet, Save chat as notes…
- **Browser Agent**: Group tabs, Find duplicates, Bookmark this window…

Click one and it drops a short, half-finished sentence into the input, like *"Find conversations about "*, so you only have to type the rest. The buttons step aside as soon as you start typing. They're a gentle nudge, not a script.

### 🛡️ Browser Agent: Finer Permissions, and All Your Windows

**Separate switches for tabs and bookmarks.** Before, permissions were just "organize" and "delete", covering tabs and bookmarks together. Some of you told me you're happy to let the AI tidy tabs but would rather it never touch bookmarks, and that makes total sense. Now there are four switches in Browser Agent settings: Organize tabs, Close tabs, Organize bookmarks, and Delete bookmarks. Turn on only what you're comfortable with.

**It now sees every window.** This one was a bug on my side. Browser Agent used to only look at the window your conversation was in, so if your tabs were spread over three windows (mine usually are 😅), "close duplicates" would miss most of them. Now it looks through every window before deciding what counts as a duplicate, and tells you which window each change touches. And if you run Gemini as an installed app in its own window, the agent understands that too and works in your normal browser windows.

---

## 🛠️ Small Touches & Fixes

- **"Files" is now "Library"**: "Files" always felt a little off for conversations, and "Library" fits better. The Tags list also dropped its little leading icons, so names get a bit more room.
- **AI Studio sign-in detection**: After AI Studio's recent redesign, some of you saw an "account not detected" prompt even though you were clearly signed in. Sorry about that. It's fixed now.

---

That's all for this round. Small, but hopefully it makes the everyday a little smoother. As always, if something feels off or you have an idea, I'd love to hear from you. Thanks for being here ☕
