# 🔧 v2.13.1 — Al día con los cambios internos de Gemini

Justo después de publicar la 2.13.0, Gemini cambió la forma en que su página web se comunica con sus servidores. En pantalla no se veía nada distinto, pero el formato con el que se envían los mensajes nuevos y las listas de chats había cambiado. Por eso, durante un tiempo, los chats y mensajes nuevos dejaron de guardarse en la barra lateral sin avisar. Perdón por las molestias. Esta actualización se centra sobre todo en ponerse al día.

## 🐞 Correcciones
*   **💬 Los chats y mensajes nuevos se guardan otra vez:** La extensión ya entiende el nuevo formato de Gemini, así que las conversaciones, respuestas y títulos nuevos aparecen en la barra lateral como antes.
*   **🔄 La lista de chats, los cambios de nombre y las eliminaciones vuelven a sincronizarse:** Renombrar o borrar un chat, así como tus listas de Gems y cuadernos, se recogen correctamente de nuevo.
*   **💎 Lista de Gems más precisa:** Ahora tu lista de Gems se sincroniza completa, en lugar de adivinarse en cada carga de página. Los Gems que no han cambiado ya no aparecen como "actualizados" sin motivo.
*   **👥 Sincronización en segundo plano con otras cuentas de Google:** En pestañas con una segunda cuenta (las que llevan `/u/1` o similar en la dirección), la sincronización pedía los chats de la cuenta equivocada y fallaba. Ahora usa la cuenta de esa pestaña. Además, un chat que no se puede cargar ya no detiene al resto de la cola.
*   **⌨️ Ocultar automáticamente el cuadro de texto:** Rehecho para que aparezca y desaparezca de forma más fiable, sin quedarse a medio mostrar.
*   **📐 Botones de acción bajo las respuestas:** Al ensanchar el chat, los botones bajo cada respuesta se quedan alineados a la izquierda.
*   **✏️ Los Gems ya no se renombran desde la barra lateral:** Los nombres de los Gems vienen del propio Gemini, así que pulsar F2 sobre un Gem ya no abre un cuadro de edición que no guardaba nada.

## 🧭 AI Studio
*   **La barra de puntos sigue los cambios de chat:** Antes seguía mostrando el chat anterior hasta recargar. Ahora se actualiza al cambiar de chat.
*   **Ya no tapa el texto:** La barra tiene ahora su propio espacio a la derecha del chat y no se superpone a los mensajes, con el panel de ajustes abierto o cerrado.
*   **Un aspecto más compacto:** Más pequeña y con esquinas redondeadas acordes al estilo de AI Studio.

## 🎨 Pequeños detalles
*   **Página Acerca de:** La información de versión ahora es una tarjeta más ordenada, con la comprobación de actualizaciones en su parte inferior.

Gemini sigue cambiando cosas por dentro, así que si algo deja de guardarse o sincronizarse, avísame y lo reviso enseguida ☕
