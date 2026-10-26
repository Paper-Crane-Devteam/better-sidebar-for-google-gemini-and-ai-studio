# 2.14.0 Update: Web Agent Is Here, and Everyone Gets 3 Days of Power Pack

Hi friends 👋

Remember the Web Agent we teased last time, the one that can get things done for you inside the browser? Good news: its companion extension has passed Chrome Web Store review. With this version, the Web Agent is officially open to everyone.

So that anyone can try it without hurdles, we've prepared a **free 3-day Power Pack trial for every user**. Give it a spin first, and decide later if it fits.

---

## ⚡ The 30-Second Version

1. 🌐 **Web Agent arrives**: AI works as a helper right in your browser's sidebar, browsing pages, filling out forms and pulling out data. And every key action waits for you to confirm it first.
2. 🎁 **3-day Power Pack trial, no strings attached**: For new and existing users alike. No redeem code needed, it starts on its own after the update.
3. 📁 **Folders for Gems and notebooks**: Nested folders, pinning and drag-to-reorder keep things tidy no matter how much you collect.
4. 🪟 **A calmer floating outline**: It folds up and fades out when your mouse moves away, so it never covers your conversation.
5. 🐛 **Fixes and polish**: Chat syncing after Gemini's latest redesign, clipped save buttons in AI Studio, a choppy sidebar collapse animation, and more.

---

## 🎁 A Gift for Everyone: 3 Days of Power Pack, Free

Starting with 2.14.0, you can try everything Power Pack offers for free, including:
* Four agents, each with its own job (BetterSidebar, Workspace, Browser, and the new Web Agent)
* One-click export of full chats to Notion and Obsidian

**A few small details about the trial:**
- **Nothing to set up**: After the update, the 3-day trial starts quietly the first time you open the extension. No payment method, no activation code.
- **Check your time anytime**: The remaining hours are shown at the top of the extension popup and on the Settings page.
- **A smooth landing when it ends**: After 3 days, the extension switches back to the free version. **All the data, notes and settings you created during the trial stay safely on your device.** If it genuinely helped your day-to-day work, we'd be glad to have your support with a license. If anything felt off, we'd love to hear your suggestions too.

*(If you already have a paid Power Pack license, nothing changes for you. Everything keeps working as before.)*

---

## 🌐 What Can the New Web Agent Do for You?

Put simply, the Web Agent is like an AI assistant sitting next to you. It runs right in your browser's sidebar, understands what you're seeing on the current page, and carries out actions as you instruct.

**Common uses:**
* **Pulling out and organizing information**: Turn scattered data on a long page into a neat table.
* **Filling out forms step by step**: Fill in field after field, following your instructions.
* **Working across pages**: Switch between tabs on the same site to compare things, or search right inside the site's own search box instead of wandering off to an outside search engine.

### Getting Started
1. **Install the small companion extension**: The Web Agent works together with **[Better Sidebar Web Agent Connector](https://chromewebstore.google.com/detail/dmogbaiecikhmldgdpapobncijaoeamc)**.
   > **Why a second extension?**
   > For your safety. The low-level debugging permission needed to control web pages is kept isolated in this separate extension, so Better Sidebar itself never holds that high-risk permission. The connector is also built to **respond only to commands from Better Sidebar**, so nothing else can call it.
2. **Give permission the first time**: On first launch, you'll see a detailed risk notice. Please read it carefully before agreeing (you can turn it off again anytime in Settings).
3. **Hand it a task**: Type `>Web` followed by your request in the sidebar chat input.
4. **Requirements**: Google Chrome only, for now.

---

## ⚠️ [Please Read] Web Agent Safety and Disclaimer

We'd rather be upfront about this. The Web Agent is a sharp tool: powerful, but with real risks that shouldn't be overlooked. Please take a minute to understand the following before using it:

- **⚠️ It acts as you, with your logged-in accounts**:
  The Web Agent runs in your real browser and uses the accounts you're currently signed in to. That means form submissions, messages sent, even purchases it clicks through look to the website **exactly like actions you took yourself**. Some actions can't be undone once submitted.
- **⚠️ Some visible page content is sent to the AI**:
  To understand a page, the text, links and form structure it reads are sent as context to the Gemini model (a service provided by Google). Rest assured, **the contents of password fields (type="password") are protected and never read**.
- **⚠️ Watch out for prompt injection from malicious pages**:
  The web is a messy place. Some malicious pages may hide instructions aimed at AI models in their content, trying to steer the AI into doing things you didn't intend. **Please be extra careful on sites you don't know.**
- **🚫 Never use it on highly sensitive pages**:
  **Please do not** use the Web Agent on online banking, real payment checkout, personal medical records, or account security and password change pages.
- **👀 AI isn't fully reliable, so please stay and supervise**:
  The model may misread what a button does, or misunderstand a page's structure. That's why there's a safety lock built in: **every click, every text input, and every script that changes the page pauses and waits for you to look and approve it before it runs.** Please stay at your screen while it works.
- **🛑 An emergency stop is always available**:
  While the Web Agent controls a page, Chrome shows a system bar at the top saying the browser is being debugged (e.g. `"started debugging this browser"`). If the AI behaves strangely, click **Cancel** on that bar, or **close the current chat in the sidebar**, and all automation is cut off immediately.
- **📄 Responsibility and terms**:
  You are responsible for the outcome of every step you confirm, and please follow the terms of service of the sites you visit. Better Sidebar is provided "as is" and is not liable for direct or indirect consequences of actions carried out after your confirmation.

These terms may read a bit stiff and serious, but being honest with you and laying the risks out plainly is the least we owe every user.

---

## 📁 Gems and Notebooks: Folders at Last

As collections of Gems and notebooks grew, many of you told us they were getting hard to find your way around. Organizing them is now much easier:

- **Folder trees**: Create nested folders, rename them, and pin the ones you use most.
- **Drag to reorder**: Drag a Gem or notebook into any folder, and use the new "Custom order" view to arrange things exactly how you like.
- **Pickers follow your folders**: Selection dialogs and dropdowns across the extension now show everything in the same folder tree, so it's easy to find what you need.
- **Protection against accidental deletes**: Only empty folders can be deleted, so a slip of the hand won't wipe out a whole group.

---

## 🪟 A Better Floating Outline

- **Fades away when you move off**: A few seconds after your mouse leaves the outline, it folds up into a small title bar and leaves the screen to your conversation. Hover the title bar again and it opens right back up.
- **Pin it open**: Reading something long and want the outline to stay put? Click the pin icon on the title bar to keep it expanded.
- **A handier shortcut**: When you expand the dot scrollbar on the right, there's a new button at the top that opens the floating outline in one click.

---

## 🐛 Fixes and Polish

- **Gemini chats syncing again**: We quickly adapted to the front-end redesign Gemini rolled out on October 21, so new chats and replies reliably sync back to the sidebar again.
- **AI Studio save buttons and drawer**:
  - Fixed the snippet save button getting cut off when the sidebar is expanded or the chat area is narrow.
  - Removed an unresponsive button that showed up on the AI's "Thinking Process" bubble. The save button now sits consistently at the top of each reply.
  - Fixed dragging a saved item not opening the folder drawer while the sidebar is collapsed.
- **Smoother AI Studio sidebar animation**: The expand and collapse animation was rebuilt, so the dropped frames and stutter are gone.
- **Update notice that wouldn't close**: After the extension updated quietly in a background tab, the update notice on the active page sometimes couldn't be clicked or closed. That's fixed.
- **A more thorough data reset**: "Reset data" in Settings sometimes left behind notebook and snippet metadata, which caused sync errors right after resetting. Reset now truly wipes everything, just like a fresh install.
- **Translations filled in**: All 12 built-in languages were reviewed, missing strings were added, and a number of awkward machine translations were fixed.
- **Other touches**:
  - The new-user guide now includes step-by-step tips for Agents, snippets, notebooks and Spark.
  - Tooltips now flip to the other side when there's not enough room near the screen edge, and very long outline tooltips have a maximum height so they don't run off screen.

---

The Web Agent is an important step for us toward browser agents, and it's still in early public testing. With so many different and complex websites out there, there will surely be cases we haven't covered yet. If you run into odd behavior on a particular page, or have any ideas about features or safety, we'd love to hear from you in our community:

👉 **Join us on Discord**: [Join the Discord community](https://discord.gg/FRzesxaGAx)

Thank you for being with us all this way, and for all your feedback and support ☕
