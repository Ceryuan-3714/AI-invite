const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')

const timeOffsets = [0, 15, 30, 60, 120]; // 定义时间偏移选项

Page({
  data: {
    // 最小日期（今天）
    minDate: new Date().toISOString().split('T')[0],
    
    // 活动数据
    eventData: {
      title: '',
      date: '',
      startTime: '',
      endTime: '',
      location: '',
      description: '',
      descriptionImages: [], // 活动描述图片数组
      organizer: '',
      contact: '',
      maxAttendees: '',
      tags: [],
      // 特殊字段
      checkinConfig: {
        enabled: false,
        openTimeOffset: 0
      },
      topicSurvey: {
        enabled: false,
        question: "您对本次活动最感兴趣的话题是？",
        options: ["行业趋势", "技术交流", "商业合作", "社交拓展"]
      },
      isPrivate: false
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
    eventId: null,
    
    // 选中的时长（分钟）
    durationSelected: 0,
    
    // 签到时间偏移选项索引
    timeOffsetIndex: 0,
    
    // 标记是否刚刚选择了封面图，避免onShow重新加载数据
    skipDataReloadOnShow: false,
    nextOptionId: 1, // 新增自增id
  },
  
  loadPageData: async function(pageOptions) {
    // 获取用户信息
    console.log("获取用户信息");
    const userInfo = wx.getStorageSync('userInfo');
    this.setData({ userInfo });
    
    // 加载预设标签
    this.loadPresetTags();

    // 如果传入了活动ID，加载活动数据
    if (pageOptions && pageOptions.id) {
      this.setData({ eventId: pageOptions.id }); // Ensure eventId is set in data
      wx.showLoading({ title: '加载活动数据...' });
      try {
        const eventData = await cloudDB.getEventById(pageOptions.id);
        console.log('获取到的原始活动数据:', JSON.stringify(eventData));
        
        if (eventData) {
          // 处理时间格式 - 将原来的time字段拆分为startTime和endTime
          let startTime = '09:00';
          let endTime = '10:00';
          
          console.log('DEBUG - 原始时间数据:', {
            time: eventData.time,
            startTime: eventData.startTime,
            endTime: eventData.endTime
          });
          
          if (eventData.time) {
            console.log('原始time字段值:', eventData.time);
            // 如果原数据中已有时间段格式（例如：14:00-16:00）
            if (eventData.time.includes('-')) {
              const timeParts = eventData.time.split('-');
              startTime = timeParts[0].trim();
              endTime = timeParts[1].trim();
              console.log('从time字段解析出的时间范围:', startTime, '-', endTime);
            } else {
              // 如果只有单一时间，则将其设为开始时间，结束时间加一小时
              startTime = eventData.time;
              
              // 简单处理结束时间：小时+1
              try {
                const hourMinute = startTime.split(':');
                let hour = parseInt(hourMinute[0]) + 1;
                if (hour > 23) hour = 23;
                endTime = `${hour.toString().padStart(2, '0')}:${hourMinute[1]}`;
                console.log('从单一time计算的时间范围:', startTime, '-', endTime);
              } catch (e) {
                console.error('解析时间失败:', e);
                endTime = startTime;
              }
            }
          } else if (eventData.startTime && eventData.endTime) {
            // 如果已经有分开的 startTime 和 endTime，直接使用
            startTime = eventData.startTime;
            endTime = eventData.endTime;
            console.log('使用已存在的 startTime 和 endTime:', startTime, endTime);
          }
          
          // 确保日期格式正确，如果是Date对象，转换为YYYY-MM-DD格式
          let formattedDate = eventData.date;
          if (formattedDate) {
            // 检查是否为字符串格式的ISO日期
            if (typeof formattedDate === 'string' && formattedDate.includes('T')) {
              formattedDate = formattedDate.split('T')[0];
            } 
            // 检查是否为Date对象
            else if (formattedDate instanceof Date) {
              formattedDate = formattedDate.toISOString().split('T')[0];
            }
            // 如果是日期字符串但不是YYYY-MM-DD格式，尝试转换
            else if (typeof formattedDate === 'string' && !formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
              try {
                const dateObj = new Date(formattedDate);
                formattedDate = dateObj.toISOString().split('T')[0];
              } catch (e) {
                console.error('日期格式转换失败:', e);
                // 使用今天的日期作为后备
                formattedDate = new Date().toISOString().split('T')[0];
              }
            }
          } else {
            // 如果没有日期，设置为今天
            formattedDate = new Date().toISOString().split('T')[0];
          }
          
          // 确保所有特殊字段的存在
          // 签到设置
          const checkinConfig = eventData.checkinConfig || { 
            enabled: false, 
            openTimeOffset: 0 // 默认提前0分钟开始签到
          };
          
          // 计算timeOffsetIndex
          let timeOffsetIndex = 0;
          if (checkinConfig && typeof checkinConfig.openTimeOffset === 'number') {
            // 找到最接近的预设值
            const offset = checkinConfig.openTimeOffset;
            timeOffsetIndex = timeOffsets.findIndex(value => value === offset);
            if (timeOffsetIndex === -1) {
              // 如果找不到精确匹配，找最接近的值
              let closestDiff = Number.MAX_SAFE_INTEGER;
              let closestIndex = 0;
              timeOffsets.forEach((value, index) => {
                const diff = Math.abs(value - offset);
                if (diff < closestDiff) {
                  closestDiff = diff;
                  closestIndex = index;
                }
              });
              timeOffsetIndex = closestIndex;
            }
          }
          
          // 话题收集设置
          const topicSurvey = eventData.topicSurvey || {
            enabled: false,
            question: "您对本次活动最感兴趣的话题是？",
            options: ["行业趋势", "技术交流", "商业合作", "社交拓展"]
          };
          
          // 统一为{id, text}结构
          let maxId = 0;
          topicSurvey.options = (topicSurvey.options || []).map((opt, idx) => {
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
            'eventData.topicSurvey': topicSurvey,
            nextOptionId: maxId + 1
          });
          
          // 私密设置
          const isPrivate = !!eventData.isPrivate;
          
          // 确保封面图片信息被正确保存，但不覆盖用户新选择的封面
          const hasTempCover = !!this.data.tempCoverPath && this.data.tempCoverPath !== this.data.tempCoverUrl;
          console.log('检查是否有临时封面:', hasTempCover, '临时封面路径:', this.data.tempCoverPath);
          console.log('加载活动封面:', eventData.cover);
          console.log('活动日期处理，原始值:', eventData.date, '格式化后:', formattedDate);
          console.log('活动时间处理，原始值:', eventData.time, '格式化后 startTime:', startTime, 'endTime:', endTime);
          console.log('特殊字段加载: 签到:', checkinConfig, '话题收集:', topicSurvey, '私密设置:', isPrivate);
          
          // 创建一个新的eventData对象，确保不会修改原对象
          const updatedEventData = {
              ...eventData,
              date: formattedDate, // 使用正确格式化的日期
              startTime: startTime,
              endTime: endTime,
              maxAttendees: eventData.maxAttendees || 10,
              currentAttendees: eventData.currentAttendees || 0,
              participants: eventData.participants || [],
              tags: eventData.tags || [],
              descriptionImages: eventData.descriptionImages || [], // 确保活动描述图片字段存在
              // 如果用户已选择新封面，保留用户选择的封面
              cover: hasTempCover ? this.data.eventData.cover : (eventData.cover || ''),
              // 特殊字段
              checkinConfig: checkinConfig,
              topicSurvey: topicSurvey,
              isPrivate: isPrivate
          };
          
          console.log('IMPORTANT - 设置到eventData的时间值:', {
            startTime: updatedEventData.startTime,
            endTime: updatedEventData.endTime
          });
          
          console.log('更新后的eventData:', JSON.stringify(updatedEventData));
          
          // 先设置基本数据，确保 eventId 也在这里更新，以防 pageOptions.id 和 this.data.eventId 不同步
          this.setData({
            eventId: pageOptions.id, // 确保 eventId 也被更新
            // 如果用户已选择新封面，不更新tempCoverUrl
            tempCoverUrl: hasTempCover ? this.data.tempCoverUrl : (eventData.cover || ''),
            timeOffsetIndex: timeOffsetIndex // 设置timeOffsetIndex
          });
          
          // 单独设置eventData确保完整更新
          this.setData({
            eventData: updatedEventData
          });
          
          console.log('设置活动数据完成，日期:', formattedDate, '开始时间:', startTime, '结束时间:', endTime);
          
          // 计算并设置时长
          this.calculateDuration(startTime, endTime);
          
          // 延迟300ms检查页面显示的时间是否正确
          setTimeout(() => {
            console.log('延迟检查 - 当前eventData中的时间:', {
              startTime: this.data.eventData.startTime,
              endTime: this.data.eventData.endTime,
              date: this.data.eventData.date
            });
            console.log('延迟检查 - 签到配置:', this.data.eventData.checkinConfig);
            console.log('延迟检查 - 话题收集:', this.data.eventData.topicSurvey);
            console.log('延迟检查 - 是否私密:', this.data.eventData.isPrivate);
            
            // 强制刷新以确保显示正确的时间
            this.setData({
              'eventData.startTime': startTime,
              'eventData.endTime': endTime
            });
          }, 300);
        }
      } catch (error) {
        console.error('加载活动数据失败', error);
        wx.showToast({
          title: '加载活动数据失败',
          icon: 'none'
        });
      } finally {
        wx.hideLoading();
      }
    } else {
      // 如果没有活动ID，返回上一页或提示错误
      if (!this.data.eventId) { // 只有在 eventId 从未设置过时才执行
      wx.showToast({
        title: '未指定活动ID',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      } else {
        console.log('loadPageData called without ID, but eventId already exists in data. Skipping navigation.');
      }
    }
  },
  
  onLoad: async function(options) {
    console.log('editEvent onLoad triggered with options:', options);
    await this.loadPageData(options);
  },

  onShow: async function() {
    console.log('editEvent onShow triggered - 不执行数据加载');
    // 不再执行loadPageData，避免重新加载数据覆盖用户选择的封面
  },
  
  // 输入活动信息
  inputEventData: function(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    
    this.setData({
      [`eventData.${field}`]: value
    });
  },
  
  // 日期选择改变
  dateChange: function(e) {
    this.setData({
      'eventData.date': e.detail.value
    });
  },
  
  // 开始时间选择改变
  startTimeChange: function(e) {
    const startTime = e.detail.value;
    let endTime = this.data.eventData.endTime;
    
    this.setData({
      'eventData.startTime': startTime
    });
    
    // 如果有结束时间，计算时长
    if (endTime) {
      // 如果开始时间晚于结束时间，则调整结束时间
      if (this.compareTime(startTime, endTime) > 0) {
        // 将结束时间设置为开始时间后一小时
        endTime = this.addTime(startTime, 60);
        this.setData({
          'eventData.endTime': endTime
        });
      }
      this.calculateDuration(startTime, endTime);
    } else {
      // 如果没有结束时间，默认设置为开始时间后一小时
      endTime = this.addTime(startTime, 60);
      this.setData({
        'eventData.endTime': endTime
      });
      this.calculateDuration(startTime, endTime);
    }
  },
  
  // 结束时间选择改变
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

  compareTime: function(time1, time2) {
    const t1 = new Date("1970/01/01 " + time1);
    const t2 = new Date("1970/01/01 " + time2);
    return t1.getTime() - t2.getTime();
  },

  addTime: function(time, minutesToAdd) {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes + minutesToAdd);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  },
  
  // 选择封面图片
  chooseCoverImage: function() {
    var that = this;
    // 在调用选择图片API之前就设置标志位
    this.setData({
      skipDataReloadOnShow: true
    });
    
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
              // 标志位已经在调用wx.chooseMedia前设置，这里不再需要设置
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
  uploadCoverToCloud: function(filePath) {
    var that = this;
    return new Promise(function(resolve, reject) {
      const cloudDB = require('../../utils/cloudDB.js');
      
      // 获取原有封面图片地址
      var oldCoverImage = that.data.eventData && that.data.eventData.cover ? that.data.eventData.cover : null;
      
      var fileExt = 'png';
      var extMatch = filePath.match(/\.(\w+)$/);
      if (extMatch && extMatch[1]) {
        fileExt = extMatch[1];
      }
      var timestamp = new Date().getTime();
      var randomStr = Math.random().toString(36).substring(2, 8);
      var cloudPath = 'event_covers/' + timestamp + '_' + randomStr + '.' + fileExt;
      
      console.log('上传活动封面开始');
      wx.showLoading({
        title: '上传图片中...'
      });
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: function(res) {
          console.log('上传活动封面成功:', res.fileID);
          wx.hideLoading();
          
          // 如果有旧封面图，删除它
          if (oldCoverImage && oldCoverImage.includes('cloud://')) {
            console.log('尝试删除旧活动封面图:', oldCoverImage);
            cloudDB.deleteCloudFile(oldCoverImage).then(deleteRes => {
              console.log('旧封面图删除结果:', deleteRes);
            }).catch(deleteErr => {
              console.error('删除旧封面图失败:', deleteErr);
            });
          }
          
          // 返回新云文件ID
          resolve(res.fileID);
        },
        fail: function(err) {
          console.error('上传活动封面失败:', err);
          wx.hideLoading();
          wx.showToast({
            title: '封面上传失败',
            icon: 'none'
          });
          reject(err);
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
  
  // 提交编辑
  submitEdit: async function() {
    if (!this.validateEventForm()) {
      return;
    }
    
    wx.showLoading({
      title: '保存修改中...'
    });
    
    try {
      // 使用Object.assign代替展开运算符
      const eventData = Object.assign({}, this.data.eventData);
      
      // 将开始时间和结束时间合并为time字段
      eventData.time = `${eventData.startTime}-${eventData.endTime}`;
      
      // 确保特殊字段被保留
      // 签到设置、话题收集和私密设置已经在eventData中，无需特殊处理
      console.log('保存前检查特殊字段:');
      console.log('- 签到设置:', eventData.checkinConfig);
      console.log('- 话题收集:', eventData.topicSurvey);
      console.log('- 是否私密:', eventData.isPrivate);
      
      // 移除系统保留字段，避免出现"Invalid Key Name: _openid"错误
      if (eventData._openid) {
        delete eventData._openid;
      }
      
      // 确保使用_id字段，删除可能存在的id字段
      if (eventData.id && eventData._id && eventData.id !== eventData._id) {
        delete eventData.id;
      }
      
      // 上传封面图片到云存储（如果有临时封面）
      if (this.data.tempCoverPath && 
         (this.data.tempCoverPath.startsWith('http://tmp') || 
          this.data.tempCoverPath.startsWith('wxfile://') || 
          this.data.tempCoverPath.indexOf('/wx/') !== -1)) {
        try {
          // 上传图片到云存储
          const fileID = await this.uploadCoverToCloud(this.data.tempCoverPath);
          console.log('上传封面成功，fileID:', fileID);
          // 更新活动数据中的封面地址为云文件ID
          eventData.cover = fileID;
          
          // 同时更新本地显示的封面URL，确保UI立即更新
          this.setData({
            tempCoverUrl: fileID,
            'eventData.cover': fileID
          });
        } catch (uploadError) {
          console.error('上传封面失败:', uploadError);
          // 如果上传失败，保持原封面
        }
      }
      
      // 更新活动
      const result = await cloudDB.updateEvent(this.data.eventId, eventData);
      
      if (!result) {
        throw new Error('更新活动失败');
      }
      
      wx.hideLoading();
      wx.showToast({
        title: '更新成功',
        icon: 'success',
        duration: 2000
      });
      
      // 设置上一页需要刷新的标记
      const pages = getCurrentPages();
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2];
        console.log('准备刷新上一页数据', prevPage.route);
        
        // 标记需要刷新
        prevPage.setData({
          needRefresh: true
        });
        
        // 根据页面类型决定如何刷新
        if (prevPage.route === 'pages/eventDetail/eventDetail') {
          console.log('上一页是活动详情页，准备直接刷新');
          // 活动详情页面，直接调用其刷新方法
          if (typeof prevPage.loadEventData === 'function') {
            // 直接指定当前活动ID进行刷新
            const currentEventId = this.data.eventId;
            if (currentEventId) {
              // 将刷新函数包装在一个自定义属性中
              prevPage._refreshFunc = function() {
                console.log('执行活动详情页面刷新函数');
                prevPage.loadEventData(currentEventId);
              };
            }
          }
        } else if (prevPage.route === 'pages/events/events' || prevPage.route === 'pages/index/index') {
          console.log('上一页是活动列表页或首页，准备直接刷新');
          // 活动列表页或首页，直接调用其刷新方法
          if (typeof prevPage.loadEvents === 'function') {
            // 将刷新函数包装在一个自定义属性中
            prevPage._refreshFunc = function() {
              console.log('执行活动列表页或首页刷新函数');
              prevPage.loadEvents();
            };
          }
        }
      }
      
      // 返回上一页并刷新数据
      setTimeout(() => {
        // 先触发上一页的刷新函数，然后再返回
        if (pages.length > 1) {
          const prevPage = pages[pages.length - 2];
          
          // 如果有刷新函数，先调用
          if (prevPage._refreshFunc && typeof prevPage._refreshFunc === 'function') {
            try {
              console.log('返回前调用上一页的刷新函数');
              prevPage._refreshFunc();
            } catch (refreshErr) {
              console.error('执行刷新时出错:', refreshErr);
            }
          }
        }
        
        // 返回上一页
        wx.navigateBack({
          delta: 1
        });
      }, 2000);
      
    } catch (error) {
      wx.hideLoading();
      console.error('更新活动失败', error);
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      });
    }
  },
  
  // 删除活动
  deleteEvent: function() {
    wx.showModal({
      title: '删除活动',
      content: '确定要删除此活动吗？这将会通知所有参与者活动已取消，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#E64340',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '正在删除...'
          });
          
          try {
            // 先向所有参与者发送通知
            await this.sendCancelNotifications();
            
            // 删除活动
            const success = await cloudDB.deleteEvent(this.data.eventId);
            
            wx.hideLoading();
            
            if (success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success',
                duration: 2000
              });
              
              // 设置首页需要刷新的标记
              const pages = getCurrentPages();
              // 遍历所有页面，设置需要刷新的标记
              for (let i = 0; i < pages.length; i++) {
                // 检查是否存在 loadEvents 方法（首页和事件列表页面）
                if (pages[i].loadEvents) {
                  pages[i].setData({
                    needRefresh: true
                  });
                }
              }
              
              // 延迟后跳转到首页
              setTimeout(() => {
                wx.switchTab({
                  url: '/pages/index/index'
                });
              }, 2000);
            } else {
              throw new Error('删除活动失败');
            }
          } catch (error) {
            wx.hideLoading();
            console.error('删除活动失败', error);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },
  
  // 向参与者发送活动取消通知
  sendCancelNotifications: async function() {
    const eventData = this.data.eventData;
    const participants = eventData.participants || [];
    
    if (participants.length === 0) {
      console.log('没有参与者，无需发送通知');
      return;
    }
    
    try {
      // 为每个参与者发送通知到云数据库
      const notificationPromises = participants.map(participant => {
        return wx.cloud.callFunction({
          name: 'addNotification',
          data: {
            type: 'event',
            recipientId: participant._id || participant.openid,
            senderId: 'system',
            senderName: '系统通知',
            eventId: this.data.eventId,
            eventTitle: eventData.title,
            message: `活动"${eventData.title}"已被组织者取消。`,
            eventDate: eventData.date,
            eventTime: eventData.time,
            eventLocation: eventData.location
          }
        });
      });
      
      // 等待所有通知发送完成
      await Promise.all(notificationPromises);
      
      console.log(`已向${participants.length}名参与者发送活动取消通知到云数据库`);
      
      // 更新通知角标
      const app = getApp();
      if (app.updateNotificationBadge) {
        app.updateNotificationBadge();
      }
      
    } catch (error) {
      console.error('发送活动取消通知失败:', error);
    }
  },
  
  // 取消编辑
  cancelEdit: function() {
    wx.showModal({
      title: '提示',
      content: '确定要取消编辑吗？所有修改将不会保存。',
      success: function(res) {
        if (res.confirm) {
          wx.navigateBack({
            delta: 1
          });
        }
      }
    });
  },
  
  // 切换签到功能
  toggleCheckinEnabled: function(e) {
    this.setData({
      'eventData.checkinConfig.enabled': e.detail.value
    });
  },
  
  // 修改签到开放时间
  changeTimeOffset: function(e) {
    const selectedIndex = e.detail.value;
    const offset = timeOffsets[selectedIndex];
    
    this.setData({
      'eventData.checkinConfig.openTimeOffset': offset,
      timeOffsetIndex: selectedIndex
    });
  },
  
  // 切换话题收集功能
  toggleTopicSurveyEnabled: function(e) {
    this.setData({
      'eventData.topicSurvey.enabled': e.detail.value
    });
  },
  
  // 修改话题收集问题
  inputTopicQuestion: function(e) {
    this.setData({
      'eventData.topicSurvey.question': e.detail.value
    });
  },
  
  // 话题收集输入
  inputTopicOption: function(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const key = `eventData.topicSurvey.options[${index}].text`;
    this.setData({ [key]: value });
  },
  addTopicOption: function() {
    const options = this.data.eventData.topicSurvey.options.slice();
    const newId = this.data.nextOptionId;
    options.push({ id: newId, text: '' });
    this.setData({
      'eventData.topicSurvey.options': options,
      nextOptionId: newId + 1
    });
  },
  deleteTopicOption: function(e) {
    const options = this.data.eventData.topicSurvey.options.slice();
    if (options.length <= 2) {
      wx.showToast({ title: '至少保留两个选项', icon: 'none' });
      return;
    }
    const index = e.currentTarget.dataset.index;
    options.splice(index, 1);
    this.setData({
      'eventData.topicSurvey.options': options
    });
  },
  
  // 切换私密设置
  togglePrivate: function(e) {
    this.setData({
      'eventData.isPrivate': e.detail.value
    });
    
    if (e.detail.value) {
      wx.showModal({
        title: '活动私密提示',
        content: '启用私密模式后，活动将不会在主页面显示，只能通过分享链接或二维码访问。',
        showCancel: false
      });
    }
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
  }
  // ---- END: 活动描述图片相关方法 ----
});