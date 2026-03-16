<template>
  <div class="page-bg" :style="{ backgroundImage: `url(${bg})` }"></div>
  <div class="page-mask"></div>

  <div class="home-top-wrap">
    <div class="home-top" :style="topBarStyle">
      <div class="left-top">
        <img :src="logo" alt="logo" />
      </div>
      <div class="right-top">
        <div class="weather-box">
          <div class="weather-head">
            <span class="weather-dot"></span>
            <span class="weather-location">{{ weatherLocation }}</span>
          </div>
          <div class="weather-main">
            <span class="weather-temp">{{ weatherTempText }}</span>
            <span class="weather-desc">{{ weatherDescText }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="box" :style="{ 'margin-top': marginTop + 'px', width: width + 'px' }">
    <div class="home-left">
      <el-tabs :tab-position="tabPosition" class="tabs" v-model="tabName" @tab-click="handleClick">
        <div class="tabs-header">
          <el-tab-pane label="实时监控" name="0">
            <ssjk
              :style="{ width: width - 340 + 'px', height: 'calc(100% - 180px)', padding: '80px' }"
              class="animate__animated animate__fadeInDown"
            />
          </el-tab-pane>
          <el-tab-pane label="师资力量" name="1">
            <szll
              v-if="szllShow"
              :style="{ width: width - 340 + 'px', height: 'calc(100% - 180px)', padding: '80px' }"
              class="animate__animated animate__fadeInDown"
            />
          </el-tab-pane>
          <el-tab-pane label="保育团队" name="2">
            <hqtd
              v-if="hqtdShow"
              :style="{ width: width - 340 + 'px', height: 'calc(100% - 180px)', padding: '80px' }"
              class="animate__animated animate__fadeInDown"
            />
          </el-tab-pane>
          <el-tab-pane label="每周食谱" name="3">
            <mrsp
              v-if="mrspShow"
              :style="{ width: width - 340 + 'px', height: 'calc(100% - 180px)', padding: '80px' }"
              class="animate__animated animate__fadeInDown"
            />
          </el-tab-pane>
          <el-tab-pane label="" name="4">
            <template #label>
              <div style="font-size: 24px; text-align: center">
                <div>畔U爱公益</div>
                <div>捐赠反馈</div>
              </div>
            </template>
            <pan-uai
              v-if="panUaiShow"
              :style="{ width: width - 340 + 'px', height: 'calc(100% - 180px)', padding: '80px' }"
              class="animate__animated animate__fadeInDown"
            />
          </el-tab-pane>
        </div>
      </el-tabs>
    </div>
  </div>
</template>

<script>
import mrsp from '@/views/components/mzsp.vue'
import szll from '@/views/components/szll.vue'
import Hqtd from '@/views/components/hqtd.vue'
import Ssjk from '@/views/components/ssjk.vue'
import panUai from '@/views/components/panUai.vue'
import logo from '@/assets/image/logo/logo.png'
import bg from '@/assets/image/logo/bg.jpg'

export default {
  data() {
    return {
      logo,
      bg,
      tabPosition: 'left',
      tabName: '0',
      rightBox: false,
      marginTop: 0,
      width: 0,
      ssjkShow: true,
      szllShow: false,
      hqtdShow: false,
      mrspShow: false,
      panUaiShow: false,
      weatherTimer: null,
      weatherLocation: '成华区',
      weatherTempText: '--°C',
      weatherDescText: '天气获取中'
    }
  },
  components: { Ssjk, Hqtd, szll, mrsp, panUai },
  computed: {
    topBarStyle() {
      const barWidth = Number.isFinite(this.width) && this.width > 0 ? `${this.width}px` : '100%'
      return {
        width: barWidth,
        margin: '8px auto 0'
      }
    }
  },
  mounted() {
    this.rightBlockFun()
    this.marginTopFun()
    this.tabName = '0'
    this.applyTabState('0')
    this.loadWeather()
    this.startWeatherTimer()
    window.addEventListener('resize', this.handleResize)
  },
  beforeUnmount() {
    if (this.weatherTimer) {
      clearInterval(this.weatherTimer)
      this.weatherTimer = null
    }
    window.removeEventListener('resize', this.handleResize)
  },
  methods: {
    handleResize() {
      this.rightBlockFun()
      this.marginTopFun()
    },
    rightBlockFun() {
      this.rightBox = document.documentElement.clientWidth > 3000
      this.width = this.rightBox ? document.documentElement.clientWidth - 480 : document.documentElement.clientWidth - 10
    },
    marginTopFun() {
      this.marginTop = (document.documentElement.clientHeight - 1005) / 2
    },
    applyTabState(tabIndex) {
      const current = String(tabIndex)
      this.ssjkShow = current === '0'
      this.szllShow = current === '1'
      this.hqtdShow = current === '2'
      this.mrspShow = current === '3'
      this.panUaiShow = current === '4'
    },
    handleClick(tab) {
      this.tabName = String(tab.index)
      this.applyTabState(this.tabName)
    },
    startWeatherTimer() {
      this.weatherTimer = setInterval(() => {
        this.loadWeather()
      }, 10 * 60 * 1000)
    },
    mapWeatherCode(code) {
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
    },
    applyWeatherValue({ location, temp, desc }) {
      if (typeof location === 'string' && location.trim()) {
        this.weatherLocation = location.trim()
      }
      this.weatherTempText = temp
      this.weatherDescText = desc
    },
    async loadWeatherFromGateway() {
      const response = await fetch('/api/weather', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`weather_gateway_${response.status}`)
      }
      const data = await response.json()
      const temp = Number(data?.temperature)
      const desc = typeof data?.description === 'string' ? data.description : ''
      const location = typeof data?.location === 'string' ? data.location : ''

      this.applyWeatherValue({
        location,
        temp: Number.isFinite(temp) ? `${Math.round(temp)}°C` : '--°C',
        desc: desc || '天气未知'
      })
    },
    async loadWeatherFromOpenMeteo() {
      const url =
        'https://api.open-meteo.com/v1/forecast?latitude=30.6677&longitude=104.1176&current=temperature_2m,weather_code&timezone=Asia%2FShanghai&forecast_days=1'
      try {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`weather_${response.status}`)
        }
        const data = await response.json()
        const current = data?.current || {}
        const temp = Number(current.temperature_2m)
        const code = Number(current.weather_code)

        this.applyWeatherValue({
          location: this.weatherLocation || '成华区',
          temp: Number.isFinite(temp) ? `${Math.round(temp)}°C` : '--°C',
          desc: Number.isFinite(code) ? this.mapWeatherCode(code) : '天气未知'
        })
        return true
      } catch {
        return false
      }
    },
    async loadWeather() {
      try {
        await this.loadWeatherFromGateway()
        return
      } catch {
        // fallback to direct browser request
      }

      const ok = await this.loadWeatherFromOpenMeteo()
      if (!ok) {
        this.applyWeatherValue({
          location: this.weatherLocation || '成华区',
          temp: '--°C',
          desc: '天气暂不可用'
        })
      }
    }
  }
}
</script>

<style scoped lang="scss">
.page-bg {
  position: fixed;
  inset: -20px;
  z-index: 0;
  pointer-events: none;
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
  filter: blur(10px) saturate(1.08);
  transform: scale(1.05);
}

.page-mask {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 25% 20%, rgba(56, 189, 248, 0.14), transparent 45%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.32), rgba(2, 6, 23, 0.55));
}

.box {
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1;
  overflow: visible;
}

.home-top-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 72px;
  z-index: 9999;
  pointer-events: none;
}

.home-top {
  margin-top: 8px;
  width: 100%;
  height: 64px;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;

  .left-top {
    display: flex;
    align-items: center;
    height: 100%;
    pointer-events: auto;

    img {
      height: 46px;
      width: auto;
      display: block;
      object-fit: contain;
      filter: drop-shadow(0 5px 10px rgba(2, 6, 23, 0.45));
    }
  }

  .right-top {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    pointer-events: auto;
  }

  .weather-box {
    min-width: 0;
    width: max-content;
    max-width: 220px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    color: #fff;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid rgba(125, 211, 252, 0.34);
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.74), rgba(30, 41, 59, 0.56));
    box-shadow: 0 8px 16px rgba(2, 6, 23, 0.25);
    backdrop-filter: blur(3px);
  }

  .weather-head {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
  }

  .weather-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #67e8f9;
    box-shadow: 0 0 7px rgba(103, 232, 249, 0.85);
    flex-shrink: 0;
  }

  .weather-location {
    font-size: 12px;
    line-height: 1;
    letter-spacing: 0.4px;
    opacity: 0.9;
  }

  .weather-main {
    margin-top: 5px;
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 6px;
  }

  .weather-temp {
    font-size: 22px;
    line-height: 1;
    font-weight: 700;
    white-space: nowrap;
  }

  .weather-desc {
    font-size: 13px;
    line-height: 1;
    opacity: 0.95;
    white-space: nowrap;
  }
}

.home-left {
  width: 100%;
}

.tabs {
  height: 1005px;
  display: flex;
  align-items: center;
}

.tabs-header {
  height: 100%;
}

:deep(.el-tabs__item) {
  color: rgba(226, 232, 240, 0.78);
  height: 100px;
  font-size: 26px;
  transition:
    color 0.22s ease,
    text-shadow 0.22s ease,
    transform 0.22s ease;
}

:deep(.el-tabs__item:hover) {
  color: #bae6fd;
}

:deep(.el-tabs__header) {
  height: auto !important;
  min-height: 520px;

  .el-tabs__item.is-active {
    color: #22d3ee;
    font-weight: 700;
    text-shadow: 0 0 10px rgba(34, 211, 238, 0.45);
    transform: translateX(2px);
  }

  .el-tabs__item:hover {
    font-weight: 700;
  }
}

:deep(.el-tabs__active-bar) {
  background: linear-gradient(180deg, #67e8f9, #22d3ee);
  border-radius: 3px;
}

:deep(.el-tabs__content) {
  height: 100%;

  .el-tab-pane {
    height: 100%;
    color: #ffffff;
    display: flex;
    align-items: center;
  }
}

.home-right {
  height: 1080px;
  width: 480px;
  border: 1px solid #ccc;
}
</style>
