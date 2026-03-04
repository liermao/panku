import { get, post } from '../axios/index.js'

/*获取学校信息*/
export function schoolStatistic(data) {
  return get('api/school-statistic', data)
}

/*获取每周食谱*/
export function recipes(data) {
  return get('api/recipes', data)
}