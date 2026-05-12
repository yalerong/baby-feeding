// 引入本地配置（云开发环境 ID 等敏感信息放在这里，不提交到 Git）
const localConfig = require('./config.local.js')

App({
  onLaunch() {
    // 初始化云开发环境
    // 教程第 3 步会让你拿到 env 环境ID，填到 config.local.js 里
    // 如果想先跑起来，也可以先不传 env，默认走第一个环境
    wx.cloud.init({
      env: localConfig.cloudEnv || '',
      traceUser: true
    })

    // 家庭码固定，家人自动共享数据
    const familyCode = localConfig.familyCode || 'FAMILY'
    wx.setStorageSync('familyCode', familyCode)
  },

  globalData: {
    userInfo: null
  }
})

// 如需修复历史数据 familyCode，可手动在控制台执行：
// wx.cloud.callFunction({ name: 'fixFamilyCode' }).then(res => console.log(res.result))
