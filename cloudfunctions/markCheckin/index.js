const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 辅助函数：检查是否在签到时间段内 (与客户端逻辑类似，但使用服务器时间)
function isWithinCheckinTime(event, checkinConfig, currentTimeUTC) {
  if (!event || !event.date || !event.startTime || !checkinConfig || !checkinConfig.enabled) {
    return false;
  }

  try {
    const beijingOffsetMs = 8 * 60 * 60 * 1000;
    const currentTimeBeijing = new Date(currentTimeUTC.getTime() + beijingOffsetMs);
    
    console.log(`markCheckin: 服务器UTC时间: ${currentTimeUTC.toISOString()}, 转换后北京时间: ${currentTimeBeijing.toISOString()}`);
    
    const eventDateStr = event.date;
    const eventStartTimeStr = event.startTime;
    
    const [year, month, day] = eventDateStr.split('-').map(num => parseInt(num, 10));
    const [hour, minute] = eventStartTimeStr.split(':').map(num => parseInt(num, 10));
    
    // MODIFIED: Construct eventStartDateTimeBeijing directly assuming event.date/time are Beijing time.
    // JavaScript month is 0-indexed.
    const eventStartDateTimeBeijing = new Date(year, month - 1, day, hour, minute, 0, 0); 
    
    if (isNaN(eventStartDateTimeBeijing.getTime())) {
        console.error('markCheckin: 无效的活动开始日期或时间:', eventDateStr, eventStartTimeStr);
        return false;
    }

    const openTimeOffsetMs = (typeof checkinConfig.openTimeOffset === 'number' ? checkinConfig.openTimeOffset : 0) * 60 * 1000;
    
    let checkinOpenDateTimeBeijing = new Date(eventStartDateTimeBeijing.getTime() - openTimeOffsetMs); // This was already correct
    let checkinCloseDateTimeBeijing = new Date(eventStartDateTimeBeijing.getTime() + 60 * 60 * 1000);

    const currentTimestamp = currentTimeBeijing.getTime();
    const openTimestamp = checkinOpenDateTimeBeijing.getTime();
    const closeTimestamp = checkinCloseDateTimeBeijing.getTime();
    
    console.log(`markCheckin: 签到时间详细信息（北京时间）:
    当前北京时间: ${currentTimeBeijing.toISOString()} (${currentTimestamp})
    活动时间: ${eventDateStr} ${eventStartTimeStr}
    签到开放时间: ${checkinOpenDateTimeBeijing.toISOString()} (${openTimestamp})
    签到截止时间: ${checkinCloseDateTimeBeijing.toISOString()} (${closeTimestamp})
    当前>=开放: ${currentTimestamp >= openTimestamp}
    当前<=截止: ${currentTimestamp <= closeTimestamp}
    最终结果: ${currentTimestamp >= openTimestamp && currentTimestamp <= closeTimestamp}`);
    
    return currentTimestamp >= openTimestamp && currentTimestamp <= closeTimestamp;
  } catch (e) {
    console.error("markCheckin: 检查签到时间出错:", e);
    return false;
  }
}

exports.main = async (event, context) => {
  const { eventId, shortId, userId, userName, userAvatar } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; // 使用调用者的openid作为userId，更安全

  if ((!eventId && !shortId) || !openid) {
    return { success: false, message: '缺少必要参数 (eventId/shortId 或 userId)' };
  }

  const currentTimeUTC = new Date(); // 服务器当前时间（UTC）
  
  // 将UTC时间转换为北京时间
  const beijingOffsetMs = 8 * 60 * 60 * 1000; // 8小时的毫秒数
  const currentTimeBeijing = new Date(currentTimeUTC.getTime() + beijingOffsetMs);
  
  console.log(`markCheckin: 服务器当前时间 - UTC: ${currentTimeUTC.toISOString()}, 北京时间: ${currentTimeBeijing.toISOString()}`);

  try {
    // 1. 获取活动信息，优先使用eventId，如果没有则使用shortId
    let eventDetail = null;
    
    if (eventId) {
      // 如果提供了eventId，直接使用ID查询
      const eventRes = await db.collection('events').doc(eventId).get()
        .catch(async err => {
          console.warn(`通过doc直接查询事件 ${eventId} 失败: ${err.message}，尝试where查询...`);
          const whereRes = await db.collection('events').where({ _id: eventId }).get();
          if (whereRes.data && whereRes.data.length > 0) return { data: whereRes.data[0] };
          return { data: null };
        });
      
      eventDetail = eventRes.data;
    } 
    
    if (!eventDetail && shortId) {
      // 如果没有找到活动或者没有提供eventId，尝试使用shortId
      console.log(`尝试使用短ID查询活动: ${shortId}`);
      const shortIdRes = await db.collection('events').where({
        shortId: shortId
      }).get();
      
      if (shortIdRes.data && shortIdRes.data.length > 0) {
        console.log(`通过短ID ${shortId} 找到活动`);
        eventDetail = shortIdRes.data[0];
      }
    }

    if (!eventDetail) {
      return { success: false, message: '活动不存在' };
    }

    // 2. 检查活动是否启用签到
    const checkinConfig = eventDetail.checkinConfig;
    if (!checkinConfig || !checkinConfig.enabled) {
      return { success: false, message: '该活动无需签到' };
    }

    // 3. 检查用户是否已报名该活动 (已注释，允许未报名用户签到)
    // 假设eventDetail.participants是openids数组
    // if (!eventDetail.participants || !eventDetail.participants.includes(openid)) {
    //   return { success: false, message: '您尚未报名此活动，无法签到' };
    // }

    // 4. 检查是否在签到时间范围内 (服务器端校验)
    if (!isWithinCheckinTime(eventDetail, checkinConfig, currentTimeUTC)) {
        const eventDateStr = eventDetail.date;
        const eventStartTimeStr = eventDetail.startTime;
        
        const [year, month, day] = eventDateStr.split('-').map(num => parseInt(num, 10));
        const [hour, minute] = eventStartTimeStr.split(':').map(num => parseInt(num, 10));
        
        // MODIFIED: Construct eventStartDateTimeBeijing directly here as well
        const eventStartDateTimeBeijing = new Date(year, month - 1, day, hour, minute, 0, 0);
        
        const openTimeOffsetMs = (typeof checkinConfig.openTimeOffset === 'number' ? checkinConfig.openTimeOffset : 0) * 60 * 1000;
        // MODIFIED: Changed + to - for checkinOpenDateTimeBeijing calculation
        const checkinOpenDateTimeBeijing = new Date(eventStartDateTimeBeijing.getTime() - openTimeOffsetMs);
        
        const currentTimestampBeijing = new Date(currentTimeUTC.getTime() + (8 * 60 * 60 * 1000)).getTime();
        const openTimestampBeijing = checkinOpenDateTimeBeijing.getTime();
        
        console.log(`markCheckin: 签到时间范围判断（北京时间）:
        当前时间: ${currentTimeBeijing.toISOString()} (${currentTimestampBeijing})
        签到开放: ${checkinOpenDateTimeBeijing.toISOString()} (${openTimestampBeijing})
        比较结果: ${currentTimestampBeijing < openTimestampBeijing ? '尚未开始' : '已结束'}`);
        
        if (currentTimestampBeijing < openTimestampBeijing) {
            return { success: false, message: '签到尚未开始' };
        } else {
            return { success: false, message: '签到已结束' };
        }
    }

    // 5. 检查用户是否已签到
    let checkins = eventDetail.checkins || [];
    if (checkins.find(item => item.openid === openid)) {
      return { success: false, message: '您已完成签到' };
    }

    // 6. 添加签到记录
    checkins.push({
      openid: openid,
      userName: userName || '匿名用户',
      userAvatar: userAvatar || '',
      checkInTime: db.serverDate()
    });

    // 7. 更新数据库
    await db.collection('events').doc(eventDetail._id).update({
      data: {
        checkins: checkins,
        updatedAt: db.serverDate()
      }
    });

    return { 
      success: true, 
      message: '签到成功!',
      checkInTime: currentTimeBeijing.toISOString()
    };

  } catch (error) {
    console.error('签到处理失败:', error);
    return { 
      success: false, 
      message: '签到处理失败: ' + (error.message || '未知错误'), 
      error: error 
    };
  }
};