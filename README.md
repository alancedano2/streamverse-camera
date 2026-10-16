# StreamVerse Camera

Sistema de transmisión móvil a OBS con Next.js, TypeScript, Tailwind CSS, PeerJS y WebRTC. Esta versión no usa salas ni códigos visibles: la página `/receiver` registra un identificador fijo y `/camera` llama automáticamente al receptor al iniciar la cámara.

## Requisitos

- Node.js 20.9 o posterior y npm.
- Cuenta de Vercel (o alojamiento HTTPS equivalente).
- Conexión a internet.

## Ejecutar en desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en el ordenador. Para probar desde el celular, despliega primero en HTTPS; el navegador requiere HTTPS para permitir cámara y micrófono.

## Desplegar

Sube el proyecto a GitHub e impórtalo en Vercel con los valores predeterminados de Next.js. No requiere variables de entorno para la señalización pública de PeerJS.

## Configurar OBS una sola vez

1. En OBS añade **Fuente de navegador / Browser Source**.
2. URL: `https://TU-DOMINIO/receiver` (sin parámetros ni códigos).
3. Ancho `1920`, alto `1080`.
4. Activa **Controlar el audio mediante OBS** en las propiedades de la fuente.
5. Deja la fuente activa.

Cuando abras `https://TU-DOMINIO/camera` en el celular y pulses **Iniciar cámara y transmitir**, se buscará el Receiver automáticamente. El receptor está diseñado como una superficie limpia de pantalla completa: solo video, sin controles ni texto.

## Importante

- La conexión WebRTC usa el servicio público de señalización de PeerJS y servidores ICE predeterminados; no incluye un servidor TURN dedicado. Algunas redes móviles, Wi-Fi corporativas o NAT estrictos pueden necesitar TURN para conectar de forma fiable.
- El identificador del receptor es fijo (`streamverse-receiver`), por lo que este proyecto está pensado para una instancia de Receiver/OBS a la vez. Si se despliegan varios receptores independientes con el mismo identificador, competirán por el ID.
- La cámara solo puede iniciarse después de que el usuario autorice el acceso en el teléfono.
- Mantén la página del celular abierta y el teléfono desbloqueado durante la transmisión.
- El comportamiento de audio automático depende del navegador y de la configuración de audio de OBS.

## Verificar

```bash
npm run build
```
