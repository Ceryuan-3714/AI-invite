// createEvent.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')
const authUtils = require('../../utils/authUtils.js')

Page({
  data: {
    // 活动类型标签，默认为活动
    activeTab: 'event',
    
    // 最小日期（今天）
    minDate: new Date().toISOString().split('T')[0],
    
    // 活动数据
    eventData: {
      title: '',
      date: '',
      startTime: '',
      endTime: '',
      location: '', // 保留location文本输入
      description: '',
      descriptionImages: [], // 活动描述图片数组
      organizer: '',
      contact: '',
      maxAttendees: '',
      tags: [],
      topicSurveyEnabled: false,
      topicSurveyQuestion: '',
      topicSurveyOptions: [],
      isPrivate: false,
      // latitude: null, // 移除
      // longitude: null, // 移除
      cover: '', // 活动封面图在云存储中的fileID
      maxParticipants: null, // 允许为空或数字
      checkinConfig: {
        enabled: false,
        openTimeOffset: 0, // 默认活动开始时
      }
    },
    
    // 单约数据
    oneToOneData: {
      participants: [],
      date: '',
      time: '',
      location: '',
      content: '',
      timeSlots: []
    },
    
    // 临时标签输入
    inputTag: '',
    
    // 预设标签数据
    presetTags: [],
    
    // 预设标签管理相关
    showPresetTagsModal: false,
    newTagName: '',
    
    // 临时封面URL
    tempCoverUrl: '',
    tempCoverPath: '',
    userInfo: null,
    
    // 用于活动模板选择的数据
    hasCreatedEvents: false,
    showTemplateSelector: false,
    createdEvents: [],
    
    // 选中的时长（分钟）
    durationSelected: 0,
    
    // 新增：签到开放时间选项
    checkinOpenTimeOptions: [
      { value: 0, label: '活动开始时' },
      { value: -30, label: '活动开始前30分钟' },
      { value: -60, label: '活动开始前1小时' },
      { value: -120, label: '活动开始前2小时' }
    ],
    selectedCheckinOpenTimeIndex: 0, // 对应 checkinOpenTimeOptions 的索引
    currentStep: 1,
    formData: {}, // 用于分步表单
    hasAgreed: false,
    nextOptionId: 1, // 新增自增id
  },
  
  onLoad: async function(options) {
    // 检查用户是否已登录
    if (!authUtils.isUserLoggedIn()) {
      // 改为使用弹窗提示，与报名体验一致
      authUtils.promptLogin('创建活动需要先登录，是否前往登录？', null, () => {
        console.log('用户取消登录，返回上一页');
        wx.navigateBack();
      });
      return;
    }
    
    // 获取用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    this.setData({ userInfo });
    
    // 加载预设标签
    this.loadPresetTags();
    
    // 设置默认值
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    const defaultStartHour = currentHour < 23 ? currentHour + 1 : 23;
    const defaultEndHour = defaultStartHour < 23 ? defaultStartHour + 1 : 23;
    
    this.setData({
      minDate: today,
      'eventData.date': today,
      'eventData.startTime': `${defaultStartHour.toString().padStart(2, '0')}:00`,
      'eventData.endTime': `${defaultEndHour.toString().padStart(2, '0')}:00`,
      'oneToOneData.date': today,
      durationSelected: 60, // 默认选中1小时
      // 初始化签到配置的显示索引
      selectedCheckinOpenTimeIndex: this.data.checkinOpenTimeOptions.findIndex(opt => opt.value === (this.data.eventData.checkinConfig.openTimeOffset || 0))
    });
    
    // 如果用户已登录，自动填充组织者信息
    if (app.globalData && app.globalData.userInfo) {
      this.setData({
        'eventData.organizer': app.globalData.userInfo.name && app.globalData.userInfo.name.trim() !== '' ? app.globalData.userInfo.name : '未设置名称',
        userInfo: app.globalData.userInfo
      });
    }
    
    // 处理从首页传来的参数
    if (options.tab === 'oneToOne') {
      // 设置活动标签为单约
      this.setData({
        activeTab: 'oneToOne'
      });
      
      // 如果传递了客户信息，则添加到参与者列表
      if (options.clientId) {
        // 使用传入的参数
        const client = {
          id: options.clientId,
          name: options.clientName || '未命名客户',
          company: options.clientCompany || '',
          avatar: options.clientAvatar || '/images/avatar1.jpg'
        };
        
        this.setData({
          'oneToOneData.participants': [client]
        });
      }
    }
    
    // 检查是否有创建过的活动用于模板
    this.checkUserCreatedEvents();
    
    // 修正已有选项结构并设置nextOptionId
    let maxId = 0;
    if (this.data.eventData.topicSurveyOptions && this.data.eventData.topicSurveyOptions.length > 0) {
      const fixedOptions = this.data.eventData.topicSurveyOptions.map((opt, idx) => {
        let id = opt.id;
        if (typeof opt === 'string') {
          id = idx + 1;
          return { id, text: opt };
        } else if (!opt.id) {
          id = idx + 1;
          return { ...opt, id };
        }
        if (id > maxId) maxId = id;
        return opt;
      });
      this.setData({
        'eventData.topicSurveyOptions': fixedOptions,
        nextOptionId: maxId + 1
      });
    } else {
      this.setData({ nextOptionId: 1 });
    }
  },
  
  // 检查用户是否创建过活动
  checkUserCreatedEvents: async function() {
    if (!this.data.userInfo || !this.data.userInfo._id) {
      return;
    }
    
    try {
      // 查询用户创建的活动
      wx.showLoading({ title: '加载中...' });
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 查询条件：创建者ID等于当前用户ID
      const query = {
        creatorId: this.data.userInfo._id
      };
      
      // 如果有openid，也添加到查询条件
      if (this.data.userInfo.openid) {
        query.creatorOpenid = this.data.userInfo.openid;
      }
      
      // 查询最近10个创建的活动
      const result = await db.collection('events')
        .where(_.or([
          { creatorId: this.data.userInfo._id },
          { creatorOpenid: this.data.userInfo.openid }
        ]))
        .orderBy('createTime', 'desc')
        .limit(10)
        .get();
      
      // 过滤掉单约类型的活动，只保留普通活动
      const events = result.data.filter(event => event.type !== 'oneToOne');
      
      this.setData({
        hasCreatedEvents: events.length > 0,
        createdEvents: events
      });
      
      wx.hideLoading();
    } catch (error) {
      console.error('查询用户创建的活动失败', error);
      wx.hideLoading();
    }
  },
  
  // 显示模板选择器
  showTemplateSelector: function() {
    this.setData({
      showTemplateSelector: true
    });
  },
  
  // 隐藏模板选择器
  hideTemplateSelector: function() {
    this.setData({
      showTemplateSelector: false
    });
  },
  
  // 复制云存储中的图片文件
  copyCloudImage: async function(fileID) {
    if (!fileID || !fileID.includes('cloud://')) {
      return fileID; // 如果不是云文件ID，则直接返回原文件ID
    }

    try {
      console.log('开始复制云存储图片:', fileID);
      // 先获取临时访问链接
      const res = await wx.cloud.getTempFileURL({
        fileList: [fileID]
      });
      
      if (!res.fileList || res.fileList.length === 0 || !res.fileList[0].tempFileURL) {
        console.error('获取临时访问链接失败');
        return fileID; // 失败时返回原文件ID
      }
      
      const tempFileURL = res.fileList[0].tempFileURL;
      
      // 下载文件到本地临时路径
      const downloadRes = await wx.cloud.downloadFile({
        fileID: fileID
      });
      
      if (!downloadRes.tempFilePath) {
        console.error('下载文件失败');
        return fileID;
      }
      
      const tempFilePath = downloadRes.tempFilePath;
      
      // 上传为新文件
      const uploadRes = await this.uploadImageToCloud(tempFilePath, 'event_covers');
      console.log('复制云存储图片成功:', uploadRes);
      return uploadRes; // 返回新文件的ID
    } catch (error) {
      console.error('复制云存储图片失败:', error);
      return fileID; // 失败时返回原文件ID
    }
  },
  
  // 使用选择的活动模板
  useEventTemplate: async function(e) {
    const eventId = e.currentTarget.dataset.id;
    
    try {
      wx.showLoading({ title: '加载模板...' });
      
      // 获取活动详情
      const template = await cloudDB.getEventById(eventId);
      
      if (template) {
        let coverImageUrl = template.cover;
        let descriptionImages = [];
        
        // 如果模板活动有封面图，复制一份到新活动
        if (coverImageUrl && coverImageUrl.includes('cloud://')) {
          wx.showLoading({ title: '复制活动封面...' });
          try {
            coverImageUrl = await this.copyCloudImage(coverImageUrl);
            console.log('活动封面复制成功，新fileID:', coverImageUrl);
          } catch (error) {
            console.error('复制活动封面失败:', error);
            // 如果复制失败，使用原封面
          }
        }
        
        // 如果模板活动有描述图片，复制到新活动
        if (template.descriptionImages && template.descriptionImages.length > 0) {
          wx.showLoading({ title: '复制描述图片...' });
          try {
            // 复制每张描述图片
            const copyPromises = template.descriptionImages.map(imageUrl => {
              return this.copyCloudImage(imageUrl);
            });
            
            descriptionImages = await Promise.all(copyPromises);
            console.log('描述图片复制成功，新fileIDs:', descriptionImages);
          } catch (error) {
            console.error('复制描述图片失败:', error);
            // 如果复制失败，使用原描述图片
            descriptionImages = template.descriptionImages || [];
          }
        }
        
        // 创建新活动数据，基于模板但去除ID和参与者信息
        const newEventData = {
          title: template.title,
          date: new Date().toISOString().split('T')[0], // 默认日期设为今天
          startTime: template.startTime,
          endTime: template.endTime,
          location: template.location,
          description: template.description,
          descriptionImages: descriptionImages, // 使用复制后的描述图片
          organizer: template.organizer,
          contact: template.contact,
          maxAttendees: template.maxAttendees,
          tags: template.tags || [],
          cover: coverImageUrl, // 使用复制后的封面URL
          isPrivate: template.isPrivate || false
        };
        
        // 处理话题调查相关字段
        if (template.topicSurvey && template.topicSurvey.enabled) {
          // 如果模板中有话题调查配置，则复制到新活动中
          newEventData.topicSurveyEnabled = true;
          newEventData.topicSurveyQuestion = template.topicSurvey.question || '';
          
          // 处理选项，确保每个选项都有id
          if (template.topicSurvey.options && template.topicSurvey.options.length > 0) {
            let maxId = 0;
            const options = template.topicSurvey.options.map((opt, idx) => {
              const id = idx + 1;
              if (id > maxId) maxId = id;
              return { id, text: opt.text || '' };
            });
            
            newEventData.topicSurveyOptions = options;
            this.setData({ nextOptionId: maxId + 1 });
          } else {
            // 如果没有选项，初始化两个空选项
            newEventData.topicSurveyOptions = [
              { id: 1, text: '' },
              { id: 2, text: '' }
            ];
            this.setData({ nextOptionId: 3 });
          }
        } else {
          // 如果模板中没有话题调查，则初始化为默认值
          newEventData.topicSurveyEnabled = false;
          newEventData.topicSurveyQuestion = '';
          newEventData.topicSurveyOptions = [];
        }
        
        // 更新表单数据
        this.setData({
          eventData: newEventData,
          tempCoverUrl: coverImageUrl,
          tempCoverPath: '' // 重置临时路径
        });
        
        // 隐藏模板选择器
        this.hideTemplateSelector();
        
        wx.hideLoading();
        wx.showToast({
          title: '模板已应用',
          icon: 'success'
        });
      }
    } catch (error) {
      console.error('应用活动模板失败', error);
      wx.hideLoading();
      wx.showToast({
        title: '应用模板失败',
        icon: 'none'
      });
    }
  },
  
  // 切换标签
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      activeTab: tab
    });
  },
  
  // 输入活动信息
  inputEventData: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`eventData.${field}`]: value
    });
  },
  
  // 输入单约信息
  inputOneToOneData: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`oneToOneData.${field}`]: value
    });
  },
  
  // 日期选择改变 (活动)
  dateChange: function(e) {
    this.setData({
      'eventData.date': e.detail.value
    });
  },
  
  // 开始时间选择改变 (活动)
  startTimeChange: function(e) {
    const startTime = e.detail.value;
    
    this.setData({
      'eventData.startTime': startTime
    });
    
    // 如果有结束时间，计算时长
    if (this.data.eventData.endTime) {
      this.calculateDuration(startTime, this.data.eventData.endTime);
    } else {
      // 如果没有结束时间，根据当前选中的时长自动设置结束时间
      if (this.data.durationSelected > 0) {
        this.applyDuration(this.data.durationSelected);
      }
    }
  },
  
  // 结束时间选择改变 (活动)
  endTimeChange: function(e) {
    const endTime = e.detail.value;
    
    this.setData({
      'eventData.endTime': endTime
    });
    
    // 计算时长
    const startTime = this.data.eventData.startTime;
    if (startTime) {
      this.calculateDuration(startTime, endTime);
    }
  },
  
  // 计算时长并更新选中状态
  calculateDuration: function(startTime, endTime) {
    if (!startTime || !endTime) return;
    
    try {
      // 解析时间
      const startParts = startTime.split(':');
      const endParts = endTime.split(':');
      
      const startMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      const endMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
      
      // 计算时长（分钟）
      let durationMinutes = endMinutes - startMinutes;
      
      // 如果结束时间早于开始时间，认为是跨天，加24小时
      if (durationMinutes < 0) {
        durationMinutes += 24 * 60;
      }
      
      // 查找匹配的预设时长
      let matchedDuration = 0;
      const presetDurations = [30, 60, 120, 180];
      
      for (const duration of presetDurations) {
        if (Math.abs(durationMinutes - duration) < 5) { // 允许5分钟误差
          matchedDuration = duration;
          break;
        }
      }
      
      this.setData({
        durationSelected: matchedDuration
      });
    } catch (e) {
      console.error('计算时长失败:', e);
    }
  },
  
  // 选择预设时长
  selectDuration: function(e) {
    const duration = parseInt(e.currentTarget.dataset.duration);
    
    this.setData({
      durationSelected: duration
    });
    
    // 应用时长
    this.applyDuration(duration);
  },
  
  // 应用时长，计算结束时间
  applyDuration: function(durationMinutes) {
    const startTime = this.data.eventData.startTime;
    if (!startTime) {
      wx.showToast({
        title: '请先选择开始时间',
        icon: 'none'
      });
      return;
    }
    
    try {
      // 解析开始时间
      const startParts = startTime.split(':');
      const startHour = parseInt(startParts[0]);
      const startMinute = parseInt(startParts[1]);
      
      // 计算结束时间
      let endMinutes = startHour * 60 + startMinute + durationMinutes;
      let endHour = Math.floor(endMinutes / 60);
      let endMinute = endMinutes % 60;
      
      // 处理跨天情况
      if (endHour >= 24) {
        endHour = endHour % 24;
      }
      
      // 格式化结束时间
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      
      this.setData({
        'eventData.endTime': endTime
      });
    } catch (e) {
      console.error('应用时长失败:', e);
    }
  },
  
  // 日期选择改变 (单约)
  oneToOneDateChange: function(e) {
    this.setData({
      'oneToOneData.date': e.detail.value
    });
  },
  
  // 时间选择改变 (单约)
  oneToOneTimeChange: function(e) {
    this.setData({
      'oneToOneData.time': e.detail.value
    });
  },
  
  // 选择客户
  selectClients: function() {
    // 跳转到客户选择页面
    wx.navigateTo({
      url: '/pages/clientManage/clientManage?mode=select'
    });
  },
  
  // 移除选中的参与者
  removeParticipant: function(e) {
    const id = e.target.dataset.id;
    const participants = this.data.oneToOneData.participants.filter(p => p.id !== id);
    
    this.setData({
      'oneToOneData.participants': participants
    });
  },
  
  // 分享可选时间
  shareTimeSlots: async function() {
    if (!this.data.oneToOneData.date) {
      wx.showToast({
        title: '请先选择日期',
        icon: 'none'
      });
      return;
    }
    
    try {
      // 显示加载状态
      wx.showLoading({
        title: '准备分享...'
      });
      
      // 创建临时ID（将在提交单约时被替换为真实ID）
      const tempId = 'temp_' + Date.now();
      
      // 准备时间选择数据
      const timeSelectionData = {
        id: tempId,
        creatorId: this.data.userInfo ? this.data.userInfo.id : '',
        creatorName: this.data.userInfo ? this.data.userInfo.name : '',
        date: this.data.oneToOneData.date,
        location: this.data.oneToOneData.location,
        content: this.data.oneToOneData.content,
        status: 'pending',
        timeOptions: [
          { time: '9:00', label: '上午 9:00', confirmed: [] },
          { time: '10:30', label: '上午 10:30', confirmed: [] },
          { time: '14:00', label: '下午 14:00', confirmed: [] },
          { time: '15:30', label: '下午 15:30', confirmed: [] },
          { time: '17:00', label: '下午 17:00', confirmed: [] }
        ]
      };
      
      // 保存到云数据库
      const db = wx.cloud.database();
      const result = await db.collection('timeSelections').add({
        data: timeSelectionData
      });
      
      // 获取生成的ID
      const realId = result._id;
      
      // 将ID保存到当前表单数据中
      this.setData({
        'oneToOneData.pendingSelectionId': realId
      });
      
      wx.hideLoading();
      
      // 打开分享面板
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage']
      });
      
      // 通知用户
      wx.showModal({
        title: '分享时间选择',
        content: '页面已准备好分享，点击右上角"..."菜单，选择"转发"给您的客户，他们可以选择合适的时间段。',
        showCancel: false
      });
    } catch (error) {
      wx.hideLoading();
      console.error('准备分享时间选择失败', error);
      
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      });
    }
  },
  
  // 页面分享事件
  onShareAppMessage: function() {
    // 如果是从单约的分享时间按钮触发的分享
    if (this.data.oneToOneData && this.data.oneToOneData.pendingSelectionId) {
      return {
        title: `邀请您选择合适的见面时间 - ${this.data.oneToOneData.date}`,
        path: `/pages/timeSelection/timeSelection?id=${this.data.oneToOneData.pendingSelectionId}`,
        imageUrl: '/images/time_selection_share.jpg' // 自定义分享图片
      };
    }
    
    // 默认分享信息
    return {
      title: '邀请您参加活动',
      path: '/pages/index/index'
    };
  },
  
  // 输入标签
  inputTagValue: function(e) {
    this.setData({ 
      inputTag: e.detail.value 
    });
  },
  
  // 添加标签
  addTag: function() {
    const tag = this.data.inputTag.trim();
    if (!tag) return;
    
    if (this.data.eventData.tags.includes(tag)) {
      wx.showToast({
        title: '标签已存在',
        icon: 'none'
      });
      return;
    }
    
    // 使用concat代替展开运算符
    const tags = this.data.eventData.tags.concat([tag]);
    this.setData({
      'eventData.tags': tags,
      inputTag: ''
    });
  },
  
  // 删除标签
  removeTag: function(e) {
    const index = e.currentTarget.dataset.index;
    // 使用slice代替展开运算符
    const tags = this.data.eventData.tags.slice();
    tags.splice(index, 1);
    
    this.setData({
      'eventData.tags': tags
    });
  },
  
  // 加载预设标签
  loadPresetTags: function() {
    wx.cloud.callFunction({
      name: 'managePresetTags',
      data: {
        action: 'getAll'
      },
      success: (res) => {
        if (res.result.success) {
          this.setData({
            presetTags: res.result.data // 保存所有标签用于管理
          });
        } else {
          console.error('加载预设标签失败:', res.result.error);
        }
      },
      fail: (error) => {
        console.error('调用预设标签云函数失败:', error);
      }
    });
  },
  
  // 显示预设标签管理弹窗
  showPresetTagsManage: function() {
    this.setData({
      showPresetTagsModal: true
    });
  },
  
  // 隐藏预设标签管理弹窗
  hidePresetTagsManage: function() {
    this.setData({
      showPresetTagsModal: false,
      newTagName: ''
    });
  },
  
  // 输入新标签名称
  inputNewTagName: function(e) {
    this.setData({
      newTagName: e.detail.value
    });
  },
  
  // 添加新预设标签
  addNewPresetTag: function() {
    const tagName = this.data.newTagName.trim();
    if (!tagName) {
      wx.showToast({
        title: '请输入标签名称',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({
      title: '添加中...'
    });
    
    wx.cloud.callFunction({
      name: 'managePresetTags',
      data: {
        action: 'add',
        tagData: {
          name: tagName
        }
      },
      success: (res) => {
        wx.hideLoading();
        if (res.result.success) {
          wx.showToast({
            title: '添加成功',
            icon: 'success'
          });
          this.setData({
            newTagName: ''
          });
          // 重新加载预设标签
          this.loadPresetTags();
        } else {
          wx.showToast({
            title: res.result.error || '添加失败',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        wx.hideLoading();
        console.error('添加预设标签失败:', error);
        wx.showToast({
          title: '添加失败',
          icon: 'none'
        });
      }
    });
  },
  

  
  // 删除预设标签
  deletePresetTag: function(e) {
    const tagId = e.currentTarget.dataset.id;
    const tagName = e.currentTarget.dataset.name;
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除标签"${tagName}"吗？此操作不可恢复。`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '删除中...'
          });
          
          wx.cloud.callFunction({
            name: 'managePresetTags',
            data: {
              action: 'delete',
              tagData: {
                tagId: tagId
              }
            },
            success: (res) => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
                // 重新加载预设标签
                this.loadPresetTags();
              } else {
                wx.showToast({
                  title: res.result.error || '删除失败',
                  icon: 'none'
                });
              }
            },
            fail: (error) => {
              wx.hideLoading();
              console.error('删除预设标签失败:', error);
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },
  
  // 切换预设标签
  togglePresetTag: function(e) {
    const tagName = e.currentTarget.dataset.tag;
    const currentTags = this.data.eventData.tags.slice();
    
    const tagIndex = currentTags.indexOf(tagName);
    if (tagIndex > -1) {
      // 标签已存在，移除它
      currentTags.splice(tagIndex, 1);
    } else {
      // 标签不存在，添加它
      currentTags.push(tagName);
    }
    
    this.setData({
      'eventData.tags': currentTags
    });
  },
  
  // 选择封面图片
  chooseCoverImage: function() {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        console.log('选择活动封面成功', tempFilePath);
        
        // 使用微信官方图像裁剪接口，固定比例16:9
        wx.cropImage({
          src: tempFilePath,
          cropScale: '16:9', // 固定比例16:9
          success: function(cropRes) {
            console.log('图片裁剪成功', cropRes.tempFilePath);
            // 更新临时封面URL和路径
            that.setData({
              tempCoverUrl: cropRes.tempFilePath,
              tempCoverPath: cropRes.tempFilePath
            });
            
            wx.showToast({
              title: '封面已设置',
              icon: 'success',
              duration: 1500
            });
          },
          fail: function(cropErr) {
            console.error('图片裁剪失败', cropErr);
            // 如果裁剪失败，直接使用原图
            that.setData({
              tempCoverUrl: tempFilePath,
              tempCoverPath: tempFilePath
            });
            
            wx.showToast({
              title: '裁剪失败，使用原图',
              icon: 'none'
            });
          }
        });
      },
      fail: function(err) {
        console.error('选择活动封面失败', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },
  
  // 将图片上传到云存储
  uploadImageToCloud: function(filePath, cloudFolderName = 'images') {
    return new Promise((resolve, reject) => {
      const cloudPath = `${cloudFolderName}/${Date.now()}-${Math.floor(Math.random() * 1000000)}${filePath.match(/\.\w+$/)[0]}`;
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: res => {
          console.log('[上传文件] 成功：', res.fileID);
          resolve(res.fileID);
        },
        fail: e => {
          console.error('[上传文件] 失败：', e);
          reject(e);
        }
      });
    });
  },
  
  // 验证活动表单数据
  validateEventForm: function() {
    const data = this.data.eventData;
    
    if (!data.title.trim()) {
      wx.showToast({
        title: '请输入活动名称',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.date) {
      wx.showToast({
        title: '请选择活动日期',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.startTime) {
      wx.showToast({
        title: '请选择开始时间',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.endTime) {
      wx.showToast({
        title: '请选择结束时间',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.location.trim()) {
      wx.showToast({
        title: '请输入活动地点',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.description.trim()) {
      wx.showToast({
        title: '请输入活动描述',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.organizer.trim()) {
      wx.showToast({
        title: '请输入组织者名称',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.contact.trim()) {
      wx.showToast({
        title: '请输入联系电话',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.maxAttendees) {
      wx.showToast({
        title: '请输入最大参与人数',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },
  
  // 验证单约表单数据
  validateOneToOneForm: function() {
    const data = this.data.oneToOneData;
    
    if (data.participants.length === 0) {
      wx.showToast({
        title: '请选择参与人',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.date) {
      wx.showToast({
        title: '请选择日期',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.time) {
      wx.showToast({
        title: '请选择时间',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.location.trim()) {
      wx.showToast({
        title: '请输入地点',
        icon: 'none'
      });
      return false;
    }
    
    if (!data.content.trim()) {
      wx.showToast({
        title: '请输入业务内容',
        icon: 'none'
      });
      return false;
    }
    
    return true;
  },
  
  // 提交创建活动
  submitEvent: async function() {
    if (!this.validateEventForm()) {
      return;
    }
    
    // ---- START: Validate Topic Survey if Enabled ----
    if (this.data.eventData.topicSurveyEnabled) {
      if (!this.data.eventData.topicSurveyQuestion.trim()) {
        wx.showToast({ title: '请输入话题收集问题', icon: 'none' });
        return;
      }
      if (!this.data.eventData.topicSurveyOptions || this.data.eventData.topicSurveyOptions.length < 2) {
        wx.showToast({ title: '话题选项至少2个', icon: 'none' });
        return;
      }
      for (let option of this.data.eventData.topicSurveyOptions) {
        if (!option.text.trim()) {
          wx.showToast({ title: '有选项文本为空', icon: 'none' });
          return;
        }
      }
    }
    // ---- END: Validate Topic Survey if Enabled ----
    
    wx.showLoading({
      title: '创建活动中...'
    });
    
    try {
      const eventPayload = { ...this.data.eventData }; // Use a copy

      // Consolidate time
      eventPayload.time = `${eventPayload.startTime}-${eventPayload.endTime}`;

      // ---- START: Prepare Topic Survey Data for Saving ----
      if (eventPayload.topicSurveyEnabled) {
        eventPayload.topicSurvey = {
          enabled: true,
          question: eventPayload.topicSurveyQuestion.trim(),
          options: eventPayload.topicSurveyOptions.map(opt => ({ text: opt.text.trim() })).filter(opt => opt.text) // Save trimmed and non-empty options
        };
      } else {
        // If not enabled, ensure no survey data or a clean "disabled" state is saved
        eventPayload.topicSurvey = {
          enabled: false,
          question: '',
          options: []
        };
      }
      
      // Clean up temporary fields from main eventData if they are not part of topicSurvey object
      delete eventPayload.topicSurveyEnabled; 
      delete eventPayload.topicSurveyQuestion;
      delete eventPayload.topicSurveyOptions;
      
      // For clarity, let's ensure the eventPayload sent to DB has the nested structure
      // and remove the flat ones from the direct payload being sent if they are not desired at the root level.
      const finalEventPayload = { ...eventPayload };
      // ---- END: Prepare Topic Survey Data for Saving ----
      
      // 上传封面图片到云存储（如果有临时封面）
      if (this.data.tempCoverPath && (this.data.tempCoverPath.startsWith('http://tmp') || this.data.tempCoverPath.startsWith('wxfile://'))) {
        try {
          // 上传图片到云存储
          const fileID = await this.uploadImageToCloud(this.data.tempCoverPath);
          console.log('上传封面成功，fileID:', fileID);
          // 更新活动数据中的封面地址为云文件ID
          finalEventPayload.cover = fileID;
        } catch (uploadError) {
          console.error('上传封面失败:', uploadError);
          // 如果上传失败，使用默认封面
          finalEventPayload.cover = finalEventPayload.cover || '/images/default_event_cover.jpg';
        }
      }
      
      // 添加创建者信息
      const userInfo = this.data.userInfo;
      finalEventPayload.creatorId = userInfo._id;
      finalEventPayload.creatorName = userInfo.name && userInfo.name.trim() !== '' ? userInfo.name : '未设置名称';
      finalEventPayload.creatorAvatar = userInfo.avatarUrl;
      finalEventPayload.creatorOpenid = userInfo.openid;
      finalEventPayload.creator = {
        _id: userInfo._id,
        name: userInfo.name && userInfo.name.trim() !== '' ? userInfo.name : '未设置名称',
        avatar: userInfo.avatarUrl,
        openid: userInfo.openid
      };
      
      // 将创建者添加为参与者
      if (!finalEventPayload.participants) {
        finalEventPayload.participants = [];
      }
      
      // 检查创建者是否已经在参与者列表中
      const creatorExists = finalEventPayload.participants.includes(userInfo.openid);
      
      // 如果不在参与者列表中，添加创建者的openid
      if (!creatorExists) {
        finalEventPayload.participants.push(userInfo.openid);
      }
      
      // 更新当前参与人数
      finalEventPayload.currentAttendees = finalEventPayload.participants.length;
      
      const result = await cloudDB.addEvent(finalEventPayload);
      
      if (!result) {
        throw new Error('创建活动失败');
      }
      
      wx.hideLoading();
      wx.showToast({
        title: '创建成功',
        icon: 'success',
        duration: 2000
      });
      
      // 返回上一页并刷新
      setTimeout(() => {
        // 设置全局刷新标志
        app.globalData.needRefresh = true;
        
        // 获取当前页面栈
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2]; // 上一个页面
        
        if (prevPage) {
          // 设置上一个页面的刷新标志
          if (prevPage.route.includes('index/index')) {
            prevPage.setData({ needRefresh: true });
          } else if (prevPage.route.includes('events/events')) {
            prevPage.setData({ needRefresh: true });
          } else if (prevPage.route.includes('mine/mine')) {
            // mine页面刷新
            prevPage.fetchEventData && prevPage.fetchEventData();
          }
        }
        
        // 返回上一页
        wx.navigateBack({
          delta: 1,
          success: function() {
            console.log('成功返回并触发刷新');
          }
        });
      }, 2000);
      
    } catch (error) {
      wx.hideLoading();
      console.error('创建活动失败', error);
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      });
    }
  },
  
  // 提交创建单约
  submitOneToOne: async function() {
    if (!this.validateOneToOneForm()) {
      return;
    }
    
    wx.showLoading({
      title: '创建单约中...'
    });
    
    try {
      // 使用Object.assign代替展开运算符
      const oneToOneData = Object.assign({}, this.data.oneToOneData);
      
      // 添加创建者信息
      const userInfo = this.data.userInfo;
      oneToOneData.creatorId = userInfo._id;
      oneToOneData.creatorName = userInfo.name && userInfo.name.trim() !== '' ? userInfo.name : '未设置名称';
      oneToOneData.creatorAvatar = userInfo.avatarUrl;
      oneToOneData.creatorOpenid = userInfo.openid;
      oneToOneData.creator = {
        _id: userInfo._id,
        name: userInfo.name && userInfo.name.trim() !== '' ? userInfo.name : '未设置名称',
        avatar: userInfo.avatarUrl,
        openid: userInfo.openid
      };
      
      // 确保参与者列表中包含创建者
      if (!oneToOneData.participants) {
        oneToOneData.participants = [];
      }
      
      // 检查创建者是否已经在参与者列表中
      const creatorExists = oneToOneData.participants.some(p => 
        (p._id && p._id === userInfo._id) || 
        (p.openid && p.openid === userInfo.openid)
      );
      
      // 如果不在参与者列表中，添加创建者
      if (!creatorExists) {
        oneToOneData.participants.push({
          _id: userInfo._id,
          name: userInfo.name && userInfo.name.trim() !== '' ? userInfo.name : '未设置名称',
          avatar: userInfo.avatarUrl,
          openid: userInfo.openid,
          isCreator: true  // 标记为创建者
        });
      }
      
      // 更新当前参与人数
      oneToOneData.currentAttendees = oneToOneData.participants.length;
      
      // 设置活动类型和其他默认值
      oneToOneData.type = 'oneToOne';
      oneToOneData.status = 'active';
      oneToOneData.title = oneToOneData.content.substring(0, 20) + '...';
      oneToOneData.cover = '/images/meeting_cover.jpg';
      
      const result = await cloudDB.addEvent(oneToOneData);
      
      if (!result) {
        throw new Error('创建单约失败');
      }
      
      wx.hideLoading();
      wx.showToast({
        title: '创建成功',
        icon: 'success',
        duration: 2000
      });
      
      // 返回上一页并刷新
      setTimeout(() => {
        // 设置全局刷新标志
        app.globalData.needRefresh = true;
        
        // 获取当前页面栈
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2]; // 上一个页面
        
        if (prevPage) {
          // 设置上一个页面的刷新标志
          if (prevPage.route.includes('index/index')) {
            prevPage.setData({ needRefresh: true });
          } else if (prevPage.route.includes('events/events')) {
            prevPage.setData({ needRefresh: true });
          } else if (prevPage.route.includes('mine/mine')) {
            // mine页面刷新
            prevPage.fetchEventData && prevPage.fetchEventData();
          }
        }
        
        // 返回上一页
        wx.navigateBack({
          delta: 1,
          success: function() {
            console.log('成功返回并触发刷新');
          }
        });
      }, 2000);
      
    } catch (error) {
      wx.hideLoading();
      console.error('创建单约失败', error);
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      });
    }
  },
  
  // 取消创建
  cancelCreate: function() {
    wx.showModal({
      title: '提示',
      content: '确定要取消创建吗？已填写的信息将丢失。',
      success: (res) => { // 使用箭头函数确保this指向（如果需要）
        if (res.confirm) {
          console.log('User confirmed cancellation. Navigating back.');
          wx.navigateBack({
            delta: 1,
            fail: (err) => {
              console.error('navigateBack failed:', err);
              // 如果 navigateBack 失败，可以尝试 reLaunch 到首页或其他安全页面
              // wx.reLaunch({ url: '/pages/index/index' });
            }
          });
        } else {
          console.log('User cancelled cancellation modal.');
        }
      },
      fail: (modalErr) => {
        console.error('wx.showModal failed:', modalErr);
      }
    });
  },
  
  // 处理从客户选择页面返回的数据
  onShow: function() {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    
    // 检查是否有选择的客户数据
    if (currentPage.data.selectedClients && currentPage.data.selectedClients.length > 0) {
      this.setData({
        'oneToOneData.participants': currentPage.data.selectedClients
      });
      
      // 清除数据，避免重复添加
      currentPage.setData({
        selectedClients: []
      });
    }
    
    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo: userInfo
      });
    }
  },
  
  // ---- START: Event Handlers for Topic Survey ----
  onTopicSurveyEnabledChange: function(e) {
    this.setData({
      'eventData.topicSurveyEnabled': e.detail.value
    });
  },

  inputTopicSurveyQuestion: function(e) {
    this.setData({
      'eventData.topicSurveyQuestion': e.detail.value
    });
  },

  inputTopicSurveyOptionText: function(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const key = `eventData.topicSurveyOptions[${index}].text`;
    this.setData({
      [key]: value
    });
  },

  addTopicSurveyOption: function() {
    const options = this.data.eventData.topicSurveyOptions.slice(); // 浅拷贝
    const newId = this.data.nextOptionId;
    options.push({ id: newId, text: '' });
    this.setData({
      'eventData.topicSurveyOptions': options,
      nextOptionId: newId + 1
    });
  },

  removeTopicSurveyOption: function(e) {
    const options = this.data.eventData.topicSurveyOptions.slice(); // 浅拷贝
    if (options.length <= 2) {
      wx.showToast({ title: '至少保留两个选项', icon: 'none' });
      return;
    }
    const index = e.currentTarget.dataset.index;
    options.splice(index, 1);
    this.setData({
      'eventData.topicSurveyOptions': options
    });
  },
  // ---- END: Event Handlers for Topic Survey ----

  // ---- START: Handler for Private Event Switch ----
  onPrivateChange: function(e) {
    this.setData({
      'eventData.isPrivate': e.detail.value
    });
  },
  // ---- END: Handler for Private Event Switch ----

  // --- 新增签到相关处理函数 ---
  onCheckinEnableChange: function(e) {
    this.setData({
      'eventData.checkinConfig.enabled': e.detail.value
    });
  },

  onOpenTimeChange: function(e) {
    const selectedIndex = e.detail.value;
    const selectedOption = this.data.checkinOpenTimeOptions[selectedIndex];
    this.setData({
      selectedCheckinOpenTimeIndex: selectedIndex,
      'eventData.checkinConfig.openTimeOffset': selectedOption.value
    });
  },
  // --- 签到相关处理函数结束 ---

  // 辅助函数：格式化日期 (YYYY-MM-DD)
  formatDate: function(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 辅助函数：格式化时间 (HH:mm)
  formatTime: function(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // ---- START: 活动描述图片相关方法 ----
  // 选择活动描述图片
  chooseDescriptionImages: function() {
    const currentImages = this.data.eventData.descriptionImages || [];
    const remainingCount = 3 - currentImages.length;
    
    if (remainingCount <= 0) {
      wx.showToast({
        title: '最多只能上传3张图片',
        icon: 'none'
      });
      return;
    }

    wx.chooseMedia({
      count: remainingCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        wx.showLoading({ title: '上传中...' });
        
        const uploadPromises = res.tempFiles.map(file => {
          return new Promise((resolve, reject) => {
            wx.cloud.uploadFile({
              cloudPath: `event-description-images/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`,
              filePath: file.tempFilePath,
              success: resolve,
              fail: reject
            });
          });
        });

        Promise.all(uploadPromises)
          .then(results => {
            const newImages = results.map(result => result.fileID);
            const updatedImages = [...currentImages, ...newImages];
            
            this.setData({
              'eventData.descriptionImages': updatedImages
            });
            
            wx.hideLoading();
            wx.showToast({
              title: '图片上传成功',
              icon: 'success'
            });
          })
          .catch(error => {
            console.error('图片上传失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '图片上传失败',
              icon: 'error'
            });
          });
      },
      fail: (error) => {
        console.error('选择图片失败:', error);
      }
    });
  },

  // 删除活动描述图片
  deleteDescriptionImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const images = [...this.data.eventData.descriptionImages];
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张图片吗？',
      success: (res) => {
        if (res.confirm) {
          // 删除云存储中的文件
          const fileID = images[index];
          wx.cloud.deleteFile({
            fileList: [fileID]
          }).then(() => {
            console.log('云存储文件删除成功');
          }).catch(error => {
            console.error('云存储文件删除失败:', error);
          });
          
          // 从数组中移除
          images.splice(index, 1);
          this.setData({
            'eventData.descriptionImages': images
          });
          
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          });
        }
      }
    });
  },

  // 预览活动描述图片
  previewDescriptionImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.eventData.descriptionImages;
    
    wx.previewImage({
      current: images[index],
      urls: images
    });
  },
  // ---- END: 活动描述图片相关方法 ----

});