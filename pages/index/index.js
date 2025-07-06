// index.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')
const eventUtils = require('../../utils/eventUtils.js')
const authUtils = require('../../utils/authUtils.js')
const shareUtils = require('../../utils/shareUtils.js')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    profileProgress: 0,
    loading: {
      eventsLobby: true,
      clients: false
    },
    events: [],
    eventTabs: ['最新活动', '我参与的活动', '我发起的活动'],
    activeEventTab: 0,
    needRefresh: false,
    showIndexSurveyModal: false,
    currentIndexSurveyData: {
      question: '',
      options: []
    },
    eventPendingSurvey: null,
    statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
    stats: {
      created: 0,
      joined: 0
    },
    banners: [] // 轮播图数据
  },

  // 处理聊天框状态变化
  onChatToggle: function(e) {
    console.log('聊天框状态变化:', e.detail.isOpen);
    // 可以在这里添加其他逻辑，例如调整页面元素
  },

  // 处理聊天消息发送
  onChatSendMessage: function(e) {
    console.log('用户发送消息:', e.detail.message);
    // 可以在这里添加其他处理逻辑，例如记录用户问题等
  },

  // 小助理点击事件处理
  onAssistantTap: function() {
    // 现在由组件内部处理聊天框的显示和消息
    console.log('小助理组件被点击');
  },
  
  // 定义页面的分享行为
  // 分享按钮点击处理函数
  onShareButtonTap: function(e) {
    // 阻止事件冒泡，避免触发卡片的点击事件
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    // 这里不需要额外处理，分享功能由open-type="share"和onShareAppMessage处理
  },

  onShareAppMessage: function(res) {
    console.log('首页分享事件:', res);
    
    // 如果是从活动卡片分享，使用Canvas生成海报
    if (res.from === 'button' && res.target && res.target.dataset) {
      const event = res.target.dataset.event;
      const eventId = res.target.dataset.eventId;
      
      if (event && eventId) {
        return new Promise((resolve) => {
          shareUtils.generateEventShareWithCanvas(event, eventId, (shareConfig) => {
            resolve(shareConfig);
          });
        });
        */
      }
    }
    
    // 默认分享
    return shareUtils.handleShareAppMessage(res, this.data, {
      defaultTitle: '邀请您参加活动',
      defaultPath: '/pages/index/index',
      defaultImageUrl: '/images/share_default.jpg'
    });
  },

  // 设置分享图片回调（由Canvas页面调用）
  setShareImage: function(imageUrl) {
    console.log('收到Canvas生成的分享图片:', imageUrl);
    this.shareImageUrl = imageUrl;
  },

  onLoad: function() {
    // 恢复上次的活动过滤选项
    const savedActiveTab = wx.getStorageSync('activeEventTab');
    if (savedActiveTab !== '' && savedActiveTab !== null) {
      this.setData({ activeEventTab: savedActiveTab });
    }
    
    this.checkLogin();
    this.loadBanners(); // 加载轮播图数据
    this.loadEvents(); // 会根据activeEventTab加载正确的活动列表
  },

  onShow: async function() { // Make onShow async
    // 从云端重新获取最新用户信息
    await this.refreshUserInfoFromCloud(); // Await the refresh
    this.checkLoginStatus(); // Now this uses updated globalData/storage
    this.checkLogin(); // Ensure this is also called to update page data
    
    // 页面显示时的处理逻辑
    console.log('首页显示，用户登录状态:', app.globalData.isLoggedIn);
    
    let needRefresh = this.data.needRefresh;
    if (app.globalData && app.globalData.needRefreshEvents) {
      needRefresh = true;
      app.globalData.needRefreshEvents = false;
    }
    if (needRefresh) {
      this.loadEvents();
      this.setData({ needRefresh: false });
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  onPullDownRefresh: function() {
    this.refreshPage();
  },

  // 计算用户资料完善程度
  calculateProfileProgress: function(userInfo) {
    if (!userInfo) return 0;
    
    // 定义需要检查的字段及其权重（平均分布）
    const fields = [
      { key: 'name', weight: 12.5 },      // 姓名
      { key: 'company', weight: 12.5 },   // 公司
      { key: 'position', weight: 12.5 },  // 职位
      { key: 'industry', weight: 12.5 },  // 行业
      { key: 'interest', weight: 12.5 },  // 兴趣
      { key: 'expertise', weight: 12.5 }, // 专长
      { key: 'phone', weight: 12.5 },     // 电话
      { key: 'email', weight: 12.5 }      // 邮箱
    ];
    
    let completedWeight = 0;
    let totalWeight = 0;
    
    fields.forEach(field => {
      totalWeight += field.weight;
      const value = userInfo[field.key];
      if (value && value.trim && value.trim() !== '') {
        completedWeight += field.weight;
      }
    });
    
    // 检查头像是否为默认头像
    if (userInfo.avatarUrl && !userInfo.avatarUrl.includes('/images/avatar1.jpg')) {
      completedWeight += 0; // 头像不计入权重，但可以作为加分项
    }
    
    return Math.round((completedWeight / totalWeight) * 100);
  },

  checkLogin: function() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (userInfo) {
      const progress = this.calculateProfileProgress(userInfo);
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true,
        profileProgress: progress
      })
      if (!app.globalData.userInfo) app.globalData.userInfo = userInfo;
      if (!app.globalData.isLoggedIn && userInfo.openid) {
          app.globalData.isLoggedIn = true;
          app.globalData.openid = userInfo.openid;
      }
    }
  },

  loadEvents: async function() {
    this.setData({ 'loading.eventsLobby': true });
    try {
      let allEvents = await cloudDB.getAllEvents();
      this.filterAndProcessEvents(allEvents);
    } catch (err) {
      console.error('获取活动失败', err);
      this.setData({ events: [], 'loading.eventsLobby': false });
      wx.showToast({ title: '加载活动失败', icon: 'none' });
    }
  },

  processEventData: function(events) {
    if (!Array.isArray(events)) return;
    events.forEach(event => {
      const processedEvent = eventUtils.processEventData(event, this.data.userInfo);
      // 添加过期判断
      event.isExpired = eventUtils.isEventExpired(event);
      // 添加创建者和参与者判断
      event.isCreator = this.data.userInfo && eventUtils.isUserCreator(event, this.data.userInfo);
      event.isJoined = this.data.userInfo && eventUtils.isUserJoined(event, this.data.userInfo);
      Object.assign(event, processedEvent);
    });
  },

  // 过滤和处理活动数据的通用函数
  filterAndProcessEvents: function(allEvents) {
    if (!Array.isArray(allEvents)) {
      this.setData({ events: [], 'loading.eventsLobby': false });
      return;
    }
    
    let relevantEvents = [];
    const currentTab = this.data.activeEventTab; 
    const currentUserInfo = this.data.userInfo;
    
    // 根据当前选中的标签过滤活动
    if (currentTab === 0) {
      // 最新活动 - 过滤掉已过期的活动
      relevantEvents = allEvents.filter(event => 
        !event.isPrivate && !eventUtils.isEventExpired(event)
      ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (currentTab === 1 && currentUserInfo) {
      // 我参与的活动 - 显示所有参与的活动，包括过期的
      relevantEvents = allEvents.filter(event => 
          eventUtils.isUserJoined(event, currentUserInfo) || eventUtils.isUserCreator(event, currentUserInfo)
      ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (currentTab === 2 && currentUserInfo) {
      // 我发起的活动 - 显示所有发起的活动，包括过期的
      relevantEvents = allEvents.filter(event => 
          eventUtils.isUserCreator(event, currentUserInfo)
      ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      // 如果没有选择有效标签或用户未登录，默认显示最新活动，过滤掉已过期的活动
      relevantEvents = allEvents.filter(event => 
        !event.isPrivate && !eventUtils.isEventExpired(event)
      ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    this.processEventData(relevantEvents);
    
    // 计算统计数据
    if (currentUserInfo) {
      const createdEvents = allEvents.filter(event => 
        eventUtils.isUserCreator(event, currentUserInfo)
      );
      
      const joinedEvents = allEvents.filter(event => {
        // 排除用户创建的活动，避免重复计算
        if (eventUtils.isUserCreator(event, currentUserInfo)) return false;
        // 只保留用户参与的活动
        return eventUtils.isUserJoined(event, currentUserInfo);
      });
      
      this.setData({
        events: relevantEvents, 
        'loading.eventsLobby': false,
        stats: {
          created: createdEvents.length,
          joined: joinedEvents.length
        }
      });
    } else {
      this.setData({ 
        events: relevantEvents, 
        'loading.eventsLobby': false 
      });
    }
  },

  switchEventTab: async function(e) {
    const index = e.currentTarget.dataset.index;
    if (this.data.activeEventTab === index) return;
    this.setData({ activeEventTab: index, 'loading.eventsLobby': true });
    
    // 保存当前选中的标签到本地存储
    wx.setStorageSync('activeEventTab', index);

    try {
      let allEvents = await cloudDB.getAllEvents(); 
      this.filterAndProcessEvents(allEvents);
    } catch (err) {
      console.error('切换标签时获取活动失败', err);
      this.setData({ events: [], 'loading.eventsLobby': false });
      wx.showToast({ title: '加载列表失败', icon: 'none' });
    }
  },

  viewEventDetail: function(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/eventDetail/eventDetail?id=${id}` });
  },
  
  // 快捷功能区 - 点击"查看活动"
  goToEvents: function() {
    wx.navigateTo({
      url: '/pages/events/events'
    });
  },
  
  // 快捷功能区 - 点击"推荐客户"
  goToSuggestions: function() {
    wx.navigateTo({
      url: '/pages/clientManage/clientManage'
    });
  },
  
  // 快捷功能区 - 点击"我的资料"
  goToProfile: function() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    });
  },
  
  // 快捷功能区 - 点击"发起邀约"
  goToInvite: function() {
    wx.navigateTo({
      url: '/pages/createEvent/createEvent'
    });
  },
  
  toggleJoin: async function(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    const eventId = e.currentTarget?.dataset?.id;
    if (!eventId) {
      wx.showToast({ title: '活动ID获取失败', icon: 'none' });
      return;
    }
    
    const isLoggedIn = app.globalData.isLoggedIn && app.globalData.openid;
    if (!isLoggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '登录后才能报名活动哦',
        confirmText: '去登录',
        cancelText: '暂不登录',
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync('loginRedirectUrl', '/pages/index/index');
            wx.navigateTo({ url: '/pages/login/login?from=index' });
          }
        }
      });
      return;
    }
    
    const event = this.data.events.find(ev => ev._id === eventId || ev.id === eventId);
    if (!event) {
      wx.showToast({ title: '未能找到活动信息', icon: 'none' });
      try {
          const fullEvent = await cloudDB.getEventById(eventId);
          if (fullEvent && fullEvent.topicSurvey && fullEvent.topicSurvey.enabled && !eventUtils.isUserJoined(fullEvent, this.data.userInfo)) {
              this.setData({
                  currentIndexSurveyData: fullEvent.topicSurvey,
                  showIndexSurveyModal: true,
                  eventPendingSurvey: fullEvent
              });
          } else if (fullEvent) {
              this.proceedWithActualRegistration(fullEvent);
          } else {
              wx.showToast({ title: '无法加载活动详情', icon: 'none' });
          }
      } catch (error) {
          console.error("Error fetching full event for survey:", error);
          wx.showToast({ title: '加载活动问卷信息失败', icon: 'none' });
        }
      return;
    }
    
    if (eventUtils.isUserJoined(event, this.data.userInfo)) {
      this.proceedWithActualRegistration(event);
      return;
    }

    if (event.topicSurvey && event.topicSurvey.enabled) {
      this.setData({
        currentIndexSurveyData: event.topicSurvey,
        showIndexSurveyModal: true,
        eventPendingSurvey: event
        });
    } else {
      this.proceedWithActualRegistration(event);
    }
  },

  onIndexSurveyModalClose: function() {
    this.setData({ showIndexSurveyModal: false, eventPendingSurvey: null });
  },

  onIndexSurveyModalSubmit: async function(e) {
    const selectedOption = e.detail.selectedOption;
    const eventToRegister = this.data.eventPendingSurvey;

    if (!eventToRegister || !selectedOption) {
      wx.showToast({ title: '提交问卷出错', icon: 'none' });
      this.setData({ showIndexSurveyModal: false, eventPendingSurvey: null });
      return;
    }

    const currentUserInfo = this.data.userInfo || app.globalData.userInfo;
    const preferenceData = {
      eventId: eventToRegister._id || eventToRegister.id,
      userId: currentUserInfo.openid,
      name: currentUserInfo.name && currentUserInfo.name.trim() !== '' ? currentUserInfo.name : '未设置名称',
      question: eventToRegister.topicSurvey.question,
      prefer: selectedOption,
      submittedAt: new Date()
    };

    wx.showLoading({ title: '提交选择中...' });
    try {
      const db = wx.cloud.database();
      await db.collection('eventTopicPreferences').add({ data: preferenceData });
      wx.hideLoading();
      wx.showToast({ title: '选择已记录', icon: 'success', duration: 1000 });
      this.setData({ showIndexSurveyModal: false });
      
      await this.proceedWithActualRegistration(eventToRegister);
      
    } catch (error) {
      wx.hideLoading();
      console.error('保存话题偏好失败:', error);
      wx.showToast({ title: '提交选择失败', icon: 'none' });
    }
  },

  proceedWithActualRegistration: async function(event) {
    const currentUserInfo = this.data.userInfo || app.globalData.userInfo;
    if (!event || !currentUserInfo) {
        wx.showToast({ title: '缺少报名信息', icon: 'none' });
        return;
    }
      
    const isCurrentlyJoined = eventUtils.isUserJoined(event, currentUserInfo);
    
    // 如果是取消报名，直接执行
    if (isCurrentlyJoined) {
      wx.showLoading({ title: '取消中...' });
      try {
        await eventUtils.handleJoinEvent({
          eventId: event._id || event.id,
          userInfo: currentUserInfo,
          isJoined: isCurrentlyJoined,
        });
        wx.hideLoading();
        wx.showToast({ title: '已取消报名', icon: 'success' });
        this.loadEvents(); 
        if (app.globalData) app.globalData.needRefreshEvents = true;
      } catch (error) {
        wx.hideLoading();
        console.error('取消报名失败:', error);
        wx.showToast({ title: error.message || '操作失败', icon: 'none' });
      }
      return;
    }
    
    // 如果是报名，先检查用户资料完整性
    authUtils.checkUserProfileWithPrompt(currentUserInfo, '报名活动', async () => {
      // 资料完整，执行报名
      wx.showLoading({ title: '报名中...' });
      try {
        await eventUtils.handleJoinEvent({
          eventId: event._id || event.id,
          userInfo: currentUserInfo,
          isJoined: false,
        });
        wx.hideLoading();
        wx.showToast({ title: '报名成功', icon: 'success' });
        this.loadEvents(); 
        if (app.globalData) app.globalData.needRefreshEvents = true;
      } catch (error) {
        wx.hideLoading();
        console.error('报名失败:', error);
        wx.showToast({ title: error.message || '操作失败', icon: 'none' });
      }
    });
    
    if (this.data.eventPendingSurvey && (this.data.eventPendingSurvey._id === event._id || this.data.eventPendingSurvey.id === event.id)) {
        this.setData({ eventPendingSurvey: null });
    }
  },
  
  // 期待加场功能
  expectRerun: function(e) {
    const eventId = e.currentTarget.dataset.id;
    const eventName = e.currentTarget.dataset.name;
    
    if (!this.data.userInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '期待加场',
      content: `您希望「${eventName}」再次举办吗？我们会记录您的期待并通知组织者。`,
      confirmText: '期待',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.submitExpectRerun(eventId, eventName);
        }
      }
    });
  },
  
  // 提交期待加场请求
  submitExpectRerun: function(eventId, eventName) {
    wx.showLoading({ title: '提交中...' });
    
    wx.cloud.callFunction({
      name: 'expectRerun',
      data: {
        action: 'add',
        expectData: {
          eventId: eventId,
          eventName: eventName,
          userName: this.data.userInfo.name && this.data.userInfo.name.trim() !== '' ? this.data.userInfo.name : '未设置名称'
        }
      },
      success: (res) => {
        wx.hideLoading();
        if (res.result.success) {
          wx.showToast({
            title: '期待已记录',
            icon: 'success'
          });
        } else {
          wx.showToast({
            title: res.result.error || '提交失败',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        wx.hideLoading();
        console.error('期待加场提交失败:', error);
        wx.showToast({
          title: '提交失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  createEvent: function() {
    wx.navigateTo({ url: '/pages/createEvent/createEvent' });
  },
  
  // 编辑活动按钮点击处理函数
  editEvent: function(e) {
    // 阻止事件冒泡，避免触发卡片的点击事件
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    
    const eventId = e.currentTarget.dataset.id;
    if (!eventId) {
      wx.showToast({
        title: '活动ID不存在',
        icon: 'none'
      });
      return;
    }

    // 跳转到编辑活动页面，传递活动ID
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
  },
  
  refreshPage: async function() {
    try {
      // 重新获取用户信息
      await this.refreshUserInfoFromCloud();
      this.checkLogin();
      
      // 重新加载轮播图数据
      await this.loadBanners();
      
      // 重新加载活动数据
      await this.loadEvents();
      
      // 停止下拉刷新
      wx.stopPullDownRefresh();
      
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1000
      });
    } catch (error) {
      console.error('刷新页面失败:', error);
      wx.stopPullDownRefresh();
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      });
    }
  },
  
  // 从云端重新获取最新用户信息
  refreshUserInfoFromCloud: async function() { // Ensure it's async and returns a promise
    if (!app.globalData.openid) return null; // Return null or some indicator
    try {
      const latestUserInfo = await cloudDB.getUserByOpenId(app.globalData.openid);
      if (latestUserInfo) {
        // 更新全局数据和本地缓存
        app.globalData.userInfo = latestUserInfo;
        wx.setStorageSync('userInfo', latestUserInfo);
        
        // 计算并更新进度条
        const progress = this.calculateProfileProgress(latestUserInfo);
        this.setData({
          userInfo: latestUserInfo,
          hasUserInfo: true,
          profileProgress: progress
        });
        
        console.log('Index: 从云端获取到最新用户信息:', latestUserInfo);
        console.log('Index: 计算的资料完善度:', progress + '%');
        return latestUserInfo; // Return the fetched info
      }
      return null;
    } catch (error) {
      console.error('Index: 从云端获取用户信息失败:', error);
      return null;
    }
  },

  checkLoginStatus: function() {
    if (app.globalData.isLoggedIn && app.globalData.userInfo) {
        if (!this.data.userInfo || this.data.userInfo.openid !== app.globalData.openid) {
            this.setData({ 
                userInfo: app.globalData.userInfo,
                hasUserInfo: true 
            });
        }
    } else if (!app.globalData.isLoggedIn && this.data.hasUserInfo) {
        this.setData({ userInfo: null, hasUserInfo: false });
    }
  },

  // 加载轮播图数据
  loadBanners: async function() {
    try {
      const db = wx.cloud.database();
      const result = await db.collection('home_banners')
        .where({
          isActive: true
        })
        .orderBy('order', 'asc')
        .get();
      
      if (result.data && result.data.length > 0) {
        this.setData({
          banners: result.data
        });
      } else {
        // 如果没有数据，设置默认轮播图
        this.setData({
          banners: [{
            imageUrl: '/images/event1.jpg',
            title: '心光邀约 - 需求问卷调研',
            subtitle: '点击填写问卷，帮助我们更好改进',
            jumpPath: '',
            order: 1,
            isActive: true
          }]
        });
      }
    } catch (error) {
      console.error('加载轮播图失败:', error);
      // 设置默认轮播图
      this.setData({
        banners: [{
          imageUrl: '/images/event1.jpg',
          title: '心光邀约 - 需求问卷调研',
          subtitle: '点击填写问卷，帮助我们更好改进',
          jumpPath: '',
          order: 1,
          isActive: true
        }]
      });
    }
  },

  // 轮播图点击事件
  onBannerTap: function(e) {
    const index = e.currentTarget.dataset.index;
    const banner = this.data.banners[index];
    
    if (banner && banner.jumpPath) {
      console.log('轮播图被点击，跳转到:', banner.jumpPath);
      
      // 判断是否为外部链接
      if (banner.jumpPath.startsWith('http')) {
        // 外部链接，显示提示
        wx.showToast({
          title: '外部链接功能已移除',
          icon: 'none'
        });
        return;
        /*
        wx.navigateTo({
          url: `/pages/web-view/web-view?url=${encodeURIComponent(banner.jumpPath)}`,
          fail: function(err) {
            console.error('打开外部链接失败:', err);
            wx.showToast({
              title: '无法打开链接',
              icon: 'none'
            });
          }
        });
      } else {
        // 内部页面跳转
        wx.navigateTo({
          url: banner.jumpPath,
          fail: function(err) {
            console.error('页面跳转失败:', err);
            wx.showToast({
              title: '页面跳转失败',
              icon: 'none'
            });
          }
        });
      }
    }
  },

  openSurvey: function() {
    console.log('问卷功能已移除');
    wx.showToast({
      title: '问卷功能已移除',
      icon: 'none'
    });
  },
  
  // 跳转到登录页面
  goToLogin: function() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

})
