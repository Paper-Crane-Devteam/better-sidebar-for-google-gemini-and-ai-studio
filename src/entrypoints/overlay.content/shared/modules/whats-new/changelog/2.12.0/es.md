# Actualización 2.12.0: Etiquetas que por fin se abren, "Seguir en un chat nuevo" y un Browser Agent más tranquilo

Hola a todos 👋

Esta es una versión pequeña, más bien de "limar asperezas". Después de lanzar la 2.11.0 seguí usándolo todo a diario, y hubo algunos detallitos que me seguían rondando. Así que aquí están, ya pulidos.

---

## ⚡ TL;DR

1. **🏷️ Etiquetas que se pueden abrir**: Haz clic en una etiqueta para ver todos los chats que la llevan, y cambia de etiqueta, busca, añade o quita etiquetas ahí mismo.
2. **🔀 Seguir en un chat nuevo**: Cuando un chat se alarga demasiado, el BetterSidebar Agent puede resumirlo y abrir un chat nuevo con el resumen esperando en el cuadro de texto.
3. **✨ Atajos de inicio para los agentes**: Elige un agente con `>` y aparece una fila de botones que te muestra lo que puede hacer.
4. **🛡️ Permisos más finos en Browser Agent**: Pestañas y marcadores tienen ahora interruptores separados, y el agente por fin ve todas tus ventanas.
5. **📚 "Archivos" ahora es "Biblioteca"**: Nuevo nombre para la pestaña que guarda todos tus chats. Dentro, todo sigue igual.
6. **🐛 Arreglo en el inicio de sesión de AI Studio**: Se acabó el aviso de "cuenta no detectada" cuando ya habías iniciado sesión.

---

## 🔥 Un poco más sobre lo interesante

### 🏷️ Etiquetas que por fin se abren

Siendo sincero, la pestaña de Etiquetas era un poco un callejón sin salida. Veías tus etiquetas, pero al hacer clic no pasaba nada, así que parecían más decoración que herramienta.

Ahora, al hacer clic en una etiqueta, se abre la lista de todos los chats que la llevan. Desde ahí puedes:

- **Cambiar de etiqueta** desde la cabecera, sin volver a la lista.
- **Buscar dentro de la etiqueta** cuando tiene muchos chats.
- **Quitar un chat de la etiqueta** con un clic, o hacer clic derecho para añadir o quitar otras etiquetas, marcarlo como favorito y más.
- **Mostrar en Biblioteca** para saltar a la carpeta donde están esos chats.

Por fin las etiquetas sirven para encontrar cosas, no solo para ponerles nombre.

### 🔀 Seguir en un chat nuevo

Seguro que conoces la sensación: una conversación se alarga tanto que el modelo empieza a perder el hilo, y empezar de cero significa volver a escribir todo el contexto a mano.

Ahora basta con decirle al BetterSidebar Agent (también hay un botón de atajo): *"Resume este chat y continúalo en un chat nuevo."* Escribe un traspaso con lo que intentas hacer, lo que decidieron y por qué, y lo que sigue pendiente. Luego abre un chat nuevo en una pestaña justo al lado de la actual, con ese resumen esperando en el cuadro de texto.

Algunas cosas que me importaban aquí:

- **No se envía nada solo.** El resumen se queda en el cuadro de texto para que lo leas y lo edites primero.
- **Te pregunta antes de abrir la pestaña**, siempre.
- **La misma cuenta.** Si tienes varias cuentas de Google abiertas, el chat nuevo se abre en la que estás usando ahora.
- **El chat anterior sigue abierto**, por si al resumen se le escapó algo.

### ✨ Atajos de inicio: sabe qué puede hacer un agente en cuanto lo eliges

Después de escribir `>` y elegir un agente, a menudo me quedaba mirando el cursor pensando "Vale… ¿y qué le pido?". Así que ahora aparece una pequeña fila de botones encima del cuadro de texto, por ejemplo:

- **BetterSidebar Agent**: Organizar chats, Buscar chats, Etiquetar chats, Diseñar un tema, Seguir en un chat nuevo…
- **Workspace Agent**: Resumir un archivo, Analizar una hoja, Guardar chat como notas…
- **Browser Agent**: Agrupar pestañas, Buscar duplicados, Guardar esta ventana…

Al hacer clic, se coloca una frase corta a medio terminar, como *"Busca conversaciones sobre "*, para que solo tengas que escribir el resto. Los botones se apartan en cuanto empiezas a escribir. Son un empujoncito, no un guion.

### 🛡️ Browser Agent: permisos más finos y todas tus ventanas

**Interruptores separados para pestañas y marcadores.** Antes los permisos eran solo "organizar" y "eliminar", y cubrían pestañas y marcadores a la vez. Algunos me contaron que les parece bien que la IA ordene pestañas, pero prefieren que no toque los marcadores, y tiene todo el sentido. Ahora hay cuatro interruptores en los ajustes de Browser Agent: Organizar pestañas, Cerrar pestañas, Organizar marcadores y Eliminar marcadores. Activa solo lo que te dé tranquilidad.

**Ahora ve todas las ventanas.** Esto era un fallo mío. Browser Agent solo miraba la ventana de tu conversación, así que si tenías pestañas repartidas en tres ventanas (a mí me pasa siempre 😅), "cierra los duplicados" se dejaba la mayoría. Ahora revisa todas antes de decidir qué es duplicado y te dice en qué ventana ocurre cada cambio. Y si usas Gemini como aplicación instalada en su propia ventana, el agente también lo entiende y trabaja en tus ventanas normales del navegador.

---

## 🛠️ Pequeños detalles y arreglos

- **"Archivos" ahora es "Biblioteca"**: "Archivos" siempre me sonó raro para conversaciones, y "Biblioteca" encaja mejor. La lista de etiquetas también perdió sus iconitos iniciales, así los nombres tienen algo más de espacio.
- **Detección de cuenta en AI Studio**: Tras el rediseño reciente de AI Studio, algunos veían un aviso de "cuenta no detectada" aunque habían iniciado sesión. Perdón por la molestia. Ya está arreglado.

---

Eso es todo por esta vez. Poca cosa, pero ojalá haga el día a día un poco más fluido. Como siempre, si algo no te convence o tienes una idea, me encantará leerte. Gracias por estar aquí ☕
