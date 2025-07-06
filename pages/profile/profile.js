// profile.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')
const BusinessCardRecognition = require('../../utils/businessCardRecognition.js')

Page({
  data: {
    userInfo: {
      name: '', // Primary field for name
      company: '',
      position: '',
      industry: '',
      interest: '',
      expertise: '',
      phone: '',
      email: '',
      avatar: '/images/avatar1.jpg', // Default avatar
      ancestralHome: '' // 祖籍字段
    },
    isEditing: false,
    tempAvatarPath: '', // To store temporary avatar path for upload
    adminCodeVisible: false, // 控制管理员邀请码输入框的显示
    adminCode: '' // 管理员邀请码
  },

  // 从用户信息中获取公司职位配对（兼容新旧数据结构）
  getCompanyPositionsFromUserInfo: function(userInfo) {
    if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions)) {
      // 新格式：已经是数组
      return userInfo.companyPositions;
    } else if (userInfo.company || userInfo.position) {
      // 旧格式：单个公司职位，转换为数组格式
      return [{
        company: userInfo.company || '',
        position: userInfo.position || ''
      }];
    } else {
      // 默认：空的公司职位配对
      return [{ company: '', position: '' }];
    }
  },

  onLoad: async function(options) { // Make onLoad async
    await this.refreshUserInfoFromCloud(); // 从云端获取最新用户信息
    this.checkAuthAndLoadUserInfo();    // 使用获取到的信息更新页面
  },
  
  onShow: function() {
    // 当页面重新显示时，仅从全局/本地缓存同步用户信息
    // 这样可以避免 refreshUserInfoFromCloud 从云端拉取旧数据覆盖本地更改
    this.checkAuthAndLoadUserInfo();
  },

  // 从云端重新获取最新用户信息
  refreshUserInfoFromCloud: async function() { // Ensure it's async and returns a promise
    if (!app.globalData.openid) return null;
    try {
      const latestUserInfo = await cloudDB.getUserByOpenId(app.globalData.openid);
      if (latestUserInfo) {
        // 更新全局数据和本地缓存
        app.globalData.userInfo = latestUserInfo;
        wx.setStorageSync('userInfo', latestUserInfo);
        console.log('Profile: 从云端获取到最新用户信息:', latestUserInfo);
        return latestUserInfo; // Return the fetched info
      }
      return null;
    } catch (error) {
      console.error('Profile: 从云端获取用户信息失败:', error);
      return null;
    }
  },
  
  checkAuthAndLoadUserInfo: function() {
    let storedUserInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (storedUserInfo) {
      console.log('Profile: 获取到用户信息:', storedUserInfo);
      // Initialize with empty name if not present, prioritize 'name' over 'nickName'
      // Since we are removing nickName, we only rely on 'name'
      this.setData({
        userInfo: {
          _id: storedUserInfo._id, // Preserve _id and openid if they exist
          openid: storedUserInfo.openid,
          name: storedUserInfo.name || '', // Use name, default to empty
          companyPositions: this.getCompanyPositionsFromUserInfo(storedUserInfo),
          industry: storedUserInfo.industry || '',
          interest: storedUserInfo.interest || '',
          expertise: storedUserInfo.expertise || '',
          phone: storedUserInfo.phone || '',
          email: storedUserInfo.email || '',
          avatarUrl: storedUserInfo.avatarUrl || '/images/avatar1.jpg',
          isProfileComplete: storedUserInfo.isProfileComplete || false,
          isAdmin: storedUserInfo.isAdmin || false, // 添加管理员权限字段
          ancestralHome: storedUserInfo.ancestralHome || '' // 祖籍字段
        },
        // nickName is intentionally omitted
        isEditing: true,
      });
    } else {
      console.log('Profile: 未获取到用户信息，使用默认值或引导登录');
      // Optionally, if no user info, redirect to login or show placeholder
      // For now, it will use the default empty userInfo from data.
    }
  },

  nameInput: function(e) {
    this.setData({
      'userInfo.name': e.detail.value
    });
  },

  // 公司输入处理
  companyInput: function(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`userInfo.companyPositions[${index}].company`]: e.detail.value
    });
  },

  // 职位输入处理
  positionInput: function(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      [`userInfo.companyPositions[${index}].position`]: e.detail.value
    });
  },

  // 添加公司职位配对
  addCompanyPosition: function() {
    const companyPositions = this.data.userInfo.companyPositions;
    companyPositions.push({ company: '', position: '' });
    this.setData({
      'userInfo.companyPositions': companyPositions
    });
  },

  // 删除公司职位配对
  removeCompanyPosition: function(e) {
    const index = e.currentTarget.dataset.index;
    const companyPositions = this.data.userInfo.companyPositions;
    if (companyPositions.length > 1) {
      companyPositions.splice(index, 1);
      this.setData({
        'userInfo.companyPositions': companyPositions
      });
    }
  },

  ancestralHomeInput: function(e) {
    this.setData({
      'userInfo.ancestralHome': e.detail.value
    });
  },

  // 名片识别功能
  recognizeBusinessCard: function() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.uploadAndRecognize(tempFilePath);
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  // 上传并识别名片
  uploadAndRecognize: function(filePath) {
    wx.showLoading({
      title: '识别中...',
      mask: true
    });

    wx.cloud.callFunction({
      name: 'recognizeBusinessCard',
      data: {
        filePath: filePath
      },
      success: (res) => {
        wx.hideLoading();
        console.log('名片识别结果:', res.result);
        if (res.result.success) {
          this.showBusinessCardConfirmDialog(res.result.data);
        } else {
          wx.showToast({
            title: res.result.error || '识别失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('名片识别失败:', err);
        wx.showToast({
          title: '识别失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  // 显示名片识别结果确认对话框
  showBusinessCardConfirmDialog: function(recognizedData) {
    const companyPositions = recognizedData.公司职位配对 || [];
    let message = '识别到以下信息：\n\n';
    message += `姓名: ${recognizedData.姓名 || '未识别'}\n`;
    message += `电话: ${recognizedData.电话 || '未识别'}\n`;
    
    if (companyPositions.length > 0) {
      message += '\n公司职位配对:\n';
      companyPositions.forEach((pair, index) => {
        message += `${index + 1}. ${pair.公司 || '未识别'} - ${pair.职位 || '未识别'}\n`;
      });
    }
    
    message += '\n是否使用这些信息填写表单？';
    
    wx.showModal({
      title: '名片识别结果',
      content: message,
      confirmText: '使用',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.fillFormWithBusinessCardData(recognizedData);
        }
      }
    });
  },

  // 使用名片识别结果填写表单
  fillFormWithBusinessCardData: function(data) {
    const updateData = {};
    
    // 填写姓名
    if (data.姓名) {
      updateData['userInfo.name'] = data.姓名;
    }
    
    // 填写电话
    if (data.电话) {
      updateData['userInfo.phone'] = data.电话;
    }
    
    // 处理公司职位配对
    if (data.公司职位配对 && Array.isArray(data.公司职位配对)) {
      const companyPositions = data.公司职位配对.map(pair => ({
        company: pair.公司 || '',
        position: pair.职位 || ''
      })).filter(pair => pair.company || pair.position); // 过滤掉空的配对
      
      if (companyPositions.length > 0) {
        updateData['userInfo.companyPositions'] = companyPositions;
      }
    }
    
    this.setData(updateData);
    
    wx.showToast({
      title: '信息已填入表单',
      icon: 'success'
    });
  },
  
  industryInput: function(e) {
    this.setData({
      'userInfo.industry': e.detail.value
    });
  },
  
  interestInput: function(e) {
    this.setData({
      'userInfo.interest': e.detail.value
    });
  },
  
  expertiseInput: function(e) {
    this.setData({
      'userInfo.expertise': e.detail.value
    });
  },
  
  phoneInput: function(e) {
    this.setData({
      'userInfo.phone': e.detail.value
    });
  },
  
  emailInput: function(e) {
    this.setData({
      'userInfo.email': e.detail.value
    });
  },
  
  // 切换管理员邀请码输入框显示
  toggleAdminCode: function() {
    this.setData({
      adminCodeVisible: !this.data.adminCodeVisible
    });
  },
  
  // 管理员邀请码输入
  adminCodeInput: function(e) {
    this.setData({
      adminCode: e.detail.value
    });
  },

  // 名片识别功能
  async recognizeBusinessCard() {
    try {
      const result = await BusinessCardRecognition.chooseAndRecognizeBusinessCard();
      
      if (result.success && result.data) {
        const recognizedData = result.data;
        
        // 如果有错误信息，先显示警告
        if (result.error) {
          console.warn('[名片识别] 识别过程中出现问题:', result.error);
        }
        
        // 显示确认对话框
        this.showBusinessCardConfirmDialog(recognizedData);
      } else {
        wx.showToast({
          title: result.error || '名片识别失败',
          icon: 'none',
          duration: 2000
        });
      }
    } catch (error) {
      console.error('名片识别失败:', error);
      wx.showToast({
        title: '名片识别失败，请重试',
        icon: 'none'
      });
    }
  },

  // 显示名片识别结果确认对话框
  showBusinessCardConfirmDialog(recognizedData) {
    const { 姓名, 电话, 公司职位配对 } = recognizedData;
    
    let content = '识别到以下信息：\n';
    content += `姓名: ${姓名}\n`;
    if (公司职位配对 && Array.isArray(公司职位配对) && 公司职位配对.length > 0) {
      content += '公司职位信息:\n';
      公司职位配对.forEach((item, index) => {
        content += `  ${index + 1}. ${item.公司} - ${item.职位}\n`;
      });
    }
    content += `电话: ${电话}\n\n`;
    content += '是否要填入表单？';
    
    wx.showModal({
      title: '名片识别结果',
      content: content,
      confirmText: '确认填入',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.fillFormWithBusinessCardData(recognizedData);
        }
      }
    });
  },

  // 将名片识别结果填入表单
  fillFormWithBusinessCardData(recognizedData) {
    console.log('[名片识别] 接收到的数据:', recognizedData);
    const { 姓名, 电话, 公司职位配对 } = recognizedData;
    const updateData = {};
    
    // 只填入非"未能识别"的字段
    if (姓名 && 姓名 !== '未能识别') {
      updateData['userInfo.name'] = 姓名;
      console.log('[名片识别] 填入姓名:', 姓名);
    }
    
    // 处理公司职位配对数据
    if (公司职位配对 && Array.isArray(公司职位配对) && 公司职位配对.length > 0) {
      const companyPositions = 公司职位配对.map(item => ({
        company: item.公司 && item.公司 !== '未能识别' ? item.公司 : '',
        position: item.职位 && item.职位 !== '未能识别' ? item.职位 : ''
      })).filter(item => item.company || item.position); // 过滤掉空的配对
      
      if (companyPositions.length > 0) {
        updateData['userInfo.companyPositions'] = companyPositions;
        console.log('[名片识别] 填入公司职位配对:', companyPositions);
        
        // 为了兼容性，同时更新第一个公司职位到单独字段
        if (companyPositions[0].company) {
          updateData['userInfo.company'] = companyPositions[0].company;
        }
        if (companyPositions[0].position) {
          updateData['userInfo.position'] = companyPositions[0].position;
        }
      }
    }
    
    if (电话 && 电话 !== '未能识别') {
      updateData['userInfo.phone'] = 电话;
      console.log('[名片识别] 填入电话:', 电话);
    }
    
    console.log('[名片识别] 准备更新的数据:', updateData);
    
    // 更新表单数据
    this.setData(updateData);
    
    // 验证数据是否成功更新
    setTimeout(() => {
      console.log('[名片识别] 更新后的userInfo:', this.data.userInfo);
    }, 100);
    
    // 全局刷新用户信息
    this.refreshGlobalUserInfo();
    
    wx.showToast({
      title: '信息已填入表单',
      icon: 'success',
      duration: 1500
    });
  },
  
  // 全局刷新用户信息
  refreshGlobalUserInfo: function() {
    const app = getApp();
    const currentUserInfo = this.data.userInfo;
    
    // 更新全局数据
    app.globalData.userInfo = currentUserInfo;
    
    // 更新本地存储
    wx.setStorageSync('userInfo', currentUserInfo);
    
    // 通知其他页面刷新
    const pages = getCurrentPages();
    pages.forEach(page => {
      if (page.route !== 'pages/profile/profile' && page.refreshUserInfo) {
        page.refreshUserInfo(currentUserInfo);
      }
    });
  },
  
  // 新版微信头像选择 - 使用微信官方裁剪功能
  onChooseAvatar: function(e) {
    // 从事件中获取临时头像路径
    const tempFilePath = e.detail.avatarUrl;
    
    if (tempFilePath) {
      console.log('获取到头像临时路径:', tempFilePath);
      
      // 直接使用微信返回的头像
      this.setData({
        'userInfo.avatarUrl': tempFilePath,
        tempAvatarPath: tempFilePath // 保存临时路径以便上传
      });
      
      // 全局刷新用户信息
      this.refreshGlobalUserInfo();
      
      // 提示用户头像已更新
      wx.showToast({
        title: '头像已更新',
        icon: 'success',
        duration: 1500
      });
    } else {
      console.error('获取头像失败');
      wx.showToast({
        title: '获取头像失败',
        icon: 'none'
      });
    }
  },
  
  // 保留旧版头像选择方法以兼容其他可能的调用
  chooseAvatar: function() {
    // 提示用户使用新的头像选择方式
    wx.showToast({
      title: '请点击头像进行更换',
      icon: 'none'
    });
  },
  
  // 将图片上传到云存储
  uploadImageToCloud: function(filePath) {
    return new Promise((resolve, reject) => {
      // 确保有文件扩展名
      let fileExt = 'png';
      const extMatch = filePath.match(/\.(\w+)$/);
      if (extMatch && extMatch[1]) {
        fileExt = extMatch[1];
      }
      const cloudDB = require('../../utils/cloudDB.js');
      const userInfo = wx.getStorageSync('userInfo');
      
      // 先检查是否有旧头像需要删除
      const oldAvatarUrl = userInfo ? userInfo.avatarUrl : '';
      
      const cloudPath = `avatars/${app.globalData.openid || 'unknown'}_${new Date().getTime()}.${fileExt}`;
      
      console.log(`[上传头像] 开始上传到云路径: ${cloudPath}`);
      wx.showLoading({ title: '上传头像中...' });
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: res => {
          console.log('[上传头像] 成功:', res.fileID);
          wx.hideLoading();
          
          // 如果有旧头像，尝试删除
          if (oldAvatarUrl && oldAvatarUrl.includes('cloud://')) {
            console.log('[删除旧头像] 开始删除:', oldAvatarUrl);
            cloudDB.deleteCloudFile(oldAvatarUrl).then(deleteRes => {
              console.log('[删除旧头像] 结果:', deleteRes);
            }).catch(err => {
              console.error('[删除旧头像] 失败:', err);
            });
          }
          
          // 返回新云文件ID
          resolve(res.fileID);
        },
        fail: err => {
          console.error('[上传头像] 失败:', err);
          wx.hideLoading();
          wx.showToast({
            title: '头像上传失败',
            icon: 'none'
          });
          reject(err);
        }
      });
    });
  },

  // Submit profile
  submitProfile: async function() {
    // Validate inputs
    const { name, companyPositions } = this.data.userInfo;
    
    if (!name) {
      wx.showToast({
        title: '请填写姓名',
        icon: 'none'
      });
      return;
    }

    // 验证公司职位配对
    if (!companyPositions || companyPositions.length === 0) {
      wx.showToast({
        title: '请至少添加一个公司职位',
        icon: 'none'
      });
      return;
    }

    // 检查是否至少有一个完整的公司职位配对
    const hasValidPair = companyPositions.some(item => 
      item.company && item.company.trim() && item.position && item.position.trim()
    );
    
    if (!hasValidPair) {
      wx.showToast({
        title: '请至少填写一个完整的公司和职位',
        icon: 'none'
      });
      return;
    }

    // 显示加载状态
    wx.showLoading({
      title: '保存中...',
      mask: true // 添加遮罩防止用户重复点击
    });

    try {
      // 检查管理员邀请码
      const isAdmin = this.data.adminCode === '123456'; // 这里设置一个固定的邀请码，实际应用中应该从服务器验证
      
      let userDataToSave = { ...this.data.userInfo }; // Operate on a copy
      
      // 如果输入了邀请码，更新管理员权限
      if (this.data.adminCode) {
        userDataToSave.isAdmin = isAdmin;
      }
      
      if (this.data.tempAvatarPath && 
          (this.data.tempAvatarPath.startsWith('http://tmp') || 
           this.data.tempAvatarPath.startsWith('wxfile://') || 
           this.data.tempAvatarPath.startsWith('file:///'))) {
        try {
          console.log('检测到临时头像，准备上传到云存储:', this.data.tempAvatarPath);
          // 上传头像到云存储
          const fileID = await this.uploadImageToCloud(this.data.tempAvatarPath);
          console.log('上传头像成功，fileID:', fileID);
          // 更新用户数据中的头像地址为云文件ID
          userDataToSave.avatarUrl = fileID;
        } catch (uploadError) {
          console.error('上传头像失败:', uploadError);
          wx.showToast({
            title: '头像上传失败，将使用现有头像 (if any): ',
            icon: 'none'
          });
          // 如果上传失败，保留原头像
        }
      } else if (this.data.tempAvatarPath) {
        console.log('头像路径不是临时文件，可能已经是云存储路径:', this.data.tempAvatarPath);
      }
      
      // 确保openid存在 (注意不要使用_openid，这是系统字段)
      if (!userDataToSave.openid && app.globalData.openid) {
        userDataToSave.openid = app.globalData.openid;
      }

      // 确保_id存在 (注意不要使用_openid，这是系统字段)
      if (userDataToSave._id) {
        delete userDataToSave._openid;
      }

      console.log('准备保存的用户信息:', userDataToSave);
      
      // 保存到云数据库
      const updatedUser = await cloudDB.saveUserInfo(userDataToSave);
      
      if (!updatedUser) {
        throw new Error('保存用户信息到云数据库失败');
      }

      console.log('保存成功，更新后的用户信息:', updatedUser);
      
      // Create a clean user object for global and local storage, explicitly without nickName
      const cleanUserInfo = {
          _id: updatedUser._id,
          openid: updatedUser.openid,
          name: updatedUser.name,
          companyPositions: updatedUser.companyPositions,
          industry: updatedUser.industry,
          interest: updatedUser.interest,
          expertise: updatedUser.expertise,
          phone: updatedUser.phone,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl,
          isProfileComplete: updatedUser.isProfileComplete,
          isAdmin: updatedUser.isAdmin || false, // 添加管理员权限字段
          ancestralHome: updatedUser.ancestralHome || '' // 祖籍字段
          // nickName is intentionally omitted
      };

      wx.setStorageSync('userInfo', cleanUserInfo);
      app.globalData.userInfo = cleanUserInfo;
      app.globalData.isLoggedIn = true;

      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 1500,
        success: () => {
          // 返回上一页
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
    } catch (error) {
      wx.hideLoading();
      console.error('保存用户信息失败', error);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    }
  }
})