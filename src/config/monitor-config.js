// 监控配置文件：后续只需维护这里，不需要改页面代码。
import { DEFAULT_GATEWAY } from '@/api/stream'

export const monitorConfig = {
  gatewayUrl: DEFAULT_GATEWAY,
  displayCount: 6,
  autoPlayOnMount: true,
  startConcurrency: 2,
  recoverConcurrency: 1,
  bootstrapMaxWaitMs: 60000,
  frameReadyTimeoutMs: 45000,
  stallTimeoutMs: 60000,
  recoverIntervalMs: 10000,
  startCooldownMs: 5000,
  pendingRetryDelayMs: 1800,
  requestTimeoutMs: 12000,
  minRetryIntervalMs: 1200,
  retry: {
    delayMs: 2000
  },
  cameras: [
    { id: 'cam-1', name: '河豚班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.9/cam/realmonitor?channel=1&subtype=1' },
    { id: 'cam-2', name: '海马班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.8/cam/realmonitor?channel=9&subtype=1' },
    { id: 'cam-4', name: '天鲲班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.9/cam/realmonitor?channel=30&subtype=1' },
    { id: 'cam-5', name: '水鲸班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.7/cam/realmonitor?channel=9&subtype=1' },
    { id: 'cam-6', name: '海鹏班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.12/cam/realmonitor?channel=10&subtype=1' },
    { id: 'cam-7', name: '鲲鹏班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.12/cam/realmonitor?channel=3&subtype=1' }
  ]
}
