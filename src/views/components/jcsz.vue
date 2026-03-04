<template>
  <div>
    <div id="main" style="width: 600px; height: 400px"></div>
  </div>
</template>

<script>
import { schoolStatistic } from '@/api/xiaonuo.js'

export default {
  mounted() {
    this.$nextTick(() => {
      this.drawChart()
    })

    this.schoolStatisticFun()
  },
  methods: {
    schoolStatisticFun() {
      const data = {
        schoolId: 1649
      }
      schoolStatistic(data)
    },
    drawChart() {
      const myChart = this.$echarts.init(document.getElementById('main'))
      const option = {
        title: {
          text: 'ECharts 入门示例'
        },
        tooltip: {},
        legend: {
          data: ['销量']
        },
        xAxis: {
          data: ['衬衫', '羊毛衫', '雪纺衫', '裤子', '高跟鞋', '袜子']
        },
        yAxis: {},
        series: [
          {
            name: '销量',
            type: 'bar',
            data: [5, 20, 36, 10, 10, 20]
          }
        ]
      }

      myChart.setOption(option)
    }
  }
}
</script>

<style scoped lang="sass"></style>
