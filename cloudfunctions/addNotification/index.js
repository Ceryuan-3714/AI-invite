// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { 
    type, // 通知类型: 'checkin', 'registration', 等
    eventId, // 活动ID
    senderId, // 发送者ID (用户的openid)
    senderName, // 发送者名称
    senderAvatar, // 发送者头像
    recipientId, // 接收者ID (活动创建者的openid)
    message, // 通知消息内容
    surveyOption, // 话题调查选项 (可选)
  } = event
  
  try {
    // 验证必要参数
    if (!type || !eventId || !senderId || !recipientId) {
      return {
        success: false,
        message: '缺少必要参数'
      }
    }

    // 获取活动信息以便在通知中显示活动标题
    const eventRes = await db.collection('events').doc(eventId).get()
    
    if (!eventRes.data) {
      return {
        success: false,
        message: '未找到活动信息'
      }
    }
    
    const eventInfo = eventRes.data
    
    // 构建通知对象
    const notification = {
      type,
      eventId,
      eventTitle: eventInfo.title || '活动',
      senderId,
      senderName: senderName || '用户',
      senderAvatar: senderAvatar || '',
      recipientId,
      message: message || `用户参与了活动`,
      surveyOption, // 如果有选择话题调查选项
      createdAt: db.serverDate(),
      read: false // 初始为未读状态
    }
    
    // 将通知添加到数据库
    const result = await db.collection('notifications').add({
      data: notification
    })
    
    return {
      success: true,
      notificationId: result._id
    }
    
  } catch (error) {
    console.error('创建通知失败:', error)
    return {
      success: false,
      message: '创建通知失败: ' + error.message
    }
  }
} 