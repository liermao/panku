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
2. Builds frontend output (`panku/index.html`) if missing.
3. Checks `bin/ffmpeg.exe`; if missing, downloads and installs it.
4. Sets user env `FFMPEG_BIN` and appends ffmpeg directory into user `PATH`.
5. Starts backend gateway (`npm run server`) with local ffmpeg.
6. Opens frontend by local HTTP URL (`http://127.0.0.1:8080/`) to avoid `file://` CORS blank page.

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
