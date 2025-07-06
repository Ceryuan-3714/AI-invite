// 云函数入口文件
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用动态当前环境

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('调用AI助理云函数，参数:', event)
  
  const { action, eventId, userId } = event
  
  // 如果是报名活动的操作
  if (action === 'joinEvent') {
    try {
      // 这里是调用AI助理API的逻辑
      // 实际使用时需要填入有效的apiKey和endpoint
      const apiKey = '' // 留空，后续添加
      const apiEndpoint = 'https://api.example.com/assistant' // 示例URL，需替换为实际API地址
      
      // 构建请求参数
      const requestData = {
        eventId: eventId,
        userId: userId,
        action: 'joinEvent'
      }
      
      // 模拟API调用
      // 实际使用时应替换为真实API调用
      /*
      const response = await axios({
        method: 'post',
        url: apiEndpoint,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        data: requestData
      })
      
      return {
        success: true,
        data: response.data
      }
      */
      
      // 目前返回模拟数据
      return {
        success: true,
        message: '已成功接入活动小助手，您可以随时提问关于活动的问题！',
        data: {
          assistantReady: true,
          eventId: eventId
        }
      }
    } catch (error) {
      console.error('调用AI助理API失败:', error)
      return {
        success: false,
        error: error.message || '调用助理失败'
      }
    }
  } else {
    // 其他动作暂不支持
    return {
      success: false,
      message: '新的助理功能还在开发中'
    }
  }
} 