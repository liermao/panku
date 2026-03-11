<template>
  <div class="jk-box">
    <div class="video-board" v-if="cameras.length">
      <div class="video-row row-top" :style="topRowStyle">
        <div v-for="camera in topRowCameras" :key="camera.id" class="video-card">
          <div class="loading-mask" v-if="camera.loading">
            <span class="spinner"></span>
            <span class="loading-text">加载中...</span>
          </div>
          <div class="camera-name">
            {{ camera.name }}
            <span v-if="camera.isDuplicate" class="dup-tag">重复源 x{{ camera.duplicateCount }}</span>
          </div>
          <div class="camera-time">{{ nowText }}</div>
          <video ref="videoEls" :data-camera-id="camera.id" class="video" autoplay muted playsinline></video>
        </div>
      </div>

      <div class="video-row row-bottom" :style="bottomRowStyle" v-if="bottomRowCameras.length">
        <div v-for="camera in bottomRowCameras" :key="camera.id" class="video-card">
          <div class="loading-mask" v-if="camera.loading">
            <span class="spinner"></span>
            <span class="loading-text">加载中...</span>
          </div>
          <div class="camera-name">
            {{ camera.name }}
            <span v-if="camera.isDuplicate" class="dup-tag">重复源 x{{ camera.duplicateCount }}</span>
          </div>
          <div class="camera-time">{{ nowText }}</div>
          <video ref="videoEls" :data-camera-id="camera.id" class="video" autoplay muted playsinline></video>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import Hls from 'hls.js'
import { DEFAULT_GATEWAY, requestPlayableUrl } from '@/api/stream'
import { monitorConfig } from '@/config/monitor-config'
import { loadRuntimeConfig } from '@/config/runtime-config'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeCameras(configCameras = []) {
  return configCameras
    .map((item, index) => ({
      id: item.id || `cam-${index + 1}`,
      name: item.name || `监控${index + 1}`,
      rtspUrl: item.rtspUrl || '',
      isDuplicate: false,
      duplicateCount: 1,
      loading: false,
      lastStartAt: 0,
      lastFrameAt: 0
    }))
    .filter((item) => !!item.rtspUrl)
}

export default {
  name: 'ssjk',
  data() {
    const fallback = monitorConfig
    return {
      gatewayUrl: fallback.gatewayUrl || DEFAULT_GATEWAY,
      autoPlayOnMount: fallback.autoPlayOnMount !== false,
      cameras: normalizeCameras(fallback.cameras),
      videoRefs: {},
      hlsMap: {},
      videoStateMap: {},
      playTaskMap: {},
      nowText: '',
      clockTimer: null,
      recoverTimer: null,
      recovering: false,
      isUnmounted: false,
      startConcurrency: Number(fallback?.startConcurrency || 4),
      recoverConcurrency: Number(fallback?.recoverConcurrency || 1),
      bootstrapMaxWaitMs: Number(fallback?.bootstrapMaxWaitMs || 20000),
      frameReadyTimeoutMs: Number(fallback?.frameReadyTimeoutMs || 45000),
      stallTimeoutMs: Number(fallback?.stallTimeoutMs || 60000),
      recoverIntervalMs: Number(fallback?.recoverIntervalMs || 10000),
      startCooldownMs: Number(fallback?.startCooldownMs || 5000),
      pendingRetryDelayMs: Number(fallback?.pendingRetryDelayMs || 1800),
      requestTimeoutMs: Number(fallback?.requestTimeoutMs || 12000),
      retryDelayMs: Number(fallback?.retry?.delayMs || 2000)
    }
  },
  computed: {
    splitIndex() {
      return Math.ceil(this.cameras.length / 2)
    },
    topRowCameras() {
      return this.cameras.slice(0, this.splitIndex)
    },
    bottomRowCameras() {
      return this.cameras.slice(this.splitIndex)
    },
    topRowColumns() {
      return Math.max(this.topRowCameras.length, 1)
    },
    topRowStyle() {
      return {
        gridTemplateColumns: `repeat(${this.topRowColumns}, minmax(0, 1fr))`
      }
    },
    bottomRowStyle() {
      const bottomCount = this.bottomRowCameras.length
      if (!bottomCount) {
        return {}
      }
      const gapPx = 8
      if (bottomCount === this.topRowColumns) {
        return {
          gridTemplateColumns: `repeat(${bottomCount}, minmax(0, 1fr))`,
          width: '100%',
          margin: '0 auto'
        }
      }
      return {
        gridTemplateColumns: `repeat(${bottomCount}, minmax(0, 1fr))`,
        width: `calc(((100% - ${(this.topRowColumns - 1) * gapPx}px) / ${this.topRowColumns}) * ${bottomCount} + ${(bottomCount - 1) * gapPx}px)`,
        margin: '0 auto'
      }
    }
  },
  async mounted() {
    await this.applyRuntimeMonitorConfig()
    await this.$nextTick()
    this.syncVideoRefs()
    await this.waitForVideoRefs()
    this.detectDuplicateSources()
    this.startClock()
    window.addEventListener('focus', this.handleWindowFocus)

    if (this.autoPlayOnMount) {
      await this.playAll()
    }

    this.startRecoverLoop()
  },
  updated() {
    this.syncVideoRefs()
  },
  beforeUnmount() {
    this.isUnmounted = true
    window.removeEventListener('focus', this.handleWindowFocus)
    this.stopClock()
    this.stopRecoverLoop()
    Object.values(this.videoStateMap).forEach((item) => item.cleanup())
    this.videoStateMap = {}
    this.stopAll()
  },
  methods: {
    async applyRuntimeMonitorConfig() {
      const runtime = await loadRuntimeConfig()
      const monitor = runtime?.monitor || {}

      this.gatewayUrl = monitor.gatewayUrl || this.gatewayUrl
      this.autoPlayOnMount = monitor.autoPlayOnMount !== false
      this.cameras = normalizeCameras(monitor.cameras || this.cameras)

      this.startConcurrency = Number(monitor.startConcurrency || this.startConcurrency)
      this.recoverConcurrency = Number(monitor.recoverConcurrency || this.recoverConcurrency)
      this.bootstrapMaxWaitMs = Number(monitor.bootstrapMaxWaitMs || this.bootstrapMaxWaitMs)
      this.frameReadyTimeoutMs = Number(monitor.frameReadyTimeoutMs || this.frameReadyTimeoutMs)
      this.stallTimeoutMs = Number(monitor.stallTimeoutMs || this.stallTimeoutMs)
      this.recoverIntervalMs = Number(monitor.recoverIntervalMs || this.recoverIntervalMs)
      this.startCooldownMs = Number(monitor.startCooldownMs || this.startCooldownMs)
      this.pendingRetryDelayMs = Number(monitor.pendingRetryDelayMs || this.pendingRetryDelayMs)
      this.requestTimeoutMs = Number(monitor.requestTimeoutMs || this.requestTimeoutMs)
      this.retryDelayMs = Number(monitor?.retry?.delayMs || this.retryDelayMs)
    },
    async waitForVideoRefs(maxWaitMs = 5000) {
      const start = Date.now()
      while (Date.now() - start < maxWaitMs) {
        this.syncVideoRefs()
        if (Object.keys(this.videoRefs).length >= this.cameras.length) {
          return
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(60)
      }
    },
    formatNow() {
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      return `${y}/${m}/${d} ${hh}:${mm}:${ss}`
    },
    startClock() {
      this.nowText = this.formatNow()
      this.clockTimer = setInterval(() => {
        this.nowText = this.formatNow()
      }, 1000)
    },
    stopClock() {
      if (this.clockTimer) {
        clearInterval(this.clockTimer)
        this.clockTimer = null
      }
    },
    startRecoverLoop() {
      this.recoverTimer = setInterval(() => {
        this.ensureAllStreams()
      }, this.recoverIntervalMs)
    },
    stopRecoverLoop() {
      if (this.recoverTimer) {
        clearInterval(this.recoverTimer)
        this.recoverTimer = null
      }
    },
    getVideoNodeList() {
      const refs = this.$refs.videoEls
      if (!refs) {
        return []
      }
      return Array.isArray(refs) ? refs : [refs]
    },
    getVideoElById(id) {
      const list = this.getVideoNodeList()
      return list.find((el) => el?.dataset?.cameraId === id) || null
    },
    syncVideoRefs() {
      this.cameras.forEach((camera) => {
        const id = camera.id
        const el = this.getVideoElById(id)
        const prevState = this.videoStateMap[id]

        if (!el) {
          if (prevState) {
            prevState.cleanup()
            delete this.videoStateMap[id]
          }
          delete this.videoRefs[id]
          return
        }

        if (prevState && prevState.el !== el) {
          prevState.cleanup()
          delete this.videoStateMap[id]
        }

        this.videoRefs[id] = el
        if (!this.videoStateMap[id]) {
          this.bindVideoEvents(id, el)
        }
      })
    },
    bindVideoEvents(cameraId, video) {
      const onFrame = () => {
        const currentTime = Number(video.currentTime || 0)
        const canConfirmFrame = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && currentTime > 0.03
        if (!canConfirmFrame) {
          return
        }
        const camera = this.cameras.find((item) => item.id === cameraId)
        if (camera) {
          camera.lastFrameAt = Date.now()
          camera.loading = false
        }
      }
      video.addEventListener('playing', onFrame)
      video.addEventListener('timeupdate', onFrame)

      this.videoStateMap[cameraId] = {
        el: video,
        cleanup: () => {
          video.removeEventListener('playing', onFrame)
          video.removeEventListener('timeupdate', onFrame)
        }
      }
    },
    detectDuplicateSources() {
      const urlCount = new Map()
      for (const camera of this.cameras) {
        const key = (camera.rtspUrl || '').trim()
        urlCount.set(key, (urlCount.get(key) || 0) + 1)
      }
      this.cameras.forEach((camera) => {
        const count = urlCount.get((camera.rtspUrl || '').trim()) || 1
        camera.duplicateCount = count
        camera.isDuplicate = count > 1
      })
    },
    hasActiveMedia(camera) {
      if (this.playTaskMap[camera.id]) {
        return true
      }

      const video = this.videoRefs[camera.id]
      if (!video) {
        return false
      }

      const hasBoundSource = !!(this.hlsMap[camera.id] || video.currentSrc || video.src)
      if (!hasBoundSource) {
        return false
      }

      const inWarmup = camera.loading && Date.now() - camera.lastStartAt <= this.frameReadyTimeoutMs
      if (inWarmup) {
        return true
      }

      const frameReady = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
      if (!frameReady) {
        return false
      }

      const stale = Date.now() - (camera.lastFrameAt || 0) > this.stallTimeoutMs
      if (stale) {
        return false
      }
      return Date.now() - (camera.lastFrameAt || 0) <= this.stallTimeoutMs
    },
    clearPlayerById(cameraId) {
      const hls = this.hlsMap[cameraId]
      if (hls) {
        hls.destroy()
        delete this.hlsMap[cameraId]
      }

      const video = this.videoRefs[cameraId]
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    },
    async waitForPlaylistReady(playUrl, maxWaitMs) {
      const deadline = Date.now() + maxWaitMs
      while (!this.isUnmounted && Date.now() < deadline) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const response = await fetch(playUrl, { method: 'HEAD', cache: 'no-store' })
          if (response.ok) {
            return true
          }
        } catch {
          // ignore
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(this.pendingRetryDelayMs)
      }
      return false
    },
    async waitVideoReady(video, timeoutMs = this.frameReadyTimeoutMs) {
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && Number(video.currentTime || 0) > 0.03) {
        return true
      }

      return await new Promise((resolve) => {
        let done = false
        const isReady = () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && Number(video.currentTime || 0) > 0.03
        const finish = (ok) => {
          if (done) return
          done = true
          clearTimeout(timer)
          video.removeEventListener('timeupdate', onReady)
          video.removeEventListener('playing', onReady)
          video.removeEventListener('error', onError)
          resolve(ok)
        }
        const onReady = () => {
          if (isReady()) {
            finish(true)
          }
        }
        const onError = () => finish(false)
        const timer = setTimeout(() => finish(false), timeoutMs)

        video.addEventListener('timeupdate', onReady)
        video.addEventListener('playing', onReady)
        video.addEventListener('error', onError)

        // 立即检查一次，防止监听前已满足条件
        onReady()
      })
    },
    tryPlay(video) {
      const p = video.play()
      if (p && typeof p.then === 'function') {
        p.catch(() => {})
      }
    },
    async playByUrl(cameraId, playUrl) {
      this.clearPlayerById(cameraId)
      const video = this.videoRefs[cameraId]
      if (!video) {
        throw new Error('视频容器不存在')
      }

      video.muted = true
      video.autoplay = true
      video.preload = 'auto'
      video.setAttribute('muted', 'true')
      video.setAttribute('playsinline', 'true')

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: false,
          maxBufferLength: 30,
          backBufferLength: 30,
          liveSyncDurationCount: 6,
          liveMaxLatencyDurationCount: 12,
          manifestLoadingTimeOut: 20000,
          levelLoadingTimeOut: 20000,
          fragLoadingTimeOut: 20000,
          manifestLoadingMaxRetry: 1,
          levelLoadingMaxRetry: 1,
          fragLoadingMaxRetry: 1,
          manifestLoadingRetryDelay: 2000,
          levelLoadingRetryDelay: 2000,
          fragLoadingRetryDelay: 2000
        })

        this.hlsMap[cameraId] = hls

        await new Promise((resolve, reject) => {
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) {
              reject(new Error(data.details || 'HLS 播放失败'))
            }
          })
          hls.on(Hls.Events.MANIFEST_PARSED, () => resolve())
          hls.loadSource(playUrl)
          hls.attachMedia(video)
        })

        this.tryPlay(video)
        const ready = await this.waitVideoReady(video)
        if (!ready) {
          throw new Error('HLS 首帧超时')
        }
        return
      }

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playUrl
        this.tryPlay(video)
        const ready = await this.waitVideoReady(video)
        if (!ready) {
          throw new Error('原生 HLS 首帧超时')
        }
        return
      }

      throw new Error('当前浏览器不支持 HLS 播放')
    },
    getPendingWaitMs(maxWaitMs) {
      const upperBound = Number.isFinite(maxWaitMs) ? maxWaitMs : this.bootstrapMaxWaitMs
      const candidate = Math.min(45000, upperBound)
      return Math.max(20000, candidate)
    },
    async startCamera(camera, maxWaitMs = this.bootstrapMaxWaitMs) {
      if (this.playTaskMap[camera.id]) {
        return this.playTaskMap[camera.id]
      }

      const task = (async () => {
        camera.loading = true
        const deadline = Date.now() + maxWaitMs

        while (!this.isUnmounted && Date.now() < deadline) {
          const now = Date.now()
          const coolDownRemain = this.startCooldownMs - (now - camera.lastStartAt)
          if (coolDownRemain > 0) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(Math.min(coolDownRemain, this.retryDelayMs))
            continue
          }

          camera.lastStartAt = Date.now()
          try {
            // eslint-disable-next-line no-await-in-loop
            const result = await requestPlayableUrl(camera.rtspUrl, this.gatewayUrl, this.requestTimeoutMs)

            if (result.pending) {
              const pendingWaitMs = this.getPendingWaitMs(maxWaitMs)
              // eslint-disable-next-line no-await-in-loop
              const ready = await this.waitForPlaylistReady(result.playUrl, pendingWaitMs)
              if (!ready) {
                throw new Error('播放清单准备超时')
              }
            }

            // eslint-disable-next-line no-await-in-loop
            await this.playByUrl(camera.id, result.playUrl)
            camera.lastFrameAt = Date.now()
            camera.loading = false
            return true
          } catch (error) {
            console.warn(`[monitor] ${camera.name} 启动失败:`, error?.message || error)
            this.clearPlayerById(camera.id)
            // eslint-disable-next-line no-await-in-loop
            await sleep(this.retryDelayMs)
          }
        }

        camera.loading = false
        return false
      })().finally(() => {
        delete this.playTaskMap[camera.id]
      })

      this.playTaskMap[camera.id] = task
      return task
    },
    async playAll() {
      const targets = [...this.cameras]
      const workerCount = Math.max(1, Math.min(this.startConcurrency, targets.length))
      const groups = Array.from({ length: workerCount }, () => [])
      targets.forEach((camera, index) => {
        groups[index % workerCount].push(camera)
      })

      const workers = groups.map(async (group) => {
        for (const camera of group) {
          if (this.isUnmounted) break
          // eslint-disable-next-line no-await-in-loop
          this.startCamera(camera)
          // eslint-disable-next-line no-await-in-loop
          await sleep(120)
        }
      })

      await Promise.all(workers)
    },
    async ensureAllStreams() {
      if (this.recovering || this.isUnmounted) {
        return
      }

      const missing = this.cameras.filter((camera) => !this.hasActiveMedia(camera))
      if (!missing.length) {
        return
      }

      this.recovering = true
      try {
        const queue = [...missing]
        const workerCount = Math.min(this.recoverConcurrency, queue.length)
        const workers = Array.from({ length: workerCount }, async () => {
          while (queue.length && !this.isUnmounted) {
            const camera = queue.shift()
            if (!camera) break
            // eslint-disable-next-line no-await-in-loop
            await this.startCamera(camera, this.frameReadyTimeoutMs + 10000)
            // eslint-disable-next-line no-await-in-loop
            await sleep(this.retryDelayMs)
          }
        })
        await Promise.all(workers)
      } finally {
        this.recovering = false
      }
    },
    async handleWindowFocus() {
      await this.ensureAllStreams()
    },
    stopAll() {
      this.cameras.forEach((camera) => {
        camera.loading = false
        this.clearPlayerById(camera.id)
      })
      this.playTaskMap = {}
    }
  }
}
</script>

<style scoped lang="scss">
.jk-box {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-board {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}

.video-row {
  width: 100%;
  display: grid;
  gap: 8px;
}

.video-card {
  position: relative;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  border: 1px solid rgba(219, 234, 254, 0.45);
  padding: 2px;
  overflow: hidden;
}

.loading-mask {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #e2e8f0;
  font-size: 12px;
  background: rgba(2, 6, 23, 0.52);
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid rgba(226, 232, 240, 0.4);
  border-top-color: #f8fafc;
  animation: spin 0.9s linear infinite;
}

.loading-text {
  line-height: 1;
}

.camera-name {
  position: absolute;
  left: 6px;
  top: 6px;
  z-index: 2;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 3px;
  background: rgba(15, 23, 42, 0.72);
  display: flex;
  align-items: center;
  gap: 4px;
}

.dup-tag {
  color: #fee2e2;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 2px;
  background: rgba(127, 29, 29, 0.75);
}

.camera-time {
  position: absolute;
  right: 6px;
  top: 6px;
  z-index: 2;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 3px;
  background: rgba(15, 23, 42, 0.72);
}

.video {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  object-position: center;
  border-radius: 2px;
  background: #020617;
  display: block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
