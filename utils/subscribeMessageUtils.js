  // subscribeMessageUtils.js - 订阅消息和服务通知相关工具函数

/**
 * 请求订阅消息授权
 * @param {Array} tmplIds 模板ID数组
 * @returns {Promise<Object>} 授权结果
 */
async function requestSubscribeMessage(tmplIds) {
  if (!Array.isArray(tmplIds) || tmplIds.length === 0) {
    console.error('模板ID数组不能为空');
    return { errMsg: 'requestSubscribeMessage:fail parameter error: tmplIds can not be empty' };
  }

  try {
    console.log('请求订阅消息授权，模板ID:', tmplIds);
    const result = await wx.requestSubscribeMessage({
      tmplIds: tmplIds
    });
    console.log('订阅消息授权结果:', result);
    return result;
  } catch (error) {
    console.error('请求订阅消息授权失败:', error);
    return { errMsg: 'requestSubscribeMessage:fail ' + (error.errMsg || error.message || '未知错误') };
  }
}

/**
 * 发送活动报名成功的服务通知
 * @param {Object} options 选项
 * @param {string} options.openid 接收者的openid
 * @param {string} options.eventTitle 活动标题
 * @param {string} options.eventTime 活动时间
 * @param {string} options.eventLocation 活动地点
 * @returns {Promise<Object>} 发送结果
 */
async function sendRegistrationSuccessMessage(options) {
  const { openid, eventTitle, eventTime, eventLocation } = options;
  
  if (!openid || !eventTitle) {
    console.error('发送服务通知失败: 缺少必要参数', options);
    return { success: false, errMsg: '缺少必要参数' };
  }

  try {
    console.log('准备发送活动报名成功服务通知:', options);
    
    // 调用云函数发送服务通知
    const result = await wx.cloud.callFunction({
      name: 'sendSubscribeMessage',
      data: {
        openid: openid,
        templateId: 'vqEQeiif0RVlaUt-nxDcUb66GKaTI7OMLxSXUjxDlu4',
        page: `/pages/eventDetail/eventDetail?id=${options.eventId}`,
        data: {
          thing1: { value: eventTitle }, // 活动名称
          time2: { value: eventTime }, // 活动时间
          thing3: { value: eventLocation }, // 活动地点
          thing4: { value: '更多信息，请点击进入小程序查看' } // 备注
        }
      }
    });
    
    console.log('服务通知发送结果:', result);
    return result.result || { success: false, errMsg: '发送失败' };
  } catch (error) {
    console.error('发送服务通知失败:', error);
    return { success: false, errMsg: error.errMsg || error.message || '发送失败' };
  }
}

/**
 * 在活动页面请求订阅消息授权
 * @param {string} eventId 活动ID
 * @returns {Promise<Object>} 授权结果
 */
async function requestEventNotification(eventId) {
  try {
    // 活动相关的模板消息ID
    const tmplIds = ['vqEQeiif0RVlaUt-nxDcUb66GKaTI7OMLxSXUjxDlu4'];
    
    // 请求订阅消息授权
    const subscribeResult = await requestSubscribeMessage(tmplIds);
    
    // 记录用户的订阅状态
    if (subscribeResult[tmplIds[0]] === 'accept') {
      // 用户接受了订阅，可以在这里记录到数据库
      console.log('用户接受了活动通知订阅');
      
      // 可以调用云函数记录用户订阅状态
      try {
        await wx.cloud.callFunction({
          name: 'updateUserSubscription',
          data: {
            eventId: eventId,
            templateId: tmplIds[0],
            status: 'accept'
          }
        });
      } catch (error) {
        console.error('记录用户订阅状态失败:', error);
        // 继续执行，不影响用户体验
      }
    }
    
    return subscribeResult;
  } catch (error) {
    console.error('请求活动通知订阅失败:', error);
    return { errMsg: 'requestEventNotification:fail ' + (error.errMsg || error.message || '未知错误') };
  }
}

// 导出所有函数
module.exports = {
  requestSubscribeMessage,
  sendRegistrationSuccessMessage,
  requestEventNotification
};