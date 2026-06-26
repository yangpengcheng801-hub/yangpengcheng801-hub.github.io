import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsOption } from 'echarts'
import { Card } from '@/components/ui/card'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

interface MetricsChartProps {
  metrics: string[]
  datasets: string[]
}

export function MetricsChart({ metrics, datasets }: MetricsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!containerRef.current) return
    const chart: ECharts = echarts.init(containerRef.current)
    const labels = [...metrics, ...datasets].slice(0, 6)
    const option: EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', backgroundColor: '#0f172a', borderColor: '#334155', textStyle: { color: '#cbd5e1' } },
      grid: { left: 20, right: 16, top: 12, bottom: 10, containLabel: true },
      xAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: 'rgba(148,163,184,.08)' } }, axisLabel: { show: false } },
      yAxis: { type: 'category', data: labels.length ? labels : ['原文未明确列出'], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#94a3b8', width: 130, overflow: 'truncate' } },
      series: [{ type: 'bar', data: (labels.length ? labels : ['']).map((_, index) => 82 - index * 8), barWidth: 8, itemStyle: { borderRadius: 8, color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#8b5cf6' }] } } }],
    }
    chart.setOption(option)
    const resize = (): void => chart.resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); chart.dispose() }
  }, [metrics, datasets])

  return <Card className="p-6"><h2 className="text-sm font-semibold">实验要素雷达</h2><p className="mt-1 text-xs text-slate-500">数据集与评价指标快速索引</p><div ref={containerRef} className="mt-4 h-64 w-full" /></Card>
}

