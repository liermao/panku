// 监控配置文件：后续只需维护这里，不需要改页面代码。
import { DEFAULT_GATEWAY } from '@/api/stream'

export const monitorConfig = {
  gatewayUrl: DEFAULT_GATEWAY,
  displayCount: 7,
  autoPlayOnMount: true,
  startConcurrency: 7,
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
    { id: 'cam-2', name: '海星班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.7/cam/realmonitor?channel=28&subtype=1' },
    { id: 'cam-3', name: '海马班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.7/cam/realmonitor?channel=30&subtype=1' },
    { id: 'cam-4', name: '图鲲班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.9/cam/realmonitor?channel=30&subtype=1' },
    { id: 'cam-5', name: '蓝鲸班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.7/cam/realmonitor?channel=9&subtype=1' },
    { id: 'cam-6', name: '海鹏班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.9/cam/realmonitor?channel=13&subtype=1' },
    { id: 'cam-7', name: '云鹏班', rtspUrl: 'rtsp://admin:a12345678@41.1.7.9/cam/realmonitor?channel=29&subtype=1' },
    // { id: 'cam-8', name: '监控8', rtspUrl: 'rtsp://admin:a12345678@41.1.7.9/cam/realmonitor?channel=31&subtype=1' }
  ]
}
