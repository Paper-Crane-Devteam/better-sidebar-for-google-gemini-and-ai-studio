import type { ChangeLogItem } from './types';

export const changelog: ChangeLogItem[] = [
  {
    version: '2.4.1',
    date: '2026-04-21',
    features: [],
    fixes: [
      '🚑 **Hotfix**: Fixed AI Studio redesign — the extension now recognizes the new `ms-navbar-v2` navbar, and "Switch to Original Sidebar" correctly restores it.',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-04-13',
    features: [
      '✏️ **True Rename**: Rename conversations directly — changes are synced to Google\'s servers in real time.',
      '🗑️ **True Delete & Batch Delete**: Delete or batch-delete conversations with real server-side removal. No more ghost chats.',
      '🔐 **Persistent Login**: Stay logged in across sessions. No more frequent re-authorization. Includes a smart merge option for synced data.',
      '💎 **Create Gem Conversations** (Gemini): Start a new Gem conversation directly from the Gem tab.',
    ],
    fixes: [
      'Fixed an issue where scanning could trigger across multiple tabs simultaneously.',
      'Redesigned the three-dot dropdown menu with a cleaner, more polished style.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-03-30',
    features: [
      '🔍 **Chained Search**: Filter conversations by combining multiple conditions — title, tag, and type — all at once for laser-precise results.',
      '📂 **Default Folders**: Configure default folders for sync and import operations, so new conversations land exactly where you want them.',
      '📜 **Smart Scrollbar** (Gemini): A visual scrollbar that lets you jump directly to any message in long conversations. No more endless scrolling.',
      '💎 **Gem Management** (Gemini): Full Gem integration — browse, filter, create, and start conversations with your Gems right from the sidebar.',
      '🤖 **Default Model** (Gemini): Set a default model and every new conversation will automatically use it. No more re-selecting each time.',
      '✏️ **Quick Resend** (Gemini): Resend a message without making edits — just hit resend directly from the edit view.',
    ],
    fixes: [
      'Fixed watermark removal for Pro account HD images.',
      'Current conversation now has a clear selected style so you always know which chat is active.',
      'Folder backgrounds now match their assigned folder color for better visual consistency.',
      'Redesigned tooltips with a cleaner look and faster response time.',
      'Improved batch operation UI and UX for a smoother multi-select workflow.',
      'Various detail-level experience improvements and known bug fixes.',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-03-10',
    features: [
      '🎨 **Gemini UI Customization**: Adjust sidebar, chat content, and input box widths. Hide unnecessary elements (Gemini logo, AI disclaimer, upgrade button) and toggle Focus Mode for a cleaner look.',
      '🏷️ **Title Tags**: Tags are now displayed next to the conversation title in the header and can be configured directly.',
      '🖼️ **Watermark-Free Image Downloads**: Downloading generated images in Gemini now automatically removes the watermark.',
      '☁️ **Google Drive Sync**: Manually backup and sync your settings, prompts, and configurations (excluding chat history) via Google Drive.',
      '🌈 **Custom Colors**: You can now assign custom colors to your folders and tags for better organization.',
    ],
    fixes: [
      'Fixed an issue where user feedback failed to send (apologies for the inconvenience! You can now resend any previous feedback).',
      'Improved Gemini sidebar animation performance for smoother expanding and collapsing.',
      'Various minor UI tweaks and experience optimizations.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-02-25',
    features: [
      '👥 **Multi-Account Profiles**: Support for multiple profiles, each allowing a separate Gemini and AI Studio account connection.',
      '📝 **Enhanced Prompt Variables**: Added support for option-type variables and prompt composition by importing other prompts.',
      '🔍 **Search Filtering**: New "Search in Current Conversation" filter for more precise full-text search results.',
      '⚙️ **Platform Manager**: New extension popup (accessible via the browser icon) to enable/disable platforms and quickly jump between them.',
    ],
    fixes: [
      'Restored the system prompt import functionality in AI Studio.',
      'Fixed an issue where deleted conversations would reappear unexpectedly after refreshing the page.',
      'Refined Gemini UI styling and restored the official Gemini brand logo.',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-02-13',
    features: [
      '🌟 **Gemini Platform Support**: Now works seamlessly with Gemini alongside AI Studio. Manage conversations across both platforms in one unified sidebar.',
      '🔄 **Automatic Conversation Sync**: Your latest conversations are automatically synced when you visit the page. Stay up-to-date effortlessly.',
      '🔗 **Unified Data Management**: Seamlessly share prompts and search across both Gemini and AI Studio. One library, two platforms.',
      '🎨 **Improved UI Layouts**: Enhanced compact and relaxed view options for better readability and visual comfort.',
    ],
    fixes: [
      'Optimized batch operations for improved performance and reliability when managing multiple items.',
      'Fixed various UI bugs and enhanced overall user experience with smoother interactions.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-01-31',
    features: [
      '🚀 **Prompt Library**: A powerful new module to manage your prompts with folders, tags, and variables.',
      '📥 **Conversation Export**: Export your conversations as Markdown, Plain Text, or JSON.',
      '🔍 **Deep Search**: Full-text search across all your conversations and messages. Find anything instantly.',
      '🌐 **Multi-Browser Support**: Now available for Firefox and Microsoft Edge.',
      "🔗 **Quick Shortcuts**: Added direct access to AI Studio's Build, Dashboard, and Documentation pages in the sidebar.",
      '✨ **QoL Improvements**: Enhanced UI, better navigation, and smoother interactions.',
      '❤️ **Open Source**: The code is now open source! Star us on GitHub if you like it!',
    ],
    fixes: [
      'Moved the "Switch to Original Sidebar" button for better accessibility.',
      'Fixed various UI glitches and improved performance.',
    ],
  },
];
