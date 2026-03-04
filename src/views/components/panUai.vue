<template>
  <div class="img-box">
    <img :src="imgUrl" alt="畔U爱公益" />
  </div>
</template>

<script>
import { getDefaultRuntimeConfig, loadRuntimeConfig } from '@/config/runtime-config'

const defaultPanUaiImage = getDefaultRuntimeConfig().images.panUai

export default {
  name: 'panUai',
  data() {
    return {
      imgUrl: defaultPanUaiImage
    }
  },
  async mounted() {
    const runtime = await loadRuntimeConfig()
    this.imgUrl = runtime?.images?.panUai || defaultPanUaiImage
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
