// checkinList.js
const app = getApp();
const cloudDB = require('../../utils/cloudDB.js');
const authUtils = require('../../utils/authUtils.js');

Page({
  data: {
    eventId: '',
    eventTitle: '',
    loading: true,
    checkinUsers: [],
    notCheckinUsers: [], // 添加未签到用户列表
    activeTab: 'signed', // 默认显示已签到用户
    hasMore: false,
    loadingMore: false
  },

  onLoad: function(options) {
    console.log('checkinList onLoad options:', options);
    
    if (!options.eventId) {
      this.showError('缺少活动ID参数');
      return;
    }
    
    // 记录活动ID
    this.setData({ eventId: options.eventId });
    
    // 检查用户是否是活动创建者
    this.checkPermissionAndLoadData(options.eventId);
  },
  
  // 切换已签到/未签到标签
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },
  
  // 检查权限并加载数据
  checkPermissionAndLoadData: async function(eventId) {
    this.setData({ loading: true });
    
    try {
      // 检查用户是否已登录
      const isLoggedIn = authUtils.isUserLoggedIn();
      if (!isLoggedIn) {
        wx.showModal({
          title: '需要登录',
          content: '查看签到记录需要先登录',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
        return;
      }
      
      // 获取活动信息
      const event = await cloudDB.getEventById(eventId);
      if (!event) {
        this.showError('未找到活动信息');
        return;
      }
      
      // 设置活动标题
      this.setData({ eventTitle: event.title || '未命名活动' });
      
      // 检查当前用户是否是活动创建者
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
      const isCreator = (event.creatorOpenid && event.creatorOpenid === userInfo.openid) ||
                        (event._openid && event._openid === userInfo.openid);
      
      if (!isCreator) {
        wx.showModal({
          title: '权限不足',
          content: '只有活动创建者可以查看签到记录',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
        return;
      }
      
      // 加载签到记录
      this.loadCheckinRecords(event);
      
    } catch (error) {
      console.error('检查权限并加载数据失败:', error);
      this.showError('加载失败', error.message || '未知错误');
    }
  },
  
  // 加载签到记录 - 从活动文档的 checkins 数组中获取
  loadCheckinRecords: async function(event) {
    this.setData({ loading: true });
    
    try {
      // 如果没有传入event参数，重新获取活动数据
      if (!event) {
        event = await cloudDB.getEventById(this.data.eventId);
        if (!event) {
          throw new Error('未找到活动信息');
        }
      }
      
      // 获取活动中的签到记录数组和参与者列表
      const checkins = event.checkins || [];
      const participants = event.participants || [];
      
      console.log('从活动中获取到签到记录:', checkins);
      console.log('活动参与者:', participants);
      
      const checkedInUsers = [];
      const notCheckedInUsers = [];
      
      // 处理已签到用户
      if (checkins.length > 0) {
        // 对签到记录进行时间倒序排序
        const sortedCheckins = [...checkins].sort((a, b) => {
          const timeA = a.checkInTime ? new Date(a.checkInTime).getTime() : 0;
          const timeB = b.checkInTime ? new Date(b.checkInTime).getTime() : 0;
          return timeB - timeA; // 降序排列，最新的在前
        });
        
        // 处理签到记录，格式化时间等
        sortedCheckins.forEach(record => {
          checkedInUsers.push({
            ...record,
            checkinTime: record.checkInTime ? this.formatTime(record.checkInTime) : '未知时间',
            displayName: record.userName || '未知用户',
            avatarUrl: record.userAvatar || '/images/default-avatar.png',
            phone: record.phone || record.userPhone || '',
            status: 'checked'
          });
        });
      }
      
      // 处理未签到用户
      if (participants.length > 0) {
        // 从participants列表中提取未签到用户
        // 1. 获取已签到用户的openid列表
        const checkedInOpenids = checkins.map(record => record.userId || record.openid);
        
        // 2. 筛选出未签到的用户
        const notCheckedInOpenids = participants.filter(
          participant => !checkedInOpenids.includes(participant)
        );
        
        if (notCheckedInOpenids.length > 0) {
          // 获取未签到用户的详细信息
          try {
            // 使用云函数获取用户详细信息
            const { result } = await wx.cloud.callFunction({
              name: 'getUsersByIds',
              data: {
                userIds: notCheckedInOpenids
              }
            });
            
            if (result && result.success && result.users) {
              result.users.forEach(user => {
                notCheckedInUsers.push({
                  userId: user.openid,
                  userName: user.name && user.name.trim() !== '' ? user.name : '未设置名称',
                  userAvatar: user.avatarUrl || user.avatar || '/images/default-avatar.png',
                  phone: user.phone || '',
                  status: 'not_checked',
                  contact: user.contact || ''
                });
              });
            }
          } catch (error) {
            console.error('获取未签到用户详情失败:', error);
          }
        }
      }
      
      this.setData({
        checkinUsers: checkedInUsers,
        notCheckinUsers: notCheckedInUsers,
        loading: false
      });
    } catch (error) {
      console.error('加载签到记录失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载签到记录失败',
        icon: 'none'
      });
    }
  },
  
  // 显示错误信息
  showError: function(title, message = '') {
    this.setData({ loading: false });
    wx.showModal({
      title: title,
      content: message,
      showCancel: false
    });
  },
  
  // 格式化时间
  formatTime: function(dateObj) {
    if (!dateObj) return '未知时间';
    
    try {
      // 如果是字符串，尝试转为Date对象
      const date = typeof dateObj === 'string' ? new Date(dateObj) : dateObj;
      
      if (isNaN(date.getTime())) {
        return '无效时间';
      }
      
      // 格式化年月日
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      // 格式化时分秒
      const hour = date.getHours().toString().padStart(2, '0');
      const minute = date.getMinutes().toString().padStart(2, '0');
      const second = date.getSeconds().toString().padStart(2, '0');
      
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    } catch (e) {
      console.error('格式化时间失败:', e);
      return '时间格式错误';
    }
  },
  
  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },
  
  // 下拉刷新
  onPullDownRefresh: function() {
    // 重置数据，重新加载
    this.checkPermissionAndLoadData(this.data.eventId).finally(() => {
      wx.stopPullDownRefresh();
    });
  }
});