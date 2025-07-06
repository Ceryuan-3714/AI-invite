// eventDetail.js
const app = getApp();
const cloudDB = require('../../utils/cloudDB.js');
const eventUtils = require('../../utils/eventUtils.js');
const authUtils = require('../../utils/authUtils.js');
const shareUtils = require('../../utils/shareUtils.js');
const subscribeMessageUtils = require('../../utils/subscribeMessageUtils.js');

// 辅助函数：获取公司职位显示文本（兼容新旧数据结构）
function getCompanyPositionText(userInfo) {
  if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && userInfo.companyPositions.length > 0) {
    // 新格式：显示所有公司和职位组合
    const positions = userInfo.companyPositions
      .filter(item => item.company || item.position) // 过滤掉空的条目
      .map(item => `${item.company || ''} ${item.position || ''}`.trim())
      .filter(text => text.length > 0); // 过滤掉空字符串
    return positions.length > 0 ? positions.join(' | ') : '';
  }
  // 旧格式：直接返回company和position字段
  return `${userInfo.company || ''} ${userInfo.position || ''}`.trim();
}

// 辅助函数：检查是否在签到时间段内
function isWithinCheckinTime(event, checkinConfig, currentTime) {
  if (!event || !event.date || !event.startTime || !checkinConfig || !checkinConfig.enabled) {
    return false;
  }

  try {
    const eventDateStr = event.date; // "YYYY-MM-DD"
    const eventStartTimeStr = event.startTime; // "HH:mm"
    
    const [year, month, day] = eventDateStr.split('-').map(num => parseInt(num, 10));
    const [hour, minute] = eventStartTimeStr.split(':').map(num => parseInt(num, 10));
    
    const eventStartDateTime = new Date(year, month - 1, day, hour, minute);
    
    if (isNaN(eventStartDateTime.getTime())) {
        console.error('无效的活动开始日期或时间:', eventDateStr, eventStartTimeStr);
        return false;
    }

    const openTimeOffsetMs = (typeof checkinConfig.openTimeOffset === 'number' ? checkinConfig.openTimeOffset : 0) * 60 * 1000;
    console.log(`签到时间计算：使用的openTimeOffset值(分钟): ${openTimeOffsetMs/60/1000}, 原始值: ${checkinConfig.openTimeOffset}`);
    
    let checkinOpenDateTime = new Date(eventStartDateTime.getTime() - openTimeOffsetMs); // MODIFIED: Changed + to -
    let checkinCloseDateTime = new Date(eventStartDateTime.getTime() + 60 * 60 * 1000); 

    console.log(`签到判断：当前时间: ${currentTime}, 签到开放: ${checkinOpenDateTime}, 签到截止: ${checkinCloseDateTime}`);
    return currentTime >= checkinOpenDateTime && currentTime <= checkinCloseDateTime;
  } catch (e) {
    console.error("检查签到时间出错:", e);
    return false;
  }
}

Page({
  data: {
    eventId: '',
    event: null,
    participants: [],
    aiSuggestions: [],
    loading: true,
    suggestionsLoading: false,
    joined: false,
    userInfo: null,
    isCreator: false,
    isAttending: false,
    isLoggedIn: false, // 添加登录状态标记
    // 分页相关状态
    participantsPage: 1,
    participantsPageSize: 20,
    hasMoreParticipants: false,
    loadingMoreParticipants: false,
    allParticipantOpenids: [], // 保存所有参与者的openid
    // AI建议处理队列
    aiProcessingQueue: [],
    isProcessingAI: false,
    forceRefreshQueue: false, // 队列强制刷新标记
    // 折叠状态
    isShowDescCollapsed: false,
    isScheduleCollapsed: false,
    isParticipantsCollapsed: false,
    isAiSuggestionsCollapsed: false,
    needRefresh: false,
    loadingAI: false,
    processingParticipants: 0,
    pageActive: true, // Flag to track if the page is currently active
    // AI缓存相关
    aiCacheKey: 'ai_suggestions_cache', // 本地缓存key
    maxCachePerEvent: 50, // 单个活动最多缓存50个建议
    cacheExpiryDays: 7, // 缓存7天过期
    defaultSuggestions: [
      {
        title: "破冰话题",
        content: "可以聊聊最近看过的电影或读过的书，分享彼此的兴趣爱好。",
        type: "social",
        participant: {
          name: "张小明",
          avatar: "/images/default-avatar1.png",
          company: "科技有限公司",
          position: "产品经理"
        }
      }
    ],
    // 话题调研相关
    showTopicSurveyModal: false,
    currentSurvey: {
      eventId: '', // To ensure we save response for the correct event
      question: '',
      options: [], 
      selectedOptionText: null // Or an index, then get text
    },
    tempSelectedSurveyOption: null, // For radio group binding
    // 新增：签到相关状态
    checkinConfig: null, // 活动的签到配置
    showCheckinButton: false, // 控制签到按钮的显示（参与者）
    checkinButtonText: '签到', // 签到按钮的文本
    canCheckin: false, // 当前是否可以签到（时间判断）
    showGenerateQRButton: false, // 控制生成二维码按钮的显示（创建者）
    qrCodeUrl: '', // 保存生成的二维码图片URL
    qrCodeLoading: false, // 二维码生成加载状态
    qrCodePath: '', // 保存二维码链接路径
    shortId: '', // 活动短ID，用于生成二维码和显示
    surveySubmitAttempted: false // Added for survey submission attempt tracking
  },
  // AI缓存管理函数
  getAICacheKey: function(eventId, userOpenid, participantOpenid) {
    return `${eventId}_${userOpenid}_${participantOpenid}`;
  },

  // 获取本地缓存的AI建议
  getCachedAISuggestion: function(eventId, userOpenid, participantOpenid) {
    try {
      const cacheData = wx.getStorageSync(this.data.aiCacheKey) || {};
      const cacheKey = this.getAICacheKey(eventId, userOpenid, participantOpenid);
      const cachedItem = cacheData[cacheKey];
      
      if (cachedItem) {
        const now = new Date().getTime();
        const cacheTime = new Date(cachedItem.timestamp).getTime();
        const expiryTime = this.data.cacheExpiryDays * 24 * 60 * 60 * 1000; // 7天
        
        if (now - cacheTime < expiryTime) {
          console.log('找到有效的AI建议缓存:', cacheKey);
          return cachedItem.suggestion;
        } else {
          console.log('AI建议缓存已过期:', cacheKey);
          // 删除过期缓存
          delete cacheData[cacheKey];
          wx.setStorageSync(this.data.aiCacheKey, cacheData);
        }
      }
      return null;
    } catch (error) {
      console.error('获取AI建议缓存失败:', error);
      return null;
    }
  },

  // 保存AI建议到本地缓存
  saveAISuggestionToCache: function(eventId, userOpenid, participantOpenid, suggestion) {
    try {
      const cacheData = wx.getStorageSync(this.data.aiCacheKey) || {};
      const cacheKey = this.getAICacheKey(eventId, userOpenid, participantOpenid);
      
      // 清理当前活动的过期缓存和超出限制的缓存
      this.cleanupEventCache(cacheData, eventId);
      
      // 保存新的缓存
      cacheData[cacheKey] = {
        suggestion: suggestion,
        timestamp: new Date().toISOString(),
        eventId: eventId
      };
      
      wx.setStorageSync(this.data.aiCacheKey, cacheData);
      console.log('AI建议已保存到缓存:', cacheKey);
    } catch (error) {
      console.error('保存AI建议缓存失败:', error);
    }
  },

  // 清理单个活动的缓存（过期和超出限制）
  cleanupEventCache: function(cacheData, eventId) {
    try {
      const now = new Date().getTime();
      const expiryTime = this.data.cacheExpiryDays * 24 * 60 * 60 * 1000;
      
      // 获取当前活动的所有缓存项
      const eventCacheItems = [];
      
      Object.keys(cacheData).forEach(key => {
        const item = cacheData[key];
        const cacheTime = new Date(item.timestamp).getTime();
        
        // 删除所有过期缓存（不限活动）
        if (now - cacheTime >= expiryTime) {
          delete cacheData[key];
          console.log('删除过期缓存:', key);
        } else if (item.eventId === eventId) {
          // 收集当前活动的有效缓存
          eventCacheItems.push({
            key: key,
            timestamp: cacheTime
          });
        }
      });
      
      // 如果当前活动缓存超出限制，删除最旧的
      if (eventCacheItems.length >= this.data.maxCachePerEvent) {
        // 按时间排序，最旧的在前
        eventCacheItems.sort((a, b) => a.timestamp - b.timestamp);
        
        // 删除最旧的缓存，保留最新的49个（为新缓存留出空间）
        const itemsToDelete = eventCacheItems.slice(0, eventCacheItems.length - this.data.maxCachePerEvent + 1);
        itemsToDelete.forEach(item => {
          delete cacheData[item.key];
          console.log('删除最旧缓存:', item.key);
        });
      }
    } catch (error) {
      console.error('清理活动缓存失败:', error);
    }
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
  
  // 处理参与者气泡点击，滚动到参与人员部分
  scrollToParticipants: function() {
    console.log('点击参与者气泡，滚动到参与者部分');
    
    // 查找参与者部分的选择器
    wx.createSelectorQuery()
      .select('.participants-section')
      .boundingClientRect(rect => {
        if (rect) {
          // 滚动到参与者部分
          wx.pageScrollTo({
            scrollTop: rect.top,
            duration: 300
          });
          
          // 为前三个参与者卡片添加点击提示动画
          const participantsToAnimate = Math.min(3, this.data.participantsDetails.length);
          let updatedParticipantsDetails = [...this.data.participantsDetails];
          
          // 先重置所有点击提示
          updatedParticipantsDetails = updatedParticipantsDetails.map(p => ({
            ...p,
            showClickHint: false
          }));
          
          // 为前几个参与者添加点击提示
          for (let i = 0; i < participantsToAnimate; i++) {
            updatedParticipantsDetails[i].showClickHint = true;
          }
          
          this.setData({ participantsDetails: updatedParticipantsDetails });
          
          // 2秒后移除点击提示
          setTimeout(() => {
            if (this.data.pageActive) {
              let resetParticipantsDetails = [...this.data.participantsDetails];
              resetParticipantsDetails = resetParticipantsDetails.map(p => ({
                ...p,
                showClickHint: false
              }));
              this.setData({ participantsDetails: resetParticipantsDetails });
            }
          }, 2000);
        }
      })
      .exec();
  },
  
  // 处理点击参与者卡片
  onParticipantTap: function(e) {
    // 首先检查用户是否已登录
    const isLoggedIn = authUtils.isUserLoggedIn();
    if (!isLoggedIn) {
      // 保存当前活动详情页面路径，用于登录后跳回
      const eventId = this.data.eventId;
      const currentPath = `/pages/eventDetail/eventDetail?id=${eventId}`;
      wx.setStorageSync('loginRedirectUrl', currentPath);
      
      // 提示登录
      authUtils.promptLogin('登录后才能查看参与者详情和AI合作建议，是否前往登录？', null, () => {
        console.log('用户取消登录，继续浏览活动详情');
        wx.showToast({
          title: '可继续浏览活动',
          icon: 'none',
          duration: 1500
        });
      });
      return;
    }
    
    // 以下是原有的参与者详情跳转逻辑
    const index = e.currentTarget.dataset.participantIndex;
    const participant = this.data.participantsDetails[index];
    
    if (!participant) return;
    
    const currentUser = this.data.userInfo;
    const isSelf = currentUser && (
      (participant.openid && participant.openid === currentUser.openid) ||
      (participant._id && participant._id === currentUser._id)
    );
    
    if (isSelf) {
      wx.navigateTo({
        url: '/pages/profile/profile'
      });
      return;
    }
    
    // 准备通过事件通道传递的数据
    const eventDataForDetail = {
      participant: participant,
      currentUser: currentUser, // 传递当前用户信息
      eventTitle: this.data.event ? this.data.event.title : '活动详情',
      eventType: this.data.event ? (this.data.event.type || '普通活动') : '普通活动',
      eventId: this.data.eventId
    };

    wx.navigateTo({
      url: `/pages/participantDetail/participantDetail?openid=${participant.openid || ''}&eventId=${this.data.eventId}`,
      events: {
        // 为指定事件添加一个监听器，获取被打开页面传送到当前页面的数据
        acceptDataFromOpenedPage: function(data) {
          console.log('来自参与者详情页的回传数据:', data)
        },
      },
      success: function(res) {
        // 通过eventChannel向被打开页面传送数据
        res.eventChannel.emit('acceptParticipantData', eventDataForDetail);
        console.log('成功导航到参与者详情页并发送数据:', eventDataForDetail);
      },
      fail: function(err) {
        console.error('导航到参与者详情页失败:', err);
        // 如果导航失败，可以考虑使用全局变量作为后备方案，但不推荐
        // app.globalData.tempParticipantData = eventDataForDetail;
        // wx.navigateTo({ url: `/pages/participantDetail/participantDetail?openid=${participant.openid || ''}&eventId=${this.data.eventId}` });
      }
    });
  },
  
  onShow: function() {
    console.log('活动详情页 onShow 被调用');
    
    // 如果正在处理二维码参数，跳过onShow的数据加载逻辑
    if (this.data.isHandlingQRCode) {
      console.log('正在处理二维码参数，跳过onShow数据加载');
      return;
    }
    
    // 检查是否从登录页面返回，如果是则需要刷新页面数据
    const wasLoggedIn = this.data.isLoggedIn;
    const isLoggedIn = authUtils.isUserLoggedIn();
    
    // 如果之前未登录，现在已登录，说明是从登录页面返回的，需要刷新数据
    if (!wasLoggedIn && isLoggedIn) {
      console.log('检测到从登录页面返回，刷新页面数据');
      this.setData({ isLoggedIn: isLoggedIn });
      // 重新加载活动数据以获取登录后的完整信息
      // 使用checkAuthAndLoadData确保检查用户数据完整性
      if (this.data.eventId) {
        this.checkAuthAndLoadData(this.data.eventId);
      }
      return;
    }
    
    // 重新检查登录状态
    if (this.data.isLoggedIn !== isLoggedIn) {
      this.setData({ isLoggedIn: isLoggedIn });
    }
    
    // 页面显示时的处理逻辑
    console.log('页面显示，用户登录状态:', isLoggedIn);
    
    // Set page as active when showing
    this.setData({ pageActive: true });
    
    if (this.data.needRefresh) {
      console.log('活动详情页需要刷新数据');
      if (this.data.eventId) {
        // 使用checkAuthAndLoadData确保检查用户数据完整性
        this.checkAuthAndLoadData(this.data.eventId);
      }
      this.setData({ needRefresh: false });
    }
  },
  
  onLoad: function(options) {
    console.log("eventDetail onLoad options:", options);
    
    // 处理扫描二维码进入的情况
    if (options.scene) {
      console.log("检测到scene参数，处理二维码扫描场景:", options.scene);
      // 设置标志，表示正在处理二维码参数
      this.setData({ isHandlingQRCode: true });
      // 直接将scene参数传递给handleSceneParameter
      this.handleSceneParameter(options.scene);
      return; // 等待handleSceneParameter中异步加载完成
    }
    
    // 处理通过qid参数进入的情况（二维码扫描或直接跳转）
    if (options.qid) {
      console.log("检测到qid参数，处理二维码:", options.qid);
      // 设置标志，表示正在处理二维码参数
      this.setData({ isHandlingQRCode: true });
      // 构造scene格式的参数传递给handleSceneParameter
      let sceneParam = `qid=${options.qid}`;
      if (options.sid) {
        sceneParam += `&sid=${options.sid}`;
      }
      this.handleSceneParameter(sceneParam);
      return; // 等待handleSceneParameter中异步加载完成
    }
    
    // 检查登录状态并设置到 data 中
    const isLoggedIn = authUtils.isUserLoggedIn();
    this.setData({ 
      eventId: options.id,
      isLoggedIn: isLoggedIn
    });
    
    // 使用checkAuthAndLoadData替代直接调用loadEventData
    // 确保所有登录用户都会被检查数据完整性
    this.checkAuthAndLoadData(options.id);

    if (options.action === 'checkin' && options.eventId === this.data.eventId) {
        console.log('通过扫码进入，尝试自动签到');
        // 需要确保活动数据已加载完毕，并且用户已登录
        // 这里可能需要一个延时或者在loadEventData的回调中执行
        const checkLoginAndEventData = () => {
            if (this.data.event && this.data.isLoggedIn) {
                // 检查是否已报名
                if (this.data.isAttending) {
                    console.log('用户已报名，执行签到操作');
                    this.handleCheckin(true); // true表示来自扫码
                } else {
                    console.log('用户未报名该活动，不能签到');
                    wx.showModal({
                        title: '签到提示',
                        content: '您尚未报名此活动，无法签到。是否查看活动详情并报名？',
                        confirmText: '查看详情',
                        cancelText: '取消',
                        success: (res) => {
                            if (res.confirm) {
                                // 用户停留在当前页面即可
                            } else {
                                wx.switchTab({ url: '/pages/index/index' });
                            }
                        }
                    });
                }
            } else if (!this.data.isLoggedIn) {
                console.log('用户未登录，扫码后引导登录再尝试签到');
                 const currentPath = `/pages/eventDetail/eventDetail?id=${this.data.eventId}&action=checkin&eventId=${this.data.eventId}`;
                 wx.setStorageSync('loginRedirectUrl', currentPath);
                 authUtils.redirectToLogin(currentPath);
            } else {
                // 活动数据未加载或用户未登录，等待
                setTimeout(checkLoginAndEventData, 500);
            }
        };
        checkLoginAndEventData();
    }

    if (options.initiateJoin === 'true' || options.initiateJoinAfterProfileSetup === 'true') {
      let logMessage = options.initiateJoin === 'true' ? 
        '检测到 initiateJoin=true 参数' : 
        '检测到 initiateJoinAfterProfileSetup=true 参数';
      logMessage += '，尝试自动执行报名/话题收集流程';
      console.log(logMessage);
      if (isLoggedIn) {
        setTimeout(() => { this.toggleJoin(); }, 300);
      } else {
        console.log('用户未登录，跳过自动报名流程');
      }
    }

    if (options.from === 'createEventNotification') {
      // 如果是从创建活动通知跳转过来，显示成功提示
      wx.showToast({
        title: '活动创建成功！',
        icon: 'success',
        duration: 2000
      });

      // 延迟显示分享提示，引导用户分享活动
      setTimeout(() => {
      wx.showModal({
          title: '分享活动',
          content: '活动已创建成功，立即分享给好友一起参与吧！',
          confirmText: '去分享',
          cancelText: '稍后再说',
        success: (res) => {
          if (res.confirm) {
              // 用户选择分享，触发右上角分享提示
              wx.showShareMenu({
                withShareTicket: true,
                menus: ['shareAppMessage', 'shareTimeline']
              });
          }
        }
      });
      }, 1500);
    }
  },

  // 处理扫描二维码进入的场景参数
  handleSceneParameter: async function(scene) {
    console.log('处理扫描二维码进入的场景参数:', scene);
    
    // 显示加载状态
    wx.showLoading({
      title: '正在加载活动...'
    });
    
    try {
      let eventId = '';
      let qrCodeId = null;
      
      // 检查scene格式并解析
      let shortId = null;
      
      // 处理可能的URL编码
      if (typeof scene === 'string' && scene.indexOf('%') !== -1) {
        try {
          const originalScene = scene;
          // 特殊处理：如果scene包含sid%和qid%的模式，需要特殊解码
          if (scene.includes('sid%') && scene.includes('qid%')) {
            console.log('检测到特殊的sid%和qid%编码格式');
            // 手动解析sid和qid部分
             // %3D 是 = 的编码，%26 是 & 的编码
             const sidMatch = scene.match(/sid%3D([^%&]+)/);
             const qidMatch = scene.match(/qid%3D([A-Za-z0-9]+)/);
             
             console.log('sid匹配结果:', sidMatch);
             console.log('qid匹配结果:', qidMatch);
            
            if (sidMatch && qidMatch) {
               const extractedSid = sidMatch[1];
               const extractedQid = qidMatch[1];
               scene = `sid=${extractedSid}&qid=${extractedQid}`;
               console.log('手动解析的sid:', extractedSid, 'qid:', extractedQid);
               console.log('重构的scene参数:', scene);
             } else {
               console.log('正则匹配失败，尝试分割方式解析');
               // 备用方案：通过%26分割，然后分别解码每部分
               if (scene.includes('%26')) {
                 const parts = scene.split('%26');
                 console.log('分割后的部分:', parts);
                 let sidPart = '', qidPart = '';
                 
                 parts.forEach(part => {
                   if (part.includes('sid%3D')) {
                     sidPart = part.replace('sid%3D', '');
                   } else if (part.includes('qid%3D')) {
                     qidPart = part.replace('qid%3D', '');
                   }
                 });
                 
                 if (sidPart && qidPart) {
                   scene = `sid=${sidPart}&qid=${qidPart}`;
                   console.log('备用方案解析的sid:', sidPart, 'qid:', qidPart);
                   console.log('备用方案重构的scene参数:', scene);
                 } else {
                   // 如果备用方案也失败，尝试标准URL解码
                   scene = decodeURIComponent(scene);
                 }
               } else {
                 // 如果没有%26分隔符，尝试标准URL解码
                 scene = decodeURIComponent(scene);
               }
             }
          } else {
            // 标准URL解码
            scene = decodeURIComponent(scene);
          }
          console.log('URL解码前的scene参数:', originalScene);
          console.log('URL解码后的scene参数:', scene);
        } catch (e) {
          console.error('解码scene参数失败:', e);
          // 继续使用原始scene值
        }
      } else {
        console.log('scene参数无需URL解码:', scene);
      }
      
      if (scene.includes('=') && scene.includes('&')) {
        // 新格式: sid=xxx&qid=xxx 或 id=xxx&qid=xxx 等
        console.log('检测到复杂格式参数，开始解析:', scene);
        const params = {};
        const items = scene.split('&');
        console.log('分割后的参数项:', items);
        
        items.forEach(item => {
          const pair = item.split('=');
          console.log('处理参数项:', item, '分割结果:', pair);
          if (pair.length === 2) {
            params[pair[0]] = pair[1];
          }
        });
        
        console.log('解析复杂场景参数结果:', params);
        eventId = params.id;
        shortId = params.sid;
        qrCodeId = params.qid; // 解析QrCodeId参数
        
        console.log('从复杂参数中提取的值 - eventId:', eventId, 'shortId:', shortId, 'qrCodeId:', qrCodeId);
      } else if (scene.includes('=')) {
        // 简单格式: id=xxx 或 sid=xxx 或 qid=xxx
        const pair = scene.split('=');
        if (pair.length === 2) {
          if (pair[0] === 'id') {
            eventId = pair[1];
          } else if (pair[0] === 'sid') {
            shortId = pair[1];
          } else if (pair[0] === 'qid') {
            qrCodeId = pair[1];
          }
        }
      } else {
        // 最简单格式: 直接就是活动ID或shortId或qrCodeId
        // 尝试识别格式
        if (scene.length === 6 && /^[A-Za-z0-9]{6}$/.test(scene)) {
          // 6位字母数字组合，可能是shortId
          console.log('检测到可能的shortId格式:', scene);
          shortId = scene;
        } else if (scene.length >= 10 && /^[A-Za-z0-9]{10,}$/.test(scene)) {
          // 10位以上字母数字组合，可能是qrCodeId
          console.log('检测到可能的qrCodeId格式:', scene);
          qrCodeId = scene;
        } else if (scene.startsWith('E')) {
          // 以E开头，认为是shortId
          shortId = scene;
        } else {
          // 其他情况，认为是eventId
          eventId = scene;
        }
      }
      
      console.log('解析后的活动ID:', eventId, '短ID:', shortId, 'QrCodeId:', qrCodeId);
      console.log('原始scene参数:', scene);
      console.log('scene参数类型:', typeof scene);
      console.log('scene参数长度:', scene.length);
      
      // 添加更详细的日志，帮助调试
      console.log('===== 场景参数解析详情 =====');
      console.log('是否包含等号:', scene.includes('='));
      console.log('是否包含&符号:', scene.includes('&'));
      console.log('是否为6位字母数字:', scene.length === 6 && /^[A-Za-z0-9]{6}$/.test(scene));
      console.log('是否为10位以上字母数字:', scene.length >= 10 && /^[A-Za-z0-9]{10,}$/.test(scene));
      console.log('是否以E开头:', scene.startsWith('E'));
      console.log('===== 场景参数解析详情结束 =====');
      
      // 如果只有qrCodeId，通过qrCodeId查询活动信息
      if (!eventId && !shortId && qrCodeId) {
        console.log('通过qrCodeId查询活动:', qrCodeId);
        try {
          const db = wx.cloud.database();
          const qrCodeResult = await db.collection('eventQRCodes').where({
            qrCodeId: qrCodeId
          }).get();
          
          if (qrCodeResult.data && qrCodeResult.data.length > 0) {
            eventId = qrCodeResult.data[0].eventId;
            shortId = qrCodeResult.data[0].shortId;
            console.log('通过qrCodeId找到活动ID:', eventId, '短ID:', shortId);
          } else {
            throw new Error('未找到对应的二维码记录');
          }
        } catch (error) {
          console.error('通过qrCodeId查询活动失败:', error);
          throw new Error('查询二维码记录失败');
        }
      }
      
      // 如果有shortId但没有eventId，通过shortId查询活动
      if (!eventId && shortId) {
        console.log('通过shortId查询活动:', shortId);
        try {
          const db = wx.cloud.database();
          const shortIdResult = await db.collection('events').where({
            shortId: shortId
          }).get();
          
          if (shortIdResult.data && shortIdResult.data.length > 0) {
            eventId = shortIdResult.data[0]._id;
            console.log('通过shortId找到活动ID:', eventId);
          } else {
            throw new Error('未找到对应的活动');
          }
        } catch (error) {
          console.error('通过shortId查询活动失败:', error);
          throw new Error('查询活动失败');
        }
      }
      
      if (!eventId) {
        throw new Error('缺少活动ID参数');
      }
      
      // 设置eventId、shortId、qrCodeId到页面数据
      this.setData({
        eventId: eventId,
        shortId: shortId || '', // 保存shortId到页面数据
        qrCodeId: qrCodeId || '', // 保存qrCodeId到页面数据
        isLoggedIn: authUtils.isUserLoggedIn()
      });
      
      // 使用checkAuthAndLoadData替代直接调用loadEventData
      // 确保所有登录用户都会被检查数据完整性
      await this.checkAuthAndLoadData(eventId);
      
      // 如果有qrCodeId，更新二维码访问计数
      if (qrCodeId) {
        console.log('检测到qrCodeId，准备更新访问计数:', qrCodeId);
        await this.updateQRCodeCount(qrCodeId);
      } else {
        console.log('未检测到qrCodeId，跳过访问计数更新');
      }
      
      wx.hideLoading();
      // 清除处理二维码的标志
      this.setData({ isHandlingQRCode: false });
    } catch (error) {
      console.error('处理场景参数失败:', error);
      wx.hideLoading();
      // 清除处理二维码的标志
      this.setData({ isHandlingQRCode: false });
      
      // 显示错误提示
      wx.showModal({
        title: '加载失败',
        content: '无法找到相关活动信息，请检查二维码是否有效',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/index/index' });
        }
      });
    }
  },

  // 更新二维码访问计数
  async updateQRCodeCount(qrCodeId) {
    try {
      console.log('=== 开始更新二维码访问计数 ===');
      console.log('传入的qrCodeId:', qrCodeId);
      console.log('qrCodeId类型:', typeof qrCodeId);
      console.log('qrCodeId长度:', qrCodeId ? qrCodeId.length : 'null');
      
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 查找对应的二维码记录
      console.log('查询eventQRCodes集合，qrCodeId:', qrCodeId);
      const qrCodeResult = await db.collection('eventQRCodes').where({
        qrCodeId: qrCodeId
      }).get();
      
      console.log('查询结果完整信息:', JSON.stringify(qrCodeResult, null, 2));
      console.log('查询结果数据长度:', qrCodeResult.data ? qrCodeResult.data.length : 'null');
      
      if (qrCodeResult.data && qrCodeResult.data.length > 0) {
        // 如果找到记录，将count字段+1
        const qrCodeRecord = qrCodeResult.data[0];
        const currentCount = qrCodeRecord.count || 0;
        
        console.log('找到二维码记录，当前计数:', currentCount, '记录ID:', qrCodeRecord._id);
        
        const updateResult = await db.collection('eventQRCodes').doc(qrCodeRecord._id).update({
          data: {
            count: _.inc(1) // 使用数据库原子操作增加1
          }
        });
        
        console.log('二维码访问计数更新结果:', updateResult);
        console.log('二维码访问计数更新成功，当前计数:', currentCount + 1);
      } else {
        console.warn('未找到对应的二维码记录:', qrCodeId);
        console.log('eventQRCodes集合查询结果为空，可能的原因:');
        console.log('1. 该二维码不是通过管理页面生成的');
        console.log('2. qrCodeId不匹配');
        console.log('3. 数据库权限问题');
        // 如果没有找到记录，可以选择创建一个新记录或者忽略
        // 这里选择忽略，因为正常情况下二维码记录应该在生成时就创建了
      }
    } catch (error) {
      console.error('更新二维码访问计数失败:', error);
      console.error('错误详情:', error.message);
      // 不抛出错误，避免影响页面正常加载
    }
  },

  // 测试函数：检查eventQRCodes集合
  async testEventQRCodes() {
    try {
      console.log('=== 测试eventQRCodes集合访问 ===');
      const db = wx.cloud.database();
      
      // 1. 尝试获取所有记录（限制10条）
      const allRecords = await db.collection('eventQRCodes').limit(10).get();
      console.log('eventQRCodes集合总记录数:', allRecords.data.length);
      console.log('前10条记录:', allRecords.data);
      
      // 2. 检查是否有qrCodeId字段
      if (allRecords.data.length > 0) {
        const firstRecord = allRecords.data[0];
        console.log('第一条记录的字段:', Object.keys(firstRecord));
        console.log('第一条记录的qrCodeId:', firstRecord.qrCodeId);
      }
      
      return allRecords;
    } catch (error) {
      console.error('测试eventQRCodes集合失败:', error);
      console.error('错误详情:', error.message);
      return null;
    }
  },

  checkAuthAndLoadData: function(eventId) {
    // 1. 获取用户信息（如果有）但不强制登录
    let userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    const isLoggedIn = authUtils.isUserLoggedIn();
    
    // 不论登录状态如何，更新当前页面状态
    this.setData({ 
      userInfo: userInfo,
      isLoggedIn: isLoggedIn 
    });

    // 2. 始终加载活动数据，无论用户是否登录
    this.loadEventData(eventId).then(() => {
      // 3. 活动数据加载成功
      console.log('活动数据加载完成，用户登录状态:', isLoggedIn);
    }).catch(error => {
      console.error('在 checkAuthAndLoadData 中加载活动数据失败:', error);
    });
  },
  
  // 添加下拉刷新处理函数
  onPullDownRefresh: function() {
    // 刷新活动数据
    if (this.data.eventId) {
      // 使用checkAuthAndLoadData替代直接调用loadEventData
      // 确保所有登录用户都会被检查数据完整性
      this.checkAuthAndLoadData(this.data.eventId).then(() => {
        // 停止下拉刷新动画
        wx.stopPullDownRefresh();
      }).catch(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      wx.stopPullDownRefresh();
    }
  },
  
  // 加载活动数据
  loadEventData: async function(eventId) {
    const that = this; // 在函数开头保存 this 的引用
    that.setData({ loading: true, qrCodeUrl: '' }); // 重置二维码URL
    try {
      let event = await cloudDB.getEventById(eventId);
      console.log('从数据库获取的活动数据:', event);
      
      if (!event) {
        console.error('未找到活动数据, 尝试直接查询 events 集合');
        
        // 尝试使用_id和id查询
        try {
          const db = wx.cloud.database();
          const eventsCollection = db.collection('events');
          
          // 先尝试使用_id查询
          const { data: dataById } = await eventsCollection.doc(eventId).get()
          .catch(err => ({ data: null }));
          
          if (dataById) {
            event = dataById;
            console.log('使用_id查询成功:', event);
          } else {
            // 再尝试使用id字段查询
            const { data } = await eventsCollection.where({
              id: eventId
            }).get();
            
            if (data && data.length > 0) {
              event = data[0];
              console.log('使用id字段查询成功:', event);
            }
          }
        } catch (queryError) {
          console.error('直接查询数据库失败:', queryError);
        }
      }
      
      if (event) {
        // 检查用户信息和登录状态
        // 这里不再根据 userInfo 来判断登录状态，而是统一使用 authUtils
        const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
        const isLoggedIn = authUtils.isUserLoggedIn();
        
        // 获取参与者的完整用户信息
        let participantsDetails = [];
        let invalidOpenids = []; // 存储查询不到的openid
        
        try {
          // 检查活动参与者列表是否为原始的openid数组
          if (event.participants && Array.isArray(event.participants)) {
            // 判断是否是openid列表（判断第一个元素是否为字符串）
            if (event.participants.length > 0 && typeof event.participants[0] === 'string') {
              // 新格式: 参与者列表是openid数组
              console.log('使用新格式获取参与者信息');
              const openids = event.participants;
              // 计算第一页的起始和结束索引
              const startIndex = 0;
              const endIndex = this.data.participantsPageSize;
              const firstPageOpenids = openids.slice(startIndex, endIndex);
              
              participantsDetails = await cloudDB.getUsersByOpenIds(firstPageOpenids);
              console.log('获取到的参与者详细信息:', participantsDetails);
              
              // 检查是否有无效的用户ID (查询返回的用户数少于请求的ID数)
              if (participantsDetails.length < firstPageOpenids.length) {
                // 找出哪些openid没有对应的用户信息
                const validOpenids = participantsDetails.map(p => p.openid);
                invalidOpenids = firstPageOpenids.filter(id => !validOpenids.includes(id));
                console.log('发现无效的参与者openid:', invalidOpenids);
              }
              
              // 更新是否有更多参与者的状态
              this.setData({
                allParticipantOpenids: openids, // 保存所有openids以供加载更多时使用
                hasMoreParticipants: openids.length > this.data.participantsPageSize,
                participantsPage: 1 // 重置页码
              });
            } else {
              // 旧格式: 参与者列表是完整用户信息对象
              console.log('使用旧格式参与者信息');
              participantsDetails = event.participants;
              
              // 旧格式不需要分页，所以没有更多数据
              this.setData({
                hasMoreParticipants: false,
                participantsPage: 1
              });
            }
          }
        } catch (error) {
          console.error('获取参与者详细信息失败:', error);
        }
        
        // 如果发现无效的参与者ID，尝试清理
        if (invalidOpenids.length > 0 && event._id) {
          console.log('尝试清理无效参与者:', invalidOpenids);
          try {
            const db = wx.cloud.database();
            const _ = db.command;
            
            // 从活动的参与者列表中移除无效的openid
            await db.collection('events').doc(event._id).update({
              data: {
                participants: _.pullAll(invalidOpenids),
                updatedAt: db.serverDate()
              }
            });
            
            console.log('成功清理无效参与者');
            
            // 更新本地事件参与者数据，移除无效ID
            if (event.participants && Array.isArray(event.participants)) {
              event.participants = event.participants.filter(p => !invalidOpenids.includes(p));
              this.setData({
                allParticipantOpenids: event.participants
              });
            }
          } catch (cleanupError) {
            console.error('清理无效参与者失败:', cleanupError);
          }
        }
        
        // 先保存userInfo到data中，确保后续处理能正确识别用户
        that.setData({ userInfo: userInfo });
        
        // 使用工具函数处理活动数据
        event = eventUtils.processEventData(event, userInfo);
        
        console.log('处理后的活动数据:', event);
        console.log('活动创建者状态:', event.isCreator);
        console.log('活动参与状态:', event.isJoined);
        
        // 使用event.isCreator作为创建者状态判断
        const isAttending = event.isJoined;
        
        participantsDetails = participantsDetails.map(p => ({
          ...p,
          companyPositionText: getCompanyPositionText(p),
          aiSuggestion: { loading: true, content: '' } 
        }));

        // -- 更新签到相关状态 --
        const checkinConfig = event.checkinConfig || { enabled: false, openTimeOffset: 0 };
        let showCheckinButton = false;
        let checkinButtonText = '签到';
        let canCheckin = false;
        let showGenerateQRButton = false;
        const currentTime = new Date(); // Get current time once for consistent checks

        if (checkinConfig.enabled) {
          // canCheckin is now calculated using the corrected isWithinCheckinTime
          canCheckin = isWithinCheckinTime(event, checkinConfig, currentTime);

          if (event.isCreator) {
            showGenerateQRButton = true;
          } else if (isAttending) {
            showCheckinButton = true;
            if (canCheckin) {
              checkinButtonText = '立即签到';
            } else {
              // 判断签到是未开始还是已结束
              // eventStartDateTime should be created as it's specific to this calculation context if not passed
              const [year, month, day] = event.date.split('-').map(num => parseInt(num, 10));
              const [hour, minute] = event.startTime.split(':').map(num => parseInt(num, 10));
              const eventStartDateTime = new Date(year, month - 1, day, hour, minute);

              const openTimeOffsetMs = (typeof checkinConfig.openTimeOffset === 'number' ? checkinConfig.openTimeOffset : 0) * 60 * 1000;
              const checkinOpenDateTime = new Date(eventStartDateTime.getTime() - openTimeOffsetMs); // MODIFIED: ensure subtraction here as well
              
              const currentTimestamp = currentTime.getTime();
              const openTimestamp = checkinOpenDateTime.getTime();
              
              console.log(`活动详情页判断: 当前时间戳: ${currentTimestamp}, 开放时间戳: ${openTimestamp}, 比较结果: ${currentTimestamp < openTimestamp}`);
              
              if (currentTimestamp < openTimestamp) {
                checkinButtonText = '签到未开始';
              } else {
                checkinButtonText = '签到已结束';
              }
            }
          }
        }
        // -- 签到状态更新结束 --

        // 获取创建者信息
        if (event.creatorOpenid) {
          // 在participantsDetails中查找创建者信息
          const creatorInfo = participantsDetails.find(p => p.openid === event.creatorOpenid);
          if (creatorInfo) {
            // 将创建者信息设置到event对象中
            event.creatorInfo = creatorInfo;
            // 添加公司职位显示文本
            event.creatorInfo.companyPositionText = getCompanyPositionText(creatorInfo);
            // 初始化创建者的AI建议状态
            event.creatorInfo.aiSuggestion = { loading: true, content: '' };
          }
        }

        that.setData({
          event: event,
          participantsDetails: participantsDetails, 
          loading: false,
          isCreator: event.isCreator,
          isAttending: isAttending,
          isLoggedIn: isLoggedIn,
          userInfo: userInfo,
          // 更新签到相关data
          checkinConfig: checkinConfig,
          showCheckinButton: showCheckinButton,
          checkinButtonText: checkinButtonText,
          canCheckin: canCheckin,
          showGenerateQRButton: showGenerateQRButton,
          // 设置活动短ID (如果有)
          shortId: event.shortId || '',
          // 如果用户是创建者且活动已有保存的二维码URL，则直接显示
          qrCodeUrl: event.isCreator && event.qrCodeUrl ? event.qrCodeUrl : '',
          qrCodePath: event.isCreator && event.qrCodePath ? event.qrCodePath : ''
        }, () => { 
          // 仅在登录状态下添加参与者到 AI 处理队列
          if (isLoggedIn) {
            // 如果有创建者信息，优先处理创建者的AI建议
            if (event.creatorInfo && event.creatorInfo.openid !== userInfo.openid) {
              this.generateSuggestionForCreator().then(() => {
                // 创建者AI建议处理完成后再处理其他参与者
            that.addParticipantsToAIQueue(participantsDetails);
              });
            } else {
              that.addParticipantsToAIQueue(participantsDetails);
            }
          } else {
            console.log('用户未登录，跳过 AI 处理');
            // 更新所有参与者卡片为非加载状态
            const updatedParticipants = participantsDetails.map(p => ({
              ...p,
              aiSuggestion: { loading: false, content: '登录后查看 AI 建议', requireLogin: true }
            }));
            that.setData({ participantsDetails: updatedParticipants });
            
            // 如果有创建者信息，也更新创建者的AI建议状态
            if (event.creatorInfo) {
              event.creatorInfo.aiSuggestion = { loading: false, content: '登录后查看 AI 建议', requireLogin: true };
              that.setData({ 'event.creatorInfo': event.creatorInfo });
            }
          }
        });
        
        // 如果活动没有日程，添加默认日程
        if (!event.schedule) {
          event.schedule = [
            {time: '13:00-13:30', content: '签到'},
            {time: '13:30-14:00', content: '开幕致辞'},
            {time: '14:00-15:30', content: '主题演讲：2025全球经济展望'},
            {time: '15:30-15:45', content: '茶歇'},
            {time: '15:45-17:00', content: '圆桌讨论：新兴市场投资机会'},
            {time: '17:00-17:30', content: '自由交流'}
          ];
          
          // 更新日程到云数据库
          try {
            await cloudDB.updateEvent(eventId, { schedule: event.schedule });
          } catch (updateError) {
            console.error('更新活动日程失败:', updateError);
            // 继续处理，不中断流程
          }
        }
        
        // 确保有默认值
        if (!event.cover) event.cover = '/images/default_event_cover.jpg';
        
        // 设置页面标题
        wx.setNavigationBarTitle({
          title: event.title || '活动详情'
        });
        
        // 获取AI建议
        that.generateAISuggestions();
      } else {
        console.error('所有方法都没有找到活动数据');
        wx.showToast({
          title: '未找到活动信息',
          icon: 'none'
        });
        
        // 返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    } catch (error) {
      console.error('加载活动数据失败', error);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
      that.setData({ loading: false }); // 使用 that
    }
  },
  
  // 编辑活动（仅组织者可见）
  editEvent: function() {
    if (!this.data.event) return;
    
    // 使用eventUtils的统一方法处理编辑活动跳转
    // 确保传递正确的活动ID，优先使用_id，如果没有则使用id
    const eventId = this.data.event._id || this.data.eventId;
    eventUtils.navigateToEditEvent(eventId);
  },
  
  // 判断用户是否是创建者 - 使用eventUtils工具类
  isUserCreator: function(event) {
    return eventUtils.isUserCreator(event, this.data.userInfo);
  },

  // 判断用户是否已参加 - 使用eventUtils工具类
  isUserJoined: function(event) {
    return eventUtils.isUserJoined(event, this.data.userInfo);
  },
  
  // 切换参加状态(报名/取消报名) - 统一入口
  toggleJoin: function() {
    const event = this.data.event;
    const eventId = this.data.eventId;
    const isLoggedIn = this.data.isLoggedIn;

    if (!isLoggedIn) {
      // 记录当前活动详情页面路径，用于登录后跳回
      const currentPath = `/pages/eventDetail/eventDetail?id=${eventId}&initiateJoin=true`;
      wx.setStorageSync('loginRedirectUrl', currentPath);
      
      // 使用工具类中的登录提示，允许用户取消登录
      authUtils.promptLogin('登录后才能报名活动，是否前往登录？', null, () => {
        console.log('用户取消登录，继续浏览活动详情');
        // 可以显示一个轻提示，告知用户可继续浏览
        wx.showToast({
          title: '可继续浏览活动',
          icon: 'none',
          duration: 1500
        });
      });
      return;
    }
    
    // 获取用户信息
    const app = getApp();
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    // 如果是取消报名，直接执行取消报名逻辑
    if (event.isJoined) {
      this.proceedWithEventRegistration();
      return;
    }
    
    // 检查用户资料是否完善，如果不完善则弹窗提示
     authUtils.checkUserProfileWithPrompt(userInfo, '报名活动', () => {
       // 资料完整，继续报名流程
       this.requestSubscriptionAndRegister();
     });
    },

    // ---- START: Topic Survey Logic ----
    showTopicSurvey() {
      const event = this.data.event;
      const eventId = this.data.eventId;
      
      // 检查活动是否启用了话题收集并且用户尚未参加该活动 (避免重复填写)
      if (event.topicSurvey && event.topicSurvey.enabled && !event.isJoined) {
        console.log('活动启用了话题收集，显示问卷');
        
        // 预处理选项，使其格式统一
        let normalizedOptions = [];
        if (Array.isArray(event.topicSurvey.options)) {
          normalizedOptions = event.topicSurvey.options.map(opt => {
            // 将所有选项处理为对象格式，简化WXML中的表达式
            if (typeof opt === 'string') {
              return { text: opt, value: opt };
            } else if (opt && typeof opt === 'object' && opt.text) {
              return { text: opt.text, value: opt.text };
            }
            return { text: '未知选项', value: '未知选项' };
          });
        } else {
          // 如果不是数组，使用默认选项
          normalizedOptions = [
            { text: '行业趋势', value: '行业趋势' },
            { text: '技术交流', value: '技术交流' },
            { text: '商业合作', value: '商业合作' },
            { text: '社交拓展', value: '社交拓展' }
          ];
        }
        
        this.setData({
          currentSurvey: {
            eventId: eventId,
            question: event.topicSurvey.question,
            options: normalizedOptions,
            selectedOptionText: null // Reset selection
          },
          tempSelectedSurveyOption: null, // Reset radio group binding
          showTopicSurveyModal: true
        });
        
        console.log('话题收集选项:', normalizedOptions);
        // 不直接报名，等待用户填写问卷
        return; 
      }
      // ---- END: Topic Survey Logic ----

      // 如果没有启用话题收集，则在用户点击时直接请求订阅消息授权
      this.requestSubscriptionAndRegister();  
    },
  
  // 新增：请求订阅消息授权并执行报名
  requestSubscriptionAndRegister: async function() {
    const eventId = this.data.eventId;
    const event = this.data.event;
    const currentUserInfo = this.data.userInfo || app.globalData.userInfo || wx.getStorageSync('userInfo');
    
    if (!event || !eventId || !currentUserInfo) {
      console.error('无法获取有效的用户信息或活动信息进行报名操作');
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      return;
    }
    
    try {
      // 先请求订阅消息授权
      const tmplIds = ['vqEQeiif0RVlaUt-nxDcUb66GKaTI7OMLxSXUjxDlu4']; // 活动报名成功模板ID
      const subscribeResult = await subscribeMessageUtils.requestSubscribeMessage(tmplIds);
      console.log('订阅消息授权结果:', subscribeResult);
      
      // 无论用户是否接受订阅，都继续执行报名操作
      this.proceedWithEventRegistration();
      
      // 记录用户的订阅状态
      if (subscribeResult[tmplIds[0]] === 'accept') {
        console.log('用户接受了活动通知订阅');
        try {
          await wx.cloud.callFunction({
            name: 'updateUserSubscription',
            data: {
              eventId: eventId,
              templateId: tmplIds[0],
              status: 'accept'
            }
          });
        } catch (error) {
          console.error('记录用户订阅状态失败:', error);
          // 继续执行，不影响用户报名流程
        }
      }
    } catch (error) {
      console.error('请求订阅消息授权失败:', error);
      // 如果订阅消息请求失败，仍然继续执行报名操作
      this.proceedWithEventRegistration();
    }
  },

  // 新增：实际执行报名/取消报名的方法
  proceedWithEventRegistration: function() {
    const event = this.data.event;
    const eventId = this.data.eventId;
    const currentUserInfo = this.data.userInfo || app.globalData.userInfo || wx.getStorageSync('userInfo');

    if (!event || !eventId || !currentUserInfo) {
        console.error('无法获取有效的用户信息或活动信息进行报名操作');
        wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      return;
    }
    
    eventUtils.handleJoinEvent({
      eventId: eventId,
      userInfo: currentUserInfo,
      isJoined: event.isJoined,
      onSuccess: () => {
        console.log('报名/取消报名成功，刷新活动数据');
        
        // 如果是报名成功（不是取消报名），触发AI助理功能
        if (!event.isJoined) {
          // 调用新的云函数
          wx.cloud.callFunction({
            name: 'callAIAssistant',
            data: {
              action: 'joinEvent',
              eventId: eventId,
              userId: currentUserInfo.openid
            },
            success: res => {
              console.log('AI助理响应:', res.result);
              // 此处可以添加显示AI助理回复的逻辑，如果需要的话
            },
            fail: err => {
              console.error('调用AI助理失败:', err);
            }
          });
          
          // 如果是报名成功，发送通知给活动创建者
          if (event.creatorInfo && event.creatorInfo.openid) {
            try {
              // 构建消息内容
              let message = `${currentUserInfo.name && currentUserInfo.name.trim() !== '' ? currentUserInfo.name : '未设置名称'} 已报名参加活动「${event.title || '未命名活动'}」`;
              
              // 获取话题调查选项（如果有）
              let surveyOption = null;
              if (this.data.currentSurvey && this.data.currentSurvey.selectedOptionText) {
                surveyOption = {
                  question: this.data.currentSurvey.question,
                  answer: this.data.currentSurvey.selectedOptionText
                };
                message += `，并选择了话题「${this.data.currentSurvey.selectedOptionText}」`;
              }
              
              // 发送通知
              wx.cloud.callFunction({
                name: 'addNotification',
                data: {
                  type: 'registration',
                  eventId: eventId,
                  senderId: currentUserInfo.openid,
                  senderName: currentUserInfo.name && currentUserInfo.name.trim() !== '' ? currentUserInfo.name : '未设置名称',
                  senderAvatar: currentUserInfo.avatarUrl,
                  recipientId: event.creatorInfo.openid,
                  message: message,
                  surveyOption: surveyOption
                },
                success: res => {
                  console.log('报名通知已发送给活动创建者:', res.result);
                },
                fail: err => {
                  console.error('发送报名通知失败:', err);
                  // 继续执行，不影响用户报名流程
                }
              });
              
              // 同时发送确认通知给报名者本人
              wx.cloud.callFunction({
                name: 'addNotification',
                data: {
                  type: 'registration_confirmation',
                  eventId: eventId,
                  senderId: 'system', // 系统发送的通知
                  senderName: '系统',
                  senderAvatar: '',
                  recipientId: currentUserInfo.openid, // 发给报名者本人
                  message: `您已成功报名活动「${event.title}」`,
                  surveyOption: surveyOption
                },
                success: res => {
                  console.log('报名确认通知已发送给报名者:', res.result);
                },
                fail: err => {
                  console.error('发送报名确认通知失败:', err);
                  // 继续执行，不影响用户报名流程
                }
              });
            } catch (error) {
              console.error('处理报名通知时出错:', error);
              // 继续执行，不影响用户报名流程
            }
          }
        }
        
        this.loadEventData(eventId);
        if (getApp().globalData) {
          getApp().globalData.needRefreshEvents = true;
        }
      },
      onFail: (error) => {
        console.error('报名/取消报名操作失败:', error);
        wx.showToast({
          title: error.message || '操作失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  // ---- START: Survey Modal Handlers ----
  handleSurveyOptionChange: function(e) {
    // 现在e.detail.value直接是选项的value值
    this.setData({
      'currentSurvey.selectedOptionText': e.detail.value 
    });
    console.log('选择了话题选项:', e.detail.value);
  },

  submitTopicSurvey: async function() {
    if (!this.data.currentSurvey.selectedOptionText) {
      wx.showToast({
        title: '请选择一个选项',
        icon: 'none'
      });
      // 设置标记，显示错误提示
      this.setData({ surveySubmitAttempted: true });
      return;
    }

    const currentUserInfo = this.data.userInfo || app.globalData.userInfo;
    const userId = currentUserInfo && currentUserInfo.openid;

    if (!userId) {
        wx.showToast({ title: '无法获取用户信息，请稍后重试', icon: 'none'});
        this.setData({ showTopicSurveyModal: false }); // Close modal if user info is missing
        return;
    }

    const preferenceData = {
      eventId: this.data.currentSurvey.eventId,
      userId: userId,
      name: currentUserInfo.name && currentUserInfo.name.trim() !== '' ? currentUserInfo.name : '未设置名称', // User's name
      question: this.data.currentSurvey.question, // Survey question for context
      prefer: this.data.currentSurvey.selectedOptionText, // User's selected option text
      submittedAt: new Date() // Timestamp, or use db.serverDate() if available and preferred
    };

    wx.showLoading({ title: '提交中...' });
    try {
      const db = wx.cloud.database();
      // Save to the new collection 'eventTopicPreferences'
      await db.collection('eventTopicPreferences').add({
        data: preferenceData
      });
      
      wx.hideLoading();
      this.setData({ showTopicSurveyModal: false });
      wx.showToast({ title: '已记录您的选择', icon: 'success', duration: 1000 });

      // 问卷提交成功后，继续执行报名逻辑
      setTimeout(() => {
        // 统一命名为 proceedWithActualRegistration 与首页保持一致
        this.proceedWithEventRegistration();
      }, 1000); // Delay to let toast show

    } catch (error) {
      wx.hideLoading();
      console.error('提交话题偏好失败:', error);
      wx.showToast({
        title: '提交选择失败，请重试',
        icon: 'none'
      });
      // Keep modal open on failure to allow retry or explicit close.
    }
  },

  closeTopicSurveyModal: function() {
    this.setData({
      showTopicSurveyModal: false,
      tempSelectedSurveyOption: null
    });
  },
  // ---- END: Survey Modal Handlers ----
  
  // 参加活动 - 调用统一工具方法
  joinEvent: function() {
    console.log('使用toggleJoin代替joinEvent');
    this.toggleJoin();
  },
  
  // 取消参加 - 调用统一工具方法
  cancelJoin: function() {
    console.log('使用toggleJoin代替cancelJoin');
    this.toggleJoin();
  },
  
  // 添加加载更多参与者方法
  loadMoreParticipants: async function() {
    if (this.data.loadingMoreParticipants || !this.data.hasMoreParticipants) {
      return;
    }
    
    this.setData({ loadingMoreParticipants: true });
    
    try {
      const nextPage = this.data.participantsPage + 1;
      const startIndex = (nextPage - 1) * this.data.participantsPageSize;
      const endIndex = nextPage * this.data.participantsPageSize;
      const openidsToLoad = this.data.allParticipantOpenids.slice(startIndex, endIndex);
      
      if (openidsToLoad.length === 0) {
        this.setData({ 
          hasMoreParticipants: false,
          loadingMoreParticipants: false
        });
        return;
      }
      
      const newParticipantsDetails = await cloudDB.getUsersByOpenIds(openidsToLoad);
      const newParticipantsWithPlaceholder = newParticipantsDetails.map(p => ({
        ...p,
        aiSuggestion: { loading: true, content: '' } // Placeholder, AI will be generated via queue
      }));
      
      const updatedParticipantsDetails = [
        ...this.data.participantsDetails,
        ...newParticipantsWithPlaceholder
      ];
      
      this.setData({
        participantsDetails: updatedParticipantsDetails,
        participantsPage: nextPage,
        hasMoreParticipants: endIndex < this.data.allParticipantOpenids.length,
        loadingMoreParticipants: false
      });
      
      // 将新加载的参与者添加到AI处理队列
      this.addParticipantsToAIQueue(newParticipantsWithPlaceholder);
      
    } catch (error) {
      console.error('加载更多参与者失败:', error);
      wx.showToast({
        title: '加载更多参与者失败',
        icon: 'none'
      });
      this.setData({ loadingMoreParticipants: false });
    }
  },
  
  // 修改刷新AI建议方法，优先刷新创建者
  refreshAISuggestions: function() {
    // 如果用户未登录，提示登录
    if (!this.data.isLoggedIn) {
      authUtils.promptLogin('登录后才能生成AI建议，是否前往登录？', null, () => {
        console.log('用户取消登录，继续浏览活动详情');
        // 显示不登录的提示
        wx.showToast({
          title: '可继续浏览活动',
          icon: 'none',
          duration: 1500
        });
      });
      return;
    }
    
    wx.showToast({
      title: '正在刷新建议',
      icon: 'loading',
      duration: 1000
    });
    
    // 如果有创建者信息，先重置创建者的AI建议状态
    if (this.data.event && this.data.event.creatorInfo) {
      this.setData({
        'event.creatorInfo.aiSuggestion': { loading: true, content: null }
      });
      
      // 先生成创建者的AI建议
      this.generateSuggestionForCreator().then(() => {
        // 创建者的AI建议生成完成后，再处理其他参与者
    if (this.data.participantsDetails && this.data.participantsDetails.length > 0) {
          // 重置所有现有参与者的AI建议状态为加载中
          const resetParticipants = this.data.participantsDetails.map(p => ({
            ...p,
            aiSuggestion: { loading: true, content: null }
          }));
          
          this.setData({ 
            participantsDetails: resetParticipants,
            aiProcessingQueue: [], // 清空现有队列
            isProcessingAI: false // 重置处理状态
          }, () => {
          // 将重置后的参与者重新加入队列进行处理，强制刷新（跳过缓存）
          this.addParticipantsToAIQueue(resetParticipants, true);
        });
        }
      }).catch(error => {
        console.error('刷新创建者AI建议失败:', error);
      });
    } else if (this.data.participantsDetails && this.data.participantsDetails.length > 0) {
      // 如果没有创建者信息，直接处理参与者
      // 重置所有现有参与者的AI建议状态为加载中
      const resetParticipants = this.data.participantsDetails.map(p => ({
        ...p,
        aiSuggestion: { loading: true, content: null }
      }));
      
      this.setData({ 
        participantsDetails: resetParticipants,
        aiProcessingQueue: [], // 清空现有队列
        isProcessingAI: false // 重置处理状态
      }, () => {
        // 将重置后的参与者重新加入队列进行处理，强制刷新（跳过缓存）
        this.addParticipantsToAIQueue(resetParticipants, true);
      });
    } else {
      console.log('没有参与者，无法刷新AI建议');
      // 如果没有参与者，也确保队列是空的
      this.setData({ aiProcessingQueue: [], isProcessingAI: false });
    }
  },

  // 刷新单个参与者的AI建议
  refreshSingleAISuggestion: function(e) {
    // 阻止冒泡，避免触发卡片点击事件
    e.stopPropagation();
    
    // 获取参与者索引
    const participantIndex = e.currentTarget.dataset.participantIndex;
    if (participantIndex === undefined || participantIndex < 0) {
      console.error('刷新单个AI建议时无法获取参与者索引');
      return;
    }
    
    // 获取参与者信息
    const participant = this.data.participantsDetails[participantIndex];
    if (!participant) {
      console.error('找不到指定索引的参与者');
      return;
    }
    
    // 设置该参与者的AI建议为加载状态
    let updatedParticipants = [...this.data.participantsDetails];
    updatedParticipants[participantIndex] = {
      ...participant,
      aiSuggestion: { loading: true, content: null }
    };
    
    this.setData({ 
      participantsDetails: updatedParticipants
    }, () => {
      // 直接为该参与者生成建议，不使用队列，强制刷新（跳过缓存）
      this.generateSuggestionForSingleParticipant(participant, true)
        .then(() => {
          console.log(`成功刷新参与者${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'}的AI建议`);
        })
        .catch(error => {
          console.error(`刷新参与者${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'}的AI建议失败:`, error);
          
          // 如果失败，恢复错误状态
          let errorUpdatedParticipants = [...this.data.participantsDetails];
          errorUpdatedParticipants[participantIndex] = {
            ...participant,
            aiSuggestion: { loading: false, error: true, content: 'AI连接失败，请重试' }
          };
          this.setData({ participantsDetails: errorUpdatedParticipants });
          
          // 显示错误提示
          wx.showToast({
            title: '刷新建议失败',
            icon: 'none'
          });
        });
    });
  },

  // 页面隐藏时触发（如使用wx.navigateTo跳转到其他页面）
  onHide: function() {
    console.log('活动详情页被隐藏，设置刷新标记');
    // Mark page as inactive
    this.setData({ pageActive: false });
    
    // 设置全局刷新标记，通知其他页面需要刷新活动列表
    if (getApp().globalData) {
      getApp().globalData.needRefreshEvents = true;
    }
  },

  // 页面卸载时触发（如返回上一页）
  onUnload: function() {
    console.log('活动详情页被卸载，设置刷新标记');
    // Mark page as inactive
    this.setData({ pageActive: false });
    
    // 设置全局刷新标记，通知其他页面需要刷新活动列表
    if (getApp().globalData) {
      getApp().globalData.needRefreshEvents = true;
    }
  },
  
  // 取消活动（仅组织者可见）
  cancelEvent: async function() {
    wx.showModal({
      title: '确认取消',
      content: '确定要取消此活动吗？此操作不可恢复。',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 显示加载状态
            wx.showLoading({
              title: '取消活动中...'
            });
            
            // 从云数据库删除活动
            const success = await cloudDB.deleteEvent(this.data.eventId);
            
            wx.hideLoading();
            
            if (success) {
              wx.showToast({
                title: '活动已取消',
                icon: 'success',
                success: () => {
                  // 返回上一页
                  setTimeout(() => {
                    wx.navigateBack();
                  }, 1500);
                }
              });
            } else {
              throw new Error('取消活动失败');
            }
          } catch (error) {
            wx.hideLoading();
            console.error('取消活动失败', error);
            
            wx.showToast({
              title: '操作失败，请重试',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 生成AI建议的方法
  generateAISuggestions: function() {
    // 如果用户未登录，不生成AI建议，只更新UI状态
    if (!this.data.isLoggedIn) {
      console.log('用户未登录，跳过AI建议生成，展示未登录状态');
      
      // 更新所有参与者卡片为未登录状态
      if (this.data.participantsDetails && this.data.participantsDetails.length > 0) {
        const updatedParticipants = this.data.participantsDetails.map(p => ({
          ...p,
          aiSuggestion: { 
            loading: false, 
            content: '登录后查看AI建议', 
            requireLogin: true 
          }
        }));
        this.setData({ 
          participantsDetails: updatedParticipants,
          loadingAI: false,
          suggestionsLoading: false
        });
      }
      return;
    }
    
    // 如果没有用户登录或没有参与者，不需要生成建议
    if (!this.data.userInfo || !this.data.participantsDetails || this.data.participantsDetails.length === 0) {
      console.log('没有用户登录或没有参与者，跳过AI建议生成');
      return;
    }
    
    // 设置加载状态
    this.setData({ loadingAI: true });
    
    // 此函数可以为空，因为实际生成AI建议的工作已经由addParticipantsToAIQueue和processAIQueue完成
    console.log('开始生成AI建议流程');
    this.setData({ loadingAI: false });
    
    // 无需额外操作，队列处理已经在loadEventData中通过addParticipantsToAIQueue触发
  },

  // 添加参与者到AI处理队列并开始处理
  addParticipantsToAIQueue: function(newParticipants, forceRefresh = false) {
    // 如果用户未登录，不添加到队列
    if (!this.data.isLoggedIn) {
      console.log('用户未登录，不添加参与者到AI队列');
      
      // 更新所有参与者卡片为未登录状态
      if (newParticipants && newParticipants.length > 0) {
        const updatedParticipants = newParticipants.map(p => ({
          ...p,
          aiSuggestion: { 
            loading: false, 
            content: '登录后查看AI建议', 
            requireLogin: true 
          }
        }));
        
        // 更新UI显示，但不加入处理队列
        const allParticipants = [...this.data.participantsDetails];
        for (let i = 0; i < allParticipants.length; i++) {
          const matchIndex = updatedParticipants.findIndex(p => 
            (p.openid && p.openid === allParticipants[i].openid) || 
            (p._id && p._id === allParticipants[i]._id)
          );
          if (matchIndex !== -1) {
            allParticipants[i].aiSuggestion = updatedParticipants[matchIndex].aiSuggestion;
          }
        }
        
        this.setData({ participantsDetails: allParticipants });
      }
      return;
    }
    
    if (!newParticipants || newParticipants.length === 0) return;

    this.setData({
      aiProcessingQueue: [...this.data.aiProcessingQueue, ...newParticipants],
      forceRefreshQueue: forceRefresh // 保存强制刷新标记
    });

    if (!this.data.isProcessingAI) {
      this.processAIQueue();
    }
  },

  // 处理AI队列中的下一个参与者
  processAIQueue: async function() {
    // 如果用户未登录，不处理队列
    if (!this.data.isLoggedIn) {
      console.log('用户未登录，不处理AI队列');
      this.setData({ 
        isProcessingAI: false,
        aiProcessingQueue: [] // 清空队列
      });
      return;
    }
    
    if (this.data.aiProcessingQueue.length === 0) {
      this.setData({ 
        isProcessingAI: false,
        forceRefreshQueue: false // 重置强制刷新标记
      });
      console.log('AI建议队列处理完成');
      return;
    }

    this.setData({ isProcessingAI: true });
    const participantToProcess = this.data.aiProcessingQueue[0];

    console.log('处理AI建议队列中的下一个参与者:', participantToProcess.name && participantToProcess.name.trim() !== '' ? participantToProcess.name : '未设置名称');

    // 为单个参与者生成AI建议 (需要从原有逻辑中提取和修改)
    await this.generateSuggestionForSingleParticipant(participantToProcess, this.data.forceRefreshQueue || false);

    // 从队列中移除已处理的参与者
    const updatedQueue = this.data.aiProcessingQueue.slice(1);
    this.setData({
      aiProcessingQueue: updatedQueue
    });

    // 继续处理队列
    this.processAIQueue(); 
  },

  // 为单个参与者生成AI建议 (需要从原有逻辑中提取和修改)
  generateSuggestionForSingleParticipant: async function(participant, forceRefresh = false) {
    const event = this.data.event;
    const currentUser = this.data.userInfo;

    if (!event || !currentUser || !participant) {
      console.log('缺少必要数据，无法为单个参与者生成AI建议');
      return;
    }

    // 跳过当前用户自己
    if ((participant._id && participant._id === currentUser._id) || 
        (participant.openid && participant.openid === currentUser.openid)) {
      console.log('跳过为当前用户生成AI建议');
      //即使跳过，也要确保UI上该参与者的loading状态被正确处理
      const participantIndex = this.data.participantsDetails.findIndex(
        p => (p._id && p._id === participant._id) || (p.openid && p.openid === participant.openid)
      );
      if (participantIndex !== -1) {
        let updatedDetails = [...this.data.participantsDetails];
        updatedDetails[participantIndex].aiSuggestion = { loading: false, content: '', isSelf: true };
        this.setData({ participantsDetails: updatedDetails });
      }
      return;
    }

    console.log(`为参与者 ${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'} 生成AI建议`);

    // 检查本地缓存（除非强制刷新）
    if (!forceRefresh) {
      const cachedSuggestion = this.getCachedAISuggestion(
        this.data.eventId,
        currentUser.openid,
        participant.openid
      );

      if (cachedSuggestion) {
        console.log(`使用缓存的AI建议 for ${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'}`);
        
        // 直接使用缓存的建议更新UI
        const participantIndex = this.data.participantsDetails.findIndex(
          p => (p._id && p._id === participant._id) || (p.openid && p.openid === participant.openid)
        );
        
        if (participantIndex !== -1) {
          let updatedDetails = [...this.data.participantsDetails];
          updatedDetails[participantIndex].aiSuggestion = {
            loading: false,
            ...cachedSuggestion,
            fromCache: true // 标记来自缓存
          };
          this.setData({ participantsDetails: updatedDetails });
        }
        return;
      }
    } else {
      console.log(`强制刷新，跳过缓存 for ${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'}`);
    }

    const prompt = `作为一个社交助手，请为以下场景提供一个简短的合作建议：
        
        我的信息：
        - 姓名：${currentUser.name && currentUser.name.trim() !== '' ? currentUser.name : '不需要使用姓名'}
        - 公司职位：${getCompanyPositionText(currentUser) || '未知'}
        - 行业：${currentUser.industry || '未填写'}
        - 专长领域：${currentUser.expertise || '未填写'}
        - 个人描述标签：${currentUser.personalTags && currentUser.personalTags.length > 0 ? currentUser.personalTags.join('、') : '未设置'}
        
        对方信息：
        - 姓名：${participant.name && participant.name.trim() !== '' ? participant.name : '未知'}
        - 公司职位：${getCompanyPositionText(participant) || '对方未填写'}
        - 行业：${participant.industry || '对方未填写'}
        - 专长领域：${participant.expertise || '对方未填写'}`;

    try {
      if (!this.data.pageActive) {
        console.log('页面不再活跃，中止为单个参与者生成AI建议');
        return; 
      }

      console.log(`调用API为参与者 ${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'} 生成AI建议`);
      const response = await wx.cloud.callFunction({
        name: 'callDifyAPI',
        data: { prompt: prompt }
      });

      if (!this.data.pageActive) {
        console.log('API响应后页面已不再活跃，放弃处理单个参与者结果');
        return;
      }

      const participantIndex = this.data.participantsDetails.findIndex(
        p => (p._id && p._id === participant._id) || (p.openid && p.openid === participant.openid)
      );

      if (participantIndex === -1) {
        console.log('未在列表中找到参与者，无法更新AI建议:', participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称');
        return;
      }

      let updatedDetails = [...this.data.participantsDetails];

      if (response && response.result && response.result.data) {
        let responseData = response.result.data;
        let parsedData = null;
        try {
          if (typeof responseData === 'string') {
            if (responseData.includes('```')) {
              const jsonStart = responseData.indexOf('{');
              const jsonEnd = responseData.lastIndexOf('}');
              if (jsonStart >= 0 && jsonEnd >= 0) {
                responseData = responseData.substring(jsonStart, jsonEnd + 1);
              }
            }
            parsedData = JSON.parse(responseData);
          } else if (typeof responseData === 'object') {
            parsedData = responseData;
          }

          if (parsedData && parsedData.content) {
            // 更新类型映射
            const typeMapping = {
              '合作建议': 'hezuo',
              '技术支持': 'jishu',
              '资源共享': 'ziyuan',
              '社交': 'social',
              '商务': 'business',
              '合作': 'cooperation'
            };

            // 处理新的tips字段（标签列表）
            const tips = parsedData.tips || [];
            const tipsStr = tips.join('、');

            const suggestionData = {
              loading: false,
              content: parsedData.content || '',
              title: parsedData.title || '合作建议',
              tips: tips, // 新增：保存标签列表
              tipsStr: tipsStr, // 新增：用于显示的标签字符串
              typeClass: 'cooperation' // 默认使用cooperation类型
            };

            updatedDetails[participantIndex].aiSuggestion = suggestionData;

            // 保存到本地缓存
            this.saveAISuggestionToCache(
              this.data.eventId,
              currentUser.openid,
              participant.openid,
              suggestionData
            );
          } else {
            throw new Error('解析数据格式不符合预期');
          }
        } catch (parseError) {
          console.error('解析AI响应失败:', parseError, '原始响应:', responseData);
          const fallbackSuggestion = {
            loading: false,
            content: typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
            title: '合作建议',
            typeClass: 'cooperation',
            error: false
          };
          updatedDetails[participantIndex].aiSuggestion = fallbackSuggestion;

          // 即使解析失败，也保存原始内容到缓存
          this.saveAISuggestionToCache(
            this.data.eventId,
            currentUser.openid,
            participant.openid,
            fallbackSuggestion
          );
        }
      } else {
        console.error('API返回数据格式错误 for participant:', participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称');
        updatedDetails[participantIndex].aiSuggestion = { loading: false, error: true, content: 'AI连接失败，请重试' };
        
        // AI建议生成失败时，不保存到本地缓存
      }
      
      this.setData({ participantsDetails: updatedDetails });
      console.log(`成功更新参与者 ${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'} 的AI建议`);

    } catch (error) {
      console.error(`为参与者 ${participant.name && participant.name.trim() !== '' ? participant.name : '未设置名称'} 生成建议失败:`, error);
      const participantIndex = this.data.participantsDetails.findIndex(
        p => (p._id && p._id === participant._id) || (p.openid && p.openid === participant.openid)
      );
      if (participantIndex !== -1) {
        let updatedDetails = [...this.data.participantsDetails];
        updatedDetails[participantIndex].aiSuggestion = { loading: false, error: true, content: '生成失败' };
        this.setData({ participantsDetails: updatedDetails });
        // AI建议生成失败时，不保存到本地缓存
      }
    }
  },

  // --- 新增签到相关函数 ---
  handleCheckin: function(fromQRCode = false) {
    // 直接跳转到签到成功页面，由该页面处理签到判断逻辑
    wx.navigateTo({
      url: `/pages/checkinSuccess/checkinSuccess?id=${this.data.eventId}`
    });
  },

  generateCheckinQRCode: async function() {
    if (!this.data.isCreator || !this.data.checkinConfig || !this.data.checkinConfig.enabled) {
      return;
    }
    
    // 删除原有的二维码数据
    this.setData({ 
      qrCodeLoading: true, 
      qrCodeUrl: '', 
      qrCodePath: '', 
      shortId: '' 
    });
    
    wx.showLoading({ title: '重新生成二维码中...' });
    try {
      // 直接使用活动ID，云函数会自动处理和生成shortId
      const res = await wx.cloud.callFunction({
        name: 'generateEventQRCode',
        data: {
          eventId: this.data.eventId,
          page: 'pages/checkinSuccess/checkinSuccess', // 直接跳转到签到成功页面
          qrNamePrefix: `checkin_qr_${this.data.eventId}`
        }
      });
      wx.hideLoading();
      this.setData({ qrCodeLoading: false });
      if (res.result && res.result.success && res.result.qrCodeUrl) {
        // 保存二维码URL、链接路径和短ID
        this.setData({ 
          qrCodeUrl: res.result.qrCodeUrl,
          qrCodePath: res.result.qrCodePath || `pages/checkinSuccess/checkinSuccess?sid=${res.result.shortId}`,
          shortId: res.result.shortId || ''
        });
        wx.showToast({ title: '二维码已生成', icon: 'success' });
        console.log('生成的二维码短ID:', res.result.shortId);
      } else {
        throw new Error(res.result.message || '生成二维码失败');
      }
    } catch (error) {
      wx.hideLoading();
      this.setData({ qrCodeLoading: false });
      console.error('生成二维码失败:', error);
      wx.showToast({ title: error.message || '生成二维码失败，请重试', icon: 'none' });
    }
  },

  previewQRCode: function() {
    if (this.data.qrCodeUrl) {
      wx.previewImage({
        current: this.data.qrCodeUrl,
        urls: [this.data.qrCodeUrl]
      });
    }
  },
  
  // 导航到二维码对应的页面路径
  navigateToQRCodePath: function() {
    if (!this.data.qrCodePath) return;
    
    try {
      // 处理路径，确保正确格式
      let path = this.data.qrCodePath;
      
      // 如果路径不是以 / 开头，添加前导斜杠
      if (path && !path.startsWith('/')) {
        path = '/' + path;
      }
      
      console.log('尝试导航到路径:', path);
      
      // 使用navigateTo尝试导航
      wx.navigateTo({
        url: path,
        fail: (err) => {
          console.error('导航失败:', err);
          // 如果导航失败，可能是tabBar页面，尝试使用switchTab
          if (path.includes('/pages/index/index') || 
              path.includes('/pages/mine/mine') || 
              path.includes('/pages/notifications/notifications')) {
            wx.switchTab({
              url: path,
              fail: (switchErr) => {
                console.error('切换到Tab页面也失败:', switchErr);
                wx.showToast({
                  title: '页面导航失败',
                  icon: 'none'
    });
              }
            });
          } else {
            wx.showToast({
              title: '无法导航到该页面',
              icon: 'none'
            });
          }
        }
      });
    } catch (error) {
      console.error('导航过程中发生错误:', error);
      wx.showToast({
        title: '导航过程中发生错误',
        icon: 'none'
      });
    }
  },
  
  // 查看已签到人员列表
  viewCheckinList: function() {
    if (!this.data.eventId) {
      wx.showToast({
        title: '无法获取活动ID',
        icon: 'none'
      });
      return;
    }
    
    wx.navigateTo({
      url: `/pages/checkinList/checkinList?eventId=${this.data.eventId}`,
      fail: (err) => {
        console.error('导航到签到列表页失败:', err);
        wx.showToast({
          title: '无法打开签到列表',
          icon: 'none'
        });
      }
    });
  },
  // --- 签到相关函数结束 ---

  // 为创建者生成AI建议
  generateSuggestionForCreator: async function() {
    const event = this.data.event;
    const currentUser = this.data.userInfo;
    const creatorInfo = event.creatorInfo;

    if (!event || !currentUser || !creatorInfo) {
      console.log('缺少必要数据，无法为创建者生成AI建议');
      return;
    }

    // 跳过当前用户自己
    if (creatorInfo.openid === currentUser.openid) {
      console.log('跳过为当前用户(创建者)生成AI建议');
      this.setData({
        'event.creatorInfo.aiSuggestion': { loading: false, content: '', isSelf: true }
      });
      return;
    }

    console.log(`为创建者 ${creatorInfo.name && creatorInfo.name.trim() !== '' ? creatorInfo.name : '未设置名称'} 生成AI建议`);

    const prompt = `作为一个社交助手，请为以下场景提供一个简短的合作建议：
        
        我的信息：
        - 姓名：${currentUser.name && currentUser.name.trim() !== '' ? currentUser.name : '不需要使用姓名'}
        - 公司职位：${getCompanyPositionText(currentUser) || '未知'}
        - 行业：${currentUser.industry || '未填写'}
        - 专长领域：${currentUser.expertise || '未填写'}
        - 个人描述标签：${currentUser.personalTags && currentUser.personalTags.length > 0 ? currentUser.personalTags.join('、') : '未设置'}
        
        对方信息（活动组织者）：
        - 姓名：${creatorInfo.name && creatorInfo.name.trim() !== '' ? creatorInfo.name : '未知'}
        - 公司职位：${getCompanyPositionText(creatorInfo) || '对方未填写'}
        - 行业：${creatorInfo.industry || '对方未填写'}
        - 专长领域：${creatorInfo.expertise || '对方未填写'}
        
        请提供一个具体的、实用的合作建议，重点关注双方可能的业务合作机会。建议应该简短清晰，不超过100字。`;

    try {
      if (!this.data.pageActive) {
        console.log('页面不再活跃，中止为创建者生成AI建议');
        return; 
      }

      const response = await wx.cloud.callFunction({
        name: 'callDifyAPI',
        data: { prompt: prompt }
      });

      if (!this.data.pageActive) {
        console.log('API响应后页面已不再活跃，放弃处理创建者结果');
        return;
      }

      if (response && response.result && response.result.data) {
        let responseData = response.result.data;
        let parsedData = null;
        try {
          if (typeof responseData === 'string') {
            if (responseData.includes('```')) {
              const jsonStart = responseData.indexOf('{');
              const jsonEnd = responseData.lastIndexOf('}');
              if (jsonStart >= 0 && jsonEnd >= 0) {
                responseData = responseData.substring(jsonStart, jsonEnd + 1);
              }
            }
            parsedData = JSON.parse(responseData);
          } else if (typeof responseData === 'object') {
            parsedData = responseData;
          }

          if (parsedData && parsedData.content) {
            // 处理新的tips字段（标签列表）
            const tips = parsedData.tips || [];
            const tipsStr = tips.join('、');

            this.setData({
              'event.creatorInfo.aiSuggestion': {
                loading: false, 
                content: parsedData.content || '',
                title: parsedData.title || '合作建议', 
                tips: tips, // 新增：保存标签列表
                tipsStr: tipsStr, // 新增：用于显示的标签字符串
                typeClass: 'cooperation' // 默认使用cooperation类型
              }
            });
          } else { 
            throw new Error('解析数据格式不符合预期'); 
          }
        } catch (parseError) {
          console.error('解析创建者AI响应失败:', parseError, '原始响应:', responseData);
          this.setData({
            'event.creatorInfo.aiSuggestion': {
              loading: false, 
              content: typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
              title: '合作建议', 
              typeClass: 'cooperation',
              error: false
            }
          });
        }
      } else {
        console.error('API返回数据格式错误 for 创建者:', creatorInfo.name && creatorInfo.name.trim() !== '' ? creatorInfo.name : '未设置名称');
        this.setData({
          'event.creatorInfo.aiSuggestion': { loading: false, error: true, content: 'AI连接失败，请重试' }
      });
      // AI建议生成失败时，不保存到本地缓存
      }
      console.log(`成功更新创建者 ${creatorInfo.name && creatorInfo.name.trim() !== '' ? creatorInfo.name : '未设置名称'} 的AI建议`);

    } catch (error) {
      console.error(`为创建者 ${creatorInfo.name && creatorInfo.name.trim() !== '' ? creatorInfo.name : '未设置名称'} 生成建议失败:`, error);
      this.setData({
        'event.creatorInfo.aiSuggestion': { loading: false, error: true, content: 'AI连接失败，请重试' }
      });
      // AI建议生成失败时，不保存到本地缓存
    }
  },

  // 刷新创建者的AI建议
  refreshCreatorAISuggestion: function() {
    // 首先检查用户是否已登录
    if (!this.data.isLoggedIn) {
      authUtils.promptLogin('登录后才能生成AI建议，是否前往登录？', null, () => {
      console.log('用户取消登录，继续浏览活动详情');
        wx.showToast({
          title: '可继续浏览活动',
          icon: 'none',
          duration: 1500
        });
      });
      return;
    }

    // 检查是否有创建者信息
    if (!this.data.event || !this.data.event.creatorInfo) {
      console.log('没有创建者信息，无法刷新AI建议');
      return;
    }

    // 设置创建者的AI建议为加载状态
    this.setData({
      'event.creatorInfo.aiSuggestion': { loading: true, content: null }
    });

    // 生成创建者的AI建议
    this.generateSuggestionForCreator()
      .then(() => {
        console.log('成功刷新创建者的AI建议');
      })
      .catch(error => {
        console.error('刷新创建者的AI建议失败:', error);
        this.setData({
          'event.creatorInfo.aiSuggestion': { loading: false, error: true, content: 'AI连接失败，请重试' }
    });
    // AI建议生成失败时，不保存到本地缓存
        wx.showToast({
          title: '刷新建议失败',
          icon: 'none'
        });
    });
  },

  viewAllParticipants: function() {
    const eventId = this.data.eventId;
    wx.navigateTo({
      url: `/pages/allParticipants/allParticipants?eventId=${eventId}`
    });
  },

  // 跳转到二维码管理页面
  goToQRCodeManagement: function() {
    if (!this.data.eventId) {
      wx.showToast({
        title: '无法获取活动ID',
        icon: 'none'
      });
      return;
    }
    
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

  onOrganizerTap: function() {
    // 首先检查用户是否已登录
    const isLoggedIn = authUtils.isUserLoggedIn();
    if (!isLoggedIn) {
      // 保存当前活动详情页面路径，用于登录后跳回
      const eventId = this.data.eventId;
      const currentPath = `/pages/eventDetail/eventDetail?id=${eventId}`;
      wx.setStorageSync('loginRedirectUrl', currentPath);
      
      // 提示登录
      authUtils.promptLogin('登录后才能查看组织者详情和AI合作建议，是否前往登录？', null, () => {
        console.log('用户取消登录，继续浏览活动详情');
        wx.showToast({
          title: '可继续浏览活动',
          icon: 'none',
          duration: 1500
        });
      });
      return;
    }
    
    const creatorInfo = this.data.event.creatorInfo;
    const currentUser = this.data.userInfo;
    
    if (!creatorInfo) return;
    
    const isSelf = currentUser && (
      (creatorInfo.openid && creatorInfo.openid === currentUser.openid) ||
      (creatorInfo._id && creatorInfo._id === currentUser._id)
    );
    
    if (isSelf) {
      wx.navigateTo({
        url: '/pages/profile/profile'
      });
      return;
    }
    
    // 准备通过事件通道传递的数据
    const eventDataForDetail = {
      participant: creatorInfo,
      currentUser: currentUser,
      eventTitle: this.data.event ? this.data.event.title : '活动详情',
      eventType: this.data.event ? (this.data.event.type || '普通活动') : '普通活动',
      eventId: this.data.eventId,
      isOrganizer: true // 标记这是组织者
    };

    wx.navigateTo({
      url: `/pages/participantDetail/participantDetail?openid=${creatorInfo.openid || ''}&eventId=${this.data.eventId}&isOrganizer=true`,
      events: {
        acceptDataFromOpenedPage: function(data) {
          console.log('来自组织者详情页的回传数据:', data)
        },
      },
      success: function(res) {
        // 通过eventChannel向被打开页面传送数据
        res.eventChannel.emit('acceptParticipantData', eventDataForDetail);
        console.log('成功导航到组织者详情页并发送数据:', eventDataForDetail);
      },
      fail: function(err) {
        console.error('导航到组织者详情页失败:', err);
        wx.showToast({
          title: '打开详情页失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },

  // ---- START: Tag Recommendation Methods ----
  

  // 分享功能
  onShareAppMessage: function(res) {
    console.log('活动详情页分享事件:', res);
    
    // 使用Canvas生成5:4比例的分享海报
    return new Promise((resolve) => {
      shareUtils.generateEventShareWithCanvas(this.data.event, this.data.eventId, (shareConfig) => {
        resolve(shareConfig);
      });
    });
  },

  // 设置分享图片回调（由Canvas页面调用）
  setShareImage: function(imageUrl) {
    console.log('收到Canvas生成的分享图片:', imageUrl);
    this.shareImageUrl = imageUrl;
  },

  // 编辑活动按钮点击事件

  // ---- START: 活动描述图片相关方法 ----
  // 预览活动描述图片
  previewDescriptionImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.event.descriptionImages;
    
    if (images && images.length > 0) {
      wx.previewImage({
        current: images[index],
        urls: images
      });
    }
  }
  // ---- END: 活动描述图片相关方法 ----
})