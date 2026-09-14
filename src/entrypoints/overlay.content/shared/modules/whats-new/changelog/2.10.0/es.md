# Actualización 2.10.0: Entra el Workspace Agent y mejoras de calidad de vida

¡Hola viejos amigos, es hora de otro informe de progreso!

He estado trabajando sin descanso para traerles la versión 2.10.0. Esta vez, no solo he solucionado algunos puntos de dolor sobre los que llevan tiempo comentando, sino que también he lanzado algo "grande": el Workspace Agent. Este es un paso crucial en nuestro camino para convertir esto en un verdadero "monstruo de la productividad", así que vamos a ello.

---

## 🎁 Mejoras en la versión base para todos

Cuando usas algo a diario, la comodidad es lo más importante. He incluido varios ajustes en la versión base para que usar la extensión sea un placer y sin fricciones:

*   **Chats temporales en AI Studio**: Algunos me comentaron que a veces solo quieren probar algo rápido sin dejar rastro. ¡Hecho! Los nuevos chats ya no se guardarán en el árbol de archivos (aunque, para ser honesto, se siguen guardando en AI Studio Drive, solo simulamos un chat temporal en la interfaz). También corregí un pequeño bug donde los chats temporales en Gemini creaban entradas basura en las carpetas.
*   **Modo Compacto ultra limpio**: Si eres como yo y quieres quitar todos los botones innecesarios de la pantalla mientras trabajas, ¡ahora puedes ocultar completamente la barra de iconos lateral! La interfaz queda súper limpia al instante, reduciendo a la mitad la carga cognitiva. Ideal para el trabajo profundo.
*   **Ratón y atajos más fluidos**: El botón de 'Nuevo Chat' ahora soporta clic con la rueda del ratón; un clic y se abre directamente en una nueva pestaña. Además, la memoria muscular manda: por fin puedes usar F2 para renombrar y Suprimir para borrar archivos.
*   **Encuentra carpetas al instante**: He añadido una función de búsqueda en el popup de selección de carpetas. Por muchos archivos que tengas, lo encontrarás en un segundo.
*   **Un bug solucionado**: Corregido un fallo donde el smartscrollbar de la derecha a veces desordenaba los chats al hacer "branch chat" en Gemini.

---

## 🔥 El Plato Principal: Workspace Agent (Deja que la IA haga el trabajo)

¡Esto es sin duda lo que más me emociona de esta actualización! Siempre he pensado que chatear no es suficiente; la IA debería hacer el trabajo por mí. ¡Por eso ha llegado el Workspace Agent!

**¿Cómo se usa? Súper fácil:** Está justo al lado del BetterSidebar Agent de siempre. Solo tienes que escribir un símbolo `>` en la caja de texto para activar el Workspace Agent. Puedes arrastrar tus archivos locales directamente al espacio de trabajo para que trabaje sobre ellos; **o mejor aún: ¡no necesitas subir ningún archivo y puedes pedirle a la IA que cree proyectos nuevos desde cero!**

Tanto si quieres retocar archivos existentes como si deseas crear algo desde la nada, lo gestiona a la perfección. **¿Qué puede hacer exactamente? Te doy algunos ejemplos reales:**

*   **📝 El salvador de Tesis/Informes (Soporta Word `.docx`)**
    Puedes arrastrar tus 50 páginas de `thesis.docx` y pedir a la IA que pula párrafos específicos. Y aquí viene lo mejor: **no sobrescribirá tu archivo a lo bruto**. Actúa como un mentor, añadiendo **comentarios** donde hay problemas, o usando el modo de **Control de Cambios** (Tracked Changes) para reescribir. El formato y las referencias que tanto te ha costado ajustar no se desordenarán en absoluto, solo tienes que ir aceptando/rechazando en Word.
*   **📊 Maestro del análisis de datos (Soporta Excel `.xlsx` / `.csv`)**
    Lánzale `data.xlsx` para que haga análisis estadístico. No solo entiende tus cabeceras, sino que es lo suficientemente inteligente como para **insertar nuevas columnas y escribir fórmulas de Excel reales**, en lugar de darte un montón de números fijos. Tus gráficos y el formato condicional de la tabla original no se verán afectados.
*   **🎬 El mejor amigo del creador de vídeos (Soporta Subtítulos `.srt`, `.vtt`, `.ass`)**
    Puedes pedirle que traduzca o pula tus archivos de subtítulos. Lo más genial es que sabe que la línea de tiempo es sagrada. Después de traducir, **no destruirá ni un milisegundo de la línea de tiempo**, ya no tienes que preocuparte de que los subtítulos no coincidan con las voces.
*   **📚 Revisión y anotación de literatura (Soporta PDF)**
    Arrastra un PDF, y aunque debido a las limitaciones del formato no puede editar el texto principal directamente, puede extraer información e incluso **resaltar puntos clave y añadir notas adhesivas** directamente sobre el PDF.
*   **🪧 Asistente de Presentaciones (Soporta PPT `.pptx`)**
    Soporta leer el contenido de las diapositivas, reemplazar texto, modificar notas del orador, e incluso puede ayudarte a reorganizar el orden de las diapositivas.
*   **💻 El favorito de programadores y escritores: ¡No solo edita, crea desde cero! (Soporta texto plano, `.md` y todos los archivos de código)**
    Este es el punto que muchos malinterpretan: **¡no asumas que tienes que subir un archivo antes de que la IA pueda hacer algo!**
    Para todos los archivos de texto y código (HTML, CSS, JS/TS, Python, Markdown, etc.), la IA no solo puede realizar ediciones y refactorizaciones precisas, **sino que puede estructurar y crear proyectos completamente nuevos desde cero**. Por ejemplo, dile: "Créame una app completa de tareas en React desde cero", y creará el HTML, componentes, estilos y configuraciones directamente dentro de tu espacio de trabajo. ¡Un proyecto frontend completo montado en minutos!
 
**¿Te has dado cuenta? Su mayor ventaja es: ¡no estropea tu formato!** Gracias al soporte subyacente especializado en formatos de documentos, ya sea modificando Word o Excel, los estilos originales están perfectamente protegidos. Así es como debería ser una verdadera herramienta de productividad.

*   **Sobre los límites de soporte de formatos**: Los archivos de texto y código se pueden crear desde cero y editar libremente. Los formatos complejos (Word, Excel, PPT, PDF) actualmente se centran en **leer, anotar y modificar con precisión archivos ya existentes** (garantizando que el formato, gráficos y fórmulas no se alteren); actualmente no se admite la creación desde cero de estos formatos binarios complejos.
*   **Un pequeño lamento y una promesa**: Debido a las limitaciones del entorno de las extensiones de navegador, para procesar documentos de Word o Excel existentes actualmente es necesario arrastrarlos al espacio de trabajo; asimismo, la vista previa enriquecida dentro de la barra lateral aún no está disponible (se pueden descargar o abrir externamente). He tomado nota de estos inconvenientes y buscaremos mejorarlo.
*   **Contáctame si tienes problemas**: Actualmente esta función está en fase Beta. Si te encuentras con algún bug al usarlo, o algo te parece anti-intuitivo, dame feedback en cualquier momento, ¡te prometo soluciones a la velocidad de la luz!

---

## 🚀 Bienvenidos, Power Users (Sobre el Powerpack)

Si eres un usuario intensivo (Power user) que depende en gran medida de la productividad de la IA, la forma completa del Workspace Agent es algo que debes tener.

*   **Desatado**: En Powerpack, no hay límite en el número de espacios de trabajo y archivos. Dale con todo.
*   **AI Studio se pone al día**: Ahora AI Studio también soporta funciones completas de Agent, teniendo exactamente la misma experiencia de Agent que Gemini.
*   **Agent es más inteligente**: He vuelto a optimizar las instrucciones de sistema del Agent. Ahora es mucho más interactivo, discutirá las cosas contigo, ya no ejecutará tareas a ciegas por su cuenta como antes, entiende mejor tu verdadera intención.

🤫 **Consejo egoísta (un pequeño momento de venta)**: El Workspace Agent está actualmente en periodo Beta. Una vez que termine la prueba y la función se estabilice, el Powerpack subirá de precio. Así que, comprarlo ahora es un acierto seguro, no solo lo disfrutas antes, sino que te ahorras un dinero. ¡Tómatelo como un apoyo para que siga trabajando hasta tarde!

---

## 🎨 Por último, ropa nueva para tu estado de ánimo (Temas)

A veces, cambiar a un tema bonito mejora tu estado de ánimo para escribir código o leer documentos.

*   **Añadidos 6 temas preciosos** (incluidos en el pack de temas de Supportpack): Te garantizo una experiencia más agradable mientras trabajas.
*   **Selector de color más cómodo**: Ya no tienes que ir hasta el panel de configuración para buscarlo, ahora puedes seleccionar el estilo de color personalizado directamente desde el menú desplegable de carpetas.
*   **Optimización de la interfaz**: Se corrigió el problema con el color de fondo incorrecto de la barra lateral en el tema de AI Studio, por fin se ve bien. Al mismo tiempo, se añadió la visualización del avatar de la cuenta en la barra lateral, un gran acierto para los usuarios con múltiples cuentas, ahora puedes ver claramente tu estado de inicio de sesión de un vistazo, y cambiar de cuenta es más conveniente.

¡Eso es todo por el 2.10.0! Crear un plugin es un proceso continuo de prueba y error, de pulir el producto junto a ustedes, los usuarios amigos. Si hay algo que no les gusta usar, ya conocen las reglas: ¡avísenme en cualquier momento!
