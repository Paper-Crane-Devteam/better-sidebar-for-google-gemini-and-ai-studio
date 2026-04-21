import type { ChangeLogItem } from './types';

export const changelog: ChangeLogItem[] = [
  {
    version: '2.4.1',
    date: '2026-04-21',
    features: [],
    fixes: [
      '🚑 **Correção urgente**: Compatibilidade com o redesign do AI Studio — a extensão agora reconhece a nova barra de navegação `ms-navbar-v2` e "Alternar para Barra Lateral Original" a restaura corretamente.',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-04-13',
    features: [
      '✏️ **Renomeação real**: Renomeie conversas e as alterações são sincronizadas com os servidores do Google em tempo real.',
      '🗑️ **Exclusão real e em lote**: Exclua ou exclua em lote conversas com remoção real no lado do servidor. Sem mais chats fantasma.',
      '🔐 **Sessão persistente**: Mantenha-se logado entre sessões. Sem mais reautorizações frequentes. Inclui uma opção de mesclagem inteligente para dados sincronizados.',
      '💎 **Criar conversas Gem** (Gemini): Inicie uma nova conversa Gem diretamente da aba Gem.',
    ],
    fixes: [
      'Corrigido um problema onde a varredura podia ser acionada simultaneamente em múltiplas abas.',
      'Redesenhado o menu suspenso de três pontos com um estilo mais limpo e polido.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-03-30',
    features: [
      '🔍 **Pesquisa encadeada**: Filtre conversas combinando múltiplas condições — título, tag e tipo — para resultados ultra precisos.',
      '📂 **Pastas padrão**: Configure pastas padrão para sincronização e importação, para que novas conversas sejam organizadas automaticamente.',
      '📜 **Barra de rolagem inteligente** (Gemini): Uma barra visual que permite pular diretamente para qualquer mensagem em conversas longas.',
      '💎 **Gerenciamento de Gems** (Gemini): Integração completa de Gems — navegue, filtre, crie e inicie conversas com seus Gems diretamente da barra lateral.',
      '🤖 **Modelo padrão** (Gemini): Defina um modelo padrão e cada nova conversa o utilizará automaticamente.',
      '✏️ **Reenvio rápido** (Gemini): Reenvie uma mensagem sem precisar editá-la — basta clicar em reenviar.',
    ],
    fixes: [
      "Corrigida a remoção de marca d'água para imagens HD de contas Pro.",
      'A conversa atual agora tem um estilo de seleção claro para que você sempre saiba qual chat está ativo.',
      'Os fundos das pastas agora correspondem à cor atribuída para maior consistência visual.',
      'Tooltips redesenhados com visual mais limpo e tempo de resposta mais rápido.',
      'Melhoria da interface e experiência das operações em lote.',
      'Diversas melhorias de detalhes e correções de bugs conhecidos.',
    ],
  },
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
