// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 更新用户订阅状态云函数
 * 用于记录用户对特定活动的订阅消息授权状态
 * 
 * @param {Object} event 云函数调用参数
 * @param {string} event.eventId 活动ID
 * @param {string} event.templateId 订阅消息模板ID
 * @param {string} event.status 订阅状态 (accept/reject/ban)
 * @param {Object} context 云函数上下文
 * @returns {Object} 更新结果
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  
  const { eventId, templateId, status } = event
  
  // 检查必要参数
  if (!eventId || !templateId || !status) {
    return {
      success: false,
      errMsg: '缺少必要参数: eventId, templateId 或 status'
    }
  }
  
  try {
    // 记录日志
    console.log('更新用户订阅状态:', {
      openid: OPENID,
      eventId,
      templateId,
      status,
      timestamp: new Date()
    })
    
    // 查找是否已存在记录
    const existingRecord = await db.collection('user_subscriptions')
      .where({
        openid: OPENID,
        eventId: eventId,
        templateId: templateId
      })
      .get()
    
    const subscriptionData = {
      openid: OPENID,
      eventId: eventId,
      templateId: templateId,
      status: status,
      updateTime: db.serverDate()
    }
    
    let result
    
    if (existingRecord.data.length > 0) {
      // 更新现有记录
      result = await db.collection('user_subscriptions')
        .doc(existingRecord.data[0]._id)
        .update({
          data: {
            status: status,
            updateTime: db.serverDate()
          }
        })
      console.log('更新现有订阅记录成功:', result)
    } else {
      // 创建新记录
      subscriptionData.createTime = db.serverDate()
      result = await db.collection('user_subscriptions')
        .add({
          data: subscriptionData
        })
      console.log('创建新订阅记录成功:', result)
    }
    
    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('更新用户订阅状态失败:', error)
    return {
      success: false,
      errMsg: error.errMsg || error.message || '更新失败',
      error: error
    }
  }
}