// 两个图表页共用：取到 canvas 节点，按设备像素比放大并清屏，再交给各自的绘制函数。
// 只处理画布本身，坐标、刻度、配色仍由各页面决定，避免把两种图表的差异揉进公共代码。
function withChartCanvas(selector, dpr, draw) {
  const query = wx.createSelectorQuery()
  query.select(selector).fields({ node: true, size: true }).exec(res => {
    if (!res || !res[0]) return
    const canvas = res[0].node
    const ctx = canvas.getContext('2d')
    const width = res[0].width
    const height = res[0].height
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)
    draw(ctx, width, height)
  })
}

module.exports = { withChartCanvas }
