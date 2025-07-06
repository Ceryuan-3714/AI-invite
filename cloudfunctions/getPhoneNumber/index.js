// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { code } = event
    
    if (!code) {
      return {
        success: false,
        message: '缺少code参数'
      }
    }
    
    // 获取用户手机号
    const result = await cloud.openapi.phonenumber.getPhoneNumber({
      code: code
    })
    
    if (result && result.phoneInfo) {
      return {
        success: true,
        phoneNumber: result.phoneInfo.phoneNumber,
        purePhoneNumber: result.phoneInfo.purePhoneNumber,
        countryCode: result.phoneInfo.countryCode,
        openid: wxContext.OPENID
      }
    } else {
      return {
        success: false,
        message: '获取手机号失败'
      }
    }
  } catch (error) {
    console.error('获取手机号失败:', error)
    return {
      success: false,
      message: error.message || '获取手机号时发生错误'
    }
  }
} 