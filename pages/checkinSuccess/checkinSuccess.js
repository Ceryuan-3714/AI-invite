const app = getApp();
const cloudDB = require('../../utils/cloudDB.js');
const authUtils = require('../../utils/authUtils.js');
const eventUtils = require('../../utils/eventUtils.js');

// 辅助函数：检查是否在签到时间段内
function isWithinCheckinTime(event, checkinConfig, currentTime) {
  if (!event || !event.date || !event.startTime || !checkinConfig || !checkinConfig.enabled) {
    return false;
  }

  try {
    const eventDateStr = event.date; // "YYYY-MM-DD"
    const eventStartTimeStr = event.startTime; // "HH:mm"
    
    // 创建日期对象，确保正确处理本地时区
    // 使用单独的year, month, day, hour, minute参数构造Date以避免时区问题
    const [year, month, day] = eventDateStr.split('-').map(num => parseInt(num, 10));
    const [hour, minute] = eventStartTimeStr.split(':').map(num => parseInt(num, 10));
    
    // 注意：JavaScript月份从0开始，所以需要减1
    const eventStartDateTime = new Date(year, month - 1, day, hour, minute);
    
    if (isNaN(eventStartDateTime.getTime())) {
      console.error('无效的活动开始日期或时间:', eventDateStr, eventStartTimeStr);
      return false;
    }

    // 确保openTimeOffset是有效的数字，并设置默认值
    const openTimeOffset = (typeof checkinConfig.openTimeOffset === 'number' ? checkinConfig.openTimeOffset : 0) * 60 * 1000;
    console.log(`签到时间计算：使用的openTimeOffset值(分钟): ${openTimeOffset/60/1000}, 原始值: ${checkinConfig.openTimeOffset}`);
    
    let checkinOpenDateTime = new Date(eventStartDateTime.getTime() - openTimeOffset);
    // 签到结束时间默认为活动开始后1小时，可以根据需求调整
    let checkinCloseDateTime = new Date(eventStartDateTime.getTime() + 60 * 60 * 1000); 

    // 时间戳比较，确保比较的是数字而不是对象
    const currentTimestamp = currentTime.getTime();
    const openTimestamp = checkinOpenDateTime.getTime();
    const closeTimestamp = checkinCloseDateTime.getTime();
    
    console.log(`签到判断详细信息：
    当前时间: ${currentTime} (${currentTimestamp})
    签到开放: ${checkinOpenDateTime} (${openTimestamp})
    签到截止: ${checkinCloseDateTime} (${closeTimestamp})
    当前>=开放: ${currentTimestamp >= openTimestamp}
    当前<=截止: ${currentTimestamp <= closeTimestamp}
    最终结果: ${currentTimestamp >= openTimestamp && currentTimestamp <= closeTimestamp}`);
    
    return currentTimestamp >= openTimestamp && currentTimestamp <= closeTimestamp;
  } catch (e) {
    console.error("检查签到时间出错:", e);
    return false;
  }
}

// 格式化日期时间
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? dateStr : 
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// 格式化时间
function formatTime(timeStr) {
  return timeStr || '';
}

// 获取当前时间的格式化字符串
function getCurrentTimeString() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

Page({
  data: {
    eventId: '',
    shortId: '',
    event: null,
    isLoggedIn: false,
    isAttending: false,
    isSuccess: false,
    statusTitle: '签到处理中...',
    eventTitle: '',
    eventDate: '',
    eventTime: '',
    checkinTime: '',
    message: ''
  },

  onLoad: function(options) {
    console.log("checkinSuccess onLoad options:", options);
    
    // 处理扫描二维码进入的情况
    if (options.scene) {
      console.log("检测到scene参数:", options.scene);
      this.handleSceneParameter(options.scene);
      return;
    }
    
    // 处理直接传入短ID的情况
    if (options.sid) {
      console.log("检测到短ID参数:", options.sid);
      this.setData({ shortId: options.sid });
      this.processCheckinByShortId(options.sid);
      return;
    }
    
    // 常规参数方式（不通过二维码）- 使用与首页列表相同的参数格式
    if (options.id) {
      // 记录活动ID到页面数据
      this.setData({ eventId: options.id });
      console.log("从options.id获取活动ID:", options.id);
      this.processCheckin(options.id);
    } else {
      this.showError('缺少活动ID参数');
    }
  },

  // 处理扫描二维码进入的场景参数
  handleSceneParameter: function(scene) {
    // 尝试解析scene参数
    try {
      console.log('原始scene参数值:', scene);
      let eventId = '';
      let shortId = '';
      
      // 新增：尝试识别shortId格式
      // 如果scene是6位或带时间戳的10位字符串，可能是shortId
      if (/^[A-Za-z0-9]{6,10}$/.test(scene)) {
        console.log('可能是短ID格式:', scene);
        shortId = scene;
        this.setData({ shortId: shortId });
        this.processCheckinByShortId(shortId);
        return;
      }
      
      // 优先尝试将场景值直接当作活动ID
      eventId = scene;
      
      // 如果包含=号，可能是id=xxx或sid=xxx格式
      if (scene.includes('=')) {
        console.log('场景值包含=号，尝试解析');
        const pair = scene.split('=');
        if (pair.length === 2) {
          if (pair[0] === 'id') {
            console.log('解析为id=xxx格式');
            eventId = pair[1];
          } else if (pair[0] === 'sid') {
            console.log('解析为sid=xxx格式（短ID）');
            shortId = pair[1];
            this.setData({ shortId: shortId });
            this.processCheckinByShortId(shortId);
            return;
          }
        }
      }
      
      console.log('最终解析后的活动ID:', eventId);
      
      if (eventId) {
        this.setData({ eventId: eventId });
        this.processCheckin(eventId);
      } else {
        this.showError('无法从二维码中解析活动ID');
      }
    } catch (error) {
      console.error('解析scene参数失败:', error, scene);
      this.showError('二维码参数解析失败');
    }
  },

  // 新增：通过短ID处理签到
  processCheckinByShortId: async function(shortId) {
    if (!shortId) {
      this.showError('缺少活动短ID');
      return;
    }

    console.log('开始通过短ID处理签到:', shortId);
    wx.showLoading({ title: '处理签到中...' });
    
    try {
      // 1. 通过短ID获取活动信息
      const event = await cloudDB.getEventByShortId(shortId);
      if (!event) {
        throw new Error('未找到活动信息，请确认二维码有效性');
      }
      
      // 验证活动对象是否包含有效的_id
      if (!event._id || typeof event._id !== 'string') {
        console.error('获取到的活动对象缺少有效的_id字段:', event);
        throw new Error('活动数据异常，请联系管理员');
      }
      
      // 设置活动ID并调用常规签到处理流程
      this.setData({ eventId: event._id });
      await this.processCheckin(event._id);
      
    } catch (error) {
      wx.hideLoading();
      console.error('通过短ID处理签到失败:', error);
      this.showError('签到失败', error.message || '未知错误');
    }
  },

  // 处理签到逻辑
  processCheckin: async function(eventId) {
    if (!eventId) {
      this.showError('缺少活动ID');
      return;
    }

    console.log('开始处理签到，活动ID:', eventId);
    wx.showLoading({ title: '处理签到中...' });
    
    try {
      // 1. 检查用户是否已登录
      const isLoggedIn = authUtils.isUserLoggedIn();
      this.setData({ isLoggedIn: isLoggedIn });
      
      if (!isLoggedIn) {
        wx.hideLoading();
        this.showError('您尚未登录，请先登录');
        
        // 设置登录后的重定向URL
        const redirectUrl = `/pages/checkinSuccess/checkinSuccess?id=${eventId}`;
        wx.setStorageSync('loginRedirectUrl', redirectUrl);
        
        // 显示确认框，询问用户是否要登录
        wx.showModal({
          title: '登录提示',
          content: '签到需要先登录，是否前往登录?',
          confirmText: '去登录',
          cancelText: '返回首页',
          success: (res) => {
            if (res.confirm) {
              authUtils.redirectToLogin(redirectUrl);
            } else {
              wx.switchTab({ url: '/pages/index/index' });
            }
          }
        });
        return;
      }
      
      // 2. 检查用户资料是否完整
      const app = getApp();
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
      
      if (!authUtils.isUserProfileComplete(userInfo)) {
        wx.hideLoading();
        this.showError('资料不完整，请先完善资料');
        
        // 显示确认框，询问用户是否要完善资料
        wx.showModal({
          title: '完善资料',
          content: '签到前需要完善个人资料（姓名、公司、职位），是否前往完善？',
          confirmText: '去完善',
          cancelText: '返回首页',
          success: (res) => {
            if (res.confirm) {
              // 保存当前页面路径，用于完善资料后跳回
              wx.setStorageSync('profileSetupRedirectUrl', `/pages/checkinSuccess/checkinSuccess?id=${eventId}`);
              
              wx.navigateTo({
                url: '/pages/profile_setup/profile_setup',
                fail: (err) => {
                  console.error('跳转到资料完善页面失败:', err);
                  wx.showToast({ title: '跳转失败，请重试', icon: 'none' });
                }
              });
            } else {
              wx.switchTab({ url: '/pages/index/index' });
            }
          }
        });
        return;
      }
      
      // 3. 获取活动信息
       console.log('尝试通过getEventById获取活动信息:', eventId);
      let event = await cloudDB.getEventById(eventId);
      
      // 如果通过常规方法获取失败，尝试直接从数据库获取
      if (!event) {
        console.warn('通过常规方法未找到活动，尝试直接查询数据库');
        try {
          const db = wx.cloud.database();
          
          // 尝试使用 _id 查询
          console.log('尝试使用_id查询:', eventId);
          let eventByDocId = null;
          try {
            const docResult = await db.collection('events').doc(eventId).get();
            eventByDocId = docResult.data;
            console.log('_id查询结果:', eventByDocId);
          } catch (docErr) {
            console.log('_id查询失败:', docErr);
          }
            
          if (eventByDocId) {
            event = eventByDocId;
            console.log('通过doc查询找到活动:', event);
          } else {
            // 尝试使用id字段查询
            console.log('尝试使用id字段查询:', eventId);
            const whereResult = await db.collection('events').where({
              id: eventId
            }).get();
            const eventsByIdField = whereResult.data;
            console.log('id字段查询结果:', eventsByIdField);
            
            if (eventsByIdField && eventsByIdField.length > 0) {
              event = eventsByIdField[0];
              console.log('通过id字段查询找到活动:', event);
            } else {
              // 最后尝试使用_id字段查询
              console.log('尝试使用_id字段查询:', eventId);
              const idWhereResult = await db.collection('events').where({
                _id: eventId
              }).get();
              const eventsByUnderscoreId = idWhereResult.data;
              console.log('_id字段查询结果:', eventsByUnderscoreId);
              
              if (eventsByUnderscoreId && eventsByUnderscoreId.length > 0) {
                event = eventsByUnderscoreId[0];
                console.log('通过_id字段查询找到活动:', event);
              }
            }
          }
        } catch (dbError) {
          console.error('直接数据库查询失败:', dbError);
        }
      }
      
      if (!event) {
        throw new Error('未找到活动信息，请确认二维码有效性');
      }
      
      // 3. 处理活动数据，标记用户参与状态
      const processedEvent = eventUtils.processEventData(event, userInfo);
      
      // 更新基本活动信息（无论签到结果如何）
      this.setData({
        event: processedEvent,
        eventTitle: processedEvent.title || '未命名活动',
        eventDate: formatDate(processedEvent.date),
        eventTime: `${formatTime(processedEvent.startTime)} - ${formatTime(processedEvent.endTime)}` 
      });
      
      // 4. 检查用户是否是参与者（允许未报名用户签到）
      const isAttending = processedEvent.isJoined;
      this.setData({ isAttending: isAttending });
      
      // 注释掉报名检查，允许未报名用户签到
      // if (!isAttending) {
      //   wx.hideLoading();
      //   this.showError('您尚未报名该活动，无法签到');
      //   return;
      // }
      
      // 5. 检查当前时间是否在签到时间范围内
      const checkinConfig = processedEvent.checkinConfig || { enabled: false };
      if (!checkinConfig.enabled) {
        wx.hideLoading();
        this.showError('该活动未启用签到功能');
        return;
      }
      
      const currentTime = new Date();
      const canCheckin = isWithinCheckinTime(processedEvent, checkinConfig, currentTime);
      console.log("是否可check：",canCheckin);
      if (!canCheckin) {
        wx.hideLoading();
        // 判断签到是未开始还是已结束
        const eventStartDateTime = new Date(`${processedEvent.date}T${processedEvent.startTime}:00`);
        
        // 确保openTimeOffset是有效的数字
        const openTimeOffset = (typeof checkinConfig.openTimeOffset === 'number' ? checkinConfig.openTimeOffset : 0) * 60 * 1000;
        const checkinOpenDateTime = new Date(eventStartDateTime.getTime() + openTimeOffset);
        
        let message = '';
        // 使用时间戳进行比较
        const currentTimestamp = currentTime.getTime();
        const openTimestamp = checkinOpenDateTime.getTime();
        
        console.log(`页面判断: 当前时间戳: ${currentTimestamp}, 开放时间戳: ${openTimestamp}, 比较结果: ${currentTimestamp < openTimestamp}`);
        
        if (currentTimestamp < openTimestamp) {
          message = '签到尚未开始，请在活动开始前再试';
        } else {
          message = '签到已结束';
        }
        
        this.showError('不在签到时间范围内', message);
        return;
      }
      
      // 6. 执行签到操作
      const res = await wx.cloud.callFunction({
        name: 'markCheckin',
        data: {
          eventId: eventId,
          userId: userInfo.openid,
          userName: userInfo.name && userInfo.name.trim() !== '' ? userInfo.name : '未设置名称',
          userAvatar: userInfo.avatarUrl
        }
      });
      
      wx.hideLoading();
      console.log(res.result,res.result.success);
      if (res.result && res.result.success) {
        // 签到成功
        this.setData({
          isSuccess: true,
          statusTitle: '签到成功！',
          checkinTime: getCurrentTimeString(),
          message: '您已成功签到，感谢您的参与！'
        });
        
        wx.showToast({
          title: '签到成功',
          icon: 'success',
          duration: 2000
        });
      } else {
        throw new Error(res.result?.message || '签到失败');
      }
      
    } catch (error) {
      wx.hideLoading();
      console.error('签到处理失败:', error);
      this.showError('签到失败', error.message || '未知错误');
    }
  },
  
  // 显示错误信息
  showError: function(title, message = '') {
    this.setData({
      isSuccess: false,
      statusTitle: title,
      message: message
    });
  },
  
  // 查看活动详情
  viewEventDetail: function() {
    if (this.data.eventId) {
      wx.navigateTo({
        url: `/pages/eventDetail/eventDetail?id=${this.data.eventId}`
      });
    } else {
      wx.showToast({
        title: '无法获取活动ID',
        icon: 'none'
      });
    }
  },
  
  // 返回首页
  backToHome: function() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});