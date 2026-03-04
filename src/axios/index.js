import axios from 'axios'
import router from '@/router'
import { ElMessage } from 'element-plus'

axios.defaults.baseURL = 'http://bigdata.didano.cn:81/'
axios.defaults.headers.post['Content-Type'] = 'application/json'
axios.defaults.headers.post['X-Requested-With'] = 'XMLHttpRequest'
axios.defaults.timeout = 1000000

axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers['Access-Token-Pc'] = token
    }
    return config
  },
  (err) => Promise.reject(err)
)

axios.interceptors.response.use(
  (response) => {
    const code = response?.data?.code
    if (code === 601 || code === 602 || code === 603) {
      localStorage.clear()
      router.push('/login')
    }

    return Promise.resolve(response)
  },
  (error) => {
    const code = error?.response?.data?.code
    if (code === 417) {
      ElMessage.error('登录信息已过期，请重新登录')
      localStorage.clear()
      router.push('/login')
    }
    return Promise.reject(error)
  }
)

export function get(url, params = {}) {
  return axios.get(url, { params }).then((response) => response.data)
}

export function post(url, data = {}) {
  return axios.post(url, data).then((response) => response.data)
}
