// events.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')

Page({
  data: {
    tabs: ['最新活动', '我参与的活动', '我发起的活动'],
    activeTab: 0,
    events: [],
    loading: true,
    needRefresh: false,
    searchKeyword: '',
    showSidebar: false,
    currentFilter: 'upcoming',
    userInfo: null,
    presetTags: [],
    showScrollIndicator: true
  },

  // 处理聊天框状态变化
  onChatToggle: function(e) {
    console.log('聊天框状态变化:', e.detail.isOpen);
  },

  // 处理聊天消息发送
  onChatSendMessage: function(e) {
    console.log('用户发送消息:', e.detail.message);
  },

  // 小助理点击事件处理
  onAssistantTap: function() {
    // 现在由组件内部处理聊天框的显示和消息
    console.log('小助理组件被点击');
  },

  onLoad: function(options) {
    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo')
    this.setData({ userInfo })
    
    // 处理传入的tab参数，用于在不同标签间切换
    if (options && options.tab) {
      const tabIndex = parseInt(options.tab);
      if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < this.data.tabs.length) {
        this.setData({ activeTab: tabIndex });
        
        // 根据标签设置对应的筛选条件
        if (tabIndex === 1) {
          // 我参与的活动
          this.setData({ currentFilter: 'joined' });
        } else if (tabIndex === 2) {
          // 我发起的活动
          this.setData({ currentFilter: 'created' });
        } else {
          // 最新活动（默认）
          this.setData({ currentFilter: 'upcoming' });
        }
      }
    }
    
    // 先加载活动列表，然后异步加载标签以提升页面响应速度
    this.fetchEvents()
    
    // 延迟加载预设标签，避免阻塞页面初始渲染
    setTimeout(() => {
      this.loadPresetTags()
    }, 100)
  },

  onShow: function() {
    // 检查页面自身的刷新标记
    let needRefresh = this.data.needRefresh;
    
    // 检查全局刷新标记（从活动详情页返回时）
    if (app.globalData && app.globalData.needRefreshEvents) {
      console.log('活动大厅页检测到全局刷新标记，需要刷新活动列表');
      needRefresh = true;
      // 不重置全局标记，以便其他页面也可以收到刷新通知
    }
    
    // 如果需要刷新，重新加载活动列表
    if (needRefresh) {
      console.log('活动大厅需要刷新活动列表');
      this.fetchEvents();
      this.setData({ needRefresh: false });
    }
  },

  // 搜索相关方法
  onSearchInput: function(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  onSearch: function() {
    this.fetchEvents()
  },

  // 侧边栏相关方法
  toggleSidebar: function() {
    this.setData({
      showSidebar: !this.data.showSidebar
    })
  },

  // 统一的过滤选择函数
  onUnifiedFilterSelect: function(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      currentFilter: type,
      showSidebar: false
    })
    this.fetchEvents()
  },

  // 过滤标签滑动检测
  onFilterScroll: function(e) {
    const { scrollLeft, scrollWidth } = e.detail
    const query = wx.createSelectorQuery()
    query.select('.filter-scroll').boundingClientRect()
    query.exec((res) => {
      if (res[0]) {
        const containerWidth = res[0].width
        const maxScrollLeft = scrollWidth - containerWidth
        // 如果还没有滑动到最右边，显示提示箭头
        const showIndicator = scrollLeft < maxScrollLeft - 10 // 留10rpx的容差
        this.setData({
          showScrollIndicator: showIndicator
        })
      }
    })
  },

  // 获取活动列表
  fetchEvents: async function() {
    this.setData({ loading: true })
    
    try {
      const db = wx.cloud.database()
      const _ = db.command
      let query = {}
      const now = new Date()
      
      // 对于"我参与的"和"我发起的"活动，使用特定查询
      if (this.data.currentFilter === 'joined') {
        // 我参与的活动
        query['participants'] = _.in([this.data.userInfo.openid]);
      } else if (this.data.currentFilter === 'created') {
        // 我发起的活动
        query.creatorOpenid = this.data.userInfo.openid;
      } else if (this.data.currentFilter !== 'upcoming' && this.data.currentFilter !== 'ongoing' && this.data.currentFilter !== 'expired') {
        // 如果不是时间过滤器，则认为是标签过滤
        query.tags = _.in([this.data.currentFilter]);
      }
      
      // 添加搜索关键词
      if (this.data.searchKeyword) {
        query.title = db.RegExp({
          regexp: this.data.searchKeyword,
          options: 'i'
        })
      }
      
      console.log("Querying events with:", query);

      const result = await db.collection('events')
        .where(query)
        .orderBy('createdAt', 'desc')
        .get()
      
      // 过滤和分类逻辑
      const filteredEvents = result.data.filter(event => {
        // 判断用户是否为活动参与者
        const isParticipant = this.data.userInfo && event.participants && 
          event.participants.includes(this.data.userInfo.openid);
        
        // 判断用户是否为活动创建者
        const isCreator = this.data.userInfo && event.creatorOpenid === this.data.userInfo.openid;
        
        // 应用统一的过滤逻辑
        // 1. 如果用户是参与者或创建者，显示活动
        if (isParticipant || isCreator) {
          return true;
        }
        
        // 2. 如果不是参与者也不是创建者，检查活动是否私密
        if (event.isPrivate === true) {
          return false; // 私密活动不显示给非参与者
        }
        
        // 3. 公开活动显示
        return true;
      }).filter(event => {
        // 根据时间过滤器进一步筛选
        if (this.data.currentFilter === 'joined' || this.data.currentFilter === 'created') {
          return true; // "我参与的"和"我发起的"不按时间过滤
        }
        
        // 解析活动时间
        let startTime, endTime;
        
        // 处理活动时间格式：date + startTime + endTime
        if (event.date && event.startTime && event.endTime) {
          const eventDate = new Date(event.date);
          const [startHour, startMinute] = event.startTime.split(':');
          const [endHour, endMinute] = event.endTime.split(':');
          
          startTime = new Date(eventDate);
          startTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
          
          endTime = new Date(eventDate);
          endTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
          
          // 处理跨天情况
          if (endTime <= startTime) {
            endTime.setDate(endTime.getDate() + 1);
          }
        } else {
          // 如果时间格式不完整，默认为全天活动
          startTime = new Date(event.date || new Date());
          endTime = new Date(event.date || new Date());
          endTime.setHours(23, 59, 59, 999);
        }
        
        // 根据过滤器类型判断
        if (this.data.currentFilter === 'upcoming') {
          // 最新活动（未开始的活动）
          return startTime > now;
        } else if (this.data.currentFilter === 'ongoing') {
          // 进行中活动（已开始但未结束的活动）
          return startTime <= now && endTime > now;
        } else if (this.data.currentFilter === 'expired') {
          // 过期活动（已结束的活动）
          return endTime <= now;
        }
        
        return true;
      });
      
      const events = filteredEvents.map(event => {
        // 判断活动是否过期
        let isExpired = false;
        if (event.date && event.endTime) {
          const eventDate = new Date(event.date);
          const [endHour, endMinute] = event.endTime.split(':');
          const endTime = new Date(eventDate);
          endTime.setHours(parseInt(endHour), parseInt(endMinute), 0, 0);
          isExpired = endTime <= now;
        }
        
        return {
          ...event,
          isCreator: (this.data.userInfo && event.creatorOpenid === this.data.userInfo.openid),
          isJoined: (this.data.userInfo && event.participants && event.participants.includes(this.data.userInfo.openid)),
          isExpired: isExpired
        }
      })
      
      this.setData({
        events,
        loading: false
      })
      
    } catch (error) {
      console.error('获取活动列表失败:', error)
      wx.showToast({
        title: '获取活动列表失败',
        icon: 'none'
      })
      this.setData({ loading: false, events: [] })
    }
  },

  // 判断用户是否是创建者
  isUserCreator: function(event) {
    const userInfo = this.data.userInfo
    if (!userInfo) return false
    
    return (
      event.creatorId === userInfo._id ||
      event.creatorOpenid === userInfo.openid ||
      (event.creator && event.creator._id === userInfo._id)
    )
  },

  // 判断用户是否已参加
  isUserJoined: function(event) {
    const userInfo = this.data.userInfo
    if (!userInfo) return false
    
    return event.participants && event.participants.some(p => 
      (p._id && p._id === userInfo._id) || 
      (p.openid && p.openid === userInfo.openid)
    )
  },

  // 查看活动详情
  viewEventDetail: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/eventDetail/eventDetail?id=${id}`
    })
  },

  // 编辑活动
  editEvent: function(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/editEvent/editEvent?id=${id}`
    })
  },

  // 报名/取消报名活动 - 使用统一的eventUtils处理
  registerEvent: function(e) {
    // 阻止事件冒泡
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    
    // 获取活动ID
    const eventId = e.currentTarget.dataset.id;
    if (!eventId) {
      console.error('活动ID不存在');
      wx.showToast({
        title: '活动ID不存在',
        icon: 'none'
      });
      return;
    }
    
    // 检查用户是否登录
    if (!this.data.userInfo) {
      console.log('用户未登录');
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    // 查找当前活动
    const event = this.data.events.find(e => e._id === eventId);
    
    if (!event) {
      console.error('找不到对应活动');
      wx.showToast({
        title: '找不到活动',
        icon: 'none'
      });
      return;
    }
    
    // 使用统一的eventUtils工具类处理报名/取消报名
    eventUtils.handleJoinEvent({
      eventId: eventId,
      userInfo: this.data.userInfo,
      isJoined: event.isJoined,
      onSuccess: () => {
        // 成功后刷新整个页面数据
        console.log('报名/取消报名成功，刷新活动列表');
        
        // 重新加载活动列表
        this.fetchEvents();
        
        // 通知其他页面可能需要刷新
        if (getApp().globalData) {
          getApp().globalData.needRefreshEvents = true;
        }
      },
      onFail: (error) => {
        console.error('报名/取消报名操作失败:', error);
        wx.showToast({
          title: '操作失败，请重试',
          icon: 'none'
        });
      }
    });
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

  // 创建活动
  createEvent: function() {
    wx.navigateTo({
      url: '/pages/createEvent/createEvent'
    })
  },

  // 加载预设标签
  loadPresetTags: async function() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'managePresetTags',
        data: {
          action: 'getAll'
        }
      });
      
      if (res.result.success) {
        this.setData({
          presetTags: res.result.data
        }, () => {
          // 标签加载完成后检查是否需要显示滑动提示
          this.checkScrollIndicator();
        });
      } else {
        console.error('加载预设标签失败:', res.result.error);
      }
    } catch (error) {
      console.error('调用预设标签云函数失败:', error);
    }
  },

  // 检查是否需要显示滑动提示
  checkScrollIndicator: function() {
    setTimeout(() => {
      const query = wx.createSelectorQuery()
      query.select('.filter-scroll').scrollOffset()
      query.select('.filter-scroll').boundingClientRect()
      query.exec((res) => {
        if (res[0] && res[1]) {
          const scrollInfo = res[0]
          const boundingInfo = res[1]
          const maxScrollLeft = scrollInfo.scrollWidth - boundingInfo.width
          // 如果内容宽度大于容器宽度，显示滑动提示
          const showIndicator = maxScrollLeft > 10
          this.setData({
            showScrollIndicator: showIndicator
          })
        }
      })
    }, 100) // 延迟100ms确保DOM渲染完成
  },


})