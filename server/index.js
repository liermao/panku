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
const HLS_ROOT = process.env.HLS_ROOT || path.resolve(APP_ROOT, 'public', 'hls')
const FRONTEND_ROOT = process.env.FRONTEND_ROOT || path.resolve(APP_ROOT, 'panku')

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
app.use(express.static(FRONTEND_ROOT, { index: 'index.html' }))
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

function createStreamId(rtspUrl) {
  return crypto.createHash('sha1').update(rtspUrl).digest('hex').slice(0, 12)
}

function getTransportAttempts() {
  return process.env.RTSP_TRANSPORTS
    ? process.env.RTSP_TRANSPORTS.split(',').map((item) => item.trim()).filter(Boolean)
    : ['tcp', 'udp', 'auto']
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

function buildFfmpegArgs(rtspUrl, transport, outputArgs, timeoutOptionOverride = null) {
  const transportArgs = transport === 'auto' ? [] : ['-rtsp_transport', transport]
  const timeoutUs = process.env.FFMPEG_RW_TIMEOUT_US || '15000000'
  const timeoutOption = timeoutOptionOverride !== null ? timeoutOptionOverride : process.env.FFMPEG_TIMEOUT_OPTION || 'rw_timeout'
  const timeoutArgs = timeoutOption ? [`-${timeoutOption}`, timeoutUs] : []
  return [
    '-hide_banner',
    '-loglevel',
    process.env.FFMPEG_LOG_LEVEL || 'error',
    ...timeoutArgs,
    ...transportArgs,
    '-i',
    rtspUrl,
    ...outputArgs
  ]
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
  const waitTimeoutMs = Number(process.env.STREAM_READY_TIMEOUT_MS || 10000)
  const transportAttempts = getTransportAttempts()
  const codecAttempts = getCodecAttempts()
  const diagnostics = []

  const timeoutOptions = (process.env.FFMPEG_TIMEOUT_OPTION_CANDIDATES || 'rw_timeout,stimeout,')
    .split(',')
    .map((item) => item.trim())
  const timeoutCandidates = timeoutOptions.length ? timeoutOptions : ['']

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

    // ffmpeg 仍在运行时，先返回 playUrl，让前端尽快开始加载并等待清单就绪。
    if (!ffmpeg.killed && ffmpeg.exitCode === null) {
      const lowerError = (record.lastError || '').toLowerCase()
      const fatalStartError = lowerError.includes('option not found') || lowerError.includes('error opening input')
      if (!fatalStartError) {
        return { record, pending: true }
      }
      ffmpeg.kill('SIGTERM')
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
      streamStartCooldown.set(streamId, now)
      return res.json({
        streamId,
        playUrl: buildPlayUrl(req, streamId),
        pending: false
      })
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
      return {
        ok: false,
        error: {
          message: error?.message || '启动推流失败',
          diagnostics: error?.diagnostics || []
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
  const timeoutOptions = (process.env.FFMPEG_TIMEOUT_OPTION_CANDIDATES || 'rw_timeout,stimeout,')
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

app.get('/api/stream/list', (_req, res) => {
  const list = Array.from(streams.values()).map((item) => ({
    streamId: item.streamId,
    rtspUrl: item.rtspUrl,
    startedAt: item.startedAt,
    running: !item.ffmpeg.killed,
    lastError: item.lastError
  }))

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
  return res.sendFile(path.join(FRONTEND_ROOT, 'index.html'))
})

async function bootstrap() {
  await ensureDir(HLS_ROOT)
  app.listen(PORT, HOST, () => {
    console.log(`RTSP gateway running at http://${HOST}:${PORT}`)
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
