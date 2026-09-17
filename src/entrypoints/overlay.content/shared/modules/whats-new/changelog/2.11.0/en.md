# 2.11.0 Update: Cmd+K Command Palette, Silent Background Sync, & Browser Agent!

Hey everyone! 👋 

Even though this release cycle was relatively short, we've packed in some serious heavy-hitter features that push operational efficiency and intelligent workflows to the next level. We think you're going to love what's inside!

---

## ⚡ TL;DR (Highlights at a Glance)

1. **🔄 Silent Background Message Sync**: No more needing to manually click open every chat to build an index. Background sync ensures comprehensive offline full-text search across all devices.
2. **⌨️ Cmd+K Command Palette**: Raycast-style keyboard-first command bar—search chat history, message content, and extension actions in a flash.
3. **🧩 Customizable Icon Bar**: Hide unused functional tabs and freely drag-and-drop to reorder icons on the far-left dock.
4. **🤖 Browser Agent (Experimental)**: Intelligent tab deduplication & grouping, plus deep bookmark cleanup. Automatic snapshots before every operation with instant one-click rollback.
5. **🎨 BetterSidebar Agent Live Theme Workshop**: Describe any aesthetic in plain words, and the agent builds and applies the theme instantly, ready for conversational fine-tuning.
6. **🛠️ Polish & Bug Fixes**: AI Studio expand/collapse fix, new chat folder routing fix, and eye-friendly contrast tuning for the Retro Terminal theme.

---

## 🔥 Deep Dive into What's New

### 1. 🔄 Silent Background Message Sync: Real Full-Text Search Restored

- **The Old Frustration**: Previously, the extension only indexed messages when you physically opened a conversation. If you used multiple computers or browsers, searches would often come up blank because older chats had never been visited locally.
- **Silent Background Indexing**: Better Sidebar can now quietly pull message histories in the background to backfill your local search index, completely solving the "missing search results" problem.
- **Rate-Limited & Account Safe**: To avoid spamming requests or triggering Google's API rate limits, this feature is **turned off by default**. You can enable it in Settings, where it operates with gentle throttling so your account stays completely safe.
- **Sync Status Overview**: We've added a dedicated sync management dialog where you can see exactly which chats are synced and which are pending. Need a specific chat indexed immediately? You can manually trigger a sync for it with a single click.

### 2. ⌨️ Cmd+K Command Palette: Raycast-Style Keyboard-First Flow

Once comprehensive message indexing is in place, the command palette truly comes to life!
- **Instant Access**: Press **`Cmd + K`** (or **`Ctrl + K`** on Windows) anywhere to invoke the spotlight command palette.
- **Unified Multi-Dimensional Search**:
  - Search conversation titles and descriptions;
  - Search directly through full message chat transcripts;
  - Search and trigger extension actions and navigation shortcuts.
- **Zero-Mouse Workflow**: Arrow keys to navigate, Enter to jump or execute. Built from the ground up for power users who love staying on the keyboard.

### 3. 🧩 Fully Customizable & Reorderable Left Icon Bar

As Better Sidebar gains more capabilities, several of you shared great feedback: *"I don't use every single tool every day, and having all those icons visible adds unnecessary visual clutter."*
- **Toggle Visibility**: You can now choose exactly which feature icons appear on the sidebar dock. Hide what you don't need for a minimal, distraction-free layout.
- **Drag-and-Drop Reordering**: Rearrange the vertical dock order to your liking. Put your most frequently reached tools right where your muscle memory expects them.

### 4. 🤖 Browser Agent: AI as Your Personal Browser Caretaker (Experimental)

We asked ourselves: if AI can help us inspect data and write code, why can't it help us clean up our chaotic daily browsing environment?
If you're like us, you probably leave dozens of tabs open until page titles turn into tiny slivers, and your bookmark bar has accumulated years of disorganized, duplicate, or dead links.
Browser Agent is designed to tackle exactly that:
- **Smart Tab Cleanup**: Automatically eliminates duplicate tabs (keeping only one instance per page) and groups related pages by semantic topic.
- **Bookmark Spring-Cleaning**: Reorganizes sprawling bookmark trees, consolidates duplicate folders, and helps purge broken links.
- **Snapshots & One-Click Rollback**: **Data safety always comes first.** Before making any changes, the agent automatically creates a snapshot of your browser state. Both before-and-after states are preserved. If the result doesn't feel right, you can **revert to the previous version with a single click**, guaranteeing zero risk of lost data. (*Tip: If you want extra peace of mind, you can also manually export an HTML backup using Chrome's native bookmark manager beforehand.*)

### 5. 🎨 BetterSidebar Agent Live Theme Customization: From Words to Wallpaper in Seconds

Creating custom themes used to be a chore: copy prompt -> generate in an external chat -> copy raw JSON -> paste into settings.
- Now, just describe your vision directly to the BetterSidebar Agent:
  > *"Design a Matrix-inspired cyberpunk theme with pitch-black backgrounds and neon green accents"* or *"Give me a soft, low-saturation Japanese milk tea palette."*
- The Agent will calculate the color tokens and **apply the theme immediately**!
- Want a minor tweak? Just chat back: *"Make the background slightly darker and increase the input border contrast."* The Agent updates it in real-time. You can now match your workspace theme to your mood every single day!

---

## 🛠️ Bug Fixes & Refinements

1. **AI Studio Expand/Collapse Restored**: Adapted to Google's recent AI Studio layout and DOM restructuring, fixing the sidebar collapse toggle.
2. **New Chat Default Folder Routing**: Fixed a bug where creating a new chat while viewing a specific folder still dumped the conversation into the "Inbox". New chats now route obediently to your active folder.
3. **Retro Terminal Theme Eye-Friendly Tuning**: Toned down overly high color saturation in the Retro theme, improving contrast and making long sessions much easier on the eyes.

---

Thank you as always for your support, patience, and feedback! If you run into any quirks or have ideas for future updates, feel free to drop a line anytime. Enjoy the update! 🎉
