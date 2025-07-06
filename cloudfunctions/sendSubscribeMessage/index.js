// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 发送订阅消息云函数
 * 用于向用户发送活动报名成功的服务通知
 * 
 * @param {Object} event 云函数调用参数
 * @param {string} event.openid 接收者的openid
 * @param {string} event.templateId 订阅消息模板ID
 * @param {string} event.page 点击消息后跳转的页面路径
 * @param {Object} event.data 模板内容，格式形如 { "key1": { "value": "value1" }, "key2": { "value": "value2" } }
 * @param {Object} context 云函数上下文
 * @returns {Object} 发送结果
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  
  // 如果没有传入openid，则使用当前调用者的openid
  const targetOpenid = event.openid || OPENID
  
  // 检查必要参数
  if (!event.templateId || !event.data) {
    return {
      success: false,
      errMsg: '缺少必要参数: templateId 或 data'
    }
  }
  
  try {
    // 记录日志
    console.log('准备发送订阅消息:', {
      touser: targetOpenid,
      templateId: event.templateId,
      page: event.page,
      data: event.data
    })
    
    // 调用订阅消息发送API
    const result = await cloud.openapi.subscribeMessage.send({
      touser: targetOpenid,
      templateId: event.templateId,
      page: event.page || 'pages/index/index',
      data: event.data,
      miniprogramState: 'formal' // 开发版，可选值: developer(开发版), trial(体验版), formal(正式版)
    })
    
    console.log('订阅消息发送结果:', result)
    
    return {
      success: true,
      ...result
    }
  } catch (error) {
    console.error('发送订阅消息失败:', error)
    return {
      success: false,
      errMsg: error.errMsg || error.message || '发送失败',
      error: error
    }
  }
}