// pages/profile_setup/profile_setup.js
const app = getApp();
const cloudDB = require('../../utils/cloudDB.js');
const BusinessCardRecognition = require('../../utils/businessCardRecognition.js');

Page({
  data: {
    userInfo: {},
    formData: {
      name: '',
      companyPositions: [{ company: '', position: '' }], // 公司职位配对列表
      phone: '',
      industry: '',
      ancestralHome: '',
      email: '',
      expertise: '',
      interest: '',
      introduction: '',
      personalTags: [],
    },
    tempPersonalTag: '',
    showAdminCode: false,
    adminCode: '',
    isSubmitting: false,
    tempAvatarPath: '', // 临时头像URL，用于预览
    charCount: 0,
    MAX_INTRODUCTION_LENGTH: 200,
  },

  onLoad: function(options) {
    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    
    if (userInfo) {
      // 处理公司职位数据的兼容性
      let companyPositions = [];
      if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions)) {
        // 新格式：已经是数组
        companyPositions = userInfo.companyPositions;
      } else if (userInfo.company || userInfo.position) {
        // 旧格式：单个公司职位，转换为数组格式
        companyPositions = [{
          company: userInfo.company || '',
          position: userInfo.position || ''
        }];
      } else {
        // 默认：空的公司职位配对
        companyPositions = [{ company: '', position: '' }];
      }
      
      // 设置表单初始值
      const formData = {
        name: userInfo.name || '',
        companyPositions: companyPositions,
        phone: userInfo.phone || '',
        industry: userInfo.industry || '',
        ancestralHome: userInfo.ancestralHome || '',
        email: userInfo.email || '',
        expertise: userInfo.expertise || '',
        interest: userInfo.interest || '',
        introduction: userInfo.introduction || '',
        personalTags: userInfo.personalTags || [],
      };
      
      this.setData({
        userInfo: userInfo,
        formData: formData,
        charCount: (userInfo.introduction || '').length,
      });
    } else {
      this.setData({
        formData: {
          name: '',
          company: '',
          position: '',
          phone: '',
          industry: '',
          ancestralHome: '',
          email: '',
          expertise: '',
          interest: '',
          introduction: '',
          personalTags: [],
        }
      });
    }
  },

  // 表单项输入事件
  onInput: function(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    this.setData({
      [`formData.${field}`]: value
    });

    if (field === 'introduction') {
      this.setData({
        charCount: value.length,
      });
    }
  },

  // 处理公司职位输入
  onCompanyPositionInput: function(e) {
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    const companyPositions = [...this.data.formData.companyPositions];
    companyPositions[index][field] = value;
    
    this.setData({
      'formData.companyPositions': companyPositions
    });
  },

  // 添加公司职位配对
  addCompanyPosition: function() {
    const companyPositions = [...this.data.formData.companyPositions];
    companyPositions.push({ company: '', position: '' });
    
    this.setData({
      'formData.companyPositions': companyPositions
    });
  },

  // 删除公司职位配对
  removeCompanyPosition: function(e) {
    const index = e.currentTarget.dataset.index;
    const companyPositions = [...this.data.formData.companyPositions];
    
    if (companyPositions.length > 1) {
      companyPositions.splice(index, 1);
      this.setData({
        'formData.companyPositions': companyPositions
      });
    }
  },
  


  personalTagsInput(e) {
    this.setData({ tempPersonalTag: e.detail.value });
  },

  confirmPersonalTags() {
    const { tempPersonalTag, formData } = this.data;
    if (tempPersonalTag && !formData.personalTags.includes(tempPersonalTag)) {
      this.setData({
        'formData.personalTags': [...formData.personalTags, tempPersonalTag],
        tempPersonalTag: '',
      });
    }
  },

  removePersonalTag(e) {
    const { tag } = e.currentTarget.dataset;
    this.setData({
      'formData.personalTags': this.data.formData.personalTags.filter(t => t !== tag),
    });
  },

  toggleAdminCode() {
    this.setData({ showAdminCode: !this.data.showAdminCode });
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
      updateData['formData.name'] = 姓名;
      console.log('[名片识别] 填入姓名:', 姓名);
    }
    
    // 处理公司职位配对数据
    if (公司职位配对 && Array.isArray(公司职位配对) && 公司职位配对.length > 0) {
      const companyPositions = 公司职位配对.map(item => ({
        company: item.公司 && item.公司 !== '未能识别' ? item.公司 : '',
        position: item.职位 && item.职位 !== '未能识别' ? item.职位 : ''
      })).filter(item => item.company || item.position); // 过滤掉空的配对
      
      if (companyPositions.length > 0) {
        updateData['formData.companyPositions'] = companyPositions;
        console.log('[名片识别] 填入公司职位配对:', companyPositions);
      }
    }
    
    if (电话 && 电话 !== '未能识别') {
      updateData['formData.phone'] = 电话;
      console.log('[名片识别] 填入电话:', 电话);
    }
    
    console.log('[名片识别] 准备更新的数据:', updateData);
    
    // 更新表单数据
    this.setData(updateData);
    
    // 验证数据是否成功更新
    setTimeout(() => {
      console.log('[名片识别] 更新后的formData:', this.data.formData);
    }, 100);
    
    wx.showToast({
      title: '信息已填入表单',
      icon: 'success',
      duration: 1500
    });
  },

  // 选择头像
  chooseAvatar: function() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        
        // 直接调用微信裁剪接口
        wx.cropImage({
          src: tempFilePath,
          cropType: 'square', // 正方形裁剪
          aspectRatio: 1, // 1:1比例
          success: (res) => {
            // 更新头像路径
            this.setData({
              'userInfo.avatarUrl': res.tempFilePath,
              'tempAvatarPath': res.tempFilePath // 保存临时路径以便上传
            });
          },
          fail: (err) => {
            console.error('图片裁剪失败:', err);
            // 如果裁剪失败，直接使用原图片
            this.setData({
              'userInfo.avatarUrl': tempFilePath,
              'tempAvatarPath': tempFilePath
            });
          }
        });
      }
    });
  },
  
  // 将图片上传到云存储
  uploadImageToCloud: function(filePath) {
    return new Promise((resolve, reject) => {
      const cloudDB = require('../../utils/cloudDB.js');
      const userInfo = wx.getStorageSync('userInfo');
      
      // 先检查是否有旧头像需要删除
      const oldAvatarUrl = userInfo ? userInfo.avatarUrl : '';
      
      // 确保有文件扩展名
      let fileExt = 'png';
      const extMatch = filePath.match(/\.(\w+)$/);
      if (extMatch && extMatch[1]) {
        fileExt = extMatch[1];
      }
      const timestamp = new Date().getTime();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const cloudPath = `avatars/${timestamp}_${randomStr}.${fileExt}`;
      
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



  // 提交表单
  submitForm: async function() {
    // 表单验证
    const { formData, adminCode, showAdminCode } = this.data;
    
    if (!formData.name) {
      wx.showToast({
        title: '请输入姓名',
        icon: 'none'
      });
      return;
    }
    
    // 验证公司职位配对
    if (!formData.companyPositions || formData.companyPositions.length === 0) {
      wx.showToast({
        title: '请至少添加一个公司职位',
        icon: 'none'
      });
      return;
    }
    
    // 检查是否至少有一个完整的公司职位配对
    const hasValidCompanyPosition = formData.companyPositions.some(item => 
      item.company && item.company.trim() !== '' && 
      item.position && item.position.trim() !== ''
    );
    
    if (!hasValidCompanyPosition) {
      wx.showToast({
        title: '请至少填写一个完整的公司和职位',
        icon: 'none'
      });
      return;
    }
    
    if (!formData.phone) {
      wx.showToast({
        title: '请输入手机号码',
        icon: 'none'
      });
      return;
    }
    
    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      wx.showToast({
        title: '请输入正确的手机号码',
        icon: 'none'
      });
      return;
    }

    if (showAdminCode && !adminCode) {
      wx.showToast({ title: '请输入管理员邀请码', icon: 'none' });
      return;
    }
    
    this.setData({ isSubmitting: true });
    
    try {
      // 检查管理员邀请码
      const isAdmin = formData.adminCode === '123456'; // 这里设置一个固定的邀请码，实际应用中应该从服务器验证
      
      const updatedUserInfo = {
        ...this.data.userInfo,
        ...formData,
        isAdmin: isAdmin, // 添加管理员权限标识
        isProfileComplete: true
      };
      
      // 移除邀请码，不保存到用户信息中
      delete updatedUserInfo.adminCode;
      
      if (this.data.tempAvatarPath && 
          (this.data.tempAvatarPath.startsWith('http://tmp') || 
           this.data.tempAvatarPath.startsWith('wxfile://') ||
           this.data.tempAvatarPath.startsWith('file:///'))) {
        try {
          const fileID = await this.uploadImageToCloud(this.data.tempAvatarPath);
          updatedUserInfo.avatarUrl = fileID;
        } catch (uploadError) {
          console.error('上传头像失败:', uploadError);
          wx.showToast({ title: '头像上传失败，将使用原头像', icon: 'none' });
        }
      } else if (this.data.tempAvatarPath) {
        console.log('头像路径不是临时文件，可能已经是云存储路径:', this.data.tempAvatarPath);
      }
      
      const result = await cloudDB.saveUserInfo(updatedUserInfo);
      
      if (result) {
        wx.setStorageSync('userInfo', result);
        app.globalData.userInfo = result;
        app.globalData.isLoggedIn = true; // Ensure isLoggedIn is also true
        if(result.openid) app.globalData.openid = result.openid; // Ensure openid is in globalData
        
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 1500
        });

            setTimeout(() => {
          const redirectUrl = wx.getStorageSync('profileSetupRedirectUrl');
          if (redirectUrl) {
            wx.removeStorageSync('profileSetupRedirectUrl'); // 清除，避免下次误用
            console.log('资料完善成功，检测到回跳URL，正在回跳至：', redirectUrl);
            
            // 判断是否是tabBar页面
            const isTabBarPage = ['/pages/index/index', '/pages/notifications/notifications', '/pages/mine/mine'].includes(redirectUrl.split('?')[0]);
            
            if (isTabBarPage) {
              wx.switchTab({
                url: redirectUrl,
                success: () => {
                  // 页面跳转成功后，获取当前页面实例并刷新
                  setTimeout(() => {
                    const pages = getCurrentPages();
                    const currentPage = pages[pages.length - 1];
                    if (currentPage && typeof currentPage.onLoad === 'function') {
                      // 获取页面参数
                      const options = {};
                      if (redirectUrl.includes('?')) {
                        const queryString = redirectUrl.split('?')[1];
                        queryString.split('&').forEach(param => {
                          const [key, value] = param.split('=');
                          if (key && value) options[key] = value;
                        });
                      }
                      // 调用页面的onLoad方法刷新页面
                      currentPage.onLoad(options);
                    }
                  }, 500); // 延迟执行，确保页面已完成跳转
                },
                fail: (err) => {
                  console.error('跳转到TabBar页面失败:', err);
                  wx.switchTab({ url: '/pages/index/index' });
                }
              });
            } else {
              wx.redirectTo({
                url: redirectUrl,
                success: () => {
                  // 页面重定向成功后，获取当前页面实例并刷新
                  setTimeout(() => {
                    const pages = getCurrentPages();
                    const currentPage = pages[pages.length - 1];
                    if (currentPage && typeof currentPage.onLoad === 'function') {
                      // 获取页面参数
                      const options = {};
                      if (redirectUrl.includes('?')) {
                        const queryString = redirectUrl.split('?')[1];
                        queryString.split('&').forEach(param => {
                          const [key, value] = param.split('=');
                          if (key && value) options[key] = value;
                        });
                      }
                      // 调用页面的onLoad方法刷新页面
                      currentPage.onLoad(options);
                    }
                  }, 500); // 延迟执行，确保页面已完成跳转
                },
                fail: (err) => {
                  console.error('重定向到原页面失败:', err);
                  // 如果重定向失败，尝试navigateTo
                  wx.navigateTo({
                    url: redirectUrl,
                    success: () => {
                      // 页面导航成功后，获取当前页面实例并刷新
                      setTimeout(() => {
                        const pages = getCurrentPages();
                        const currentPage = pages[pages.length - 1];
                        if (currentPage && typeof currentPage.onLoad === 'function') {
                          // 获取页面参数
                          const options = {};
                          if (redirectUrl.includes('?')) {
                            const queryString = redirectUrl.split('?')[1];
                            queryString.split('&').forEach(param => {
                              const [key, value] = param.split('=');
                              if (key && value) options[key] = value;
                            });
                          }
                          // 调用页面的onLoad方法刷新页面
                          currentPage.onLoad(options);
                        }
                      }, 500); // 延迟执行，确保页面已完成跳转
                    },
                    fail: (navErr) => {
                      console.error('导航到原页面也失败:', navErr);
                      // 最后尝试回到首页
                      wx.switchTab({ url: '/pages/index/index' });
                    }
                  });
                }
              });
            }
          } else {
            // 没有特定回跳URL，默认跳转到首页
            console.log('未检测到回跳URL，将跳转到首页');
            wx.switchTab({
              url: '/pages/index/index'
            });
          }
        }, 1500); // 延迟以显示toast

      } else {
        throw new Error('保存用户信息失败');
      }
    } catch (error) {
      console.error('提交资料失败', error);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});