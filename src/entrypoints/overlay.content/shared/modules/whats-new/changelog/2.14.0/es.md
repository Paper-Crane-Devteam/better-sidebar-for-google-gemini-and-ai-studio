# Actualización 2.14.0: llega el Web Agent y todos reciben 3 días de Power Pack

Hola a todos 👋

¿Recuerdan el Web Agent que adelantamos la última vez, el que puede hacer tareas por ustedes dentro del navegador? Buenas noticias: su extensión complementaria ya superó la revisión de Chrome Web Store. Con esta versión, el Web Agent queda oficialmente abierto para todos.

Para que cualquiera pueda probarlo sin complicaciones, hemos preparado una **prueba gratuita de Power Pack de 3 días para cada usuario**. Pruébenlo primero y decidan después si les convence.

---

## ⚡ Resumen en 30 segundos

1. 🌐 **Llega el Web Agent**: la IA se convierte en un asistente en la barra lateral del navegador que navega por páginas, rellena formularios y extrae datos. Y cada acción importante espera a que tú la confirmes.
2. 🎁 **Prueba de Power Pack de 3 días, sin condiciones**: para usuarios nuevos y actuales. No hace falta código de canje, empieza sola tras la actualización.
3. 📁 **Carpetas para Gems y cuadernos**: carpetas anidadas, fijar elementos y reordenar arrastrando para mantenerlo todo en orden.
4. 🪟 **Un esquema flotante más discreto**: se pliega y se desvanece cuando apartas el ratón, así nunca tapa la conversación.
5. 🐛 **Correcciones y mejoras**: sincronización de chats tras el último rediseño de Gemini, botones de guardado cortados en AI Studio, animación entrecortada al plegar la barra lateral y más.

---

## 🎁 Un regalo para todos: 3 días de Power Pack gratis

Desde la 2.14.0 puedes probar gratis todo lo que ofrece Power Pack, incluido:
* Cuatro agentes, cada uno con su función (BetterSidebar, Workspace, Browser y el nuevo Web Agent)
* Exportación con un clic de chats completos a Notion y Obsidian

**Algunos detalles sobre la prueba:**
- **Nada que configurar**: tras la actualización, la prueba de 3 días empieza sola la primera vez que abras la extensión. Sin método de pago ni código de activación.
- **Consulta tu tiempo cuando quieras**: las horas restantes aparecen en la parte superior de la ventana emergente de la extensión y en la página de Configuración.
- **Una transición suave al terminar**: después de 3 días, la extensión vuelve a la versión gratuita. **Todos los datos, notas y ajustes que crees durante la prueba se quedan a salvo en tu dispositivo.** Si de verdad te ha ayudado en tu día a día, nos alegrará contar con tu apoyo con una licencia. Si algo no te ha convencido, también nos encantará escuchar tus sugerencias.

*(Si ya tienes una licencia de pago de Power Pack, nada cambia para ti. Todo sigue funcionando como antes.)*

---

## 🌐 ¿Qué puede hacer por ti el nuevo Web Agent?

En pocas palabras, el Web Agent es como un asistente de IA sentado a tu lado. Funciona directamente en la barra lateral del navegador, entiende lo que ves en la página actual y realiza acciones según tus instrucciones.

**Usos habituales:**
* **Extraer y organizar información**: convierte datos dispersos de una página larga en una tabla ordenada.
* **Rellenar formularios paso a paso**: completa campo tras campo siguiendo tus indicaciones.
* **Trabajar entre páginas**: cambia entre pestañas del mismo sitio para comparar, o busca directamente en el buscador del propio sitio en lugar de irse a un buscador externo.

### Cómo empezar
1. **Instala la pequeña extensión complementaria**: el Web Agent funciona junto con **[Better Sidebar Web Agent Connector](https://chromewebstore.google.com/detail/dmogbaiecikhmldgdpapobncijaoeamc)**.
   > **¿Por qué una segunda extensión?**
   > Por tu seguridad. El permiso de depuración de bajo nivel necesario para controlar páginas está aislado en esta extensión separada, así que Better Sidebar nunca tiene ese permiso de alto riesgo. Además, el conector está diseñado para **responder solo a órdenes de Better Sidebar**, de modo que nada más puede usarlo.
2. **Da permiso la primera vez**: al iniciarlo por primera vez verás un aviso detallado de riesgos. Léelo con atención antes de aceptar (puedes desactivarlo cuando quieras en Configuración).
3. **Encárgale una tarea**: escribe `>Web` seguido de tu petición en el campo de chat de la barra lateral.
4. **Requisitos**: por ahora, solo Google Chrome.

---

## ⚠️ [Léelo, por favor] Seguridad y aviso legal del Web Agent

Preferimos ser claros desde el principio. El Web Agent es una herramienta afilada: potente, pero con riesgos reales que no conviene pasar por alto. Dedica un minuto a entender lo siguiente antes de usarlo:

- **⚠️ Actúa como tú, con tus cuentas iniciadas**:
  El Web Agent funciona en tu navegador real y usa las cuentas en las que tienes la sesión iniciada. Eso significa que los formularios enviados, los mensajes e incluso las compras en las que haga clic se ven para el sitio web **exactamente como acciones tuyas**. Algunas acciones no se pueden deshacer una vez enviadas.
- **⚠️ Parte del contenido visible de la página se envía a la IA**:
  Para entender una página, el texto, los enlaces y la estructura de formularios que lee se envían como contexto al modelo Gemini (un servicio de Google). Tranquilo: **el contenido de los campos de contraseña (type="password") está protegido y nunca se lee**.
- **⚠️ Cuidado con la inyección de instrucciones desde páginas maliciosas**:
  La web es un lugar complicado. Algunas páginas maliciosas pueden esconder instrucciones dirigidas a modelos de IA para intentar que haga cosas que no querías. **Ten especial cuidado en sitios que no conoces.**
- **🚫 Nunca lo uses en páginas muy sensibles**:
  **No uses** el Web Agent en banca en línea, pagos reales, historiales médicos personales ni páginas de seguridad de la cuenta o cambio de contraseña.
- **👀 La IA no es totalmente fiable, así que quédate a supervisar**:
  El modelo puede malinterpretar lo que hace un botón o la estructura de una página. Por eso hay un seguro incorporado: **cada clic, cada texto introducido y cada script que modifica la página se detiene y espera a que lo revises y lo apruebes antes de ejecutarse.** Quédate frente a la pantalla mientras trabaja.
- **🛑 Siempre hay un botón de parada de emergencia**:
  Mientras el Web Agent controla una página, Chrome muestra arriba una barra del sistema indicando que el navegador se está depurando (p. ej. `"ha empezado a depurar este navegador"`). Si la IA se comporta de forma extraña, pulsa **Cancelar** en esa barra o **cierra el chat actual en la barra lateral**, y toda la automatización se corta al instante.
- **📄 Responsabilidad y condiciones**:
  Tú eres responsable del resultado de cada paso que confirmes, y te pedimos que respetes las condiciones de servicio de los sitios que visitas. Better Sidebar se ofrece "tal cual" y no se hace responsable de las consecuencias directas o indirectas de las acciones realizadas tras tu confirmación.

Puede que estas condiciones suenen algo rígidas y serias, pero ser honestos contigo y exponer los riesgos con claridad es lo mínimo que le debemos a cada usuario.

---

## 📁 Gems y cuadernos: por fin, carpetas

A medida que crecían las colecciones de Gems y cuadernos, muchos nos dijeron que costaba orientarse. Ahora organizarlos es mucho más fácil:

- **Árbol de carpetas**: crea carpetas anidadas, cámbiales el nombre y fija las que más uses.
- **Arrastra para reordenar**: arrastra un Gem o un cuaderno a cualquier carpeta y usa la nueva vista "Orden personalizado" para colocarlo todo a tu gusto.
- **Los selectores siguen tus carpetas**: los diálogos de selección y los menús desplegables de la extensión muestran todo con el mismo árbol de carpetas, así encuentras lo que necesitas enseguida.
- **Protección contra borrados accidentales**: solo se pueden eliminar carpetas vacías, así que un despiste no borrará un grupo entero.

---

## 🪟 Un esquema flotante mejorado

- **Se desvanece al apartar el ratón**: unos segundos después de que el ratón salga del esquema, se pliega en una pequeña barra de título y deja la pantalla a tu conversación. Pasa el ratón por la barra de título y se vuelve a abrir al momento.
- **Fíjalo abierto**: ¿estás leyendo algo largo y quieres que el esquema se quede? Haz clic en el icono de chincheta de la barra de título para mantenerlo desplegado.
- **Un acceso más práctico**: al desplegar la barra de desplazamiento de puntos de la derecha, hay un botón nuevo arriba que abre el esquema flotante con un clic.

---

## 🐛 Correcciones y mejoras

- **Los chats de Gemini vuelven a sincronizarse**: nos adaptamos rápidamente al rediseño que Gemini lanzó el 21 de octubre, y los chats y respuestas nuevos vuelven a sincronizarse con la barra lateral de forma fiable.
- **Botones de guardado y cajón de AI Studio**:
  - Se corrigió que el botón para guardar fragmentos quedara cortado con la barra lateral desplegada o con el área de chat estrecha.
  - Se eliminó un botón que no respondía y aparecía en la burbuja de "Proceso de pensamiento" (Thinking Process) de la IA. El botón de guardado ahora está siempre en la parte superior de cada respuesta.
  - Se corrigió que, con la barra lateral plegada, arrastrar un elemento guardado no abriera el cajón de carpetas.
- **Animación más fluida de la barra lateral de AI Studio**: se rehízo la animación de desplegar y plegar, y ya no hay saltos ni tirones.
- **Aviso de actualización que no se cerraba**: tras actualizarse la extensión en silencio en una pestaña en segundo plano, el aviso de actualización de la página activa a veces no se podía pulsar ni cerrar. Ya está corregido.
- **Un restablecimiento de datos más completo**: "Restablecer datos" en Configuración a veces dejaba metadatos de cuadernos y fragmentos, lo que provocaba errores de sincronización justo después. Ahora lo borra todo de verdad, igual que una instalación nueva.
- **Traducciones completadas**: se revisaron los 12 idiomas incluidos, se añadieron textos que faltaban y se corrigieron varias traducciones automáticas poco naturales.
- **Otros detalles**:
  - La guía para nuevos usuarios incluye ahora pasos sobre Agents, fragmentos, cuadernos y Spark.
  - Las descripciones emergentes (tooltips) se colocan al otro lado cuando no hay espacio junto al borde de la pantalla, y las del esquema muy largas tienen una altura máxima para no salirse de la pantalla.

---

El Web Agent es un paso importante para nosotros hacia los agentes de navegador, y todavía está en una fase temprana de prueba pública. Con tantos sitios web distintos y complejos, seguro que hay casos que aún no hemos cubierto. Si notas un comportamiento extraño en alguna página, o tienes ideas sobre funciones o seguridad, nos encantará leerte en nuestra comunidad:

👉 **Únete a nosotros en Discord**: [Unirse a la comunidad de Discord](https://discord.gg/FRzesxaGAx)

Gracias por acompañarnos todo este camino, y por todos sus comentarios y apoyo ☕
