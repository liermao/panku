<template>
  <div class="swiper-box">
    <div ref="swiperContainer" class="swiper-container">
      <div class="swiper-wrapper">
        <div v-for="item in swiperList" :key="item.id" class="swiper-slide">
          <img :src="item.imgUrl" alt="师资力量" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import Swiper from 'swiper'
import 'swiper/css/swiper.min.css'
import { getDefaultRuntimeConfig, loadRuntimeConfig } from '@/config/runtime-config'

const defaultTeacherImages = getDefaultRuntimeConfig().images.teacher

function toSwiperList(urlList = []) {
  return urlList.map((imgUrl, index) => ({
    id: index + 1,
    imgUrl
  }))
}

export default {
  name: 'SzllCarousel',
  data() {
    return {
      swiper: null,
      size: 4,
      swiperList: toSwiperList(defaultTeacherImages)
    }
  },
  async mounted() {
    await this.applyRuntimeImages()
    this.$nextTick(() => {
      this.size = this.computeSlidesPerView()
      this.initSwiper()
      window.addEventListener('resize', this.handleResize)
    })
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)
    this.destroySwiper()
  },
  methods: {
    async applyRuntimeImages() {
      const runtime = await loadRuntimeConfig()
      this.swiperList = toSwiperList(runtime?.images?.teacher || defaultTeacherImages)
    },
    computeSlidesPerView() {
      return document.documentElement.clientWidth > 3000 ? 6 : 4
    },
    handleResize() {
      const nextSize = this.computeSlidesPerView()
      if (nextSize === this.size) {
        return
      }
      this.size = nextSize
      if (this.swiper) {
        this.swiper.params.slidesPerView = this.size
        this.swiper.update()
      }
    },
    destroySwiper() {
      if (this.swiper) {
        this.swiper.destroy(true, true)
        this.swiper = null
      }
    },
    initSwiper() {
      const container = this.$refs.swiperContainer
      if (!container) {
        return
      }

      this.destroySwiper()
      this.swiper = new Swiper(container, {
        loop: true,
        speed: 2000,
        slidesPerView: this.size,
        spaceBetween: 30,
        centeredSlides: true,
        autoplay: true,
        watchSlidesProgress: true,
        observer: true,
        observeParents: true,
        on: {
          setTranslate() {
            const slides = this.slides
            for (let i = 0; i < slides.length; i++) {
              const slide = slides.eq(i)
              const progress = slides[i].progress
              slide.css({ opacity: '', background: '' })
              slide.transform('')
              slide.transform(`scale(${1 - Math.abs(progress) / 8})`)
            }
          },
          setTransition(transition) {
            for (let i = 0; i < this.slides.length; i++) {
              const slide = this.slides.eq(i)
              slide.transition(transition)
            }
          }
        }
      })
    }
  }
}
</script>

<style scoped lang="scss">
.swiper-box,
.swiper-wrapper {
  height: 100%;

  img {
    width: 100%;
  }
}

.swiper-slide {
  width: 100%;

  img {
    height: 100%;
  }
}

.swiper-container {
  height: 100%;
  width: 100%;
}
</style>
