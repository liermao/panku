import cors from 'cors'
import express from 'express'
import crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const app = express()
const PORT = Number(process.env.PORT || 8080)
const HOST = process.env.HOST || '0.0.0.0'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const APP_ROOT = process.env.APP_ROOT || path.resolve(__dirname, '..')
const LOCAL_FFMPEG_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const LOCAL_FFMPEG_BIN = path.resolve(APP_ROOT, 'bin', LOCAL_FFMPEG_NAME)
const FFMPEG_BIN = process.env.FFMPEG_BIN || (existsSync(LOCAL_FFMPEG_BIN) ? LOCAL_FFMPEG_BIN : 'ffmpeg')
function resolveVlcBin() {
  const explicit = (process.env.VLC_BIN || '').trim()
  if (explicit && existsSync(explicit)) {
    return explicit
  }

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return ''
}
const VLC_BIN = resolveVlcBin()
const STREAM_ENGINE = (process.env.STREAM_ENGINE || 'auto').trim().toLowerCase()
const STREAM_ENGINE_NORMALIZED = ['ffmpeg', 'vlc', 'auto', 'auto-vlc', 'vlc-auto'].includes(STREAM_ENGINE)
  ? STREAM_ENGINE
  : 'auto'
const HLS_ROOT = process.env.HLS_ROOT || path.resolve(APP_ROOT, 'public', 'hls')
const FRONTEND_ROOT = process.env.FRONTEND_ROOT || path.resolve(APP_ROOT, 'panku')
const WEATHER_LATITUDE = Number(process.env.WEATHER_LATITUDE || 30.6677)
const WEATHER_LONGITUDE = Number(process.env.WEATHER_LONGITUDE || 104.1176)
const WEATHER_TIMEZONE = process.env.WEATHER_TIMEZONE || 'Asia/Shanghai'
const WEATHER_LOCATION = process.env.WEATHER_LOCATION || '成华区'
const WEATHER_TIMEOUT_MS = Number(process.env.WEATHER_TIMEOUT_MS || 8000)

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use((req, _res, next) => {
  if (req.method === 'POST' && req.path === '/api/stream/start') {
    metrics.startRequests += 1
  }
  if (req.path.startsWith('/hls/')) {
    metrics.hlsRequests += 1
  }
  next()
})
app.use('/hls', express.static(HLS_ROOT, { acceptRanges: false }))
app.use(express.static(FRONTEND_ROOT, {
  index: false,
  setHeaders: (res, filePath) => {
    const normalized = filePath.replace(/\\/g, '/')
    if (normalized.endsWith('/index.html') || normalized.endsWith('/runtime-config.json')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    }
  }
}))
app.use((error, _req, res, next) => {
  if (error?.status === 416) {
    return res.status(200).end()
  }
  return next(error)
})

const streams = new Map()
const startingStreams = new Map()
const streamStartCooldown = new Map()
const metrics = {
  startRequests: 0,
  startThrottled: 0,
  hlsRequests: 0
}

const START_COOLDOWN_MS = Number(process.env.START_COOLDOWN_MS || 1500)
const STREAM_WARMUP_MS = Number(process.env.STREAM_WARMUP_MS || 12000)
const STREAM_PENDING_MAX_MS = Number(process.env.STREAM_PENDING_MAX_MS || 45000)
const STALE_SWEEP_INTERVAL_MS = Number(process.env.STALE_SWEEP_INTERVAL_MS || 10000)

function createStreamId(rtspUrl) {
  return crypto.createHash('sha1').update(rtspUrl).digest('hex').slice(0, 12)
}

function getPlaylistPath(streamId) {
  return path.join(HLS_ROOT, streamId, 'index.m3u8')
}

async function hasPlaylist(streamId) {
  const playlistPath = getPlaylistPath(streamId)
  try {
    const stat = await fs.stat(playlistPath)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

function getTransportAttempts() {
  return process.env.RTSP_TRANSPORTS
    ? process.env.RTSP_TRANSPORTS.split(',').map((item) => item.trim()).filter(Boolean)
    : ['tcp']
}

function getCodecAttempts() {
  return process.env.FFMPEG_VIDEO_CODEC_CANDIDATES
    ? process.env.FFMPEG_VIDEO_CODEC_CANDIDATES.split(',').map((item) => item.trim()).filter(Boolean)
    : ['libx264']
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function tailText(text, maxLines = 12) {
  const lines = stripAnsi(text || '').trim().split('\n').filter(Boolean)
  return lines.slice(-maxLines).join('\n')
}

function buildGatewayError(message, diagnostics = []) {
  const error = new Error(message)
  error.diagnostics = diagnostics
  return error
}

function mapWeatherCode(code) {
  const map = {
    0: '晴',
    1: '晴间多云',
    2: '局部多云',
    3: '阴',
    45: '雾',
    48: '雾凇',
    51: '小毛毛雨',
    53: '毛毛雨',
    55: '大毛毛雨',
    56: '小冻毛毛雨',
    57: '大冻毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '小冻雨',
    67: '大冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '小阵雨',
    81: '中阵雨',
    82: '大阵雨',
    85: '小阵雪',
    86: '大阵雪',
    95: '雷阵雨',
    96: '雷雨夹冰雹',
    99: '强雷雨夹冰雹'
  }
  return map[code] || '未知天气'
}

async function fetchJsonWithTimeout(url, timeoutMs = WEATHER_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`status_${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function getWeatherFromOpenMeteo() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LATITUDE}&longitude=${WEATHER_LONGITUDE}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}&forecast_days=1`
  const data = await fetchJsonWithTimeout(url)
  const current = data?.current || {}
  const temperature = Number(current.temperature_2m)
  const weatherCode = Number(current.weather_code)

  if (!Number.isFinite(temperature)) {
    throw new Error('invalid_temperature')
  }

  return {
    location: WEATHER_LOCATION,
    temperature,
    description: Number.isFinite(weatherCode) ? mapWeatherCode(weatherCode) : '未知天气',
    source: 'open-meteo'
  }
}

async function getWeatherFromWttr() {
  const url = `https://wttr.in/${encodeURIComponent(WEATHER_LOCATION)}?format=j1`
  const data = await fetchJsonWithTimeout(url)
  const current = Array.isArray(data?.current_condition) ? data.current_condition[0] : null
  const area = Array.isArray(data?.nearest_area) ? data.nearest_area[0] : null
  const areaName = Array.isArray(area?.areaName) ? area.areaName[0]?.value : ''
  const desc = Array.isArray(current?.weatherDesc) ? current.weatherDesc[0]?.value : ''
  const temperature = Number(current?.temp_C)

  if (!Number.isFinite(temperature)) {
    throw new Error('invalid_temperature')
  }

  return {
    location: areaName || WEATHER_LOCATION,
    temperature,
    description: desc || '天气未知',
    source: 'wttr.in'
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function resetDir(dir) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

function buildPlayUrl(req, streamId) {
  const protocol = req.protocol
  const host = req.get('host')
  return `${protocol}://${host}/hls/${streamId}/index.m3u8`
}

function stopStreamById(streamId) {
  const record = streams.get(streamId)
  if (!record) {
    return false
  }

  if (!record.ffmpeg.killed) {
    record.ffmpeg.kill('SIGTERM')
  }

  streams.delete(streamId)
  streamStartCooldown.delete(streamId)
  return true
}

async function sweepStaleStreams() {
  const now = Date.now()
  for (const [streamId, record] of streams.entries()) {
    if (!record || record.ffmpeg.killed) {
      continue
    }

    const runningForMs = Math.max(0, now - (record.startedAt || now))
    if (runningForMs < STREAM_PENDING_MAX_MS) {
      continue
    }

    const playlistReady = await hasPlaylist(streamId)
    if (playlistReady) {
      continue
    }

    record.lastError = record.lastError || `stale_stream_no_playlist_${runningForMs}ms`
    stopStreamById(streamId)
  }
}

function buildFfmpegArgs(rtspUrl, transport, outputArgs, timeoutOptionOverride = null) {
  const transportArgs = transport === 'auto' ? [] : ['-rtsp_transport', transport]
  const timeoutUs = process.env.FFMPEG_RW_TIMEOUT_US || '15000000'
  const timeoutOption = timeoutOptionOverride !== null ? timeoutOptionOverride : process.env.FFMPEG_TIMEOUT_OPTION || 'rw_timeout'
  const timeoutArgs = timeoutOption ? [`-${timeoutOption}`, timeoutUs] : []
  return [
    '-hide_banner',
    '-loglevel',
    process.env.FFMPEG_LOG_LEVEL || 'warning',
    ...timeoutArgs,
    ...transportArgs,
    '-i',
    rtspUrl,
    ...outputArgs
  ]
}

function isVlcEnabled() {
  return Boolean(VLC_BIN) && STREAM_ENGINE_NORMALIZED !== 'ffmpeg'
}

function isFfmpegEnabled() {
  return STREAM_ENGINE_NORMALIZED !== 'vlc'
}

function shouldTryVlcFirst() {
  if (!isVlcEnabled()) {
    return false
  }
  return STREAM_ENGINE_NORMALIZED === 'vlc' || STREAM_ENGINE_NORMALIZED === 'auto-vlc' || STREAM_ENGINE_NORMALIZED === 'vlc-auto'
}

function buildVlcArgs(rtspUrl, playlistPath, segmentPattern) {
  const segLen = process.env.HLS_TIME || '2'
  const numSegs = process.env.HLS_LIST_SIZE || '12'
  const cachingMs = process.env.VLC_NETWORK_CACHING_MS || '1200'
  const playlistNorm = playlistPath.replace(/\\/g, '/')
  const segmentNorm = segmentPattern.replace(/\\/g, '/')
  const indexUrl = 'segment_%04d.ts'
  const transcode = process.env.VLC_TRANSCODE || 'transcode{vcodec=h264,vb=1800,acodec=none}'
  const sout = `#${transcode}:std{access=livehttp{seglen=${segLen},delsegs=true,numsegs=${numSegs},index=${playlistNorm},index-url=${indexUrl}},mux=ts,dst=${segmentNorm}}`

  return [
    '-I',
    'dummy',
    '--no-video-title-show',
    '--rtsp-tcp',
    '--network-caching',
    cachingMs,
    rtspUrl,
    '--sout',
    sout,
    '--sout-keep'
  ]
}

async function startStreamWithVlc(rtspUrl, outDir, streamId, waitTimeoutMs) {
  const playlistPath = path.join(outDir, 'index.m3u8')
  const segmentPattern = path.join(outDir, 'segment_%04d.ts')
  await resetDir(outDir)

  const args = buildVlcArgs(rtspUrl, playlistPath, segmentPattern)
  const vlc = spawn(VLC_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let logBuffer = ''

  const record = {
    streamId,
    rtspUrl,
    outDir,
    ffmpeg: vlc,
    engine: 'vlc',
    startedAt: Date.now(),
    lastError: '',
    transport: 'tcp',
    codec: 'h264',
    timeoutOption: '(vlc)'
  }

  const onLog = (chunk) => {
    logBuffer += chunk.toString()
    if (logBuffer.length > 16384) {
      logBuffer = logBuffer.slice(-16384)
    }
    record.lastError = tailText(logBuffer)
  }
  vlc.stdout.on('data', onLog)
  vlc.stderr.on('data', onLog)

  vlc.on('error', (error) => {
    record.lastError = error?.message || 'vlc 进程启动失败'
  })

  vlc.on('exit', () => {
    if (streams.get(streamId)?.ffmpeg === vlc) {
      streams.delete(streamId)
    }
  })

  streams.set(streamId, record)

  const startAt = Date.now()
  while (Date.now() - startAt < waitTimeoutMs) {
    try {
      await fs.access(playlistPath)
      return { record, pending: false }
    } catch {
      if (vlc.killed || vlc.exitCode !== null) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
  }

  if (!vlc.killed && vlc.exitCode === null) {
    vlc.kill('SIGTERM')
  }
  streams.delete(streamId)

  throw buildGatewayError('VLC 引擎启动超时，未生成播放清单', [{
    transport: 'tcp',
    codec: 'h264',
    timeoutOption: '(vlc)',
    message: record.lastError || `VLC 已连接但 ${waitTimeoutMs}ms 内未返回可播放数据`
  }])
}

async function runProbe(rtspUrl, transport, timeoutMs, timeoutOption = null) {
  const args = buildFfmpegArgs(rtspUrl, transport, ['-map', '0:v:0', '-an', '-frames:v', '1', '-f', 'null', '-'], timeoutOption)
  const ffmpeg = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderrBuffer = ''

  ffmpeg.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString()
    if (stderrBuffer.length > 8192) {
      stderrBuffer = stderrBuffer.slice(-8192)
    }
  })

  return await new Promise((resolve) => {
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGTERM')
      }
      finish({
        transport,
        ok: false,
        reason: 'timeout',
        log: tailText(stderrBuffer)
      })
    }, timeoutMs)

    ffmpeg.on('error', (error) => {
      finish({
        transport,
        ok: false,
        reason: 'spawn_error',
        log: error?.message || 'ffmpeg 进程启动失败'
      })
    })

    ffmpeg.on('exit', (code, signal) => {
      const ok = code === 0
      finish({
        transport,
        ok,
        reason: ok ? 'ok' : `exit_${code ?? signal ?? 'unknown'}`,
        log: tailText(stderrBuffer)
      })
    })
  })
}

async function startStream(rtspUrl, outDir, streamId) {
  const playlistPath = path.join(outDir, 'index.m3u8')
  const segmentPattern = path.join(outDir, 'segment_%04d.ts')
  const waitTimeoutMs = Number(process.env.STREAM_READY_TIMEOUT_MS || 20000)
  const transportAttempts = getTransportAttempts()
  const codecAttempts = getCodecAttempts()
  const diagnostics = []

  const timeoutOptions = (process.env.FFMPEG_TIMEOUT_OPTION_CANDIDATES || 'rw_timeout')
    .split(',')
    .map((item) => item.trim())
  const timeoutCandidates = timeoutOptions.length ? timeoutOptions : ['']

  const ffmpegEnabled = isFfmpegEnabled()
  const vlcEnabled = isVlcEnabled()
  const vlcFirst = shouldTryVlcFirst()

  if (STREAM_ENGINE_NORMALIZED === 'vlc' && !VLC_BIN) {
    throw buildGatewayError('STREAM_ENGINE=vlc 但未检测到 VLC，请安装 VLC 或改为 auto 模式', [])
  }

  if (!ffmpegEnabled && !vlcEnabled) {
    throw buildGatewayError('未检测到可用推流引擎，请检查 ffmpeg/VLC 配置', [])
  }

  if (vlcFirst) {
    try {
      return await startStreamWithVlc(rtspUrl, outDir, streamId, waitTimeoutMs)
    } catch (error) {
      diagnostics.push(...(Array.isArray(error?.diagnostics) ? error.diagnostics : [{
        transport: 'tcp',
        codec: 'h264',
        timeoutOption: '(vlc)',
        message: error?.message || 'VLC 启动失败'
      }]))
      if (!ffmpegEnabled) {
        throw buildGatewayError('等待播放清单超时，请检查 RTSP 地址和网络连通性', diagnostics)
      }
    }
  }

  if (ffmpegEnabled) {
    for (const timeoutOption of timeoutCandidates) {
    for (const codec of codecAttempts) {
      for (const transport of transportAttempts) {
    await resetDir(outDir)

    const codecArgs = codec === 'copy'
      ? ['-c:v', 'copy']
      : [
          '-c:v',
          codec,
          '-preset',
          process.env.FFMPEG_PRESET || 'ultrafast',
          '-tune',
          process.env.FFMPEG_TUNE || 'zerolatency',
          '-profile:v',
          process.env.FFMPEG_PROFILE || 'baseline',
          '-g',
          process.env.FFMPEG_GOP || '50',
          '-keyint_min',
          process.env.FFMPEG_KEYINT_MIN || '50',
          '-sc_threshold',
          process.env.FFMPEG_SC_THRESHOLD || '0'
        ]

    const args = buildFfmpegArgs(rtspUrl, transport, [
      '-map',
      '0:v:0',
      '-an',
      ...codecArgs,
      '-f',
      'hls',
      '-hls_time',
      process.env.HLS_TIME || '2',
      '-hls_list_size',
      process.env.HLS_LIST_SIZE || '12',
      '-hls_flags',
      process.env.HLS_FLAGS || 'independent_segments',
      '-hls_segment_filename',
      segmentPattern,
      playlistPath
    ], timeoutOption)

    const ffmpeg = spawn(FFMPEG_BIN, args, {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderrBuffer = ''

    const record = {
      streamId,
      rtspUrl,
      outDir,
      ffmpeg,
      startedAt: Date.now(),
      lastError: '',
      transport,
      codec,
      timeoutOption: timeoutOption || '(none)'
    }

    ffmpeg.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString()
      if (stderrBuffer.length > 16384) {
        stderrBuffer = stderrBuffer.slice(-16384)
      }
      record.lastError = tailText(stderrBuffer)
    })

    ffmpeg.on('error', (error) => {
      record.lastError = error?.message || 'ffmpeg 进程启动失败'
    })

    ffmpeg.on('exit', () => {
      if (streams.get(streamId)?.ffmpeg === ffmpeg) {
        streams.delete(streamId)
      }
    })

    streams.set(streamId, record)

    const startAt = Date.now()
    let success = false

    while (Date.now() - startAt < waitTimeoutMs) {
      try {
        await fs.access(playlistPath)
        success = true
        break
      } catch {
        if (ffmpeg.killed || ffmpeg.exitCode !== null) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }

    if (success) {
      return { record, pending: false }
    }

    if (!ffmpeg.killed && ffmpeg.exitCode === null) {
      const lowerError = (record.lastError || '').toLowerCase()
      const fatalStartError = lowerError.includes('option not found') || lowerError.includes('error opening input')
      ffmpeg.kill('SIGTERM')
      if (!fatalStartError) {
        streams.delete(streamId)
        diagnostics.push({
          transport,
          codec,
          timeoutOption: timeoutOption || '(none)',
          message: record.lastError || `RTSP 已连接但 ${waitTimeoutMs}ms 内未返回可播放数据`
        })
        continue
      }
    }
    streams.delete(streamId)
    diagnostics.push({
      transport,
      codec,
      timeoutOption: timeoutOption || '(none)',
      message: record.lastError || `RTSP 传输方式 ${transport} 失败`
    })
  }
    }
    }
  }

  if (!vlcFirst && vlcEnabled) {
    try {
      return await startStreamWithVlc(rtspUrl, outDir, streamId, waitTimeoutMs)
    } catch (error) {
      diagnostics.push(...(Array.isArray(error?.diagnostics) ? error.diagnostics : [{
        transport: 'tcp',
        codec: 'h264',
        timeoutOption: '(vlc)',
        message: error?.message || 'VLC 启动失败'
      }]))
    }
  }

  throw buildGatewayError('等待播放清单超时，请检查 RTSP 地址和网络连通性', diagnostics)
}

app.post('/api/stream/start', async (req, res) => {
  try {
    const rtspUrl = req.body?.rtspUrl?.trim()

    if (!rtspUrl) {
      return res.status(400).json({ message: 'rtspUrl 不能为空' })
    }

    if (!rtspUrl.startsWith('rtsp://')) {
      return res.status(400).json({ message: 'rtspUrl 必须以 rtsp:// 开头' })
    }

    const streamId = createStreamId(rtspUrl)
    const outDir = path.join(HLS_ROOT, streamId)
    const now = Date.now()
    const lastStartAt = streamStartCooldown.get(streamId) || 0

    const existing = streams.get(streamId)
    if (existing && !existing.ffmpeg.killed) {
      const playlistReady = await hasPlaylist(streamId)
      if (playlistReady) {
        streamStartCooldown.set(streamId, now)
        return res.json({
          streamId,
          playUrl: buildPlayUrl(req, streamId),
          pending: false
        })
      }

      const runningForMs = Math.max(0, now - (existing.startedAt || now))
      if (runningForMs <= STREAM_WARMUP_MS) {
        streamStartCooldown.set(streamId, now)
        return res.json({
          streamId,
          playUrl: buildPlayUrl(req, streamId),
          pending: true
        })
      }

      existing.lastError = existing.lastError || `playlist_not_ready_after_${runningForMs}ms`
      stopStreamById(streamId)
    }

    const inflight = startingStreams.get(streamId)
    if (inflight) {
      streamStartCooldown.set(streamId, now)
      return res.json({
        streamId,
        playUrl: buildPlayUrl(req, streamId),
        pending: true
      })
    }

    if (now - lastStartAt < START_COOLDOWN_MS) {
      metrics.startThrottled += 1
      return res.json({
        streamId,
        playUrl: buildPlayUrl(req, streamId),
        pending: true,
        throttled: true
      })
    }
    streamStartCooldown.set(streamId, now)

    const startTask = (async () => {
      const result = await startStream(rtspUrl, outDir, streamId)
      return { ok: true, result }
    })().catch((error) => {
      console.warn(`[stream] start failed streamId=${streamId} engine=${STREAM_ENGINE_NORMALIZED}: ${error?.message || 'unknown_error'}`)
      const diagnostics = Array.isArray(error?.diagnostics) ? error.diagnostics : []
      if (diagnostics.length) {
        console.warn('[stream] diagnostics:', JSON.stringify(diagnostics))
      }
      return {
        ok: false,
        error: {
          message: error?.message || '启动推流失败',
          diagnostics
        }
      }
    }).finally(() => {
      startingStreams.delete(streamId)
    })

    startingStreams.set(streamId, startTask)

    const syncWaitMs = Number(process.env.START_SYNC_WAIT_MS || 1200)
    const quickResult = await Promise.race([
      startTask,
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), syncWaitMs))
    ])

    if (quickResult?.timeout) {
      return res.json({
        streamId,
        playUrl: buildPlayUrl(req, streamId),
        pending: true
      })
    }

    if (!quickResult.ok) {
      return res.status(500).json({
        message: quickResult.error.message,
        diagnostics: quickResult.error.diagnostics
      })
    }

    return res.json({
      streamId,
      playUrl: buildPlayUrl(req, streamId),
      pending: Boolean(quickResult.result?.pending)
    })
  } catch (error) {
    return res.status(500).json({
      message: error?.message || '启动推流失败',
      diagnostics: error?.diagnostics || []
    })
  }
})

app.post('/api/stream/probe', async (req, res) => {
  const rtspUrl = req.body?.rtspUrl?.trim()
  if (!rtspUrl) {
    return res.status(400).json({ message: 'rtspUrl 不能为空' })
  }
  if (!rtspUrl.startsWith('rtsp://')) {
    return res.status(400).json({ message: 'rtspUrl 必须以 rtsp:// 开头' })
  }

  const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS || 12000)
  const transports = getTransportAttempts()
  const timeoutOptions = (process.env.FFMPEG_TIMEOUT_OPTION_CANDIDATES || 'rw_timeout')
    .split(',')
    .map((item) => item.trim())
  const timeoutCandidates = timeoutOptions.length ? timeoutOptions : ['']
  const results = []

  for (const timeoutOption of timeoutCandidates) {
    for (const transport of transports) {
      const result = await runProbe(rtspUrl, transport, timeoutMs, timeoutOption)
      results.push({
        ...result,
        timeoutOption: timeoutOption || '(none)'
      })
      if (result.ok) {
        return res.status(200).json({
          ok: true,
          ffmpegBin: FFMPEG_BIN,
          results
        })
      }
    }
  }
  return res.status(500).json({
    ok: false,
    ffmpegBin: FFMPEG_BIN,
    results
  })
})

app.post('/api/stream/stop', (req, res) => {
  const streamId = req.body?.streamId?.trim()
  if (!streamId) {
    return res.status(400).json({ message: 'streamId 不能为空' })
  }

  const stopped = stopStreamById(streamId)
  if (!stopped) {
    return res.status(404).json({ message: '未找到对应 streamId' })
  }

  return res.json({ ok: true })
})

app.get('/api/weather', async (_req, res) => {
  try {
    const weather = await getWeatherFromOpenMeteo()
    return res.json(weather)
  } catch (primaryError) {
    try {
      const weather = await getWeatherFromWttr()
      return res.json(weather)
    } catch (fallbackError) {
      return res.status(503).json({
        message: '天气服务暂不可用',
        location: WEATHER_LOCATION,
        diagnostics: [
          primaryError?.message || 'open-meteo_failed',
          fallbackError?.message || 'wttr_failed'
        ]
      })
    }
  }
})

app.get('/api/stream/list', (_req, res) => {
  const now = Date.now()
  const list = Array.from(streams.values()).map((item) => {
    const playlistPath = getPlaylistPath(item.streamId)
    return {
      streamId: item.streamId,
      rtspUrl: item.rtspUrl,
      engine: item.engine || 'ffmpeg',
      startedAt: item.startedAt,
      runningForMs: Math.max(0, now - (item.startedAt || now)),
      running: !item.ffmpeg.killed,
      playlistReady: existsSync(playlistPath),
      lastError: item.lastError
    }
  })

  res.json({ streams: list })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, runningStreams: streams.size, startingStreams: startingStreams.size })
})

app.get('/api/metrics', (req, res) => {
  if (req.query?.reset === '1') {
    metrics.startRequests = 0
    metrics.startThrottled = 0
    metrics.hlsRequests = 0
  }

  res.json({
    ...metrics,
    runningStreams: streams.size,
    startingStreams: startingStreams.size
  })
})

app.get('/', (_req, res) => {
  return res.sendFile(path.join(FRONTEND_ROOT, 'index.html'), {
    cacheControl: false,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  })
})

async function bootstrap() {
  await ensureDir(HLS_ROOT)
  const sweepTimer = setInterval(() => {
    sweepStaleStreams().catch(() => {})
  }, STALE_SWEEP_INTERVAL_MS)
  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref()
  }

  app.listen(PORT, HOST, () => {
    console.log(`RTSP gateway running at http://${HOST}:${PORT}`)
    console.log(`[stream] engine=${STREAM_ENGINE_NORMALIZED} ffmpeg="${FFMPEG_BIN}" vlc="${VLC_BIN || '(not found)'}"`)
    console.log('POST /api/stream/start  { rtspUrl }')
  })
}

async function shutdown() {
  for (const streamId of streams.keys()) {
    stopStreamById(streamId)
  }
}

process.on('SIGINT', async () => {
  await shutdown()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await shutdown()
  process.exit(0)
})

bootstrap().catch((error) => {
  console.error(error)
  process.exit(1)
})
