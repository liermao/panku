# panku

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Customize configuration

See [Vite Configuration Reference](https://vitejs.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

## Windows One-Click Startup

After cloning the project, double-click:

```text
start-windows.cmd
```

What it does automatically:

1. Installs npm dependencies if missing.
2. Builds frontend output only when source has changed or `panku/index.html` is missing.
3. Checks `bin/ffmpeg.exe`; if missing, downloads and installs it.
4. Sets user env `FFMPEG_BIN` and appends ffmpeg directory into user `PATH`.
5. Restarts backend gateway on port `8080` (`npm run server`) with local ffmpeg.
6. Probes the first camera via backend API and prints diagnostics in terminal when probe fails.
7. Sends startup notification to WeCom webhook.
8. Opens frontend by local HTTP URL (`http://127.0.0.1:8080/`) in fullscreen mode (Edge preferred, Chrome fallback).

### Stream Engine Fallback

Backend supports:

- `STREAM_ENGINE=ffmpeg` (default behavior)
- `STREAM_ENGINE=vlc` (force VLC engine)
- `STREAM_ENGINE=auto` (ffmpeg first, then VLC fallback when VLC is installed)

`start-windows.cmd` defaults to `STREAM_ENGINE=vlc` when VLC is detected on Windows, otherwise uses `auto`.

VLC binary detection on Windows:

- `C:\Program Files\VideoLAN\VLC\vlc.exe`
- `C:\Program Files (x86)\VideoLAN\VLC\vlc.exe`

Or set explicit path:

```text
VLC_BIN=your\path\to\vlc.exe
```

If you want to force rebuild once, run:

```text
start-windows-rebuild.cmd
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
