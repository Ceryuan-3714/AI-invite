const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')

Page({
  data: {
    // 统计数据
    stats: {
      totalEvents: 0,
      totalUsers: 0,
      totalParticipants: 0,
      activeEvents: 0
    },
    // 图表数据
    chartData: {
      eventTrend: [], // 活动趋势数据
      participantStats: [], // 参与者统计
      eventTypes: [] // 活动类型分布
    },
    // 加载状态
    loading: {
      stats: true,
      charts: true,
      activeUsers: true,
      expectations: true
    },
    // 时间范围选择
    timeRange: 'week', // week, month, year
    // 管理员信息
    adminInfo: null,
    // 图表交互状态
    chartInteraction: {
      selectedDate: null, // 选中的日期
      showTooltip: false, // 是否显示提示框
      tooltipPosition: { x: 0, y: 0 }, // 提示框位置
      selectedDateEvents: [] // 选中日期的活动列表
    },
    // 所有活动数据（用于筛选特定日期的活动）
    allEvents: [],
    // 活跃用户数据
    activeUsers: [],
    // 加场意愿数据
    expectations: []
  },

  onLoad: function(options) {
    // 检查管理员权限
    this.checkAdminPermission();
    // 加载数据
    this.loadDashboardData();
  },

  onShow: function() {
    // 每次显示时刷新数据
    this.loadDashboardData();
  },

  onPullDownRefresh: function() {
    // 下拉刷新
    this.loadDashboardData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 检查管理员权限
  checkAdminPermission: function() {
    const userInfo = app.globalData.userInfo;
    if (!userInfo || !userInfo.isAdmin) {
      wx.showModal({
        title: '权限不足',
        content: '只有管理员才能访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return;
    }
    this.setData({ adminInfo: userInfo });
  },

  // 加载仪表板数据
  loadDashboardData: async function() {
    try {
      await Promise.all([
        this.loadStats(),
        this.loadChartData(),
        this.loadActiveUsers(),
        this.loadExpectations()
      ]);
    } catch (error) {
      console.error('加载仪表板数据失败:', error);
      wx.showToast({
        title: '数据加载失败',
        icon: 'none'
      });
    }
  },

  // 加载统计数据
  loadStats: async function() {
    try {
      this.setData({ 'loading.stats': true });
      
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 获取总活动数
      const eventsCount = await db.collection('events').count();
      
      // 获取总用户数
      const usersCount = await db.collection('users').count();
      
      // 获取活跃活动数（未结束的活动）
      const now = new Date();
      const activeEventsCount = await db.collection('events')
        .where({
          date: _.gte(now.toISOString().split('T')[0])
        })
        .count();
      
      // 获取总参与人次
      const eventsData = await db.collection('events')
        .field({ participants: true })
        .get();
      
      let totalParticipants = 0;
      eventsData.data.forEach(event => {
        if (event.participants && Array.isArray(event.participants)) {
          totalParticipants += event.participants.length;
        }
      });
      
      this.setData({
        'stats.totalEvents': eventsCount.total,
        'stats.totalUsers': usersCount.total,
        'stats.totalParticipants': totalParticipants,
        'stats.activeEvents': activeEventsCount.total,
        'loading.stats': false
      });
    } catch (error) {
      console.error('加载统计数据失败:', error);
      this.setData({ 'loading.stats': false });
    }
  },



  // 加载图表数据
  loadChartData: async function() {
    try {
      this.setData({ 'loading.charts': true });
      
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 获取所有活动数据（不限制时间范围，因为可能没有createdAt字段）
      const eventsData = await db.collection('events').get();
      
      console.log('获取到的活动数据:', eventsData.data);
      
      // 存储所有活动数据供后续使用
      this.setData({ allEvents: eventsData.data });
      
      // 处理活动趋势数据
      const eventTrend = this.processEventTrendData(eventsData.data);
      
      // 获取活动类型分布
      const eventTypes = this.processEventTypesData(eventsData.data);
      
      console.log('处理后的趋势数据:', eventTrend);
      console.log('处理后的类型数据:', eventTypes);
      
      this.setData({
        'chartData.eventTrend': eventTrend,
        'chartData.eventTypes': eventTypes,
        'loading.charts': false
      });
    } catch (error) {
      console.error('加载图表数据失败:', error);
      this.setData({ 'loading.charts': false });
    }
  },

  // 处理活动趋势数据
  processEventTrendData: function(events) {
    const trendData = {};
    const today = new Date();
    
    // 根据时间范围决定天数
    const days = this.data.timeRange === 'month' ? 30 : 7;
    
    // 初始化指定天数的数据
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      trendData[dateStr] = 0;
    }
    
    // 如果没有活动数据，生成模拟数据用于演示
    if (events.length === 0) {
      // 生成一些模拟数据
      Object.keys(trendData).forEach((date, index) => {
        trendData[date] = Math.floor(Math.random() * 5) + 1; // 1-5的随机数
      });
    } else {
      // 统计每天的活动数量
      events.forEach(event => {
        // 尝试多个可能的日期字段
        const eventDate = event.createdAt || event.date || event.createTime;
        if (eventDate) {
          const dateStr = new Date(eventDate).toISOString().split('T')[0];
          if (trendData.hasOwnProperty(dateStr)) {
            trendData[dateStr]++;
          }
        }
      });
    }
    
    const result = Object.keys(trendData).map(date => {
      // 提取月份和日期用于显示
      const dateParts = date.split('-');
      const displayDate = dateParts.length >= 3 ? `${dateParts[1]}-${dateParts[2]}` : date;
      
      return {
        date: date,
        displayDate: displayDate,
        count: trendData[date]
      };
    });
    
    // 输出每个日期的count值用于调试
    console.log('趋势数据详情:');
    result.forEach(item => {
      console.log(`日期: ${item.date}, count: ${item.count}`);
    });
    
    return result;
  },

  // 处理活动类型分布数据
  processEventTypesData: function(events) {
    const typeCount = {};
    const colors = ['#4a90e2', '#f5a623', '#7ed321', '#d0021b', '#9013fe', '#50e3c2'];
    
    if (events.length === 0) {
      // 如果没有活动数据，生成模拟数据
      return [
        { name: '会议', value: 8, color: colors[0] },
        { name: '培训', value: 5, color: colors[1] },
        { name: '聚会', value: 3, color: colors[2] },
        { name: '其他', value: 4, color: colors[3] }
      ];
    }
    
    events.forEach(event => {
      const type = event.category || event.type || '其他';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
    
    return Object.keys(typeCount).map((type, index) => ({
      name: type,
      value: typeCount[type],
      color: colors[index % colors.length]
    }));
  },

  // 获取活动状态
  getEventStatus: function(event) {
    const now = new Date();
    const eventDate = new Date(event.date);
    
    if (eventDate < now) {
      return '已结束';
    } else if (eventDate.toDateString() === now.toDateString()) {
      return '进行中';
    } else {
      return '未开始';
    }
  },

  // 切换时间范围
  onTimeRangeChange: function(e) {
    const timeRange = e.currentTarget.dataset.range;
    this.setData({ 
      timeRange,
      'chartInteraction.selectedDate': null,
      'chartInteraction.showTooltip': false,
      'chartInteraction.selectedDateEvents': []
    });
    this.loadChartData();
  },

  // 点击图表柱子
  onBarClick: function(e) {
    const { date, count, index } = e.currentTarget.dataset;
    
    // 获取该日期的活动列表
    const dateEvents = this.getEventsByDate(date);
    
    // 获取被点击柱子的精确位置
    const query = wx.createSelectorQuery();
    query.select(`#bar-${index}`).boundingClientRect();
    query.selectViewport().scrollOffset();
    query.exec((res) => {
      if (res[0]) {
        const barRect = res[0];
        const tooltipX = barRect.left + (barRect.width / 2); // 柱子中心的X坐标
        const tooltipY = barRect.top - 10; // 柱子顶部上方10rpx
        
        this.setData({
          'chartInteraction.selectedDate': date,
          'chartInteraction.showTooltip': true,
          'chartInteraction.tooltipPosition': { x: tooltipX, y: tooltipY },
          'chartInteraction.selectedDateEvents': dateEvents
        });
      }
    });
  },

  // 隐藏提示框
  hideTooltip: function() {
    this.setData({
      'chartInteraction.showTooltip': false,
      'chartInteraction.selectedDate': null,
      'chartInteraction.selectedDateEvents': []
    });
  },

  // 根据日期获取活动列表
  getEventsByDate: function(targetDate) {
    return this.data.allEvents.filter(event => {
      const eventDate = event.createdAt || event.date || event.createTime;
      if (eventDate) {
        const dateStr = new Date(eventDate).toISOString().split('T')[0];
        return dateStr === targetDate;
      }
      return false;
    });
  },

  // 查看活动详情
  viewEventDetail: function(e) {
    const eventId = e.currentTarget.dataset.eventId;
    wx.navigateTo({
      url: `/pages/adminEventDetail/adminEventDetail?id=${eventId}`
    });
  },



  // 创建新活动
// 创建活动
  createEvent: function() {
    wx.navigateTo({
      url: '/pages/createEvent/createEvent'
    });
  },

  // 跳转到活动日历页面
  goToEventCalendar: function() {
    wx.navigateTo({
      url: '/pages/eventCalendar/eventCalendar'
    });
  },

  // 导出数据
  exportData: function() {
    wx.showActionSheet({
      itemList: ['导出活动数据', '导出用户数据', '导出参与数据'],
      success: (res) => {
        switch(res.tapIndex) {
          case 0:
            this.exportEvents();
            break;
          case 1:
            this.exportUsers();
            break;
          case 2:
            this.exportParticipants();
            break;
        }
      }
    });
  },

  // 编辑轮播图
  editBanner: function() {
    wx.navigateTo({
      url: '/pages/editBanner/editBanner'
    });
  },

  // 导出活动数据
  exportEvents: async function() {
    wx.showLoading({ title: '正在导出...' });
    try {
      const db = wx.cloud.database();
      const events = await db.collection('events').get();
      
      // 生成Excel文件
      const header = ['活动名称', '日期', '时间', '地点', '组织者', '状态'];
      const data = events.data.map(event => [
        event.title || '',
        event.date || '',
        `${event.startTime || ''}-${event.endTime || ''}`,
        event.location || '',
        event.organizer || '',
        this.getEventStatusText(event)
      ]);
      
      // 调用云函数生成Excel
      const res = await wx.cloud.callFunction({
        name: 'exportExcel',
        data: {
          fileName: '活动数据.xlsx',
          sheetName: '活动列表',
          header,
          data
        }
      });
      
      // 下载文件
      wx.downloadFile({
        url: res.result.fileID,
        success: (res) => {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'xlsx'
          });
        }
      });
    } catch (error) {
      console.error('导出失败:', error);
      wx.showToast({ title: '导出失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  // 导出用户数据
  exportUsers: async function() {
    wx.showLoading({ title: '正在导出...' });
    try {
      const db = wx.cloud.database();
      const users = await db.collection('users').get();
      
      // 生成Excel文件
      const header = ['姓名', '公司', '职位', '手机号', '邮箱', '注册时间'];
      const data = users.data.map(user => [
        user.name || '',
        user.company || '',
        user.position || '',
        user.phone || '',
        user.email || '',
        user.createdAt ? this.formatTime(user.createdAt) : ''
      ]);
      
      // 调用云函数生成Excel
      const res = await wx.cloud.callFunction({
        name: 'exportExcel',
        data: {
          fileName: '用户数据.xlsx',
          sheetName: '用户列表',
          header,
          data
        }
      });
      
      // 下载文件
      wx.downloadFile({
        url: res.result.fileID,
        success: (res) => {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'xlsx'
          });
        }
      });
    } catch (error) {
      console.error('导出失败:', error);
      wx.showToast({ title: '导出失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  // 导出参与数据
  exportParticipants: async function() {
    wx.showLoading({ title: '正在导出...' });
    try {
      const db = wx.cloud.database();
      const participants = await db.collection('participants').get();
      
      // 生成Excel文件
      const header = ['活动名称', '参与者姓名', '公司', '职位', '签到状态', '参与时间'];
      const data = participants.data.map(participant => [
        participant.eventName || '',
        participant.name || '',
        participant.company || '',
        participant.position || '',
        participant.checkinStatus || '未签到',
        participant.joinTime ? this.formatTime(participant.joinTime) : ''
      ]);
      
      // 调用云函数生成Excel
      const res = await wx.cloud.callFunction({
        name: 'exportExcel',
        data: {
          fileName: '参与数据.xlsx',
          sheetName: '参与列表',
          header,
          data
        }
      });
      
      // 下载文件
      wx.downloadFile({
        url: res.result.fileID,
        success: (res) => {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'xlsx'
          });
        }
      });
    } catch (error) {
      console.error('导出失败:', error);
      wx.showToast({ title: '导出失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  // 加载活跃用户数据
  loadActiveUsers: async function() {
    try {
      this.setData({ 'loading.activeUsers': true });
      
      const db = wx.cloud.database();
      
      // 获取用户数据，按注册时间排序（从近到远）
      const usersData = await db.collection('users')
        .orderBy('createdAt', 'desc')
        .limit(5) // 只显示前5个用户
        .get();
      
      // 格式化用户数据中的时间字段
      const formattedUsers = usersData.data.map(user => {
        return {
          ...user,
          createdAt: user.createdAt ? this.formatTime(user.createdAt) : '未知'
        };
      });
      
      this.setData({
        activeUsers: formattedUsers,
        'loading.activeUsers': false
      });
    } catch (error) {
      console.error('加载活跃用户数据失败:', error);
      this.setData({ 'loading.activeUsers': false });
    }
  },

  // 查看全部用户
  viewAllUsers: function() {
    wx.navigateTo({
      url: '/pages/clientManage/clientManage'
    });
  },

  // 查看用户详情
  viewUserDetail: function(e) {
    const userId = e.currentTarget.dataset.userId;
    const user = this.data.activeUsers.find(u => u._id === userId);
    
    if (!user) {
      wx.showToast({
        title: '用户信息不存在',
        icon: 'none'
      });
      return;
    }
    
    // 获取当前管理员用户信息
    const app = getApp();
    const currentUser = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    // 准备传递给participantDetail页面的数据
    const eventDataForDetail = {
      participant: {
        _id: user._id,
        openid: user.openid || '',
        name: user.name || user.nickName || '未知用户',
        nickName: user.nickName || user.name || '未知用户',
        avatarUrl: user.avatarUrl || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
        company: user.company || '未知公司',
        position: user.position || '未知职位',
        industry: user.industry || '',
        expertise: user.expertise || '',
        interest: user.interest || '',
        introduction: user.introduction || '',
        personalTags: user.personalTags || [],
        recommendTags: user.recommendTags || []
      },
      currentUser: currentUser,
      eventTitle: '用户详情',
      eventType: '管理员查看',
      eventId: 'admin_view'
    };
    
    wx.navigateTo({
      url: `/pages/participantDetail/participantDetail?openid=${user.openid || ''}&eventId=admin_view`,
      events: {
        acceptDataFromOpenedPage: function(data) {
          console.log('来自用户详情页的回传数据:', data);
        }
      },
      success: function(res) {
        // 通过eventChannel向被打开页面传送数据
        res.eventChannel.emit('acceptParticipantData', eventDataForDetail);
        console.log('成功导航到用户详情页并发送数据:', eventDataForDetail);
      },
      fail: function(err) {
        console.error('导航到用户详情页失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // 格式化时间显示
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

  // 加载加场意愿数据
  loadExpectations: async function() {
    try {
      this.setData({ 'loading.expectations': true });
      
      const db = wx.cloud.database();
      
      // 获取最近的加场意愿记录，限制显示前10条
      const expectationsData = await db.collection('expectRerun')
        .where({
          status: 'active'
        })
        .orderBy('createTime', 'desc')
        .limit(10)
        .get();
      
      // 获取用户头像信息
      const expectations = await Promise.all(
        expectationsData.data.map(async (expectation) => {
          try {
            // 尝试获取用户头像
            const userResult = await db.collection('users')
              .where({ openid: expectation.openid })
              .field({ avatarUrl: true })
              .get();
            
            const userAvatar = userResult.data.length > 0 ? userResult.data[0].avatarUrl : null;
            
            return {
              ...expectation,
              userAvatar: userAvatar,
              createTimeFormatted: this.formatTime(expectation.createTime)
            };
          } catch (error) {
            console.error('获取用户头像失败:', error);
            return {
              ...expectation,
              userAvatar: null,
              createTimeFormatted: this.formatTime(expectation.createTime)
            };
          }
        })
      );
      
      this.setData({
        expectations: expectations,
        'loading.expectations': false
      });
    } catch (error) {
      console.error('加载加场意愿数据失败:', error);
      this.setData({ 'loading.expectations': false });
    }
  },

  // 查看加场意愿用户详情
  viewExpectationUserDetail: function(e) {
    const { userOpenid, userName } = e.currentTarget.dataset;
    
    if (!userOpenid) {
      wx.showToast({
        title: '用户信息不完整',
        icon: 'none'
      });
      return;
    }
    
    // 跳转到用户详情页面
    wx.navigateTo({
      url: `/pages/participantDetail/participantDetail?openid=${userOpenid}&eventId=admin_expectation_view`
    });
  },

  // 查看全部加场意愿
  viewAllExpectations: function() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
    // TODO: 可以创建一个专门的加场意愿管理页面
    // wx.navigateTo({
    //   url: '/pages/expectationManage/expectationManage'
    // });
  }
})