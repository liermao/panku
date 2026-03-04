import './assets/main.css'
import App from './App.vue'
import * as echarts from 'echarts'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { createPinia } from 'pinia'
import 'swiper/css/swiper.min.css'
import 'swiper/js/swiper.js'
import "animate.css"
import scroll from 'vue-seamless-scroll'
import router from './router'

const app = createApp(App)
app.use(router)
app.use(scroll)
app.config.globalProperties.$echarts = echarts
app.use(createPinia())

app.use(ElementPlus)
app.mount('#app')