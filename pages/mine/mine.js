// mine.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')
const authUtils = require('../../utils/authUtils.js')
const eventUtils = require('../../utils/eventUtils.js')

Page({
  data: {
    userInfo: {
      name: '',
      avatarUrl: '',
      company: '',
      position: '',
      industry: '',
      phone: '',
      email: '',
      expertise: []
    },
    isLoggedIn: false,
    hasUserInfo: false,
    canIUse: wx.canIUse('button.open-type.getUserInfo'),
    loading: {
      createdEvents: true,
      joinedEvents: true
    },
    appVersion: '1.0.0',
    stats: {
      created: 0,
      joined: 0
    },
    createdEvents: [],
    joinedEvents: [],
    unreadNotifications: 0,
    clientCount: 0,
    showAccountDeleteConfirm: false,
    deleteAccountLoading: false
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
  
  onLoad: function (options) {
    const accountInfo = wx.getAccountInfoSync();
    const version = accountInfo.miniProgram.version || '1.0.0';
    this.setData({ appVersion: version });
    
    // 检查用户是否已登录
    const isLoggedIn = app.globalData.isLoggedIn && app.globalData.openid;
    
    if (!isLoggedIn) {
      console.log('未登录状态，显示登录界面');
      // 而不是导航，直接在当前页面显示登录UI
      this.setData({
        isLoggedIn: false,
        userInfo: {
      name: '',
      avatarUrl: '',
      company: '',
      position: '',
      industry: '',
      phone: '',
      email: '',
      expertise: []
    },
        hasUserInfo: false
      });
      return;
    }
    
    this.loadAndSetUserInfo();
    this.getUnreadCounts();
    this.fetchEventData();
  },
  
  // 接收全局用户信息刷新通知
  refreshUserInfo: function(userInfo) {
    this.setData({
      userInfo: userInfo
    });
  },

  // 从云端重新获取最新用户信息
  refreshUserInfoFromCloud: async function() {
    if (!app.globalData.openid) return;
    
    try {
      const latestUserInfo = await cloudDB.getUserByOpenId(app.globalData.openid);
      if (latestUserInfo) {
        // 更新全局数据和本地缓存
        app.globalData.userInfo = latestUserInfo;
        wx.setStorageSync('userInfo', latestUserInfo);
        console.log('从云端获取到最新用户信息:', latestUserInfo);
      }
    } catch (error) {
      console.error('从云端获取用户信息失败:', error);
    }
  },
  
  onShow: function () {
    // 每次页面显示时都检查登录状态
    const isLoggedIn = app.globalData.isLoggedIn && app.globalData.openid;
    
    // 同样，不再跳转，只更新UI状态
    if (!isLoggedIn) {
      console.log('onShow: 未登录状态，显示登录界面');
      this.setData({
        isLoggedIn: false,
        userInfo: {
      name: '',
      avatarUrl: '',
      company: '',
      position: '',
      industry: '',
      phone: '',
      email: '',
      expertise: []
    },
        hasUserInfo: false
      });
      return;
    }
    
    // 从云端重新获取最新用户信息
    this.refreshUserInfoFromCloud();
    this.loadAndSetUserInfo();
    this.fetchEventData();
    this.getUnreadCounts();
  },
  
  loadAndSetUserInfo: function() {
    let storedUserInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (storedUserInfo) {
      const pageUserInfo = {
        _id: storedUserInfo._id,
        openid: storedUserInfo.openid,
        name: storedUserInfo.name || '',
        avatarUrl: storedUserInfo.avatarUrl || '/images/avatar1.jpg',
        isAdmin: storedUserInfo.isAdmin || false // 添加管理员权限标识
      };
      this.setData({
        userInfo: pageUserInfo,
        hasUserInfo: true,
        isLoggedIn: true
      });
      if (!app.globalData.userInfo && storedUserInfo) app.globalData.userInfo = storedUserInfo;
      if (!app.globalData.isLoggedIn) {
        app.globalData.isLoggedIn = true;
        if(storedUserInfo.openid && !app.globalData.openid) app.globalData.openid = storedUserInfo.openid;
      }
    } else {
      // 如果没有用户信息，更新页面状态为未登录
      this.setData({
        isLoggedIn: false,
        userInfo: {
      name: '',
      avatarUrl: '',
      company: '',
      position: '',
      industry: '',
      phone: '',
      email: '',
      expertise: []
    },
        hasUserInfo: false
      });
      // 不再调用redirectToLogin，而是留在当前页面
      console.log('未找到用户信息，显示登录界面');
    }
  },
  
  getUnreadCounts: async function() {
    try {
      const userInfo = this.data.userInfo;
      if (!userInfo || !userInfo.openid) {
        this.setData({ unreadNotifications: 0 });
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
      
      this.setData({
        unreadNotifications: unreadCount,
        clientCount: 8 // 客户数量保持原有逻辑
      });
      
    } catch (error) {
      console.error('获取未读通知数量失败:', error);
      this.setData({ unreadNotifications: 0 });
    }
  },
  
  fetchEventData: async function() {
    this.setData({ 'loading.createdEvents': true, 'loading.joinedEvents': true });
    try {
      const currentUserInfo = this.data.userInfo;
      if (!currentUserInfo || !currentUserInfo.openid) {
        this.setData({ 'loading.createdEvents': false, 'loading.joinedEvents': false, createdEvents: [], joinedEvents: [] });
        return;
      }
      let allEvents = await cloudDB.getAllEvents();
      if (!allEvents) allEvents = [];
      
      // 使用eventUtils来正确过滤活动，保持与index页面一致
      const createdEvents = allEvents.filter(event => 
        eventUtils.isUserCreator(event, currentUserInfo)
      ).map(event => eventUtils.processEventData(event, currentUserInfo));

      const joinedEvents = allEvents.filter(event => {
        // 排除用户创建的活动，避免重复计算
        if (eventUtils.isUserCreator(event, currentUserInfo)) return false;
        // 只保留用户参与的活动
        return eventUtils.isUserJoined(event, currentUserInfo);
      }).map(event => eventUtils.processEventData(event, currentUserInfo));

      const sortFn = (a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      createdEvents.sort(sortFn);
      joinedEvents.sort(sortFn);

      this.setData({
        createdEvents,
        joinedEvents,
        'loading.createdEvents': false,
        'loading.joinedEvents': false,
        stats: {
          created: createdEvents.length,
          joined: joinedEvents.length
        }
      });
    } catch (error) {
      console.error('获取活动数据失败', error);
      this.setData({ 'loading.createdEvents': false, 'loading.joinedEvents': false });
      
      wx.showToast({
        title: '获取活动失败',
        icon: 'none'
      });
    }
  },
  
  processEventData: function(events) {
    if (!Array.isArray(events)) {
      console.error('processEventData: events不是数组');
      return;
    }
    
    const userInfo = this.data.userInfo;
    
    events.forEach(event => {
      // 使用eventUtils统一处理活动数据
      eventUtils.processEventData(event, userInfo);
    });
  },
  
  goToLogin: function() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },
  
  goToProfile: function() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    });
  },
  
  viewEventDetail: function(e) {
    const eventId = e.currentTarget.dataset.id
    console.log('点击活动详情, ID:', eventId);
    
    if (!eventId) {
      console.error('活动ID不存在');
      wx.showToast({
        title: '活动ID不存在',
        icon: 'none'
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/eventDetail/eventDetail?id=' + eventId,
      fail: (err) => {
        console.error('导航到活动详情页失败:', err);
        wx.showToast({
          title: '打开详情失败',
          icon: 'none'
        });
      }
    })
  },
  
  goToNotifications: function() {
    wx.showToast({
      title: '通知功能即将上线',
      icon: 'none',
      duration: 2000
    });
  },
  
  goToClientManage: function() {
    wx.navigateTo({
      url: '/pages/clientManage/clientManage'
    });
  },
  
  createNewEvent: function() {
    // 检查用户是否有管理员权限
    const userInfo = this.data.userInfo;
    
    if (!userInfo || !userInfo.isAdmin) {
      wx.showModal({
        title: '权限提示',
        content: '只有管理员才能创建活动，请联系管理员获取邀请码',
        showCancel: false
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/createEvent/createEvent'
    });
  },
  
  // 跳转到管理后台
  goToAdminDashboard: function() {
    // 检查用户是否为管理员
    const userInfo = this.data.userInfo;
    if (!userInfo || !userInfo.isAdmin) {
      wx.showToast({
        title: '只有管理员才能访问后台',
        icon: 'none'
      });
      return;
    }
    
    wx.navigateTo({
      url: '/pages/admin/admin'
    });
  },
  
  viewAllCreatedEvents: function() {
    wx.navigateTo({
      url: '/pages/events/events?tab=2'  // tab=2对应"我发起的活动"
    });
  },
  
  viewAllJoinedEvents: function() {
    wx.navigateTo({
      url: '/pages/events/events?tab=1'  // tab=1对应"我参与的活动"
    });
  },
  
  viewAllSavedEvents: function() {
    wx.showToast({
      title: '收藏功能即将上线',
      icon: 'none',
      duration: 2000
    });
  },
  
  logout: function() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.isLoggedIn = false;
          app.globalData.userInfo = null;
          app.globalData.openid = null;
          
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('isLoggedIn');
          wx.removeStorageSync('openid');
          
          this.setData({
            isLoggedIn: false,
            userInfo: {
      name: '',
      avatarUrl: '',
      company: '',
      position: '',
      industry: '',
      phone: '',
      email: '',
      expertise: []
    },
            hasUserInfo: false,
            createdEvents: [],
            joinedEvents: [],
            unreadNotifications: 0,
            clientCount: 0,
            stats: {
              created: 0,
              joined: 0
            },
            showAccountDeleteConfirm: false,
            deleteAccountLoading: false
          });

          wx.reLaunch({
            url: '/pages/index/index'
          });
        }
      }
    });
  },
  
  showDeleteAccountConfirm: function() {
    this.setData({
      showAccountDeleteConfirm: true
    });
  },
  
  hideDeleteAccountConfirm: function() {
    this.setData({
      showAccountDeleteConfirm: false
    });
  },
  
  deleteAccount: async function() {
    this.setData({
      deleteAccountLoading: true
    });
    
    try {
      const userInfo = this.data.userInfo;
      if (!userInfo || !userInfo.openid) {
        throw new Error('未找到用户信息');
      }
      
      const res = await wx.cloud.callFunction({
        name: 'deleteUserAccount',
        data: {
          userId: userInfo._id,
          openid: userInfo.openid
        }
      });
      
      if (res.result && res.result.success) {
        app.globalData.isLoggedIn = false;
        app.globalData.userInfo = null;
        app.globalData.openid = null;
        
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('isLoggedIn');
        wx.removeStorageSync('openid');
        wx.removeStorageSync('activeEventTab');
        
        this.setData({
          isLoggedIn: false,
          userInfo: {
      name: '',
      avatarUrl: '',
      company: '',
      position: '',
      industry: '',
      phone: '',
      email: '',
      expertise: []
    },
          hasUserInfo: false,
          createdEvents: [],
          joinedEvents: [],
          unreadNotifications: 0,
          clientCount: 0,
          stats: {
            created: 0,
            joined: 0
          },
          showAccountDeleteConfirm: false,
          deleteAccountLoading: false
        });
        
        wx.showToast({
          title: '账号已注销',
          icon: 'success',
          duration: 2000
        });
        
        setTimeout(() => {
          wx.reLaunch({
            url: '/pages/index/index'
          });
        }, 2000);
      } else {
        throw new Error(res.result?.message || '注销账号失败');
      }
    } catch (error) {
      console.error('注销账号失败:', error);
      this.setData({
        deleteAccountLoading: false,
        showAccountDeleteConfirm: false
      });
      
      wx.showToast({
        title: error.message || '注销账号失败，请重试',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  changeAvatar: function() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        const tempFilePath = res.tempFilePaths[0];
        
        wx.cropImage({
          src: tempFilePath,
          cropScale: '1:1',
          success: function(cropRes) {
            that.uploadUserAvatar(cropRes.tempFilePath);
          },
          fail: function(error) {
            console.error('图片裁剪失败:', error);
            wx.showToast({
              title: '图片裁剪失败',
              icon: 'none'
            });
          }
        });
      }
    });
  },
  
  uploadUserAvatar: function(filePath) {
    const that = this;
    wx.showLoading({
      title: '上传中...',
    });
    
    const userInfo = that.data.userInfo;
    const cloudPath = 'user-avatars/' + userInfo._id + '_' + new Date().getTime() + '.jpg';
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: res => {
        const fileID = res.fileID;
        
        const updatedUserInfo = {
          ...userInfo,
          avatarUrl: fileID
        };
        
        cloudDB.saveUserInfo(updatedUserInfo).then(user => {
          if (user) {
            app.globalData.userInfo = user;
            that.setData({
              userInfo: user
            });
            
            wx.hideLoading();
            wx.showToast({
              title: '头像更新成功',
              icon: 'success'
            });
          } else {
            throw new Error('保存用户信息失败');
          }
        }).catch(error => {
          console.error('更新用户头像失败', error);
          wx.hideLoading();
          wx.showToast({
            title: '更新头像失败',
            icon: 'none'
          });
        });
      },
      fail: err => {
        console.error('上传头像失败', err);
        wx.hideLoading();
        wx.showToast({
          title: '上传头像失败',
          icon: 'none'
        });
      }
    });
  },
  
  // 直接在mine页面处理登录
  handleLogin: function() {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        this.setData({ isLoading: true });
        const userInfo = res.userInfo;
        wx.login({
          success: (loginRes) => {
            if (loginRes.code) {
              wx.cloud.callFunction({
                name: 'getOpenid',
                success: async (result) => {
                  try {
                    const openid = result.result.openid;
                    app.globalData.openid = openid;
                    wx.setStorageSync('openid', openid);
                    
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
                        company: '', 
                        position: '', 
                        industry: '', 
                        interest: '', 
                        expertise: '',
                        isProfileComplete: false
                      };
                      dbUserInfo = await cloudDB.saveUserInfo(newUserInfo);
                      if (!dbUserInfo) throw new Error('保存用户信息到云数据库失败');
                      isNewUser = true;
                    }
                    
                    wx.setStorageSync('userInfo', dbUserInfo);
                    wx.setStorageSync('isLoggedIn', true);
                    app.globalData.userInfo = dbUserInfo;
                    app.globalData.isLoggedIn = true;
                    
                    wx.showToast({
                      title: '登录成功',
                      icon: 'success',
                      duration: 1500,
                      success: () => {
                        setTimeout(() => {
                          if (isNewUser || !dbUserInfo.isProfileComplete) {
                            wx.navigateTo({
                              url: '/pages/profile_setup/profile_setup'
                            });
                          } else {
                            // 刷新当前页面数据
                            this.setData({
                              isLoggedIn: true,
                              userInfo: dbUserInfo,
                              hasUserInfo: true,
                              isLoading: false
                            });
                            this.loadAndSetUserInfo();
                            this.getUnreadCounts();
                            this.fetchEventData();
                          }
                        }, 1000);
                      }
                    });
                  } catch (error) {
                    console.error('登录失败', error);
                    this.setData({ isLoading: false });
                    wx.showToast({ title: '登录失败，请重试', icon: 'none' });
                  }
                },
                fail: (err) => {
                  console.error('云函数调用失败', err);
                  this.setData({ isLoading: false });
                  wx.showToast({ title: '登录失败，请重试', icon: 'none' });
                }
              });
            } else {
              console.error('wx.login failed:', loginRes);
              this.setData({ isLoading: false });
              wx.showToast({ title: '登录失败', icon: 'none' });
            }
          },
          fail: (err) => {
            console.error('wx.login failed:', err);
            this.setData({ isLoading: false });
            wx.showToast({ title: '登录失败，请重试', icon: 'none' });
          }
        });
      },
      fail: (err) => {
        console.log('用户拒绝授权：', err);
        wx.showToast({ title: '需要授权才能继续使用', icon: 'none' });
      }
    });
  },
})