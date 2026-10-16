# Actualización 2.13.0: búsqueda que te lleva al mensaje, un índice flotante y una barra lateral más tranquila

Hola, amigos 👋

Gemini estrenó un diseño nuevo hace poco, y además cambió por dentro la forma en que su página se comunica con sus servidores. Buena parte de esta versión se dedicó a ponerse al día con ambas cosas. De paso, añadí algunas cosas que tenía ganas de hacer desde hace tiempo, sobre todo para orientarte mejor dentro de los chats largos.

---

## 🎁 Un pequeño regalo por Gemini Argon

Para celebrar el nuevo modelo Argon de Gemini, preparé un código de canje que desbloquea **todas las funciones de Power Pack gratis durante 10 días**.

- **Dónde conseguirlo**: el código está en el canal de promociones de nuestro **[Discord](https://discord.gg/FRzesxaGAx)**.
- **Hasta cuándo**: puedes canjearlo en cualquier momento hasta el **21 de octubre**.

Si tienes algún problema al usarlo, o ideas que quieras compartir, también eres bienvenido a buscarme en Discord.

---

## ⚡ En resumen

1. **🎯 Ir directo al mensaje coincidente**: al abrir un resultado de búsqueda, ahora se desplaza al mensaje exacto, no solo al chat.
2. **🔣 Búsqueda con expresiones regulares**: un nuevo modo de búsqueda para cuando las palabras clave no son lo bastante precisas.
3. **🪟 Índice flotante**: saca el índice a un panel que puedes arrastrar y redimensionar.
4. **🧭 Mejor navegación en AI Studio**: los saltos desde el índice y la barra de desplazamiento de puntos ahora también funcionan allí.
5. **🔐 Corrección para varias cuentas**: los datos de distintas cuentas de Google ya no se mezclan.
6. **🧩 Al día con los cambios de Gemini**: los chats y mensajes nuevos vuelven a guardarse, y los controles de ancho, el ocultado automático del campo de entrada y los temas vuelven a funcionar.

---

## 🔥 Un poco más sobre lo destacado

### 🎯 Los resultados de búsqueda te llevan al mensaje

Antes, abrir un resultado de búsqueda solo abría el chat, y todavía tenías que desplazarte para encontrar la parte que buscabas. En una conversación larga, eso podía llevar un rato.

Ahora, en Gemini, se desplaza hasta el mensaje que coincidió. Si ese mensaje está más atrás, primero carga los turnos anteriores. El mensaje parpadea un momento para que lo ubiques, y tus términos de búsqueda aparecen resaltados dentro de él.

### 🔣 Búsqueda con expresiones regulares

Para quienes prefieren búsquedas más precisas, ahora hay un modo de expresiones regulares. Resulta útil para cosas como encontrar cierto patrón de código de error, o una frase concreta con alguna variación. Para que todo siga fluido, muestra hasta 500 coincidencias.

### 🪟 Un índice flotante

Ahora puedes sacar el índice de la barra lateral a un panel flotante, arrastrarlo a donde quieras y cambiar su tamaño. Es cómodo cuando la barra lateral está cerrada, o cuando simplemente quieres tener el índice junto a la conversación.

También simplifiqué su aspecto: desaparecen los iconos de los encabezados y los números delante de cada mensaje, y los niveles de encabezado se distinguen por tamaño y grosor. Se lee con mucha más calma.

### 🧭 AI Studio recibe los saltos desde el índice y la barra de puntos

Al hacer clic en un elemento del índice en AI Studio, ahora saltas a ese mensaje. La barra de desplazamiento de puntos de Gemini (un punto por cada mensaje que enviaste) también está disponible en AI Studio. Mientras está activada, reemplaza la barra de desplazamiento integrada de AI Studio para que no se superpongan. Tiene su propio espacio a la derecha del chat, así que nunca tapa el texto de los mensajes, y allí es un poco más compacta para encajar con el estilo de AI Studio.

---

## 🐛 Correcciones

- **Datos mezclados entre cuentas de Google**: si usabas varias cuentas de Google en distintas pestañas a la vez, algunos datos podían guardarse en la cuenta equivocada. Fue un error mío y lo siento de verdad. Ahora cada pestaña se mantiene con los datos de su propia cuenta, y la sincronización en segundo plano ya no pasa de una cuenta a otra. Además, en pestañas con una segunda cuenta (las que llevan `/u/1` o similar en la dirección), la sincronización pedía los chats de la cuenta equivocada y fallaba; ahora usa la cuenta de esa pestaña, y un chat que no se puede cargar ya no detiene al resto de la cola.
- **Chats de AI Studio que saltaban arriba**: antes, con solo abrir un chat de AI Studio contaba como actividad, así que subía al principio de la lista. Ahora eso solo ocurre al editar o crear un chat de verdad.
- **Fechas incorrectas en los resultados de búsqueda de AI Studio**: los mensajes de chats antiguos de AI Studio a veces se fechaban según el momento de la sincronización, así que los chats viejos aparecían como nuevos. Está corregido, y los datos existentes se reparan automáticamente.
- **Respuestas del agente en segundo plano en AI Studio**: si cambiabas a otra pestaña mientras el agente esperaba una respuesta, podía agotar el tiempo de espera e indicar que el mensaje no se entregó, aunque la respuesta sí estaba. Ahora espera correctamente mientras la pestaña está en segundo plano.
- **Chats de Gemini que se abrían al principio**: al abrir un chat desde la barra lateral, a veces quedabas al inicio en lugar de en el último mensaje. Ahora llega al último mensaje como se espera.
- **Abrir una Gem desde un chat**: abrir una Gem con un chat abierto podía dejar el chat anterior en pantalla. Ahora el cambio es limpio.
- **Formato del código en línea**: el código en línea de las respuestas ya no muestra comillas invertidas de más.
- **Renombrar Gems**: los nombres de las Gems vienen del propio Gemini, así que pulsar F2 sobre una Gem ya no abre un cuadro de edición que no guardaba nada.

---

## 🧩 Al día con los cambios de Gemini

- **Los chats y mensajes nuevos vuelven a guardarse**: Gemini cambió el formato con el que envía los mensajes y las listas de chats. En pantalla no se nota nada, pero por eso las conversaciones nuevas dejaron de llegar a la barra lateral sin avisar. La extensión ya entiende el nuevo formato, así que los chats, respuestas y títulos nuevos aparecen como antes.
- **La lista de chats, los cambios de nombre y las eliminaciones vuelven a sincronizarse**, igual que tus listas de Gems y cuadernos. La lista de Gems ahora se sincroniza completa en lugar de adivinarse en cada carga de página, así que las Gems sin cambios ya no aparecen como "actualizadas" sin motivo.
- **Los controles de ancho del chat y del campo de entrada** vuelven a funcionar, y los botones de acción bajo cada respuesta se quedan a la izquierda al ensanchar el chat.
- **Las tablas ahora siguen el ancho del chat**, así que la opción aparte de "Ancho automático de tablas" ya no hace falta y se ha eliminado.
- **El ocultado automático del campo de entrada** se rehízo para la nueva zona de entrada. Aparece y desaparece de forma más fiable y ya no se queda a medio mostrar.
- **Deep Research y Canvas** ya no quedan apretados por un ancho mínimo forzado del chat.
- **Los temas** ahora también cubren el resplandor alrededor del campo de entrada de un chat nuevo, así que ya no aparece una mancha oscura en algunos temas oscuros.
- **"Eliminar marca de agua automática" queda desactivado y oculto por ahora**: Gemini ahora tiene su propio ajuste de marca de agua, y en combinación con él, nuestra eliminación podía dejar una marca invertida tenue en imágenes que ya estaban limpias. Desactivarlo me pareció la opción más segura.

---

## 🎨 Pequeños detalles

- **Iconos más discretos**: la barra de iconos y los iconos de acción en las cabeceras de las pestañas ahora se ven un poco más tenues en reposo, y recuperan el color completo al pasar el cursor. La barra lateral se siente menos recargada.
- **Los menús se cierran al instante**: los menús desplegables y contextuales ya no reproducen una animación al cerrarse.
- **Espacio de trabajo**: el estado vacío ahora incluye la opción "Importar carpeta".
- **Página Acerca de**: la información de versión ahora es una tarjeta más ordenada, con la comprobación de actualizaciones en su parte inferior.
- **Una pequeña insignia de agradecimiento**: si tienes un Support Pack o un Power Pack, la ventana emergente ahora muestra una pequeña insignia junto al título. Es mi forma discreta de darte las gracias. Además, el avatar de la barra lateral de todos tiene un nuevo borde suave.

---

Eso es todo por esta vez. Como Gemini sigue cambiando, tanto por fuera como por dentro, puede que haya detalles que todavía no haya visto. Si algo no se ve bien, por favor avísame y lo revisaré. Gracias por estar aquí ☕
