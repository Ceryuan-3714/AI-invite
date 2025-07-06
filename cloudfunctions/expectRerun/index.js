// 期待加场功能的云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, expectData } = event
  const wxContext = cloud.getWXContext()
  
  try {
    switch (action) {
      case 'add':
        // 添加期待加场记录
        const { eventId, eventName, userName } = expectData
        
        if (!eventId || !eventName || !userName) {
          return {
            success: false,
            error: '缺少必要参数'
          }
        }
        
        // 检查用户是否已经对该活动表达过期待
        const existingExpect = await db.collection('expectRerun')
          .where({
            openid: wxContext.OPENID,
            eventId: eventId
          })
          .get()
          
        if (existingExpect.data.length > 0) {
          return {
            success: false,
            error: '您已经表达过期待了'
          }
        }
        
        // 添加期待记录
        const addResult = await db.collection('expectRerun').add({
          data: {
            openid: wxContext.OPENID,
            userName: userName,
            eventId: eventId,
            eventName: eventName,
            createTime: db.serverDate(),
            status: 'active' // active: 有效, cancelled: 已取消
          }
        })
        
        // 统计该活动的期待人数
        const countResult = await db.collection('expectRerun')
          .where({
            eventId: eventId,
            status: 'active'
          })
          .count()
        
        return {
          success: true,
          data: {
            _id: addResult._id,
            expectCount: countResult.total
          }
        }
        
      case 'cancel':
        // 取消期待加场
        const { cancelEventId } = expectData
        
        if (!cancelEventId) {
          return {
            success: false,
            error: '活动ID不能为空'
          }
        }
        
        const cancelResult = await db.collection('expectRerun')
          .where({
            openid: wxContext.OPENID,
            eventId: cancelEventId,
            status: 'active'
          })
          .update({
            data: {
              status: 'cancelled',
              cancelTime: db.serverDate()
            }
          })
          
        return {
          success: true,
          data: cancelResult
        }
        
      case 'getByEvent':
        // 获取某个活动的期待加场列表
        const { queryEventId } = expectData
        
        if (!queryEventId) {
          return {
            success: false,
            error: '活动ID不能为空'
          }
        }
        
        const expectList = await db.collection('expectRerun')
          .where({
            eventId: queryEventId,
            status: 'active'
          })
          .orderBy('createTime', 'desc')
          .get()
          
        return {
          success: true,
          data: expectList.data
        }
        
      case 'getByUser':
        // 获取用户的期待加场列表
        const userExpectList = await db.collection('expectRerun')
          .where({
            openid: wxContext.OPENID,
            status: 'active'
          })
          .orderBy('createTime', 'desc')
          .get()
          
        return {
          success: true,
          data: userExpectList.data
        }
        
      case 'getCount':
        // 获取某个活动的期待人数
        const { countEventId } = expectData
        
        if (!countEventId) {
          return {
            success: false,
            error: '活动ID不能为空'
          }
        }
        
        const count = await db.collection('expectRerun')
          .where({
            eventId: countEventId,
            status: 'active'
          })
          .count()
          
        return {
          success: true,
          data: { count: count.total }
        }
        
      default:
        return {
          success: false,
          error: '不支持的操作类型'
        }
    }
  } catch (error) {
    console.error('期待加场操作失败:', error)
    return {
      success: false,
      error: error.message || '操作失败'
    }
  }
}