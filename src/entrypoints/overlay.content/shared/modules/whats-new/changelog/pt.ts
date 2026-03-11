import type { ChangeLogItem } from './types';

export const changelog: ChangeLogItem[] = [
  {
    version: '2.2.0',
    date: '2026-03-10',
    features: [
      '🎨 **Customização da UI do Gemini**: Ajuste a largura da barra lateral, do conteúdo do chat e da caixa de entrada. Oculte elementos desnecessários (logotipo do Gemini, aviso legal de IA, botão de atualização) e ative o Modo de Foco (Focus Mode) para um visual mais limpo.',
      '🏷️ **Tags no Título**: Tags agora são exibidas ao lado do título da conversa no cabeçalho e podem ser configuradas diretamente.',
      "🖼️ **Download de Imagens sem Marca d'Água**: O download de imagens geradas no Gemini agora remove automaticamente a marca d'água.",
      '☁️ **Sincronização com o Google Drive**: Faça backup e sincronize manualmente suas configurações, biblioteca de Prompt e preferências (excluindo o histórico de bate-papo) via Google Drive.',
      '🌈 **Cores Personalizadas**: Agora você pode atribuir cores personalizadas às suas pastas e tags para melhor organização.',
    ],
    fixes: [
      'Corrigido um problema onde o envio de feedback do usuário falhava (pedimos desculpas pelo inconveniente! Agora você pode reenviar qualquer feedback anterior).',
      'Melhoria do desempenho da animação da barra lateral do Gemini para expansão e retração mais suaves.',
      'Vários pequenos ajustes na UI e otimizações de experiência.',
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
