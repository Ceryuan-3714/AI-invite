const cloudDB = require('../../utils/cloudDB.js')

Page({
  data: {
    // 当前年月
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    
    // 日历数据
    calendarDates: [],
    
    // 选中的日期
    selectedDate: null,
    selectedDateText: '',
    selectedEvents: [],
    
    // 所有活动数据
    allEvents: [],
    
    // 加载状态
    loading: true
  },

  onLoad: function(options) {
    this.loadEvents();
    this.generateCalendar();
  },

  onShow: function() {
    // 每次显示时刷新数据
    this.loadEvents();
  },

  // 加载活动数据
  loadEvents: async function() {
    try {
      this.setData({ loading: true });
      
      const events = await cloudDB.getAllEvents();
      console.log('加载的活动数据:', events);
      
      this.setData({
        allEvents: events || [],
        loading: false
      });
      
      // 重新生成日历以更新有活动的日期
      this.generateCalendar();
      
    } catch (error) {
      console.error('加载活动数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  // 生成日历
  generateCalendar: function() {
    const { currentYear, currentMonth, allEvents } = this.data;
    
    // 获取当月第一天和最后一天
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    
    // 获取当月第一天是星期几（0=周日，1=周一...）
    const firstDayWeek = firstDay.getDay();
    
    // 获取当月天数
    const daysInMonth = lastDay.getDate();
    
    // 获取上个月的最后几天
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate();
    
    const calendarDates = [];
    
    // 添加上个月的日期（填充空白）
    for (let i = firstDayWeek - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const date = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDates.push({
        day: day,
        date: date,
        isCurrentMonth: false,
        hasEvents: this.hasEventsOnDate(date),
        isSelected: false
      });
    }
    
    // 添加当月的日期
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDates.push({
        day: day,
        date: date,
        isCurrentMonth: true,
        hasEvents: this.hasEventsOnDate(date),
        isSelected: false
      });
    }
    
    // 添加下个月的日期（填充到42个格子）
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const remainingCells = 42 - calendarDates.length;
    
    for (let day = 1; day <= remainingCells; day++) {
      const date = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDates.push({
        day: day,
        date: date,
        isCurrentMonth: false,
        hasEvents: this.hasEventsOnDate(date),
        isSelected: false
      });
    }
    
    this.setData({ calendarDates });
  },

  // 检查指定日期是否有活动
  hasEventsOnDate: function(date) {
    const { allEvents } = this.data;
    return allEvents.some(event => {
      // 使用活动的date字段（活动举办日期）
      const eventDate = event.date;
      if (!eventDate) return false;
      
      // 处理不同的日期格式
      let formattedEventDate;
      if (typeof eventDate === 'string') {
        // 如果是字符串格式，可能是 "2025-05-14" 或其他格式
        if (eventDate.includes('-')) {
          formattedEventDate = eventDate; // 已经是 YYYY-MM-DD 格式
        } else {
          // 其他格式尝试转换
          const dateObj = new Date(eventDate);
          if (!isNaN(dateObj.getTime())) {
            formattedEventDate = dateObj.toISOString().split('T')[0];
          } else {
            return false;
          }
        }
      } else if (eventDate instanceof Date) {
        formattedEventDate = eventDate.toISOString().split('T')[0];
      } else {
        return false;
      }
      
      return formattedEventDate === date;
    });
  },

  // 获取指定日期的活动列表
  getEventsOnDate: function(date) {
    const { allEvents } = this.data;
    return allEvents.filter(event => {
      // 使用活动的date字段（活动举办日期）
      const eventDate = event.date;
      if (!eventDate) return false;
      
      // 处理不同的日期格式
      let formattedEventDate;
      if (typeof eventDate === 'string') {
        // 如果是字符串格式，可能是 "2025-05-14" 或其他格式
        if (eventDate.includes('-')) {
          formattedEventDate = eventDate; // 已经是 YYYY-MM-DD 格式
        } else {
          // 其他格式尝试转换
          const dateObj = new Date(eventDate);
          if (!isNaN(dateObj.getTime())) {
            formattedEventDate = dateObj.toISOString().split('T')[0];
          } else {
            return false;
          }
        }
      } else if (eventDate instanceof Date) {
        formattedEventDate = eventDate.toISOString().split('T')[0];
      } else {
        return false;
      }
      
      return formattedEventDate === date;
    });
  },

  // 上一个月
  prevMonth: function() {
    let { currentYear, currentMonth } = this.data;
    
    if (currentMonth === 1) {
      currentMonth = 12;
      currentYear -= 1;
    } else {
      currentMonth -= 1;
    }
    
    this.setData({
      currentYear,
      currentMonth,
      selectedDate: null,
      selectedEvents: []
    });
    
    this.generateCalendar();
  },

  // 下一个月
  nextMonth: function() {
    let { currentYear, currentMonth } = this.data;
    
    if (currentMonth === 12) {
      currentMonth = 1;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
    
    this.setData({
      currentYear,
      currentMonth,
      selectedDate: null,
      selectedEvents: []
    });
    
    this.generateCalendar();
  },

  // 点击日期
  onDateClick: function(e) {
    const { date, hasEvents } = e.currentTarget.dataset;
    
    if (!hasEvents) {
      wx.showToast({
        title: '该日期无活动',
        icon: 'none'
      });
      return;
    }
    
    // 更新选中状态
    const calendarDates = this.data.calendarDates.map(item => ({
      ...item,
      isSelected: item.date === date
    }));
    
    // 获取选中日期的活动
    const selectedEvents = this.getEventsOnDate(date);
    
    // 格式化日期显示
    const dateObj = new Date(date);
    const selectedDateText = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
    
    this.setData({
      calendarDates,
      selectedDate: date,
      selectedDateText,
      selectedEvents
    });
  },

  // 跳转到活动详情
  goToEventDetail: function(e) {
    const eventId = e.currentTarget.dataset.eventId;
    if (!eventId) {
      wx.showToast({
        title: '活动ID缺失',
        icon: 'none'
      });
      return;
    }
    wx.navigateTo({
      url: `/pages/adminEventDetail/adminEventDetail?id=${eventId}`
    });
  }
});