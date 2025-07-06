// timeSelection.js
const app = getApp()

Page({
  data: {
    selectionId: '',
    isLoading: true,
    selectionData: null,
    userInfo: null,
    isLoggedIn: false,
    selectedTimes: [], // 已选择的时间
    otherConfirmed: [], // 已确认时间段的其他客户
    
    // 新增数据
    selectedDate: '', // 当前选择的日期
    availableDates: [], // 可选择的日期列表
    showDatePicker: false, // 是否显示日期选择器
    showCustomTimePicker: false, // 是否显示自定义时间选择器
    customTimeStart: '09:00', // 自定义开始时间
    customTimeEnd: '10:00', // 自定义结束时间
    customTimeLabel: '', // 自定义时间标签
    viewMode: false, // 查看模式（用于从通知进入）
  },

  // 获取公司显示文本（兼容新旧数据结构）
  getCompanyDisplayText: function(userInfo) {
    if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && userInfo.companyPositions.length > 0) {
      // 新格式：显示第一个公司，如果有多个则显示"公司1等N家公司"
      const firstCompany = userInfo.companyPositions[0].company;
      if (userInfo.companyPositions.length > 1) {
        return `${firstCompany}等${userInfo.companyPositions.length}家公司`;
      }
      return firstCompany;
    }
    // 旧格式：直接返回company字段
    return userInfo.company || '';
  },

  onLoad: function(options) {
    // 获取时间选择数据ID
    if (options && options.id) {
      this.setData({
        selectionId: options.id,
        viewMode: options.view === 'true' // 设置查看模式
      });
      
      // 检查登录状态
      const isLoggedIn = wx.getStorageSync('isLoggedIn');
      const userInfo = wx.getStorageSync('userInfo');
      
      this.setData({
        isLoggedIn: isLoggedIn || false,
        userInfo: userInfo || null
      });
      
      if (isLoggedIn && userInfo) {
        // 已登录，加载数据
        this.loadTimeSelectionData();
      } else {
        // 未登录，跳转登录页面
        wx.redirectTo({
          url: `/pages/login/login?from=timeSelection&selectionId=${options.id}`
        });
      }
    } else {
      wx.showToast({
        title: '缺少必要参数',
        icon: 'none'
      });
      
      // 2秒后返回首页
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        });
      }, 2000);
    }
  },
  
  onShow: function() {
    // 页面显示时检查登录状态
    const isLoggedIn = wx.getStorageSync('isLoggedIn');
    const userInfo = wx.getStorageSync('userInfo');
    
    // 如果登录状态发生变化，重新加载数据
    if (isLoggedIn && userInfo && (!this.data.isLoggedIn || !this.data.userInfo)) {
      this.setData({
        isLoggedIn: true,
        userInfo: userInfo
      });
      
      // 加载时间选择数据
      if (this.data.selectionId) {
        this.loadTimeSelectionData();
      }
    }
  },
  
  // 加载时间选择数据
  loadTimeSelectionData: function() {
    this.setData({ isLoading: true });
    
    // 从本地存储获取时间选择数据
    const pendingTimeSelections = wx.getStorageSync('pendingTimeSelections') || {};
    const selectionData = pendingTimeSelections[this.data.selectionId];
    
    if (selectionData) {
      // 处理可用日期
      let availableDates = [];
      if (selectionData.availableDates && selectionData.availableDates.length > 0) {
        availableDates = selectionData.availableDates;
      } else {
        // 如果没有预设的可用日期，默认使用当前日期和未来6天
        const today = new Date();
        for (let i = 0; i < 7; i++) {
          const date = new Date(today);
          date.setDate(today.getDate() + i);
          availableDates.push(this.formatDate(date));
        }
      }
      
      this.setData({
        selectionData: selectionData,
        isLoading: false,
        selectedTimes: [], // 重置已选时间
        availableDates: availableDates,
        selectedDate: selectionData.date || availableDates[0] // 使用预设日期或第一个可用日期
      });
    } else {
      wx.showToast({
        title: '未找到对应的时间选择',
        icon: 'none'
      });
      
      // 2秒后返回首页
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        });
      }, 2000);
    }
  },
  
  // 选择/取消选择时间
  selectTime: function(e) {
    if (this.data.viewMode) return; // 查看模式下不允许选择
    
    const timeIndex = e.currentTarget.dataset.index;
    const selectionData = this.data.selectionData;
    
    if (!selectionData || !selectionData.timeOptions || timeIndex >= selectionData.timeOptions.length) {
      return;
    }
    
    const selectedTime = selectionData.timeOptions[timeIndex].time;
    let selectedTimes = [...this.data.selectedTimes];
    
    // 检查是否已经选择
    const timeIndex2 = selectedTimes.indexOf(selectedTime);
    
    if (timeIndex2 !== -1) {
      // 如果已选择，则取消选择
      selectedTimes.splice(timeIndex2, 1);
    } else {
      // 如果未选择，则添加到选择列表
      selectedTimes.push(selectedTime);
    }
    
    // 更新其他已确认客户信息（显示最近选中时间段的已确认客户）
    let otherConfirmed = [];
    if (selectedTimes.length > 0) {
      // 获取最后一个选择的时间段对应的已确认客户
      const lastSelectedTime = selectedTimes[selectedTimes.length - 1];
      const lastSelectedTimeOption = selectionData.timeOptions.find(option => option.time === lastSelectedTime);
      if (lastSelectedTimeOption && lastSelectedTimeOption.confirmed) {
        otherConfirmed = lastSelectedTimeOption.confirmed;
      }
    }
    
    this.setData({
      selectedTimes: selectedTimes,
      otherConfirmed: otherConfirmed
    });
  },
  
  // 显示日期选择器
  showDatePicker: function() {
    if (this.data.viewMode) return; // 查看模式下不允许选择
    
    this.setData({
      showDatePicker: true
    });
  },
  
  // 取消日期选择
  cancelDatePicker: function() {
    this.setData({
      showDatePicker: false
    });
  },
  
  // 确认日期选择
  confirmDatePicker: function(e) {
    const selectedDate = e.detail.value;
    this.setData({
      selectedDate: selectedDate,
      showDatePicker: false,
      selectedTimes: [] // 日期变更时重置选中的时间
    });
  },
  
  // 显示自定义时间选择器
  showCustomTimePicker: function() {
    if (this.data.viewMode) return; // 查看模式下不允许选择
    
    this.setData({
      showCustomTimePicker: true,
      customTimeLabel: ''
    });
  },
  
  // 取消自定义时间选择
  cancelCustomTimePicker: function() {
    this.setData({
      showCustomTimePicker: false
    });
  },
  
  // 更新自定义开始时间
  onCustomTimeStartChange: function(e) {
    this.setData({
      customTimeStart: e.detail.value
    });
  },
  
  // 更新自定义结束时间
  onCustomTimeEndChange: function(e) {
    this.setData({
      customTimeEnd: e.detail.value
    });
  },
  
  // 输入自定义时间标签
  onCustomTimeLabelInput: function(e) {
    this.setData({
      customTimeLabel: e.detail.value
    });
  },
  
  // 确认添加自定义时间
  confirmCustomTimePicker: function() {
    const { customTimeStart, customTimeEnd, customTimeLabel, selectedDate, selectionData } = this.data;
    
    // 检查开始时间是否小于结束时间
    if (customTimeStart >= customTimeEnd) {
      wx.showToast({
        title: '开始时间必须早于结束时间',
        icon: 'none'
      });
      return;
    }
    
    // 创建自定义时间格式
    const customTime = `${customTimeStart}-${customTimeEnd}`;
    const displayLabel = customTimeLabel || customTime;
    
    // 检查是否与现有时间冲突
    const existingTimeOptions = selectionData.timeOptions || [];
    const existingTime = existingTimeOptions.find(option => option.time === customTime);
    
    if (existingTime) {
      // 如果存在相同时间段，直接选择
      let selectedTimes = [...this.data.selectedTimes];
      if (selectedTimes.indexOf(customTime) === -1) {
        selectedTimes.push(customTime);
        this.setData({
          selectedTimes: selectedTimes,
          showCustomTimePicker: false
        });
      } else {
        wx.showToast({
          title: '该时间段已被选择',
          icon: 'none'
        });
      }
    } else {
      // 创建新的时间选项
      const newTimeOption = {
        time: customTime,
        label: displayLabel,
        confirmed: [],
        isCustom: true
      };
      
      // 添加到时间选项列表
      selectionData.timeOptions.push(newTimeOption);
      
      // 添加到已选时间
      let selectedTimes = [...this.data.selectedTimes];
      selectedTimes.push(customTime);
      
      this.setData({
        selectionData: selectionData,
        selectedTimes: selectedTimes,
        showCustomTimePicker: false
      });
      
      // 更新本地存储
      let pendingTimeSelections = wx.getStorageSync('pendingTimeSelections') || {};
      pendingTimeSelections[this.data.selectionId] = selectionData;
      wx.setStorageSync('pendingTimeSelections', pendingTimeSelections);
    }
  },
  
  // 确认选择
  confirmSelection: function() {
    if (this.data.viewMode) return; // 查看模式下不允许操作
    
    if (this.data.selectedTimes.length === 0) {
      wx.showToast({
        title: '请至少选择一个时间段',
        icon: 'none'
      });
      return;
    }
    
    const selectionId = this.data.selectionId;
    const selectedTimes = this.data.selectedTimes;
    const selectedDate = this.data.selectedDate;
    const userInfo = this.data.userInfo;
    
    if (!userInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    
    // 从本地存储获取时间选择数据
    let pendingTimeSelections = wx.getStorageSync('pendingTimeSelections') || {};
    let selectionData = pendingTimeSelections[selectionId];
    
    if (selectionData) {
      // 设置或更新选择的日期
      selectionData.date = selectedDate;
      
      // 更新选中的时间段
      selectionData.timeOptions = selectionData.timeOptions.map(option => {
        if (selectedTimes.includes(option.time)) {
          // 检查用户是否已在确认列表中
          const existingIndex = option.confirmed.findIndex(u => u.id === userInfo.id);
          
          if (existingIndex === -1) {
            // 添加用户到确认列表
            option.confirmed.push({
              id: userInfo.id,
              name: userInfo.name,
              avatar: userInfo.avatarUrl,
              company: this.getCompanyDisplayText(userInfo),
              confirmedAt: new Date().toISOString()
            });
          }
        }
        return option;
      });
      
      // 向销售方发送通知
      this.sendNotificationToCreator(selectionData, selectedTimes);
      
      // 更新本地存储
      pendingTimeSelections[selectionId] = selectionData;
      wx.setStorageSync('pendingTimeSelections', pendingTimeSelections);
      
      // 显示成功消息
      wx.showModal({
        title: '已确认',
        content: `您已成功确认 ${selectedDate} ${selectedTimes.length}个时间段，对方将收到您的选择。`,
        showCancel: false,
        success: () => {
          // 返回首页
          wx.switchTab({
            url: '/pages/index/index'
          });
        }
      });
    } else {
      wx.showToast({
        title: '时间选择数据已失效',
        icon: 'none'
      });
    }
  },
  
  // 格式化日期
  formatDate: function(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
  
  // 向创建者(销售方)发送通知
  sendNotificationToCreator: async function(selectionData, selectedTimes) {
    try {
      // 组合所有选中的时间段字符串
      const timeText = selectedTimes.join('、');
      
      // 找到选中时间段的详细信息
      const confirmedUsers = [];
      selectedTimes.forEach(time => {
        const timeOption = selectionData.timeOptions.find(option => option.time === time);
        if (timeOption && timeOption.confirmed) {
          timeOption.confirmed.forEach(user => {
            // 确保不重复添加用户
            if (!confirmedUsers.find(u => u.id === user.id)) {
              confirmedUsers.push(user);
            }
          });
        }
      });
      
      // 使用云函数添加通知到云数据库
      const result = await wx.cloud.callFunction({
        name: 'addNotification',
        data: {
          type: 'timeConfirmation',
          recipientId: selectionData.creatorId,
          senderId: this.data.userInfo.openid,
          senderName: this.data.userInfo.name || this.data.userInfo.nickName,
          eventId: null,
          eventTitle: '单约时间确认',
          message: `您的单约(${selectionData.date})有新的时间确认: ${timeText}`,
          selectionId: selectionData.id,
          selectedDate: selectionData.date,
          selectedTimes: selectedTimes,
          confirmedBy: this.data.userInfo,
          otherConfirmed: confirmedUsers.filter(u => u.id !== this.data.userInfo.id),
          location: selectionData.location
        }
      });
      
      console.log('时间确认通知已发送到云数据库:', result);
      
      // 更新通知角标
      const app = getApp();
      if (app.updateNotificationBadge) {
        app.updateNotificationBadge();
      }
      
    } catch (error) {
      console.error('发送时间确认通知失败:', error);
    }
  }
});