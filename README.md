# Telegram · Archivo local

Extensión para **Brave y Chrome de escritorio**. Guarda vídeos, prepara una cola con tu selección y crea copias de grupos organizadas en carpetas por tema.

**[♡ Apoya al creador en PayPal](https://paypal.me/jhonanthony229)**

## Cuatro formas de guardar

| Sección | Para qué sirve |
| --- | --- |
| Vídeo abierto · azul | Guarda el vídeo que estás viendo o añádelo a Mi cola. |
| Mi cola · violeta | Descarga solo tu selección, en tandas de 10, 20, 40, 60, 100 o todos. |
| Grupo / tema · verde | Descarga vídeos del tema abierto o del grupo, con cantidad, orden y punto de inicio. |
| Respaldo · ámbar | Crea y actualiza una copia del grupo con carpetas por temas y tipos de archivo. |

La opción pequeña «Imagen» del pie guarda la imagen abierta desde sus datos locales, sin capturas de pantalla ni recompresión.

## Instalar en Brave

1. Descarga y descomprime el proyecto en una carpeta permanente.
2. Abre `brave://extensions` y activa **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta que contiene `manifest.json`.
4. Abre [Telegram Web K](https://web.telegram.org/k/), inicia tu sesión y recarga la pestaña.
5. Pulsa **Guardar**, en la esquina inferior derecha.

En Chrome se usa `chrome://extensions`. No necesitas instalar Node, Python ni otro programa para utilizar la extensión.

Para actualizar una instalación anterior, detén las descargas, reemplaza sus archivos **en la misma carpeta**, recarga la extensión y pulsa F5 en Telegram. Las tandas y la selección conservan sus claves de almacenamiento. La nueva versión no usa el antiguo subidor automático ni espera sus archivos de control.

## Crear una copia por temas

1. Abre el grupo en Telegram Web K.
2. En la extensión, entra en **Respaldo** y pulsa **Cargar temas del grupo**.
3. Elige todos los temas o marca algunos. General también está incluido.
4. Marca qué quieres conservar: vídeos, imágenes, audios, documentos y/o mensajes. Los mensajes incluyen las descripciones.
5. Opcionalmente abre **Fechas y velocidad**. Las fechas usan el horario de la PC.
6. Pulsa **Elegir carpeta y crear copia**. Puedes elegir un disco externo.

La copia crea una carpeta del grupo con su nombre y sus identificadores. Dentro, cada tema tiene su carpeta y las subcarpetas correspondientes:

| Carpeta o archivo | Contenido |
| --- | --- |
| `000101 - Clases/Vídeos/` | Vídeos con fecha, mensaje e identificador estables. |
| `000101 - Clases/Imágenes/` | La mayor versión de foto descargable que ofrece Telegram. |
| `000101 - Clases/Audios/` | Audios y notas de voz. |
| `000101 - Clases/Documentos/` | Archivos de otros tipos. |
| `000101 - Clases/Mensajes/` | Mensajes por bloques: texto legible y JSON. |
| `000101 - Clases/Tema.json` | Identidad y título actual del tema. |
| `Telegram-respaldo.json` | Registro del respaldo, archivos previstos y completos. |
| `Ultimo-resumen.json` | Resultado del último recorrido y sus avisos. |

Los nombres empiezan por la fecha UTC para conservar un orden estable entre equipos. Los identificadores distinguen archivos con el mismo nombre. Las carpetas existentes se conservan aunque cambie el título del grupo o del tema; su nuevo título queda en el registro.

### Continuar y actualizar

Puedes pausar o detener la copia. Después usa **Continuar / actualizar esta copia**. Tras cerrar el navegador, vuelve a elegir la carpeta del respaldo o la carpeta padre donde se creó.

Solo se confirma un archivo después de cerrarlo completamente y guardar su progreso. Si interrumpes un archivo, ese archivo se descarga otra vez desde el principio; los terminados se comprueban y se omiten. Si falta un archivo o su tamaño no coincide, se intenta recuperar.

La actualización vuelve a consultar el historial y descarga los archivos que falten. Si elegiste todos los temas, también incorpora temas nuevos. Las copias anteriores no se borran porque desaparezca un mensaje de Telegram. Los mensajes editados se actualizan en los bloques de texto y JSON.

Conserva `Telegram-respaldo.json` y la estructura de carpetas. Es un registro distinto del `Telegram-progreso.json` de las tandas anteriores. El respaldo comprueba los archivos de su propia carpeta; no presupone que un vídeo descargado en otra ubicación ya está incluido.

### Alcance

La copia incluye el historial accesible para tu cuenta y los adjuntos compatibles. Los mensajes se conservan como texto y datos; no hay un visor HTML ni una función para reconstruir un grupo idéntico dentro de Telegram. Los adjuntos temporales o no compatibles se notifican en los avisos. No se recuperan mensajes borrados antes del respaldo.

Mantén abiertos la PC, Brave/Chrome y la pestaña de Telegram mientras trabaja. Al apagar o suspender la PC el trabajo se interrumpe, y puede continuar al volver. Los respaldos conservan los archivos en el disco y no realizan subidas ni borrados automáticos.

## Velocidad

Conservadora usa 1 parte simultánea; Equilibrada 4; Rápida 8 e Intensiva 16. Se descarga un archivo cada vez, escribiendo sus partes en orden y con una ventana de memoria acotada. Premium se utiliza a través de tu sesión habitual; la velocidad real depende también de Telegram, tu conexión, la PC y el disco. Se respetan las esperas solicitadas por el servidor.

## Privacidad y permisos

La extensión solicita únicamente `storage` y se ejecuta en `web.telegram.org`. Los mensajes del respaldo se escriben en la carpeta elegida, no en el almacenamiento de Chrome. La extensión no recopila telemetría, no tiene servidor, no pide credenciales ni claves de Telegram y no envía tu contenido al creador. PayPal solo se abre cuando pulsas el enlace de apoyo; donar es opcional y no habilita funciones adicionales.

Es una herramienta independiente, sin afiliación con Telegram. Las funciones de cola, tandas y respaldo requieren Web K y dependen de sus interfaces internas. La descarga individual mantiene compatibilidad con Web K y Web A. Una actualización de Telegram puede requerir ajustar el adaptador.

## Desarrollo y pruebas

Requiere Node.js 22 o posterior, solo para desarrollo:

```sh
npm ci
npm run check
npm test
```

Para cambiar el diseño, edita `panel.html` o `panel.css` y ejecuta `npm run build`. Los archivos compilados se incluyen en el proyecto y se verifican con `npm run check`.

Las pruebas usan la interfaz real de la extensión, sesiones y disco simulados. Cubren separación por temas, medios, mensajes, interrupciones, actualización, nombres, permisos, paginación, cuentas y descargas por partes. No inician sesión ni envían mensajes a Telegram. El ensayo opcional `pruebas/browser.test.cjs` necesita Playwright y Chrome por separado; no forma parte de `npm test`.

GitHub Actions ejecuta las comprobaciones y pruebas en cada push y pull request. El enlace de apoyo también está configurado en `.github/FUNDING.yml`.

Licencia MIT. Lee [LICENSE.txt](LICENSE.txt).
