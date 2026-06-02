import type { ChangeLogItem } from './types';

export const changelog: ChangeLogItem[] = [
  {
    version: '2.7.0',
    date: '2026-06-02',
    features: [
      '⌨️ **Atajos de teclado**: Nuevas teclas rápidas (Hotkeys) para una navegación y operación más eficiente — imprescindible para los amantes del teclado.',
    ],
    fixes: [
      'Mejora del estilo Markdown en la vista previa de búsqueda para una mejor experiencia de lectura.',
    ],
    announcement: {
      title: 'Actualización del Supporter Pack 🎨',
      content: [
        '🎨 **Temas personalizados con IA**: Usa IA para generar cualquier tema que puedas imaginar — cyberpunk, pastel, retro, lo que quieras. Si puedes soñarlo, podemos generarlo.',
        '🎉 Nuevo canal de patrocinio lanzado. ¡Gracias por vuestro increíble apoyo! ❤️',
      ],
    },
  },
  {
    version: '2.6.0',
    date: '2026-05-29',
    features: [
      '🎛️ **Controles de UI de AI Studio**: Ancho de barra lateral configurable, ocultar automáticamente el cuadro de entrada y el panel de configuración de ejecución para un espacio de trabajo más limpio.',
      '💬 **Nuevo chat rápido**: Al crear una nueva conversación, aparece una entrada instantáneamente — establece el título antes de que se cree el chat para un flujo más ágil.',
      '🎨 **Configuración de UI de Gemini**: Nuevas opciones de configuración de UI de Gemini en el panel de ajustes.',
      '🖼️ **Eliminación de marca de agua**: Se reactivó la eliminación de marca de agua para las descargas de imágenes de Gemini.',
    ],
    fixes: [
      'Corregido el problema de Scan Library que no funcionaba en AI Studio.',
      'Corregida la imposibilidad de escribir la letra "R" mayúscula en AI Studio.',
      'Adaptado al último rediseño de la UI de Gemini.',
      'Corregidos problemas de visualización de la barra lateral en ventanas estrechas/móviles en Gemini.',
    ],
    announcement: {
      title: 'Supporter Pack 🎨',
      content: [
        '**3 temas exclusivos** ahora disponibles como Supporter Pack — una forma de personalizar tu barra lateral mientras apoyas el proyecto.',
        'Todas las funciones principales siguen siendo **100% gratuitas**. Esta extensión se desarrolla en mi tiempo libre, y tu apoyo me ayuda a seguir manteniendo y desarrollando nuevas funciones. ¡Gracias! ❤️',
      ],
    },
  },
  {
    version: '2.5.0',
    date: '2026-05-14',
    features: [
      '📓 **Integración de Notebook** (Gemini): Soporte completo de Notebook — navega, organiza y gestiona tus Gemini Notebooks directamente desde la barra lateral.',
      '☁️ **Sincronización automática con Google Drive**: Tus configuraciones y biblioteca de prompts ahora se sincronizan automáticamente con Google Drive en segundo plano. No más copias de seguridad manuales.',
      '✨ **Mejoras de UX**: Se añadieron estados de carga al crear nuevas conversaciones, además de varias mejoras de interacción para una experiencia más fluida.',
    ],
    fixes: [
      'Corregido el problema de entradas duplicadas en la barra de desplazamiento inteligente.',
      'Corregido un problema donde la creación de conversaciones dentro de carpetas en AI Studio no funcionaba.',
    ],
  },
  {
    version: '2.4.1',
    date: '2026-04-21',
    features: [],
    fixes: [
      '🚑 **Corrección urgente**: Compatibilidad con el rediseño de AI Studio — la extensión ahora reconoce la nueva barra de navegación `ms-navbar-v2` y "Cambiar a Barra Lateral Original" la restaura correctamente.',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-04-13',
    features: [
      '✏️ **Renombrado real**: Renombra conversaciones y los cambios se sincronizan con los servidores de Google en tiempo real.',
      '🗑️ **Eliminación real y por lotes**: Elimina o elimina por lotes conversaciones con eliminación real del lado del servidor. No más chats fantasma.',
      '🔐 **Sesión persistente**: Mantén tu sesión iniciada entre sesiones. Sin más reautorizaciones frecuentes. Incluye una opción de fusión inteligente para datos sincronizados.',
      '💎 **Crear conversaciones Gem** (Gemini): Inicia una nueva conversación Gem directamente desde la pestaña Gem.',
    ],
    fixes: [
      'Corregido un problema donde el escaneo podía activarse simultáneamente en múltiples pestañas.',
      'Rediseñado el menú desplegable de tres puntos con un estilo más limpio y pulido.',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-03-30',
    features: [
      '🔍 **Búsqueda encadenada**: Filtra conversaciones combinando múltiples condiciones — título, etiqueta y tipo — para resultados ultra precisos.',
      '📂 **Carpetas predeterminadas**: Configura carpetas predeterminadas para sincronización e importación, para que las nuevas conversaciones se organicen automáticamente.',
      '📜 **Barra de desplazamiento inteligente** (Gemini): Una barra visual que te permite saltar directamente a cualquier mensaje en conversaciones largas.',
      '💎 **Gestión de Gems** (Gemini): Integración completa de Gems — explora, filtra, crea e inicia conversaciones con tus Gems desde la barra lateral.',
      '🤖 **Modelo predeterminado** (Gemini): Establece un modelo predeterminado y cada nueva conversación lo usará automáticamente.',
      '✏️ **Reenvío rápido** (Gemini): Reenvía un mensaje sin necesidad de editarlo — simplemente haz clic en reenviar.',
    ],
    fixes: [
      'Corregida la eliminación de marcas de agua para imágenes HD de cuentas Pro.',
      'La conversación actual ahora tiene un estilo de selección claro para que siempre sepas qué chat está activo.',
      'Los fondos de las carpetas ahora coinciden con el color asignado para mayor consistencia visual.',
      'Tooltips rediseñados con un aspecto más limpio y tiempo de respuesta más rápido.',
      'Mejora de la interfaz y experiencia de las operaciones por lotes.',
      'Múltiples mejoras de detalle y correcciones de errores conocidos.',
    ],
  },
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
