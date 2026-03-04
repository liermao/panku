<template>
  <div class="img-box">
    <img :src="imgUrl" alt="每周食谱" />
  </div>
</template>

<script>
import dayjs from 'dayjs'
import { recipes } from '@/api/xiaonuo.js'
import defaultImage from '@/assets/image/sp/sp.png'

export default {
  name: 'mzsp',
  data() {
    return {
      imgUrl: defaultImage
    }
  },
  mounted() {
    this.loadRecipes()
  },
  methods: {
    async loadRecipes() {
      const params = {
        schoolId: 1649,
        date: dayjs().format('YYYY-MM-DD')
      }

      try {
        const res = await recipes(params)
        const imageUrl = res?.data?.[0]?.imageUrl
        if (imageUrl) {
          this.imgUrl = imageUrl
        }
      } catch {
        // Keep fallback image when API is unavailable.
      }
    }
  }
}
</script>

<style scoped lang="scss">
.img-box {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
  }
}
</style>
