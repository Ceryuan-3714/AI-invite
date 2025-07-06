// suggestions.js
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    currentEvent: null,
    loading: false,
    suggestions: [],
    animationPlayed: false,
    companyPositionText: '',
    recommendParticipants: [
      { id: "p001", name: "王强", company: "腾讯科技", position: "产品总监", avatar: "/images/avatar1.jpg" },
      { id: "p002", name: "李明", company: "阿里巴巴", position: "技术VP", avatar: "/images/avatar2.jpg" },
      { id: "p003", name: "张华", company: "字节跳动", position: "商务总监", avatar: "/images/avatar3.jpg" },
      { id: "p004", name: "刘芳", company: "百度", position: "AI研究员", avatar: "/images/avatar4.jpg" },
      { id: "p005", name: "陈建", company: "华为", position: "销售总监", avatar: "/images/avatar5.jpg" }
    ]
  },
  
  // 获取公司职位显示文本（兼容新旧数据结构）
  getCompanyPositionText: function(userInfo) {
    if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && userInfo.companyPositions.length > 0) {
      // 新格式：显示第一个公司和职位
      const first = userInfo.companyPositions[0];
      return `${first.company} · ${first.position}`;
    }
    // 旧格式：直接返回company和position字段
    return `${userInfo.company || ''} · ${userInfo.position || ''}`;
  },

  onLoad: function() {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo,
        currentEvent: app.globalData.currentEvent,
        hasUserInfo: true,
        companyPositionText: this.getCompanyPositionText(app.globalData.userInfo)
      })
    }

    // 添加页面进入动画效果
    this.animateProgressBars = setTimeout(() => {
      this.setData({
        animationPlayed: true
      })
    }, 500)
  },
  
  onShow: function() {
    // Check if user has profile info
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({
        userInfo: userInfo,
        currentEvent: app.globalData.currentEvent,
        hasUserInfo: true,
        companyPositionText: this.getCompanyPositionText(userInfo)
      })
      app.globalData.userInfo = userInfo
      
      // If we have user info, get suggestions
      this.getSuggestions()
    } else {
      this.setData({
        hasUserInfo: false
      })
      
      // Redirect to profile page if no user info
      wx.showModal({
        title: '需要个人信息',
        content: '请先完善您的个人资料，以便我们为您提供精准的社交推荐',
        showCancel: false,
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/profile/profile'
            })
          }
        }
      })
    }
  },

  onUnload: function() {
    // 清除所有定时器
    if (this.animateProgressBars) {
      clearTimeout(this.animateProgressBars)
    }
  },
  
  goToProfile: function() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    })
  },
  
  getSuggestions: function() {
    this.setData({ loading: true })
    
    // This function would call the Dify API to get suggestions
    this.getAISuggestions(this.data.userInfo, this.data.recommendParticipants)
      .then(suggestions => {
        // 为了视觉效果，添加200ms延迟
        setTimeout(() => {
        this.setData({
          suggestions: suggestions,
          loading: false
        })
          
          // 触发进度条动画
          setTimeout(() => {
            this.setData({
              animationPlayed: true
            })
          }, 300)
        }, 200)
      })
      .catch(error => {
        console.error('Error getting suggestions:', error)
        wx.showToast({
          title: '获取推荐失败',
          icon: 'none'
        })
        this.setData({ loading: false })
      })
  },
  
  // This function would be replaced with an actual call to the Dify API
  getAISuggestions: function(currentUserProfile, otherParticipants) {
    return new Promise((resolve, reject) => {
      // In a real implementation, this would be a wx.request to the Dify API
      // For now, we'll simulate a response with mock data
      
      // Simulating API call delay
      setTimeout(() => {
        try {
          // This is where the actual API call would go
          /*
          wx.request({
            url: `${app.globalData.apiBaseUrl}/chat-messages`,
            method: 'POST',
            header: {
              'Authorization': `Bearer ${app.globalData.apiKey}`,
              'Content-Type': 'application/json'
            },
            data: {
              inputs: {
                current_user: {
                  name: currentUserProfile.name,
                  company: currentUserProfile.company,
                  position: currentUserProfile.position
                },
                participants: otherParticipants
              },
              query: "给我推荐最有价值的社交对象并提供交流话题和建议",
              response_mode: "streaming",
              conversation_id: ""
            },
            success: (res) => {
              // Process the response from Dify
              resolve(res.data.suggestions);
            },
            fail: (error) => {
              reject(error);
            }
          });
          */
          
          // For now, return sample data with enhanced fields
          const mockSuggestions = [
            {
              person: {
                ...otherParticipants[1],
                avatar: "/images/avatar2.jpg"
              },
              topics: ["云计算技术合作", "数字化转型", "人工智能应用"],
              probability: 92,
              script: "您好李总，我注意到您在阿里负责技术方向，我们公司正在推进数字化转型项目，或许我们可以探讨一下行业发展趋势和云计算技术的最新应用？"
            },
            {
              person: {
                ...otherParticipants[3],
                avatar: "/images/avatar4.jpg"
              },
              topics: ["AI应用场景", "算法创新", "行业生态"],
              probability: 86,
              script: "刘博士您好，我对贵公司在AI领域的研究很感兴趣，特别是在实际商业场景中的应用，不知道有没有机会请教一下您的见解和对未来技术发展方向的看法？"
            },
            {
              person: {
                ...otherParticipants[0],
                avatar: "/images/avatar1.jpg"
              },
              topics: ["产品策略", "用户增长", "商业模式创新"],
              probability: 78,
              script: "王总您好，我一直很欣赏腾讯的产品策略，尤其是在用户增长方面的成功案例。我们公司最近也在思考相关问题，希望有机会能向您学习一下产品运营的经验。"
            },
            {
              person: {
                ...otherParticipants[2],
                avatar: "/images/avatar3.jpg"
              },
              topics: ["内容生态", "市场营销", "战略合作"],
              probability: 75,
              script: "张总您好，字节跳动在内容生态方面取得的成就令人瞩目，我们公司正在探索相关领域的业务机会，非常希望能与您交流一下对行业趋势的看法。"
            }
          ]
          
          resolve(mockSuggestions)
        } catch (err) {
          reject(err)
        }
      }, 1500)
    })
  },
  
  // 发送邀约
  sendInvite: function(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    const company = e.currentTarget.dataset.company || '';
    const avatar = e.currentTarget.dataset.avatar || '/images/avatar1.jpg';
    
    // 添加视觉反馈
    wx.showLoading({
      title: '准备邀约...',
    })
    
    setTimeout(() => {
      wx.hideLoading()
    // 直接导航到createEvent页面的"发起单约"标签页，并传递客户信息
    wx.navigateTo({
      url: '/pages/createEvent/createEvent?tab=oneToOne&clientId=' + id + 
           '&clientName=' + name + 
           '&clientCompany=' + company + 
           '&clientAvatar=' + avatar
    });
    }, 300)
  },
  
  // 跳转到客户管理页面
  goToClientManage: function() {
    wx.navigateTo({
      url: '/pages/clientManage/clientManage'
    })
  },
  
  refreshSuggestions: function() {
    // 添加视觉反馈
    const animation = wx.createAnimation({
      duration: 500,
      timingFunction: 'linear',
    })
    
    animation.rotate(360).step()
    
    this.setData({
      refreshAnimation: animation.export(),
      animationPlayed: false
    })
    
    this.getSuggestions()
  },

  // 显示更多客户详情
  showPersonDetail: function(e) {
    const index = e.currentTarget.dataset.index
    const person = this.data.suggestions[index].person
    
    wx.navigateTo({
      url: '/pages/clientDetail/clientDetail?id=' + person.id
    })
  }
})