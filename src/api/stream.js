function resolveDefaultGateway() {
  if (typeof window === 'undefined' || !window.location) {
    return 'http://localhost:8080/api/stream/start'
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  const host = window.location.hostname || 'localhost'
  return `${protocol}//${host}:8080/api/stream/start`
}

export const DEFAULT_GATEWAY = resolveDefaultGateway()

export async function requestPlayableUrl(rtspUrl, gatewayUrl = DEFAULT_GATEWAY, timeoutMs = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rtspUrl }),
      signal: controller.signal
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('网关请求超时')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    const error = new Error(payload?.message || `网关返回状态码: ${response.status}`)
    error.diagnostics = Array.isArray(payload?.diagnostics) ? payload.diagnostics : []
    throw error
  }

  const data = await response.json()
  if (!data?.playUrl) {
    throw new Error('网关响应缺少 playUrl 字段')
  }

  return {
    playUrl: data.playUrl,
    pending: Boolean(data.pending)
  }
}
