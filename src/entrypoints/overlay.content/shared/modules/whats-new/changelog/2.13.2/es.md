# 🔧 v2.13.2 — Biblioteca de prompts en los cuadros de instrucciones y arreglo del registro en Gemini
Una pequeña actualización después de 2.13.1: una función nueva, algunos arreglos y un adelanto de lo que viene.
## ✨ Novedades
*   **📚 Usa tu biblioteca de prompts en los cuadros de instrucciones:** El editor de Gems, los ajustes de Notebook y las instrucciones del sistema de AI Studio ahora tienen un menú **Prompts**. Puedes buscar o explorar tus carpetas, rellenar variables y añadir un prompt (con un aviso para deshacer si cambias de idea). Junto al menú se muestra una vista previa del prompt completo. También hay un botón **Guardar como prompt**, y `/` funciona en estos cuadros.
*   **🔀 Instrucciones del sistema en AI Studio:** Puedes alternar entre la lista propia de AI Studio y tu biblioteca de Better Sidebar. La primera vez, tus instrucciones guardadas en AI Studio se importan una sola vez, sin duplicados. En modo biblioteca, la extensión solo escribe en una entrada dedicada "⚡ Better Sidebar", así que el resto de tus instrucciones no se tocan.
## 🐞 Arreglos
*   **💬 Los chats nuevos de Gemini no se guardaban:** El 20 de octubre Gemini volvió a cambiar cómo envía los mensajes, y los chats y respuestas nuevos dejaron de llegar a la barra lateral. Ya se registran de nuevo.
*   **✏️ Los cambios de nombre en AI Studio se revertían:** Un chat renombrado desde la barra lateral podía volver a su título anterior tras la siguiente respuesta. Ahora el nuevo nombre se mantiene.
*   **🪟 Menús ocultos tras los paneles de AI Studio:** Popovers, diálogos, avisos y tooltips podían quedar detrás de los paneles laterales de AI Studio. Ahora siempre quedan encima.
*   **🖱 Parpadeo del menú contextual:** El menú del clic derecho podía aparecer un instante en otro lugar antes de saltar al puntero. Ahora se abre justo donde haces clic.
*   **🔍 Faltaban resaltados en la vista previa de búsqueda:** Las búsquedas con Markdown (como `**negrita**`) o expresiones regulares que cruzan el formato encontraban resultados, pero no se resaltaban en la vista previa. Ahora sí.
*   **💾 Descarga de la copia de seguridad bloqueada:** Chrome a veces bloqueaba la descarga del archivo de copia de seguridad. Ahora, tras exportar, un aviso espera a que hagas clic para descargar.
*   **🧭 Cursor del esquema:** Solo los elementos que se pueden expandir muestran ahora el cursor de puntero.
## 🔭 Próximamente: Web Agent
He estado trabajando en un **Web Agent** que permite a la IA trabajar en páginas web por ti desde el panel lateral de Chrome: leer una página, hacer clic, escribir y moverse entre pestañas, mientras tú puedes mirar y detenerlo en cualquier momento. Funciona a través de una pequeña extensión complementaria, **Better Sidebar Web Agent Connector**, que todavía está en revisión en la Chrome Web Store, así que por ahora la función está oculta. La activaré en cuanto la aprueben, y espero que te guste.
Si algo no se ve bien, avísame. Gracias ☕
