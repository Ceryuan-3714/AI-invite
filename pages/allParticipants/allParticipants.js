const app = getApp(); // Get app instance for globalData
const authUtils = require('../../utils/authUtils.js'); // Import authUtils
const eventUtils = require('../../utils/eventUtils.js'); // Import eventUtils

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
    eventTitle: '', // To store event title
    eventType: '', // To store event type
    participants: [],
    rows: [], // 用于两列分组显示
    userInfo: null, // Store current user's info
    isLoggedIn: false, // Store login status
    isCreator: false, // 是否为活动创建者
    loadingMore: false, // Added for loading more participants
    // 标签推荐相关数据
    showTagInputModal: false, // 是否显示标签输入模态框
    selectedParticipant: null,
    inputRecommendTag: '', // 当前输入的标签
    pendingRecommendTags: [], // 待提交的标签列表
  },

  onLoad: async function(options) {
    const eventId = options.eventId;
    const isLoggedIn = authUtils.isUserLoggedIn();
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');

    this.setData({ 
      eventId,
      isLoggedIn,
      userInfo
    });
    await this.loadEventDetailsAndParticipants();
  },

  // Load event details (for title/type) and all participants
  loadEventDetailsAndParticipants: async function() {
    wx.showLoading({ title: '加载中...' });
    try {
      const db = wx.cloud.database();
      const eventRes = await db.collection('events').doc(this.data.eventId).get();
      const event = eventRes.data;

      if (!event) {
        wx.showToast({ title: '活动信息获取失败', icon: 'none' });
        wx.hideLoading();
        return;
      }

      // 判断当前用户是否为活动创建者
      const isCreator = this.data.isLoggedIn && this.data.userInfo && eventUtils.isUserCreator(event, this.data.userInfo);

      this.setData({
        eventTitle: event.title || '活动参与者',
        eventType: event.type || '活动',
        isCreator: isCreator
      });

      let participants = [];
      if (event.participants && event.participants.length > 0) {
        let openids = event.participants;
        
        // If it's just an array of openids (strings), fetch all user objects
        if (typeof openids[0] === 'string') {
          // WeChat mini program cloud DB has a 20-item limit per query
          // We need to fetch in batches
          const batchSize = 20;
          const totalBatches = Math.ceil(openids.length / batchSize);
          
          for (let i = 0; i < totalBatches; i++) {
            const batchOpenids = openids.slice(i * batchSize, (i + 1) * batchSize);
            if (batchOpenids.length > 0) {
              const batchRes = await db.collection('users').where({
                openid: db.command.in(batchOpenids)
              }).get();
              
              participants = participants.concat(batchRes.data);
              // Update UI incrementally to show progress
              if (i < totalBatches - 1) {
                const tempRows = [];
                const tempParticipants = participants.map((p, idx) => ({ 
                  ...p, 
                  globalIndex: idx,
                  companyPositionText: getCompanyPositionText(p)
                }));
                for (let j = 0; j < tempParticipants.length; j += 2) {
                  tempRows.push(tempParticipants.slice(j, j + 2));
                }
                this.setData({ 
                  participants: tempParticipants, 
                  rows: tempRows,
                  loadingMore: true
                });
              }
            }
          }
        } else {
          // If it's already an array of user objects
          participants = openids;
        }
      }

      // Final update with all participants
      participants = participants.map((p, i) => ({ 
        ...p, 
        globalIndex: i,
        companyPositionText: getCompanyPositionText(p)
      }));
      const rows = [];
      for (let i = 0; i < participants.length; i += 2) {
        rows.push(participants.slice(i, i + 2));
      }
      
      this.setData({ 
        participants, 
        rows,
        loadingMore: false 
      });
      
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      console.error("Failed to load event details or participants:", error);
      wx.showToast({ title: '加载数据失败', icon: 'none' });
    }
  },

  // 点击参与者卡片 - Enhanced logic
  onParticipantTap: function(e) {
    if (!this.data.isLoggedIn) {
      const currentPath = `/pages/allParticipants/allParticipants?eventId=${this.data.eventId}`;
      wx.setStorageSync('loginRedirectUrl', currentPath);
      authUtils.promptLogin('登录后才能查看参与者详情和AI合作建议，是否前往登录？', null, () => {
        wx.showToast({ title: '可继续浏览', icon: 'none', duration: 1500 });
      });
      return;
    }

    const index = e.currentTarget.dataset.index;
    const participant = this.data.participants[index];
    if (!participant) {
      console.error("Participant not found at index:", index);
      return;
    }

    const currentUser = this.data.userInfo;
    const isSelf = currentUser && (
      (participant.openid && participant.openid === currentUser.openid) ||
      (participant._id && participant._id === currentUser._id) // Assuming _id might also be primary key
    );

    if (isSelf) {
      wx.navigateTo({ url: '/pages/profile/profile' });
      return;
    }

    const eventDataForDetail = {
      participant: participant,
      currentUser: currentUser,
      eventTitle: this.data.eventTitle,
      eventType: this.data.eventType,
      eventId: this.data.eventId
    };

    wx.navigateTo({
      url: `/pages/participantDetail/participantDetail?openid=${participant.openid || ''}&eventId=${this.data.eventId}`,
      events: {
        acceptDataFromOpenedPage: function(data) {
          console.log('From participantDetail (allParticipants):', data);
        }
      },
      success: function(res) {
        res.eventChannel.emit('acceptParticipantData', eventDataForDetail);
        console.log('Successfully navigated to participantDetail and sent data (allParticipants):', eventDataForDetail);
      },
      fail: function(err) {
        console.error('Navigation to participantDetail failed (allParticipants):', err);
        // Fallback or error handling
        // app.globalData.tempParticipantData = eventDataForDetail; 
        // wx.navigateTo({ url: `/pages/participantDetail/participantDetail?openid=${participant.openid || ''}&eventId=${this.data.eventId}` });
      }
    });
  },



  closeTagInputModal: function() {
    this.setData({
      showTagInputModal: false,
      selectedParticipant: null,
      inputRecommendTag: '',
      pendingRecommendTags: []
    });
  },

  onParticipantSelectForTag: async function(e) {
    if (!this.data.isLoggedIn) {
      const currentPath = `/pages/allParticipants/allParticipants?eventId=${this.data.eventId}`;
      wx.setStorageSync('loginRedirectUrl', currentPath);
      authUtils.promptLogin('登录后才能推荐标签，是否前往登录？', null, () => {
        wx.showToast({ title: '可继续浏览', icon: 'none', duration: 1500 });
      });
      return;
    }

    const index = e.currentTarget.dataset.index;
    const participant = this.data.participants[index];

    if (!participant) {
      console.error("Selected participant for tag not found at index:", index);
      wx.showToast({ title: '参与者信息错误', icon: 'none' });
      return;
    }

    // Check if recommending for self
    const currentUser = this.data.userInfo;
    const isSelf = currentUser && (
      (participant.openid && participant.openid === currentUser.openid) ||
      (participant._id && participant._id === currentUser._id)
    );

    if (isSelf) {
      wx.showToast({ title: '不能给自己推荐标签', icon: 'none' });
      return;
    }
    
    // Fetch existing recommendTags for the selected participant
    let existingTags = [];
    if (participant._id) { // Ensure participant has an _id for DB query
      try {
        const db = wx.cloud.database();
        const userRes = await db.collection('users').doc(participant._id).field({ recommendTags: true }).get();
        if (userRes.data && userRes.data.recommendTags) {
          existingTags = userRes.data.recommendTags;
        }
      } catch (err) {
        console.error("Failed to fetch existing recommendTags:", err);
        // Proceed without existing tags if fetch fails
      }
    }

    this.setData({
      selectedParticipant: { ...participant, recommendTags: existingTags }, // Store participant and their existing tags
      showTagInputModal: true,
      newRecommendTag: ''
    });
  },



  onRecommendTagInput: function(e) {
    this.setData({
      inputRecommendTag: e.detail.value
    });
  },

  // 添加推荐标签到待提交列表
  addRecommendTag: function() {
    const tag = this.data.inputRecommendTag.trim();
    if (!tag) return;
    
    if (this.data.pendingRecommendTags.includes(tag)) {
      wx.showToast({
        title: '标签已存在',
        icon: 'none'
      });
      return;
    }
    
    // 检查是否与已有推荐标签重复
    const existingTags = this.data.selectedParticipant.recommendTags || [];
    const tagExists = existingTags.some(existingTag => 
      existingTag.content === tag && existingTag.eventId === this.data.eventId
    );
    
    if (tagExists) {
      wx.showToast({
        title: '该标签已被推荐过',
        icon: 'none'
      });
      return;
    }
    
    const tags = this.data.pendingRecommendTags.concat([tag]);
    this.setData({
      pendingRecommendTags: tags,
      inputRecommendTag: ''
    });
  },

  // 从待提交列表中移除推荐标签
  removePendingRecommendTag: function(e) {
    const index = e.currentTarget.dataset.index;
    const tags = this.data.pendingRecommendTags.slice();
    tags.splice(index, 1);
    
    this.setData({
      pendingRecommendTags: tags
    });
  },

  // 删除已有的推荐标签
  removeExistingRecommendTag: async function(e) {
    const index = e.currentTarget.dataset.index;
    const { selectedParticipant, userInfo, eventId } = this.data;
    
    if (!selectedParticipant || !selectedParticipant.recommendTags) {
      return;
    }

    // 找到要删除的标签
    const tagToRemove = selectedParticipant.recommendTags[index];
    if (!tagToRemove || tagToRemove.eventId !== eventId) {
      return;
    }

    // 检查权限：只有标签推荐者才能删除
    if (!userInfo || (tagToRemove.recommenderId !== userInfo._id && tagToRemove.recommenderId !== userInfo.openid)) {
      wx.showToast({ title: '只能删除自己推荐的标签', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: `确定要删除推荐标签"${tagToRemove.content}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          
          try {
            const db = wx.cloud.database();
            
            // 从数组中移除该标签
            const updatedTags = selectedParticipant.recommendTags.filter((tag, i) => i !== index);
            
            // 更新数据库
            await db.collection('users').doc(selectedParticipant._id).update({
              data: {
                recommendTags: updatedTags
              }
            });
            
            // 更新本地数据
            const updatedParticipant = {
              ...selectedParticipant,
              recommendTags: updatedTags
            };
            
            this.setData({
              selectedParticipant: updatedParticipant
            });
            
            wx.hideLoading();
            wx.showToast({ title: '删除成功', icon: 'success' });
            
          } catch (error) {
            wx.hideLoading();
            console.error('删除推荐标签失败:', error);
            wx.showToast({ title: '删除失败，请重试', icon: 'none' });
          }
        }
      }
    });
  },

  submitTagRecommendation: async function() {
    const { selectedParticipant, pendingRecommendTags, userInfo, eventId } = this.data;
    
    if (pendingRecommendTags.length === 0) {
      wx.showToast({ title: '请添加推荐标签', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      
      // 更新用户的推荐标签 - 批量添加多个标签
      const existingTags = selectedParticipant.recommendTags || [];
      const newTagObjs = pendingRecommendTags.map(tagContent => ({
        content: tagContent,
        eventId: eventId,
        recommenderId: userInfo._id || userInfo.openid,
        recommenderName: userInfo.name || '匿名用户',
        createdAt: new Date()
      }));
      
      // 过滤掉已存在的标签
      const validNewTags = newTagObjs.filter(newTag => 
        !existingTags.some(existingTag => 
          existingTag.content === newTag.content && existingTag.eventId === eventId
        )
      );

      if (validNewTags.length > 0) {
        // 合并现有标签和新标签
        const finalTags = existingTags.concat(validNewTags);
        await db.collection('users').doc(selectedParticipant._id).update({
          data: {
            recommendTags: finalTags
          }
        });
        
        // 为每个新标签创建通知
        const notificationPromises = validNewTags.map(tagObj => 
          db.collection('notifications').add({
            data: {
              type: 'tag_recommendation',
              recipientId: selectedParticipant.openid,
              senderId: userInfo.openid,
              senderName: userInfo.name || '匿名用户',
              eventId: eventId,
              tag: tagObj.content,
              status: 'pending', // pending, accepted, ignored
              read: false,
              createdAt: new Date(),
              message: `${userInfo.name || '匿名用户'} 为您推荐了标签: ${tagObj.content}`
            }
          })
        );
        
        await Promise.all(notificationPromises);
      }

      wx.hideLoading();
      const successMessage = validNewTags.length > 0 
        ? `成功推荐 ${validNewTags.length} 个标签` 
        : '所有标签都已存在';
      wx.showToast({ title: successMessage, icon: 'success' });
      
      // 关闭模态框
      this.closeTagInputModal();
      
    } catch (error) {
      wx.hideLoading();
      console.error('提交标签推荐失败:', error);
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  }
});