import type { ChangeLogItem } from './types';

export const changelog: ChangeLogItem[] = [
  {
    version: '2.2.0',
    date: '2026-03-10',
    features: [
      '🎨 **Personalización de Gemini UI**: Ajusta el ancho de la barra lateral, el contenido del chat y el cuadro de entrada. Oculta elementos innecesarios (logotipo de Gemini, descargo de responsabilidad de IA, botón de actualización) y activa el Modo de Enfoque (Focus Mode) para una vista más limpia.',
      '🏷️ **Etiquetas en los títulos**: Las etiquetas ahora se muestran junto al título de la conversación en el encabezado y se pueden configurar directamente.',
      '🖼️ **Descarga de imágenes sin marca de agua**: Ahora, al descargar imágenes generadas en Gemini, la marca de agua se elimina automáticamente.',
      '☁️ **Sincronización con Google Drive**: Realiza copias de seguridad manuales y sincroniza tus ajustes, biblioteca de Prompt y configuraciones (excluyendo el historial de chat) mediante Google Drive.',
      '🌈 **Colores personalizados**: Ahora puedes asignar colores personalizados a tus carpetas y etiquetas para una mejor organización.',
    ],
    fixes: [
      'Se solucionó un problema por el cual los comentarios de los usuarios no se enviaban (¡disculpas por los inconvenientes! Ahora puedes reenviar cualquier comentario anterior).',
      'Se mejoró el rendimiento de la animación de la barra lateral de Gemini para que se expanda y colapse de manera más fluida.',
      'Varios pequeños ajustes de UI y optimizaciones en la experiencia.',
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
      'Moved the "Switch to original UI" button for better accessibility.',
      'Fixed various UI glitches and improved performance.',
    ],
  },
];
