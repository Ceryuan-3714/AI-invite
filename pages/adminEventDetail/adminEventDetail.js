// adminEventDetail.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')
// 导入导出工具函数
const { exportParticipantsToExcel } = require('../../utils/exportUtils.js')

// 兼容新旧数据结构的辅助函数
function getCompanyPositionText(userInfo) {
  if (!userInfo) return '';
  
  // 新数据结构：使用 companyPositions 数组
  if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && userInfo.companyPositions.length > 0) {
    // 显示所有公司和职位组合
    const positions = userInfo.companyPositions
      .filter(item => item.company || item.position) // 过滤掉空的条目
      .map(item => `${item.company || ''} ${item.position || ''}`.trim())
      .filter(text => text.length > 0); // 过滤掉空字符串
    return positions.length > 0 ? positions.join(' | ') : '';
  }
  
  // 旧数据结构：使用单独的 company 和 position 字段
  return `${userInfo.company || ''} ${userInfo.position || ''}`.trim();
}

Page({
  data: {
    eventId: '',
    eventData: {},
    participants: [],
    pageLoading: true,
    // 签到统计
    checkinStats: {
      checkedIn: 0,
      notCheckedIn: 0,
      total: 0
    },
    // 加场意愿统计
    additionalSessionStats: {
      interested: 0,
      notInterested: 0,
      pending: 0
    },
    // 报名意愿统计
    registrationStats: {
      confirmed: 0,
      declined: 0,
      pending: 0
    },
    // 话题收集统计
    topicSurveyStats: [],
    // 话题收集提交记录
    topicSubmissions: [],
    // 二维码统计
    qrCodeStats: {
      totalQRCodes: 0,
      totalScans: 0,
      qrCodeList: []
    },
    // 参与人员分页
    currentParticipantPage: 1,
    participantsPerPage: 5,
    displayedParticipants: []
  },

  onLoad: function(options) {
    if (options.id) {
      this.setData({ eventId: options.id });
      this.loadEventData();
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
      this.loadEventData();
    }
  },

  onPullDownRefresh: function() {
    this.loadEventData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载活动数据
  loadEventData: async function() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      const db = wx.cloud.database();
      const eventResult = await db.collection('events').doc(this.data.eventId).get();
      
      if (!eventResult.data) {
        throw new Error('活动不存在');
      }
      
      const eventData = eventResult.data;
      
      // 获取参与者信息
      const participants = await this.loadParticipants(eventData.participants || [], eventData);
      
      // 计算各种统计数据
      const checkinStats = this.calculateCheckinStats(participants);
      const additionalSessionStats = await this.calculateAdditionalSessionStats(participants);
      const registrationStats = this.calculateRegistrationStats(participants);
      const topicSurveyStats = await this.calculateTopicSurveyStats(eventData, participants);
      const topicSubmissions = await this.loadTopicSubmissions(eventData);
      const qrCodeStats = await this.loadQRCodeStats();
      
      // 格式化活动状态
      const now = new Date();
      const eventDateTime = new Date(`${eventData.date} ${eventData.startTime}`);
      const endDateTime = new Date(`${eventData.date} ${eventData.endTime}`);
      
      let status = 'upcoming';
      let statusText = '待开始';
      
      if (now >= eventDateTime && now <= endDateTime) {
        status = 'ongoing';
        statusText = '进行中';
      } else if (now > endDateTime) {
        status = 'ended';
        statusText = '已结束';
      }
      
      eventData.status = status;
      eventData.statusText = statusText;
      
      this.setData({
        eventData,
        participants,
        checkinStats,
        additionalSessionStats,
        registrationStats,
        topicSurveyStats,
        topicSubmissions,
        qrCodeStats,
        currentParticipantPage: 1,
        pageLoading: false
      });
      
      // 更新显示的参与人员
      this.updateDisplayedParticipants();
      
      wx.hideLoading();
    } catch (error) {
      console.error('加载活动数据失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  // 加载参与者详细信息
  loadParticipants: async function(participantIds, eventData) {
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
      
      // 添加签到状态等信息
      return allParticipants.map(participant => {
        return {
          ...participant,
          checkinStatus: this.getParticipantCheckinStatus(participant._openid, eventData),
          registrationStatus: this.getRegistrationStatus(participant._openid)
        };
      });
      
    } catch (error) {
      console.error('加载参与者信息失败:', error);
      return [];
    }
  },

  // 获取活动状态文本
  getEventStatusText: function(eventData) {
    const now = new Date();
    const eventDate = new Date(eventData.date + ' ' + eventData.startTime);
    const endDate = new Date(eventData.date + ' ' + eventData.endTime);
    
    if (now < eventDate) {
      return '未开始';
    } else if (now >= eventDate && now <= endDate) {
      return '进行中';
    } else {
      return '已结束';
    }
  },

  // 获取活动状态
  getEventStatus: function(eventData) {
    const now = new Date();
    const eventDate = new Date(eventData.date + ' ' + eventData.startTime);
    const endDate = new Date(eventData.date + ' ' + eventData.endTime);
    
    if (now < eventDate) {
      return 'upcoming';
    } else if (now >= eventDate && now <= endDate) {
      return 'ongoing';
    } else {
      return 'ended';
    }
  },

  // 计算签到统计
  calculateCheckinStats: function(participants) {
    const total = participants.length;
    const checkedIn = participants.filter(p => p.checkinStatus === 'checked').length;
    const notCheckedIn = total - checkedIn;
    
    return {
      total,
      checkedIn,
      notCheckedIn
    };
  },

  // 计算加场意愿统计
  calculateAdditionalSessionStats: async function(participants) {
    try {
      // 调用云函数获取该活动的期待加场记录
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
        const expectList = result.result.data || [];
        const interested = expectList.length; // 有期待加场记录的人数
        const notInterested = 0; // expectRerun集合中没有"不感兴趣"的概念
        const pending = participants.length - interested; // 未表态的人数
        
        return {
          interested,
          notInterested,
          pending
        };
      } else {
        // 如果云函数调用失败，返回默认值
        return {
          interested: 0,
          notInterested: 0,
          pending: participants.length
        };
      }
    } catch (error) {
      console.error('获取加场意愿统计失败:', error);
      // 出错时返回默认值
      return {
        interested: 0,
        notInterested: 0,
        pending: participants.length
      };
    }
  },

  // 计算报名意愿统计
  calculateRegistrationStats: function(participants) {
    const confirmed = participants.filter(p => p.registrationStatus === 'confirmed').length;
    const declined = participants.filter(p => p.registrationStatus === 'declined').length;
    const pending = participants.length - confirmed - declined;
    
    return {
      confirmed,
      declined,
      pending
    };
  },

  // 计算话题收集统计
  calculateTopicSurveyStats: async function(eventData, participants) {
    if (!eventData.topicSurvey || !eventData.topicSurvey.enabled || !eventData.topicSurvey.options) {
      return [];
    }
    
    try {
      const db = wx.cloud.database();
      
      // 从eventTopicPreferences集合中获取该活动的所有投票数据
      const preferencesResult = await db.collection('eventTopicPreferences')
        .where({
          eventId: this.data.eventId
        })
        .get();
      
      const preferences = preferencesResult.data || [];
      const totalVotes = preferences.length;
      
      // 统计每个选项的投票数
      const optionCounts = {};
      preferences.forEach(pref => {
        const option = pref.prefer;
        optionCounts[option] = (optionCounts[option] || 0) + 1;
      });
      
      // 生成统计数据
      const stats = eventData.topicSurvey.options.map(option => {
        const count = optionCounts[option.text] || 0;
        const percentage = totalVotes > 0 ? (count / totalVotes * 100).toFixed(1) : 0;
        
        return {
          option: option.text,
          count,
          percentage: parseFloat(percentage)
        };
      });
      
      return stats;
    } catch (error) {
      console.error('获取话题收集统计失败:', error);
      // 如果获取失败，返回空统计
      return eventData.topicSurvey.options.map(option => ({
        option: option.text,
        count: 0,
        percentage: 0
      }));
    }
  },

  // 加载话题收集提交记录
  loadTopicSubmissions: async function(eventData) {
    if (!eventData.topicSurvey || !eventData.topicSurvey.enabled) {
      return [];
    }
    
    try {
      const db = wx.cloud.database();
      
      // 从eventTopicPreferences集合中获取该活动的提交记录
      const submissionsResult = await db.collection('eventTopicPreferences')
        .where({
          eventId: this.data.eventId
        })
        .orderBy('submittedAt', 'desc')
        .limit(10)
        .get();
      
      const submissions = submissionsResult.data || [];
      
      // 格式化提交记录
      return submissions.map(submission => ({
        _id: submission._id,
        name: submission.name || '匿名用户',
        prefer: submission.prefer,
        submitTime: this.formatTime(submission.submittedAt)
      }));
    } catch (error) {
      console.error('获取话题收集提交记录失败:', error);
      return [];
    }
  },

  // 加载二维码统计数据
  loadQRCodeStats: async function() {
    try {
      const db = wx.cloud.database();
      
      // 从eventQRCodes集合中获取该活动的所有二维码
      const qrCodesResult = await db.collection('eventQRCodes')
        .where({
          eventId: this.data.eventId
        })
        .get();
      
      const qrCodes = qrCodesResult.data || [];
      
      // 计算总扫描次数
      const totalScans = qrCodes.reduce((sum, qr) => sum + (qr.count || 0), 0);
      
      // 格式化二维码列表，按扫描次数排序
      const qrCodeList = qrCodes
        .map(qr => ({
          _id: qr._id,
          name: qr.name || '未命名二维码',
          count: qr.count || 0,
          createdAt: qr.createdAt,
          qrCodeUrl: qr.qrCodeUrl
        }))
        .sort((a, b) => b.count - a.count); // 按扫描次数降序排列
      
      return {
        totalQRCodes: qrCodes.length,
        totalScans: totalScans,
        qrCodeList: qrCodeList
      };
    } catch (error) {
      console.error('获取二维码统计数据失败:', error);
      return {
        totalQRCodes: 0,
        totalScans: 0,
        qrCodeList: []
      };
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
    } else {
      return d.getMonth() + 1 + '月' + d.getDate() + '日';
    }
  },

  // 获取参与者签到状态（从events集合的checkins字段中查找）
  getParticipantCheckinStatus: function(openid, eventData) {
    // 检查eventData中是否有checkins字段
    if (!eventData || !eventData.checkins || !Array.isArray(eventData.checkins)) {
      return 'unchecked';
    }
    
    // 在checkins数组中查找是否有该用户的openid
    const hasCheckedIn = eventData.checkins.some(checkin => {
      // 支持不同的数据结构
      if (typeof checkin === 'string') {
        return checkin === openid;
      } else if (typeof checkin === 'object' && checkin !== null) {
        return checkin.openid === openid || checkin._openid === openid;
      }
      return false;
    });
    
    return hasCheckedIn ? 'checked' : 'unchecked';
  },



  // 获取报名状态（模拟数据）
  getRegistrationStatus: function(openid) {
    const statuses = ['confirmed', 'declined', 'pending'];
    return statuses[Math.floor(Math.random() * statuses.length)];
  },

  // 编辑活动
  editEvent: function() {
    wx.navigateTo({
      url: `/pages/editEvent/editEvent?id=${this.data.eventId}`
    });
  },

  // 跳转到前端活动详情页面
  goToEventDetail: function() {
    if (!this.data.eventId) {
      wx.showToast({
        title: '活动ID缺失',
        icon: 'error'
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/eventDetail/eventDetail?id=${this.data.eventId}`
    });
  },

  // 查看签到列表
  viewCheckinList: function() {
    wx.navigateTo({
      url: `/pages/checkinList/checkinList?eventId=${this.data.eventId}`
    });
  },

  // 查看加场意愿详情
  viewAdditionalSessionDetails: function() {
    wx.navigateTo({
      url: `/pages/additionalSessionDetails/additionalSessionDetails?eventId=${this.data.eventId}`,
      fail: (err) => {
        console.error('跳转到加场意愿详情页失败:', err);
        wx.showToast({
          title: '无法打开详情页',
          icon: 'error'
        });
      }
    });
  },

  // 查看报名意愿询问
  viewRegistrationInquiry: function() {
    wx.showModal({
      title: '功能开发中',
      content: '报名意愿询问功能正在开发中',
      showCancel: false
    });
  },

  // 查看话题收集
  viewTopicSurvey: async function() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      const db = wx.cloud.database();
      
      // 获取该活动的所有话题收集数据
      const preferencesResult = await db.collection('eventTopicPreferences')
        .where({
          eventId: this.data.eventId
        })
        .get();
      
      const preferences = preferencesResult.data || [];
      
      wx.hideLoading();
      
      if (preferences.length === 0) {
        wx.showModal({
          title: '暂无数据',
          content: '还没有用户提交话题收集问卷',
          showCancel: false
        });
        return;
      }
      
      // 构建详情内容
      let content = `问题：${this.data.eventData.topicSurvey.question}\n\n`;
      content += `总投票数：${preferences.length}\n\n`;
      
      // 按选项分组统计
      const optionCounts = {};
      preferences.forEach(pref => {
        const option = pref.prefer;
        optionCounts[option] = (optionCounts[option] || 0) + 1;
      });
      
      // 显示各选项统计
      Object.keys(optionCounts).forEach(option => {
        const count = optionCounts[option];
        const percentage = ((count / preferences.length) * 100).toFixed(1);
        content += `${option}：${count}票 (${percentage}%)\n`;
      });
      
      wx.showModal({
        title: '话题收集详情',
        content: content,
        showCancel: false,
        confirmText: '确定'
      });
      
    } catch (error) {
      console.error('获取话题收集详情失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '获取详情失败',
        icon: 'error'
      });
    }
  },

  // 查看话题收集统计详情
  viewTopicSurveyDetails: async function() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      const db = wx.cloud.database();
      
      // 获取该活动的所有话题收集数据
      const preferencesResult = await db.collection('eventTopicPreferences')
        .where({
          eventId: this.data.eventId
        })
        .orderBy('submittedAt', 'desc')
        .get();
      
      const preferences = preferencesResult.data || [];
      
      wx.hideLoading();
      
      if (preferences.length === 0) {
        wx.showModal({
          title: '暂无数据',
          content: '还没有用户提交话题收集问卷',
          showCancel: false
        });
        return;
      }
      
      // 构建详情内容
      let content = `问题：${this.data.eventData.topicSurvey.question}\n\n`;
      content += `总投票数：${preferences.length}\n\n`;
      
      // 按选项分组统计
      const optionCounts = {};
      preferences.forEach(pref => {
        const option = pref.prefer;
        optionCounts[option] = (optionCounts[option] || 0) + 1;
      });
      
      // 显示各选项统计
      content += '投票统计：\n';
      Object.keys(optionCounts).forEach(option => {
        const count = optionCounts[option];
        const percentage = ((count / preferences.length) * 100).toFixed(1);
        content += `${option}：${count}票 (${percentage}%)\n`;
      });
      
      // 显示最新提交记录
      if (preferences.length > 0) {
        content += '\n最新提交记录：\n';
        preferences.slice(0, 5).forEach((pref, index) => {
          const name = pref.name || '匿名用户';
          const time = this.formatTime(pref.submittedAt);
          content += `${index + 1}. ${name} - ${pref.prefer} (${time})\n`;
        });
      }
      
      wx.showModal({
        title: '话题收集统计详情',
        content: content,
        showCancel: false,
        confirmText: '确定'
      });
      
    } catch (error) {
      console.error('获取话题收集详情失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '获取详情失败',
        icon: 'error'
      });
    }
  },

  // 更新显示的参与人员
  updateDisplayedParticipants: function() {
    const { participants, currentParticipantPage, participantsPerPage } = this.data;
    const startIndex = (currentParticipantPage - 1) * participantsPerPage;
    const endIndex = startIndex + participantsPerPage;
    const displayedParticipants = participants.slice(startIndex, endIndex);
    
    this.setData({
      displayedParticipants
    });
  },

  // 上一页
  prevParticipantPage: function() {
    const { currentParticipantPage } = this.data;
    if (currentParticipantPage > 1) {
      this.setData({
        currentParticipantPage: currentParticipantPage - 1
      });
      this.updateDisplayedParticipants();
    }
  },

  // 下一页
  nextParticipantPage: function() {
    const { currentParticipantPage, participants, participantsPerPage } = this.data;
    const totalPages = Math.ceil(participants.length / participantsPerPage);
    if (currentParticipantPage < totalPages) {
      this.setData({
        currentParticipantPage: currentParticipantPage + 1
      });
      this.updateDisplayedParticipants();
    }
  },

  // 查看参与者详情
  viewParticipantDetail: function() {
    wx.navigateTo({
      url: '/pages/clientManage/clientManage'
    });
  },

  // 导出参与者名单
  exportParticipants: async function() {
    try {
      // 检查是否有参与者数据
      if (!this.data.participants || this.data.participants.length === 0) {
        wx.showToast({
          title: '暂无参与者数据',
          icon: 'none'
        });
        return;
      }

      wx.showLoading({
        title: '导出中...'
      });

      // 调用导出工具函数
      const result = await exportParticipantsToExcel(
        this.data.participants,
        this.data.eventData
      );

      wx.hideLoading();

      if (result.success) {
        wx.showToast({
          title: result.message,
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: result.message || '导出失败',
          icon: 'error'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('导出参与者名单失败:', error);
      wx.showToast({
        title: '导出失败',
        icon: 'error'
      });
    }
  },

  // 查看所有参与者
  viewAllParticipants: function() {
    wx.navigateTo({
      url: `/pages/allParticipants/allParticipants?eventId=${this.data.eventId}`
    });
  },

  // 跳转到二维码管理页面
  goToQRCodeManagement: function() {
    wx.navigateTo({
      url: `/pages/qrCodeManagement/qrCodeManagement?eventId=${this.data.eventId}`,
      fail: (err) => {
        console.error('导航到二维码管理页失败:', err);
        wx.showToast({
          title: '无法打开二维码管理页',
          icon: 'none'
        });
      }
    });
  },

  // 分享活动
  shareEvent: function() {
    wx.showModal({
      title: '功能开发中',
      content: '分享活动功能正在开发中',
      showCancel: false
    });
  },

  // 删除活动
  deleteEvent: function() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个活动吗？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#ff4757',
      success: (res) => {
        if (res.confirm) {
          this.performDeleteEvent();
        }
      }
    });
  },

  // 执行删除活动
  performDeleteEvent: async function() {
    try {
      wx.showLoading({
        title: '删除中...'
      });
      
      const db = wx.cloud.database();
      
      await db.collection('events')
        .doc(this.data.eventId)
        .remove();
      
      wx.hideLoading();
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      
    } catch (error) {
      wx.hideLoading();
      console.error('删除活动失败:', error);
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      });
    }
  }
});