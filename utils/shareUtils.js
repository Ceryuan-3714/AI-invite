/**
 * 分享工具函数
 * 提供统一的分享逻辑，支持活动封面和信息的分享
 * 支持Canvas动态生成5:4比例的分享海报
 */

/**
 * 生成活动分享信息
 * @param {Object} options 分享选项
 * @param {Object} options.event 活动信息对象
 * @param {string} options.eventId 活动ID
 * @param {string} options.defaultTitle 默认分享标题
 * @param {string} options.defaultPath 默认分享路径
 * @param {string} options.defaultImageUrl 默认分享图片
 * @returns {Object} 分享配置对象
 */
function generateShareConfig(options = {}) {
  const {
    event,
    eventId,
    defaultTitle = '诚邀您参与：精彩活动',
    defaultPath = '/pages/index/index',
    defaultImageUrl = '/images/share_default.jpg'
  } = options;

  // 如果有活动信息，使用活动相关的分享配置
  if (event && eventId) {
    const shareTitle = event.title ? `诚邀您参与：${event.title}` : defaultTitle;
    const sharePath = `/pages/eventDetail/eventDetail?id=${eventId}`;
    
    // 优先使用活动封面作为分享图片
    let shareImageUrl = defaultImageUrl;
    if (event.cover) {
      shareImageUrl = event.cover;
    }

    return {
      title: shareTitle,
      path: sharePath,
      imageUrl: shareImageUrl
    };
  }

  // 默认分享配置
  return {
    title: defaultTitle,
    path: defaultPath,
    imageUrl: defaultImageUrl
  };
}

/**
 * 处理页面分享事件的统一方法
 * @param {Object} res 分享事件对象
 * @param {Object} pageData 页面数据
 * @param {Object} options 额外选项
 * @returns {Object} 分享配置
 */
function handleShareAppMessage(res, pageData = {}, options = {}) {
  // 从按钮触发的分享
  if (res.from === 'button' && res.target && res.target.dataset) {
    const eventId = res.target.dataset.id;
    const eventTitle = res.target.dataset.title;
    const eventCover = res.target.dataset.cover;
    
    // 尝试从dataset或pageData中获取活动信息
    let event = null;
    if (pageData.event) {
      event = pageData.event;
    } else if (eventTitle) {
      event = { 
        title: eventTitle,
        cover: eventCover
      };
    }

    return generateShareConfig({
      event,
      eventId,
      defaultTitle: options.defaultTitle,
      defaultPath: options.defaultPath,
      defaultImageUrl: options.defaultImageUrl
    });
  }

  // 从右上角菜单触发的分享
  if (pageData.event && pageData.eventId) {
    return generateShareConfig({
      event: pageData.event,
      eventId: pageData.eventId,
      defaultTitle: options.defaultTitle,
      defaultPath: options.defaultPath,
      defaultImageUrl: options.defaultImageUrl
    });
  }

  // 默认分享
  return generateShareConfig({
    defaultTitle: options.defaultTitle || '诚邀您参与：精彩活动',
    defaultPath: options.defaultPath || '/pages/index/index',
    defaultImageUrl: options.defaultImageUrl || '/images/share_default.jpg'
  });
}

/**
 * 为活动详情页面生成分享配置
 * @param {Object} event 活动对象
 * @param {string} eventId 活动ID
 * @returns {Object} 分享配置
 */
function generateEventDetailShareConfig(event, eventId) {
  if (!event || !eventId) {
    return {
      title: '诚邀您参与：精彩活动',
      path: '/pages/index/index',
      imageUrl: '/images/share_default.jpg'
    };
  }

  const shareTitle = `诚邀您参与：${event.title || '精彩活动'}`;
  const sharePath = `/pages/eventDetail/eventDetail?id=${eventId}`;
  
  // 使用活动封面作为分享图片
  const shareImageUrl = event.cover || '/images/share_default.jpg';

  return {
    title: shareTitle,
    path: sharePath,
    imageUrl: shareImageUrl
  };
}

/**
 * 生成Canvas分享海报
 * @param {Object} event 活动信息对象
 * @param {Function} callback 回调函数，返回生成的图片路径
 */
function generateCanvasShareImage(event, callback) {
  if (!event) {
    callback(null);
    return;
  }

  // 跳转到Canvas页面生成海报
  const eventData = encodeURIComponent(JSON.stringify({
    title: event.title,
    cover: event.cover,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location
  }));

  wx.navigateTo({
    url: `/pages/shareCanvas/shareCanvas?eventData=${eventData}`,
    success: () => {
      // 设置回调函数到全局
      getApp().globalData.shareImageCallback = callback;
    },
    fail: () => {
      callback(null);
    }
  });
}

/**
 * 生成带Canvas海报的活动分享配置
 * @param {Object} event 活动对象
 * @param {string} eventId 活动ID
 * @param {Function} callback 回调函数
 */
function generateEventShareWithCanvas(event, eventId, callback) {
  if (!event || !eventId) {
    callback({
      title: '诚邀您参与：精彩活动',
      path: '/pages/index/index',
      imageUrl: '/images/share_default.jpg'
    });
    return;
  }

  const shareTitle = `诚邀您参与：${event.title || '精彩活动'}`;
  const sharePath = `/pages/eventDetail/eventDetail?id=${eventId}`;

  // 生成Canvas海报
  generateCanvasShareImage(event, (canvasImageUrl) => {
    const shareImageUrl = canvasImageUrl || event.cover || '/images/share_default.jpg';
    
    callback({
      title: shareTitle,
      path: sharePath,
      imageUrl: shareImageUrl
    });
  });
}

module.exports = {
  generateShareConfig,
  handleShareAppMessage,
  generateEventDetailShareConfig,
  generateCanvasShareImage,
  generateEventShareWithCanvas
};