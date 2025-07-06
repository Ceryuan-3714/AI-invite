// 引入云数据库工具
const cloudDB = require('./utils/cloudDB.js')

App({
    globalData: {
      userInfo: null,
      isLoggedIn: false,
      openid: null,
      currentEvent: {
        id: 'event001',
        name: '商业创新峰会2023'
      },
      apiBaseUrl: 'https://api.dify.ai/v1',
      apiKey: 'your-dify-api-key' // Replace with actual API key
    },
    onLaunch() {
      // 初始化云开发环境
      if (!cloudDB.initCloud()) {
        console.error('云开发环境初始化失败');
      }
      
      // 调用云函数获取用户 openid
      this.getOpenid();
      
      // 检查登录状态
      const isLoggedIn = wx.getStorageSync('isLoggedIn')
      const userInfo = wx.getStorageSync('userInfo')

      this.globalData.isLoggedIn = isLoggedIn || false
      this.globalData.userInfo = userInfo || null

      // 如果已登录，设置相关状态
      if (isLoggedIn && userInfo) {
        // 确保登录状态一致
        this.globalData.isLoggedIn = true;
        this.globalData.userInfo = userInfo;
        console.log("已登录", userInfo);
      
        // 检查用户基本信息是否完善
        // 不再自动跳转到资料完善页面，只检查并设置状态
        this.checkUserProfileComplete(userInfo);
        
        // 将用户信息同步到云数据库
        this.syncUserInfoToCloud(userInfo);
      } else {
        console.log("未登录状态，允许浏览小程序");
      }
      
      // 更新通知角标
    this.updateNotificationBadge();
    },
    
    // 获取用户openid
    getOpenid: function() {
      const that = this;
      // 调用云函数获取openid
      wx.cloud.callFunction({
        name: 'getOpenid',
        success: function(res) {
          that.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
          
          // 获取到openid后，尝试从云数据库获取用户信息
          that.getUserInfoByOpenid(res.result.openid);
          
          console.log('云函数获取到的openid: ', res.result.openid);
        },
        fail: function(err) {
          console.error('获取openid失败', err);
        }
      });
    },
    
    // 通过openid从云数据库获取用户信息
    getUserInfoByOpenid: async function(openid) {
      try {
        const userInfo = await cloudDB.getUserByOpenId(openid);
        if (userInfo) {
          // 从云端获取到用户信息，更新本地存储和全局数据
          this.globalData.userInfo = userInfo;
          this.globalData.isLoggedIn = true;
          wx.setStorageSync('userInfo', userInfo);
          wx.setStorageSync('isLoggedIn', true);
          console.log('云数据库获取到的用户信息: ', userInfo);
        }
      } catch (error) {
        console.error('从云数据库获取用户信息失败', error);
      }
    },
    
    // 将用户信息同步到云数据库
    syncUserInfoToCloud: async function(userInfo) {
      if (!userInfo) return;
      
      try {
        // 确保用户信息包含openid
        if (this.globalData.openid && !userInfo.openid) {
          userInfo.openid = this.globalData.openid;
        }
        
        // 检查用户信息是否已存在
        const existingUser = await cloudDB.getUserByOpenId(userInfo.openid);
        if (existingUser) {
          // 用户已存在，不需要每次都同步全部信息，只更新必要字段
          console.log('用户已存在，跳过同名检查');
          return existingUser;
        } else {
          // 新用户，保存到云数据库
          const result = await cloudDB.saveUserInfo(userInfo);
          console.log('新用户信息同步到云数据库结果: ', result);
          return result;
        }
      } catch (error) {
        console.error('同步用户信息到云数据库失败', error);
        return null;
      }
    },
    
    // 更新通知角标（从云数据库获取未读通知数量）
    updateNotificationBadge: async function() {
      try {
        const userInfo = this.globalData.userInfo;
        if (!userInfo || !userInfo.openid) {
          // 如果用户未登录，隐藏角标
          wx.hideTabBarRedDot({ index: 2 });
          return;
        }
        
        // 从云数据库获取未读通知数量
        const db = wx.cloud.database();
        const res = await db.collection('notifications')
          .where({
            recipientId: userInfo.openid,
            read: false
          })
          .count();
        
        const unreadCount = res.total || 0;
        
        if (unreadCount > 0) {
          wx.showTabBarRedDot({
            index: 2 // 通知图标在Tab栏的索引为2
          });
        } else {
          wx.hideTabBarRedDot({
            index: 2
          });
        }
        
      } catch (error) {
        console.error('更新通知角标失败:', error);
        // 出错时隐藏角标
        wx.hideTabBarRedDot({ index: 2 });
      }
    },
    
    // 日期格式化
    formatDate: function(date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    },
    
    // 检查用户基本信息是否完善
    checkUserProfile: function(userInfo) {
      // 检查用户名、公司和职位是否为空
      // 检查用户资料完整性（兼容新旧数据结构）
        const hasValidCompanyPosition = userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && 
          userInfo.companyPositions.some(item => item.company && item.position) ||
          (userInfo.company && userInfo.position);
        
        if (!userInfo.name || !hasValidCompanyPosition) {
        console.log('用户基本信息不完善，需要完善资料');
        
        // 跳转到资料完善页面
        wx.redirectTo({
          url: '/pages/profile_setup/profile_setup'
        });
        return false;
      }
      
      return true;
    },
    
    // 检查用户基本信息是否完善，但不跳转
    checkUserProfileComplete: function(userInfo) {
      // 检查用户名、公司和职位是否为空
      // 检查用户资料完整性（兼容新旧数据结构）
        const hasValidCompanyPosition = userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && 
          userInfo.companyPositions.some(item => item.company && item.position) ||
          (userInfo.company && userInfo.position);
        
        if (!userInfo.name || !hasValidCompanyPosition) {
        console.log('用户基本信息不完善，但不强制跳转');
        userInfo.isProfileComplete = false;
        return false;
      }
      
      userInfo.isProfileComplete = true;
      return true;
    }
  })