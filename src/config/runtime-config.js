import { DEFAULT_GATEWAY } from '@/api/stream'
import { monitorConfig as localMonitorConfig } from '@/config/monitor-config'

const DEFAULT_TEACHER_IMAGES = [
  '/runtime-assets/szll/3.png',
  '/runtime-assets/szll/2.png',
  '/runtime-assets/szll/4.png',
  '/runtime-assets/szll/5.png',
  '/runtime-assets/szll/7.png',
  '/runtime-assets/szll/8.png',
  '/runtime-assets/szll/9.png',
  '/runtime-assets/szll/10.png',
  '/runtime-assets/szll/11.png',
  '/runtime-assets/szll/12.png',
  '/runtime-assets/szll/13.png',
  '/runtime-assets/szll/14.png',
  '/runtime-assets/szll/15.png',
  '/runtime-assets/szll/16.png',
  '/runtime-assets/szll/17.png',
  '/runtime-assets/szll/18.png',
  '/runtime-assets/szll/19.png',
  '/runtime-assets/szll/20.png',
  '/runtime-assets/szll/21.png',
  '/runtime-assets/szll/22.png',
  '/runtime-assets/szll/23.png'
]

const DEFAULT_CARE_TEAM_IMAGES = [
  '/runtime-assets/hqtd/1.png',
  '/runtime-assets/hqtd/2.png',
  '/runtime-assets/hqtd/3.png',
  '/runtime-assets/hqtd/4.png',
  '/runtime-assets/hqtd/5.png',
  '/runtime-assets/hqtd/6.png',
  '/runtime-assets/hqtd/7.png',
  '/runtime-assets/hqtd/8.png',
  '/runtime-assets/hqtd/9.png',
  '/runtime-assets/hqtd/10.png'
]

const DEFAULT_PAN_UAI_IMAGE = '/runtime-assets/panUai/jksz.png'

const DEFAULT_RUNTIME_CONFIG = {
  monitor: {
    ...localMonitorConfig,
    gatewayUrl: localMonitorConfig.gatewayUrl || DEFAULT_GATEWAY
  },
  images: {
    teacher: DEFAULT_TEACHER_IMAGES,
    careTeam: DEFAULT_CARE_TEAM_IMAGES,
    panUai: DEFAULT_PAN_UAI_IMAGE
  }
}

let runtimeConfigPromise = null

function sanitizeImageList(list, fallback) {
  if (!Array.isArray(list)) {
    return fallback
  }

  const cleaned = list
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return cleaned.length ? cleaned : fallback
}

function sanitizeMonitorConfig(rawMonitor) {
  const merged = {
    ...DEFAULT_RUNTIME_CONFIG.monitor,
    ...(rawMonitor || {})
  }

  merged.gatewayUrl = merged.gatewayUrl || DEFAULT_GATEWAY
  merged.autoPlayOnMount = merged.autoPlayOnMount !== false
  merged.cameras = Array.isArray(rawMonitor?.cameras) && rawMonitor.cameras.length ? rawMonitor.cameras : DEFAULT_RUNTIME_CONFIG.monitor.cameras

  return merged
}

function sanitizeRuntimeConfig(raw) {
  const monitor = sanitizeMonitorConfig(raw?.monitor)
  const images = {
    teacher: sanitizeImageList(raw?.images?.teacher, DEFAULT_RUNTIME_CONFIG.images.teacher),
    careTeam: sanitizeImageList(raw?.images?.careTeam, DEFAULT_RUNTIME_CONFIG.images.careTeam),
    panUai:
      typeof raw?.images?.panUai === 'string' && raw.images.panUai.trim()
        ? raw.images.panUai.trim()
        : DEFAULT_RUNTIME_CONFIG.images.panUai
  }

  return { monitor, images }
}

async function fetchRuntimeConfig() {
  try {
    const response = await fetch('/runtime-config.json', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`runtime-config status ${response.status}`)
    }
    const raw = await response.json()
    return sanitizeRuntimeConfig(raw)
  } catch {
    return sanitizeRuntimeConfig(DEFAULT_RUNTIME_CONFIG)
  }
}

export function getDefaultRuntimeConfig() {
  return sanitizeRuntimeConfig(DEFAULT_RUNTIME_CONFIG)
}

export async function loadRuntimeConfig() {
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetchRuntimeConfig()
  }
  return runtimeConfigPromise
}

export function resetRuntimeConfigCache() {
  runtimeConfigPromise = null
}
