// login.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')
const authUtils = require('../../utils/authUtils.js')

Page({
  data: {
    isLoading: false,
    fromPage: null,
    selectionId: null,
    showPhoneAuth: false,
    tempUserInfo: null
  },

  onLoad: function(options) {
    if (options && options.from) {
      this.setData({
        fromPage: options.from
      });
    }
    
    if (options && options.selectionId) {
      this.setData({
        selectionId: options.selectionId
      });
    }
    
    const trulyLoggedIn = app.globalData.isLoggedIn && app.globalData.openid && app.globalData.userInfo;

    if (trulyLoggedIn) {
      console.log('Login page loaded, user is already truly logged in. Navigating away.');
      // 使用authUtils的handleLoginRedirect处理登录后跳转
      authUtils.handleLoginRedirect();
    } else {
      console.log('Login page loaded. User not considered (or not fully) logged in via app.globalData. Login UI should be presented.');
    }
  },



  // 修改后的登录处理函数
  handleLogin: function() {
    console.log('登录按钮被点击');
    this.setData({ isLoading: true });
    
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (profileRes) => {
        console.log('获取用户资料成功', profileRes);
        const userInfo = profileRes.userInfo;
        this.processLogin(userInfo, null);  // 直接处理登录，不获取手机号
      },
      fail: (err) => {
        console.error('获取用户信息失败', err);
        this.setData({ isLoading: false });
        wx.showToast({ 
          title: '需要授权才能使用',
          icon: 'none'
        });
      }
    });
  },
  
  // 获取手机号的方法
  getPhoneNumber: function(userInfo) {
    console.log('开始获取手机号');
    this.setData({ 
      showPhoneAuth: true,
      tempUserInfo: userInfo 
    });
  },

  // 处理手机号授权
  onGetPhoneNumber: function(e) {
    console.log('手机号授权回调:', e.detail);
    
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      wx.cloud.callFunction({
        name: 'getPhoneNumber',
        data: {
          code: e.detail.code
        },
        success: (res) => {
          console.log('获取手机号成功:', res.result);
          if (res.result.success) {
            const phoneNumber = res.result.phoneNumber;
            console.log('用户手机号:', phoneNumber);
            
            this.setData({ showPhoneAuth: false });
            this.processLogin(this.data.tempUserInfo, phoneNumber);
          } else {
            console.error('获取手机号失败:', res.result.message);
            wx.showToast({
              title: '获取手机号失败',
              icon: 'none'
            });
            this.processLogin(this.data.tempUserInfo, null);
          }
        },
        fail: (err) => {
          console.error('调用获取手机号云函数失败:', err);
          wx.showToast({
            title: '获取手机号失败',
            icon: 'none'
          });
          this.processLogin(this.data.tempUserInfo, null);
        }
      });
    } else {
      console.log('用户拒绝手机号授权');
      this.setData({ showPhoneAuth: false });
      this.processLogin(this.data.tempUserInfo, null);
    }
  },

  // 用户点击跳过手机号授权
  skipPhoneAuth: function() {
    this.setData({ showPhoneAuth: false });
    this.processLogin(this.data.tempUserInfo, null);
  },
  
  // 处理登录的后续流程
  processLogin: function(userInfo, phoneNumber) {
    console.log('开始处理登录流程，手机号:', phoneNumber);
    
    wx.login({
      success: (res) => {
        if (res.code) {
          wx.cloud.callFunction({
            name: 'getOpenid',
            success: async (result) => {
              const openid = result.result.openid;
              app.globalData.openid = openid;
              wx.setStorageSync('openid', openid);
              
              try {
                let dbUserInfo = await cloudDB.getUserByOpenId(openid);
                let isNewUser = false;
                
                if (!dbUserInfo) {
                  const userId = 'u' + Date.now();
                  const newUserInfo = {
                    id: userId, 
                    openid: openid,
                    name: userInfo.name && userInfo.name.trim() !== '' ? userInfo.name : '未设置名称',
                    avatar: userInfo.avatarUrl || '/images/avatar1.jpg', 
                    avatarUrl: userInfo.avatarUrl || '/images/avatar1.jpg',
                    phone: phoneNumber || '',
                    company: '', 
                    position: '', 
                    industry: '', 
                    interest: '', 
                    expertise: '',
                    isProfileComplete: false,
                    // ... 其他用户信息字段
                  };
                  
                  await cloudDB.saveUserInfo(newUserInfo);
                  dbUserInfo = newUserInfo;
                  isNewUser = true;
                } else if (phoneNumber && !dbUserInfo.phone) {
                  // 更新现有用户的手机号（如果之前没有）
                  await cloudDB.updateUser(dbUserInfo.id, { phone: phoneNumber });
                  dbUserInfo.phone = phoneNumber;
                }
                
                // 更新全局数据
                app.globalData.userInfo = dbUserInfo;
                app.globalData.isLoggedIn = true;
                wx.setStorageSync('userInfo', dbUserInfo);
                
                this.setData({ isLoading: false });
                
                // 检查是否是新用户或资料不完整，如果是则跳转到资料设置页面
                if (isNewUser || !dbUserInfo.isProfileComplete) {
                  console.log('新用户或资料不完整，跳转到资料设置页面');
                  
                  // 保存原来的重定向URL到profileSetupRedirectUrl，以便资料设置完成后跳转
                  const originalRedirectUrl = wx.getStorageSync('loginRedirectUrl');
                  if (originalRedirectUrl) {
                    wx.setStorageSync('profileSetupRedirectUrl', originalRedirectUrl);
                    wx.removeStorageSync('loginRedirectUrl'); // 清除原来的loginRedirectUrl
                  }
                  
                  wx.redirectTo({
                    url: '/pages/profile_setup/profile_setup',
                    fail: (err) => {
                      console.error('跳转到资料设置页面失败:', err);
                      // 如果跳转失败，使用原有的重定向逻辑
                      authUtils.handleLoginRedirect();
                    }
                  });
                } else {
                  // 使用authUtils的handleLoginRedirect处理登录后跳转
                  authUtils.handleLoginRedirect();
                }
              } catch (err) {
                console.error('处理用户数据失败:', err);
                this.setData({ isLoading: false });
                wx.showToast({
                  title: '登录失败，请重试',
                  icon: 'none'
                });
              }
            },
            fail: (err) => {
              console.error('获取openid失败:', err);
              this.setData({ isLoading: false });
              wx.showToast({
                title: '登录失败，请重试',
                icon: 'none'
              });
            }
          });
        } else {
          console.error('wx.login 失败:', res.errMsg);
          this.setData({ isLoading: false });
          wx.showToast({
            title: '登录失败，请重试',
            icon: 'none'
          });
        }
      }
    });
  },

  // 登录后的导航逻辑（保留作为备用，但现在使用authUtils.handleLoginRedirect）
  navigateAfterLogin: function() {
    // 使用authUtils的handleLoginRedirect处理登录后跳转
    authUtils.handleLoginRedirect();
  }
});