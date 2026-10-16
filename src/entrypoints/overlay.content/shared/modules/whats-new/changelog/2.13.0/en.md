# 2.13.0 Update: Search That Takes You to the Message, a Floating Outline, and a Quieter Sidebar

Hi friends 👋

Gemini rolled out a new layout recently, and a fair part of this round went into catching up with it. Along the way I added a few things I'd been wanting for a while, mostly around finding your way inside long chats.

---

## ⚡ TL;DR

1. **🎯 Jump straight to the matching message**: Opening a search result now scrolls to the exact message, not just the chat.
2. **🔣 Regex search**: A new search mode for when plain keywords aren't precise enough.
3. **🪟 Floating outline**: Pop the outline out into a panel you can drag and resize.
4. **🧭 Better navigation in AI Studio**: Outline jumps and the dot scrollbar now work there too.
5. **🔐 Multi-account fix**: Data from different Google accounts no longer gets mixed up.
6. **🧩 Caught up with Gemini's new layout**: Width controls, input auto-hide and themes work again.

---

## 🔥 A Little More on the Good Bits

### 🎯 Search Results Take You to the Message

Before, opening a search result only opened the chat, and you still had to scroll around to find the part you were looking for. In a long conversation, that could take a while.

Now on Gemini, it scrolls to the message that matched. If that message is further back, it loads the older turns first. The message pulses briefly so you can spot it, and your search terms are highlighted inside it.

### 🔣 Regex Search

For those who like more precise searching, there's now a regex mode. It's handy for things like finding a certain error code pattern, or an exact phrase with some variation. To keep things responsive, it shows up to 500 matches.

### 🪟 A Floating Outline

You can now pop the outline out of the sidebar into a floating panel, then drag it wherever you like and resize it. It's nice when the sidebar is closed, or when you just want the outline right next to the conversation.

I also simplified how the outline looks: the heading icons and the numbers before each message are gone, and heading levels are shown through size and weight instead. It reads a lot calmer.

### 🧭 AI Studio Gets Outline Jumps and the Dot Scrollbar

Clicking an item in the outline on AI Studio now jumps to that message. The dot scrollbar from Gemini (one dot per message you sent) is also available on AI Studio now. While it's on, it takes the place of AI Studio's built-in scrollbar so the two don't overlap.

---

## 🐛 Fixes

- **Data mixing between Google accounts**: If you used several Google accounts in different tabs at the same time, some data could end up saved under the wrong account. This was a real mistake on my part, and I'm sorry about it. Each tab now sticks to its own account's data, and background sync no longer carries over from one account to another.
- **AI Studio chats jumping to the top**: Just opening an AI Studio chat used to count as activity, so it would move to the top of the list. Now only actually editing or creating a chat does that.
- **Wrong dates in AI Studio search results**: Messages from older AI Studio chats were sometimes dated by when they were synced, so old chats showed up as if they were new. That's fixed, and existing data is repaired automatically.
- **Background agent replies on AI Studio**: If you switched to another tab while the agent was waiting for a reply, it could time out and report the message as not delivered, even though the answer was there. It now waits properly while the tab is in the background.
- **Gemini chats opening at the top**: Opening a chat from the sidebar sometimes left you at the very beginning instead of the latest message. It now lands on the latest message as expected.
- **Opening a Gem from a chat**: Opening a Gem while a chat was open could leave the old chat on screen. It now switches over cleanly.
- **Inline code formatting**: Inline code in replies no longer shows extra backticks around it.

---

## 🧩 Catching Up with Gemini's New Layout

- **Chat and input width controls** work again.
- **Tables now follow the chat width**, so the separate "Table Auto Width" option is no longer needed and has been removed.
- **Input auto-hide** works with the new input area.
- **Deep Research and Canvas** no longer get squeezed by a forced minimum chat width.
- **Themes** now also cover the glow around the new-chat input box, so it no longer shows a dark patch on some dark themes.
- **"Remove Auto Watermark" is turned off and hidden for now**: Gemini now has its own watermark setting, and with it, our removal could leave a faint inverted mark on images that were already clean. Turning it off felt like the safer choice.

---

## 🎨 Small Touches

- **Quieter icons**: The icon rail and the action icons in tab headers are now a bit dimmer when idle, and come back to full color when you hover. The sidebar feels less busy this way.
- **Menus close instantly**: Dropdown and right-click menus no longer play a closing animation.
- **Workspace**: The empty state now has an "Import folder" option.
- **A small thank-you badge**: If you have a Support Pack or Power Pack, the popup now shows a small badge next to the title. It's my quiet way of saying thank you. Everyone's sidebar avatar also got a soft new ring.

---

## 💌 A Small Gift for Gemini Argon

To celebrate Gemini's new Argon model, I've prepared a redeem code that unlocks all Power Pack features free for 10 days. You can redeem it any time until **October 21**, and the code is waiting in the promotions channel on **[Discord](https://discord.gg/FRzesxaGAx)**.

If you run into any trouble using it, or have ideas you'd like to share, you're always welcome to find me on Discord too.

---

That's it for this round. Since Gemini's layout is still changing, there may be spots I haven't caught yet. If something looks off, please let me know and I'll look into it. Thanks for being here ☕
