// eventUtils.js - 活动相关通用工具函数
const cloudDB = require('./cloudDB.js');
const subscribeMessageUtils = require('./subscribeMessageUtils.js');

/**
 * 判断用户是否是活动创建者
 * @param {Object} event 活动对象
 * @param {Object} userInfo 用户信息
 * @returns {boolean} 是否为创建者
 */
function isUserCreator(event, userInfo) {
  if (!userInfo || !event) return false;
  
  // 优先使用creatorOpenid字段判断，与用户列表中的逻辑一致
  if (event.creatorOpenid && userInfo.openid) {
    console.log('检查用户是否是活动创建者(使用creatorOpenid):', {
      '事件creatorOpenid': event.creatorOpenid,
      '用户openid': userInfo.openid
    });
    return event.creatorOpenid === userInfo.openid;
  }
  
  // 兼容旧逻辑，如果creatorOpenid不存在，则使用_openid
  console.log('检查用户是否是活动创建者(使用_openid):', {
    '事件_openid': event._openid,
    '用户openid': userInfo.openid
  });
  return event._openid && userInfo.openid && event._openid === userInfo.openid;
}

/**
 * 判断用户是否已报名该活动
 * @param {Object} event 活动对象
 * @param {Object} userInfo 用户信息
 * @returns {boolean} 是否已报名
 */
function isUserJoined(event, userInfo) {
  if (!userInfo || !event || !event.participants) return false;
  
  // 如果用户是创建者，默认标记为已参与
  if (isUserCreator(event, userInfo)) {
    console.log('用户是创建者，默认标记为已参与');
    return true;
  }
  
  console.log('检查用户是否在参与者列表中', {
    '用户openid': userInfo.openid,
    '参与者列表': event.participants
  });
  
  // 检查participants的类型和结构
  if (Array.isArray(event.participants)) {
    // 情况1: participants是字符串数组 (每个元素是openid)
    if (event.participants.length > 0 && typeof event.participants[0] === 'string') {
  return event.participants.includes(userInfo.openid);
    }
    
    // 情况2: participants是对象数组 (每个对象有openid属性)
    return event.participants.some(participant => {
      if (typeof participant === 'object') {
        // 检查不同可能的标识符字段
        return (participant.openid && participant.openid === userInfo.openid) ||
               (participant._id && participant._id === userInfo._id);
      }
      return false;
    });
  }
  
  return false;
}

/**
 * 检查活动是否已过期
 * @param {Object} event 活动对象
 * @returns {boolean} 活动是否已过期
 */
function isEventExpired(event) {
  if (!event || !event.date) return false;
  
  try {
    const now = new Date();
    
    // 解析活动日期
    const eventDate = new Date(event.date);
    
    // 解析活动结束时间（如果有）
    let eventEndTime = null;
    if (event.endTime) {
      // 如果有单独的结束时间字段
      const [hours, minutes] = event.endTime.split(':').map(Number);
      eventDate.setHours(hours, minutes);
      eventEndTime = new Date(eventDate);
    } else if (event.time && event.time.includes('-')) {
      // 如果时间格式是 HH:MM-HH:MM
      const endTimeStr = event.time.split('-')[1].trim();
      const [hours, minutes] = endTimeStr.split(':').map(Number);
      eventDate.setHours(hours, minutes);
      eventEndTime = new Date(eventDate);
    } else if (event.time) {
      // 如果只有单一时间，假设活动持续1小时
      const [hours, minutes] = event.time.split(':').map(Number);
      eventDate.setHours(hours, minutes);
      eventEndTime = new Date(eventDate);
      eventEndTime.setHours(eventEndTime.getHours() + 1);
    } else {
      // 如果没有时间信息，假设活动在当天23:59结束
      eventDate.setHours(23, 59, 59);
      eventEndTime = eventDate;
    }
    
    // 如果没有有效的结束时间，返回false
    if (!eventEndTime) return false;
    
    // 检查当前时间是否超过了活动结束时间
    return now > eventEndTime;
  } catch (error) {
    console.error('检查活动是否过期时出错:', error);
    return false;
  }
}

/**
 * 处理报名操作
 * @param {Object} options 操作选项
 * @param {string} options.eventId 活动ID
 * @param {Object} options.userInfo 用户信息
 * @param {Function} options.onSuccess 成功回调
 * @param {Function} options.onFail 失败回调
 * @param {boolean} options.isJoined 是否已报名（决定执行取消还是报名）
 */
async function handleJoinEvent(options) {
  const { eventId, userInfo, onSuccess, onFail, isJoined } = options;
  
  // 检查必要参数
  if (!eventId || !userInfo) {
    console.error('缺少必要参数', { eventId, userInfo });
    if (typeof onFail === 'function') {
      onFail(new Error('缺少必要参数'));
    }
    return;
  }
  
  // 显示加载状态
  wx.showLoading({
    title: isJoined ? '取消报名中...' : '报名中...',
    mask: true
  });
  
  try {
    // 根据当前状态调用不同的数据库操作
    let result;
    if (isJoined) {
      // 已报名，执行取消操作
      result = await cloudDB.cancelJoinEvent(eventId, userInfo);
    } else {
      // 未报名，执行报名操作
      result = await cloudDB.joinEvent(eventId, userInfo);
      
      // 报名成功后，可以获取活动详情用于其他操作
      if (result) {
        try {
          // 获取活动详情
          const event = await cloudDB.getEventById(eventId);
          
          if (event) {
            // 格式化活动时间（用于日志或其他非订阅消息的操作）
            let eventTime = '';
            if (event.date) {
              const date = new Date(event.date);
              const dateStr = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
              
              if (event.time) {
                eventTime = `${dateStr} ${event.time}`;
              } else {
                eventTime = dateStr;
              }
            }
            
            // 获取活动地点
            const eventLocation = event.location || '未设置地点';
            
            // 记录报名信息（不再在这里请求订阅消息授权）
            console.log('用户已成功报名活动:', {
              eventId: eventId,
              eventTitle: event.title || '活动',
              eventTime: eventTime,
              eventLocation: eventLocation
            });
            
            // 如果用户已经在其他地方授权了订阅消息，可以在这里发送服务通知
            // 但不再在这里请求授权，因为这里不是用户点击的直接响应
          }
        } catch (notifyError) {
          console.error('准备发送服务通知时出错:', notifyError);
          // 通知发送失败不影响主流程
        }
      }
    }
    
    // 隐藏加载状态
    wx.hideLoading();
    
    if (result) {
      // 操作成功
      wx.showToast({
        title: isJoined ? '已取消报名' : '报名成功',
        icon: 'success'
      });
      
      // 调用成功回调
      if (typeof onSuccess === 'function') {
        onSuccess(result);
      }
    } else {
      // 操作失败
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
      
      // 调用失败回调
      if (typeof onFail === 'function') {
        onFail(new Error('操作结果为失败'));
      }
    }
  } catch (error) {
    // 发生异常
    console.error(isJoined ? '取消报名失败' : '报名失败', error);
    wx.hideLoading();
    
    wx.showToast({
      title: isJoined ? '取消报名失败' : '报名失败',
      icon: 'none'
    });
    
    // 调用失败回调
    if (typeof onFail === 'function') {
      onFail(error);
    }
  }
}

/**
 * 处理编辑活动跳转
 * @param {string} eventId 活动ID
 */
function navigateToEditEvent(eventId) {
  if (!eventId) {
    console.error('编辑活动失败：缺少活动ID');
    wx.showToast({
      title: '活动ID不存在',
      icon: 'none'
    });
    return;
  }
  
  // 跳转到编辑活动页面
  wx.navigateTo({
    url: `/pages/editEvent/editEvent?id=${eventId}`,
    fail: (err) => {
      console.error('跳转到编辑页面失败:', err);
      wx.showToast({
        title: '打开编辑页面失败',
        icon: 'none'
      });
    }
  });
}

/**
 * 处理活动数据，统一字段和计算状态
 * @param {Object} event 活动数据
 * @param {Object} userInfo 用户信息
 * @returns {Object} 处理后的活动数据
 */
function processEventData(event, userInfo) {
  if (!event) return null;
  
  // 确保活动有_id字段
  if (!event._id && event.id) {
    event._id = event.id;
  }
  
  // 确保participants字段存在
  if (!event.participants) {
    event.participants = [];
  }
  
  // 确保creatorOpenid字段存在，与用户列表中的逻辑保持一致
  if (!event.creatorOpenid && event._openid) {
    console.log('设置creatorOpenid为_openid:', event._openid);
    event.creatorOpenid = event._openid;
  }
  
  // 检查用户是否为创建者
  const isCreator = isUserCreator(event, userInfo);
  event.isCreator = isCreator;
  
  // 检查用户是否已报名
  const isJoined = isUserJoined(event, userInfo);
  event.isJoined = isJoined;
  
  // 检查活动是否已过期
  const isExpired = isEventExpired(event);
  event.isExpired = isExpired;
  
  // 确保currentAttendees与participants长度一致
  event.currentAttendees = event.participants.length;
  
  // 确保有默认值
  if (!event.cover) event.cover = '/images/default_event_cover.jpg';
  if (!event.maxAttendees) event.maxAttendees = 100;
  
  console.log('处理后的活动数据:', {
    isCreator,
    isJoined,
    isExpired,
    _openid: event._openid,
    creatorOpenid: event.creatorOpenid,
    currentUser: userInfo ? userInfo.openid : null
  });
  
  return event;
}

// 导出所有函数
module.exports = {
  isUserCreator,
  isUserJoined,
  isEventExpired,
  handleJoinEvent,
  navigateToEditEvent,
  processEventData
};
