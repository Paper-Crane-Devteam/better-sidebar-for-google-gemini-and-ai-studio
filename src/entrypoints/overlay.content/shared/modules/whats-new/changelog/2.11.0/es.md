# Actualización 2.11.0: Paleta de comandos Cmd+K, sincronización silenciosa y Browser Agent

¡Hola a todos! 👋

Aunque este ciclo de desarrollo ha sido relativamente corto, viene cargado de funciones de peso pensadas para llevar la velocidad de trabajo y la automatización al siguiente nivel. ¡Estamos seguros de que les va a encantar!

---

## ⚡ TL;DR (Lo más destacado)

1. **🔄 Sincronización silenciosa en segundo plano**: Olvídate de tener que abrir los chats uno a uno para indexarlos. Búsqueda de texto completo real y sin fisuras entre dispositivos.
2. **⌨️ Paleta de comandos Cmd+K**: Panel de acceso rápido estilo Raycast. Busca en el historial, dentro de los mensajes y ejecuta acciones sin soltar el teclado.
3. **🧩 Barra de iconos lateral personalizable**: Oculta los accesos que no uses y reorganiza los iconos arrastrándolos a tu gusto.
4. **🤖 Browser Agent (Experimental)**: Deduplicación y agrupación inteligente de pestañas, más limpieza a fondo de marcadores. Copias de seguridad automáticas con reversión en un clic.
5. **🎨 Creador de temas en vivo con BetterSidebar Agent**: Describe el estilo con tus propias palabras y el agente lo generará y aplicará al instante.
6. **🛠️ Correcciones y mejoras**: Arreglado el colapso en AI Studio, enrutamiento correcto de carpetas al crear chats y optimización de contraste en el tema Retro Terminal.

---

## 🔥 Novedades en detalle

### 1. 🔄 Sincronización silenciosa de mensajes en segundo plano

- **El problema anterior**: La extensión solo indexaba los mensajes cuando abrías manualmente una conversación. Si cambiabas de ordenador o navegador, las búsquedas no encontraban mensajes de chats que no hubieses visitado localmente.
- **Indexación automática**: Ahora Better Sidebar puede obtener silenciosamente los mensajes históricos en segundo plano para completar el índice de búsqueda local.
- **Control de frecuencia y seguridad**: Para evitar saturar solicitudes y no superar los límites de la API de Google (Rate Limit), esta función viene **desactivada por defecto**. Puedes activarla en Configuración, donde operará a un ritmo moderado y seguro.
- **Panel de estado de sincronización**: Hemos incluido un diálogo donde verás con claridad qué chats están sincronizados y cuáles están pendientes, con la posibilidad de forzar la sincronización manual de cualquier conversación con un solo clic.

### 2. ⌨️ Cmd+K Command Palette: Flujo total desde el teclado

Con la indexación completa de mensajes, la paleta de comandos cobra todo su sentido:
- **Acceso instantáneo**: Pulsa **`Cmd + K`** (o **`Ctrl + K`** en Windows) desde cualquier lugar para abrir la paleta centralizada.
- **Búsqueda multidimensional unificada**:
  - Títulos y descripciones de conversaciones;
  - Búsqueda directa en el texto completo de los mensajes;
  - Acciones rápidas y herramientas de la extensión.
- **Cero ratón**: Navega con las flechas y pulsa Enter para saltar o ejecutar. Diseñado para usuarios avanzados que viven pegados al teclado.

### 3. 🧩 Barra de iconos lateral personalizable y reordenable

A medida que Better Sidebar suma más herramientas, algunos usuarios nos comentaron que preferían una barra más despejada:
- **Elige qué mostrar**: Ahora puedes activar u ocultar libremente los iconos de las herramientas que no utilices a diario.
- **Arrastra para ordenar**: Reorganiza verticalmente los iconos arrastrándolos para colocar tus funciones favoritas donde tu memoria muscular las espera.

### 4. 🤖 Browser Agent: Tu asistente para el navegador (Experimental)

Nos preguntamos: si la IA puede procesar datos y escribir código, ¿por qué no puede ayudarnos a poner orden en nuestro caótico navegador diario?
Si eres de los que acumulan decenas de pestañas hasta no poder leer los títulos, o tienes marcadores desordenados con enlaces rotos desde hace años, Browser Agent es para ti:
- **Limpieza de pestañas**: Detecta y elimina pestañas duplicadas (manteniendo solo una por página) y las agrupa inteligentemente por temática.
- **Organización de marcadores**: Reestructura carpetas caóticas, consolida duplicados y ayuda a depurar enlaces que ya no existen.
- **Copias de seguridad y reversión en un clic**: **La seguridad de tus datos es lo primero.** Antes de aplicar cambios, el agente guarda automáticamente una instantánea del estado de tu navegador. Si el resultado no te convence del todo, puedes **volver al estado anterior con un solo clic**, sin riesgo de pérdidas. (*Nota: Si deseas una capa extra de tranquilidad, siempre puedes exportar manualmente un archivo HTML de respaldo desde el Administrador de Marcadores de Chrome.*)

### 5. 🎨 Creación de temas en tiempo real con BetterSidebar Agent

Antes, personalizar un tema requería copiar prompts, generar un JSON con otra IA y pegarlo manualmente en la configuración.
- Ahora solo tienes que pedírselo a BetterSidebar Agent en el chat:
  > *«Diseña un tema estilo Matrix con fondo negro profundo y detalles en verde neón»* o *«Crea una paleta suave tipo té con leche japonés»*
- ¡El agente generará los estilos y **aplicará el tema de inmediato**!
- ¿Quieres retocarlo? Solo dile: *«Oscurece un poco más el fondo y dale más contraste al borde del cuadro de texto»*. El tema se actualizará en tiempo real. ¡Estrena diseño cada día según tu estado de ánimo!

---

## 🛠️ Corrección de errores

1. **Despliegue/Colapso en AI Studio arreglado**: Adaptado a los recientes cambios de estructura DOM en la interfaz de Google AI Studio.
2. **Enrutamiento de carpetas al crear chats**: Corregido el fallo por el cual los nuevos chats caían siempre en «Inbox» a pesar de tener seleccionada otra carpeta específica.
3. **Ajuste visual del tema Retro Terminal**: Reducida la saturación excesiva para ofrecer un contraste más agradable y cómodo a la vista.

---

¡Muchas gracias por su continuo apoyo y comentarios! Si encuentran cualquier fallo o tienen ideas para próximas versiones, no duden en escribirnos. ¡Que disfruten de la actualización! 🎉
