// additionalSessionDetails.js
Page({
  data: {
    eventId: '',
    eventData: {},
    interestedUsers: [], // 有加场意愿的用户
    pendingUsers: [], // 未表态的用户
    totalParticipants: 0,
    pageLoading: true,
    showPendingUsers: false // 是否显示未表态用户列表
  },

  onLoad: function(options) {
    if (options.eventId) {
      this.setData({ eventId: options.eventId });
      this.loadData();
    } else {
      wx.showToast({
        title: '活动ID缺失',
        icon: 'error'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  onShow: function() {
    // 每次显示时刷新数据
    if (this.data.eventId) {
      this.loadData();
    }
  },

  onPullDownRefresh: function() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载数据
  loadData: async function() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      // 并行加载活动数据和加场意愿数据
      const [eventData, expectData] = await Promise.all([
        this.loadEventData(),
        this.loadExpectData()
      ]);
      
      // 加载所有参与者数据
      const allParticipants = await this.loadAllParticipants(eventData.participants || []);
      
      // 分类用户：有意愿的和未表态的
      const interestedOpenids = expectData.map(item => item.openid);
      const interestedUsers = [];
      const pendingUsers = [];
      
      // 处理有意愿的用户
      expectData.forEach(expectItem => {
        const userInfo = allParticipants.find(p => p._openid === expectItem.openid);
        if (userInfo) {
          interestedUsers.push({
            ...userInfo,
            openid: expectItem.openid,
            expectTime: this.formatTime(expectItem.createdAt),
            expectData: expectItem
          });
        } else {
          // 如果在参与者中找不到，可能是已经退出的用户，仍然显示
          interestedUsers.push({
            _openid: expectItem.openid,
            openid: expectItem.openid,
            name: expectItem.name || '用户已退出',
            nickName: expectItem.name || '用户已退出',
            avatarUrl: '',
            expectTime: this.formatTime(expectItem.createdAt),
            expectData: expectItem
          });
        }
      });
      
      // 处理未表态的用户
      allParticipants.forEach(participant => {
        if (!interestedOpenids.includes(participant._openid)) {
          pendingUsers.push(participant);
        }
      });
      
      this.setData({
        eventData,
        interestedUsers,
        pendingUsers,
        totalParticipants: allParticipants.length,
        pageLoading: false
      });
      
      wx.hideLoading();
    } catch (error) {
      console.error('加载数据失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
      this.setData({ pageLoading: false });
    }
  },

  // 加载活动数据
  loadEventData: async function() {
    const db = wx.cloud.database();
    const result = await db.collection('events').doc(this.data.eventId).get();
    
    if (!result.data) {
      throw new Error('活动不存在');
    }
    
    return result.data;
  },

  // 加载加场意愿数据
  loadExpectData: async function() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'expectRerun',
        data: {
          action: 'getByEvent',
          expectData: {
            queryEventId: this.data.eventId
          }
        }
      });
      
      if (result.result && result.result.success) {
        return result.result.data || [];
      } else {
        console.error('获取加场意愿数据失败:', result.result);
        return [];
      }
    } catch (error) {
      console.error('调用expectRerun云函数失败:', error);
      return [];
    }
  },

  // 加载所有参与者数据
  loadAllParticipants: async function(participantIds) {
    if (!participantIds || participantIds.length === 0) {
      return [];
    }
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 分批查询参与者信息（微信小程序限制单次查询20条）
      const batchSize = 20;
      const batches = [];
      
      for (let i = 0; i < participantIds.length; i += batchSize) {
        const batch = participantIds.slice(i, i + batchSize);
        batches.push(batch);
      }
      
      const allParticipants = [];
      
      for (const batch of batches) {
        const result = await db.collection('users')
          .where({
            _openid: _.in(batch)
          })
          .get();
        
        allParticipants.push(...result.data);
      }
      
      return allParticipants;
    } catch (error) {
      console.error('加载参与者信息失败:', error);
      return [];
    }
  },

  // 格式化时间
  formatTime: function(date) {
    if (!date) return '';
    
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    
    if (diff < 60000) { // 1分钟内
      return '刚刚';
    } else if (diff < 3600000) { // 1小时内
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) { // 24小时内
      return Math.floor(diff / 3600000) + '小时前';
    } else if (diff < 604800000) { // 7天内
      return Math.floor(diff / 86400000) + '天前';
    } else {
      // 超过7天显示具体日期
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const hour = d.getHours().toString().padStart(2, '0');
      const minute = d.getMinutes().toString().padStart(2, '0');
      
      if (year === now.getFullYear()) {
        return `${month}-${day} ${hour}:${minute}`;
      } else {
        return `${year}-${month}-${day} ${hour}:${minute}`;
      }
    }
  },

  // 切换显示未表态用户列表
  togglePendingUsers: function() {
    this.setData({
      showPendingUsers: !this.data.showPendingUsers
    });
  },

  // 跳转到参与者详情页面
  goToParticipantDetail: function(e) {
    const openid = e.currentTarget.dataset.openid;
    if (!openid) {
      wx.showToast({
        title: '用户信息缺失',
        icon: 'error'
      });
      return;
    }
    
    // 跳转到参与者详情页面
    wx.navigateTo({
      url: `/pages/participantDetail/participantDetail?openid=${openid}&eventId=${this.data.eventId}`,
      fail: (err) => {
        console.error('跳转到参与者详情页失败:', err);
        wx.showToast({
          title: '无法打开用户详情',
          icon: 'error'
        });
      }
    });
  }
});