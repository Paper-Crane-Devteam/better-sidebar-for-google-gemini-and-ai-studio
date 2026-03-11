# Better Sidebar for Gemini & AI Studio

![Better Sidebar Banner](./assets/images/marquee.jpg)

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?style=for-the-badge&logo=google-chrome)](https://chromewebstore.google.com/detail/better-sidebar-for-google/cjeoaidogoaekodkbhijgljhenknkenj)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-Available-orange?style=for-the-badge&logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/better-sidebar-for-ai-studio)
[![Edge Add-ons](https://img.shields.io/badge/Edge_Add--ons-Coming_Soon-gray?style=for-the-badge&logo=microsoft-edge)](https://microsoftedge.microsoft.com/addons/)
[![Privacy Policy](https://img.shields.io/badge/Privacy-Policy-green?style=for-the-badge)](./PRIVACY.md)
[![License](https://img.shields.io/badge/License-Open_Source-orange?style=for-the-badge)](./LICENSE)

Hi there! Welcome to the home of **Better Sidebar for Gemini & AI Studio**.

If you use **Gemini** or **Google AI Studio** heavily, you know the struggle: your chat list gets messy, old prompts get lost, and finding that _one_ specific conversation from last week is a nightmare.

We built this extension to fix that. It gives you a clean, organized sidebar with folders, tags, and a powerful search engine that actually works across **both platforms**—all while keeping your data 100% local and private.

## 🚀 What's New in v2.2.0?

This update brings advanced Gemini UI customization, Google Drive sync, and custom color organization!

### 🎨 Gemini UI Customization

Take control of your Gemini experience. Adjust sidebar, chat content, and input box widths. Hide unnecessary elements (Gemini logo, AI disclaimer, upgrade button) and toggle Focus Mode for a cleaner look.

### ☁️ Google Drive Sync

Manually backup and sync your settings, prompts, and configurations (excluding chat history) securely via Google Drive.

### 🌈 Custom Colors & Tags

- **Custom Colors**: You can now assign custom colors to your folders and tags for better visual organization.
- **Title Tags**: Tags are now displayed directly next to the conversation title in the header and can be configured on the fly.

### 🖼️ Watermark-Free Image Downloads

Downloading generated images in Gemini now automatically removes the watermark.

---

## ✨ Features

Here is what Better Sidebar can do for you:

| Feature                       | Description                                                                                                                      |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| 🌟 **Multi-Platform Support** | Manage conversations across both Gemini and Google AI Studio seamlessly in one unified sidebar.                                  |
| 👥 **Multi-Account Profiles** | Create separate profiles for work or personal use. Each maintains its own database synced with the corresponding Google account. |
| **Folders & Colors**          | Drag and drop your chats into nested folders. Assign custom colors to folders and tags.                                          |
| 📝 **Prompt Library**         | Save, manage, and reuse prompts locally. Supports option variables, prompt composition, and system prompt imports.               |
| 🔍 **Precision Search**       | Full-text search across all conversations. Limit search to the active chat for immediate context.                                |
| ☁️ **Google Drive Sync**      | Manually backup and sync your settings, prompts, and config data via Google Drive.                                               |
| 🎨 **UI Customization**       | Advanced layout controls for Gemini, including width adjustments and Focus Mode.                                                 |
| ⚙️ **Platform Manager**       | Use the extension popup to quickly jump between platforms or enable/disable them.                                                |
| 🏷️ **Tags**                   | Add custom tags to conversations for flexible filtering, now visible directly in the chat header.                                |
| ⭐ **Favorites**              | Pin your most used chats or specific prompts to the top.                                                                         |
| 🔄 **Automatic Sync**         | Your latest conversations are automatically synced behind the scenes when you visit the page.                                    |
| 📊 **Timeline View**          | See your work organized by "Today", "Yesterday", and "Last Week".                                                                |
| 🖼️ **Image Downloads**        | Automatically remove watermarks when downloading generated images in Gemini.                                                     |
| 📥 **Conversation Export**    | Export your conversations as Markdown, Plain Text, or JSON.                                                                      |
| 🌗 **Theme Sync**             | Automatically matches the platform's light/dark mode.                                                                            |
| 🔒 **Privacy First**          | Everything is stored locally in your browser (SQLite). We don't see your data, ever.                                             |
| 💾 **Data Control**           | Export your data (SQL dump) anytime. You own your data.                                                                          |

## 🔒 Privacy & Security

We take this seriously.

- **Local Only:** We use an embedded database (SQLite WASM) inside your browser.
- **No Cloud:** Your folders, tags, and notes never leave your device.
- **No Training:** We don't use your data to train models.

When you install, your browser will request permission to "Read and change data on aistudio.google.com and gemini.google.com". This is just so we can draw the sidebar on the page and read your chat titles to organize them. That's it.

## 🚧 Roadmap

We're just getting started. Here is what's on our mind:

- [x] **Full Content Search** (Done in v1.1.0!)
- [x] **Prompt Library** (Done in v1.1.0!)
- [x] **Gemini Platform Support** (Done in v2.0.0!)
- [x] **Multi-Account Support** (Done in v2.1.0!)
- [x] **Cloud Sync** (Done in v2.2.0!)
- [ ] **Additional Platform Support**: Maybe bring this to ChatGPT or Claude?
- [ ] **AI Auto-Tagging**: Using a local LLM to help organize your chats automatically.

## 📥 Installation

**[Get it from the Chrome Web Store](https://chromewebstore.google.com/detail/better-sidebar-for-google/cjeoaidogoaekodkbhijgljhenknkenj)**

Also available on:

- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/better-sidebar-for-ai-studio)
- **Microsoft Edge**: Not yet supported (coming soon).

## 🤝 Contributing

This project is now open source! If you're a developer and want to help make it better, feel free to open an issue or submit a PR.

## 🆘 Support & Troubleshooting

### Common Issues (FAQ)

<details>
<summary><strong>1. The extension overlay isn't appearing.</strong></summary>

- **Refresh the page:** Sometimes the extension needs a page reload to inject properly, especially right after installation.
- **Check permissions:** Ensure the extension has permission to run on `aistudio.google.com` and `gemini.google.com`.
- **Conflict:** Disable other Gemini or AI Studio extensions temporarily to check for conflicts.
</details>

<details>
<summary><strong>2. My chats aren't showing up or I can't find specific messages.</strong></summary>

- **New chats missing?** The extension automatically syncs when you visit the page. If conversations are still missing, go to `Settings` -> `Data & Storage` and click **"Scan Library"** to force a manual sync.
- **Missing message content?** If search can't find text from older chats, you might need to import them. Go to the **Search** tab and click **"Import History"**. You can upload a Google Takeout zip to fully index your past conversations.
</details>

<details>
<summary><strong>3. I lost my folder structure!</strong></summary>

- **Don't Panic:** Your data is stored locally.
- **Check Database:** In the `Settings`, try exporting your data to see if it's still there.
- **Restore:** If you have a previous backup (DB file), use the Import function to restore your state.
</details>

### Reporting Bugs

Found a bug? Have a cool idea?

- Check the [Issues](../../issues) tab to see if it's already reported.
- If not, feel free to open a new issue!

---

_Note: This is an independent project and is not affiliated with Google._
