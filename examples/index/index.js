const { loginFn, getPhoneNumberFn } = require('./login.js')

Page({
  data: {
    phoneNumber: '' // 用于显示手机号
  },

  onLoad() {
    // 页面加载时检查本地存储中的手机号
    const savedPhoneNumber = wx.getStorageSync('phoneNumber')
    if (savedPhoneNumber) {
      this.setData({
        phoneNumber: savedPhoneNumber
      })
    }
  },
  // 获取手机号回调函数
  getPhoneNumber(e) {
    console.log('获取手机号回调:', e.detail)
    
    // 检查用户是否授权
    if (e.detail.errMsg === 'getPhoneNumber:fail user deny') {
      wx.showToast({
        title: '用户拒绝授权',
        icon: 'none'
      })
      return
    }
    
    if (e.detail.code) {
      // 先进行微信登录获取openid
      loginFn().then(res => {
        console.log(res, '接口换取的openid')
        console.log('获取手机号的动态令牌:', e.detail.code)
        
        // 使用phoneCode和openId获取手机号
        getPhoneNumberFn(e.detail.code, res.openid).then(res2 => {
          if (res2.code == 0) {
             const phoneNumber = res2.content.phone_info.phoneNumber
             // 保存手机号到本地存储
             wx.setStorageSync('phoneNumber', phoneNumber)
             // 更新页面显示
             this.setData({
               phoneNumber: phoneNumber
             })
             wx.showToast({
               title: '登录成功'
             })
             console.log('登录成功，手机号:', phoneNumber)
          } else {
            wx.showToast({
              title: '获取手机号失败',
              icon: 'none'
            })
          }
        }).catch(err => {
          console.error('获取手机号失败:', err)
          wx.showToast({
            title: '获取手机号失败',
            icon: 'none'
          })
        })
      }).catch(err => {
        console.error('微信登录失败:', err)
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
      })
    } else {
      wx.showToast({
        title: '获取手机号失败',
        icon: 'none'
      })
    }
  }
})