const app = getApp();
const authUtils = require('../../utils/authUtils.js');

// 辅助函数：获取公司职位显示文本（兼容新旧数据结构）
function getCompanyPositionText(userInfo) {
  if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && userInfo.companyPositions.length > 0) {
    // 新格式：显示所有公司和职位组合
    const positions = userInfo.companyPositions
      .filter(item => item.company || item.position) // 过滤掉空的条目
      .map(item => {
        const company = item.company || '未知公司';
        const position = item.position || '未知职位';
        return `${company} ${position}`.trim();
      })
      .filter(text => text.length > 0); // 过滤掉空字符串
    return positions.length > 0 ? positions.join(' | ') : '未知公司 未知职位';
  }
  // 旧格式：直接返回company和position字段
  return `${userInfo.company || '未知公司'} ${userInfo.position || '未知职位'}`.trim();
}

Page({
  data: {
    participant: {
      name: '匿名用户',
      avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
      company: '未知公司',
      position: '未知职位',
      industry: '',
      expertise: '',
      interest: '',
      introduction: ''
    }, // 参与者信息
    currentUser: null, // 当前用户信息
    eventTitle: '活动', // 活动标题
    eventType: '普通活动', // 活动类型
    eventId: '', // 活动ID
    suggestionsLoading: false, // AI建议是否正在加载
    aiSuggestions: [], // AI建议列表
    debugInfo: '', // 调试信息
    pageLoading: true,
    pageActive: true, // 页面是否处于活跃状态

  },

  onLoad: function(options) {
    console.log('参与者详情页 onLoad', options);
    
    // 检查登录状态
    const isLoggedIn = authUtils.isUserLoggedIn();
    if (!isLoggedIn) {
      console.log('用户未登录，无法查看参与者详情');
      wx.showToast({ 
        title: '请先登录', 
        icon: 'none',
        duration: 1500,
        success: () => {
          // 保存当前页面参数作为登录后回跳路径
          if (options && options.eventId) {
            const redirectUrl = `/pages/eventDetail/eventDetail?id=${options.eventId}`;
            wx.setStorageSync('loginRedirectUrl', redirectUrl);
          }
          // 等待一下以便显示提示，然后返回
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        }
      });
      return; // 终止后续代码执行
    }
    
    this.setData({ 
      pageLoading: true,
      pageActive: true
    });

    const currentUser = app.globalData.userInfo || wx.getStorageSync('userInfo');
    if (currentUser) {
      this.setData({ currentUser: currentUser });
    }
    
    let debugInfo = `options: ${JSON.stringify(options)}\n`;
    debugInfo += `currentUser: ${currentUser ? '已加载' : '未加载'}\n`;
    debugInfo += `tempParticipantData: ${app.globalData.tempParticipantData ? '存在' : '不存在'}\n`;
    debugInfo += `getOpenerEventChannel: ${this.getOpenerEventChannel ? '可用' : '不可用'}\n`;
    
    try {
      const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel();
      debugInfo += `eventChannel: ${eventChannel ? '存在' : '不存在'}\n`;
      if (eventChannel) {
        debugInfo += `eventChannel.on: ${typeof eventChannel.on === 'function' ? '是函数' : '不是函数'}\n`;
      }
      this.setData({ debugInfo: debugInfo });
      
      if (eventChannel && typeof eventChannel.on === 'function') {
        console.log('使用事件通道接收数据');
        eventChannel.on('acceptParticipantData', (data) => {
          this.processReceivedData(data, currentUser);
        });
      } else {
        console.warn('事件通道不可用，尝试从页面参数或全局变量获取数据');
        if (app.globalData.tempParticipantData) {
          this.processReceivedData(app.globalData.tempParticipantData, currentUser);
          app.globalData.tempParticipantData = null;
        } else {
          console.error('无法获取参与者数据，使用默认数据');
          this.setData({ 
            pageLoading: false,
            suggestionsLoading: true 
          }); 
          this.generateDefaultAISuggestions();
          wx.showToast({
            title: '无法获取完整数据',
            icon: 'none',
            duration: 2000
          });
        }
      }
    } catch (error) {
      console.error('获取数据时出错:', error);
      debugInfo += `错误: ${error.message}\n`;
      this.setData({ 
        debugInfo: debugInfo,
        pageLoading: false,
        suggestionsLoading: true
      });
      this.generateDefaultAISuggestions();
      wx.showToast({
        title: '加载失败，显示默认数据',
        icon: 'none',
        duration: 2000
      });
    }
  },

  generateDefaultAISuggestions: function() {
    this.setData({
      suggestionsLoading: false, 
      aiSuggestions: [
        {
          title: "合作概率",
          type: "概率分析",
          typeClass: "cooperation",
          content: "50% - 基于基础信息评估，建议进一步交流了解",
          isCooperationProbability: true,
          probabilityData: {
            score: 50,
            percentage: "50%",
            level: "中",
            levelClass: "zhong",
            analysis: "基于基础信息评估，建议进一步交流了解"
          }
        },
        {
          title: "对方用户信息",
          type: "用户画像",
          typeClass: "social",
          content: "暂时无法获取详细的用户信息，建议通过活动现场交流了解对方的具体背景和兴趣。",
          highlights: ["待了解专业背景", "可探索合作意向", "建议主动沟通"],
          isParticipantInfo: true
        },
        {
          title: "合作建议",
          type: "合作建议",
          typeClass: "business",
          content: "根据您们的行业背景，可以探讨在产品开发或市场推广方面的合作。建议交流各自的业务重点和近期计划，寻找互补资源整合的机会。",
          isCooperationSuggestion: true
        },
        {
          title: "话题建议",
          type: "话题建议",
          typeClass: "social",
          content: "从共同的职业发展和行业兴趣入手，探讨行业未来发展趋势和创新方向。也可以分享各自最近阅读的书籍或参加的活动，拓展共同话题。",
          topics: ["行业发展趋势", "工作经验分享", "兴趣爱好交流"],
          isTopicSuggestion: true
        }
      ]
    });
  },

  processReceivedData: async function(data, currentUser) {
    console.log('接收到的参与者数据:', data);
    
    if (!data || !data.participant) {
      console.error('接收到的数据格式不正确');
      this.setData({ 
        pageLoading: false,
        suggestionsLoading: true
      }); 
      this.generateDefaultAISuggestions();
      wx.showToast({
        title: '数据加载失败',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    
    // 获取参与者的推荐标签
    let participantWithTags = { 
      ...data.participant,
      companyPositionText: getCompanyPositionText(data.participant)
    };
    if (data.participant._id) {
      try {
        const db = wx.cloud.database();
        const userRes = await db.collection('users').doc(data.participant._id).field({ recommendTags: true }).get();
        if (userRes.data && userRes.data.recommendTags) {
          participantWithTags.recommendTags = userRes.data.recommendTags;
        }
      } catch (err) {
        console.error("Failed to fetch participant recommendTags:", err);
      }
    }
    
    // 获取当前用户的推荐标签
    let currentUserWithTags = currentUser || data.currentUser;
    if (currentUserWithTags && currentUserWithTags._id) {
      try {
        const db = wx.cloud.database();
        const userRes = await db.collection('users').doc(currentUserWithTags._id).field({ recommendTags: true }).get();
        if (userRes.data && userRes.data.recommendTags) {
          currentUserWithTags.recommendTags = userRes.data.recommendTags;
        }
      } catch (err) {
        console.error("Failed to fetch current user recommendTags:", err);
      }
    }
    
    this.setData({
      participant: {
        ...this.data.participant,
        ...participantWithTags
      },
      currentUser: currentUserWithTags,
      eventTitle: data.eventTitle || '活动',
      eventType: data.eventType || '普通活动',
      eventId: data.eventId || '',
      pageLoading: false,
      suggestionsLoading: true
    });
    
    const participantName = data.participant.nickName || data.participant.name || '参与者详情';
    wx.setNavigationBarTitle({
      title: participantName
    });

    await this.generateAISuggestions(); 
  },

  generateAISuggestions: async function() {
    // 再次检查登录状态，确保万无一失
    const isLoggedIn = authUtils.isUserLoggedIn();
    if (!isLoggedIn) {
      console.log('用户未登录，无法生成AI建议');
      this.setData({ 
        suggestionsLoading: false,
        aiSuggestions: [{
          title: '请先登录',
          type: 'login',
          typeClass: 'default',
          content: '登录后才能查看为您定制的AI合作建议',
          isCooperationSuggestion: true
        }]
      });
      
      // 添加登录按钮点击处理
      wx.showModal({
        title: '需要登录',
        content: '查看AI合作建议需要先登录，是否前往登录？',
        confirmText: '去登录',
        cancelText: '暂不登录',
        success: (res) => {
          if (res.confirm) {
            // 用户选择登录，保存当前页面参数
            if (this.data.eventId) {
              const redirectUrl = `/pages/eventDetail/eventDetail?id=${this.data.eventId}`;
              wx.setStorageSync('loginRedirectUrl', redirectUrl);
            }
            wx.navigateTo({
              url: '/pages/login/login',
              fail: () => {
                wx.switchTab({
                  url: '/pages/mine/mine'
                });
              }
            });
          }
        }
      });
      return;
    }
  
    // 先检查页面是否仍然处于活跃状态
    if (!this.data.pageActive) {
      console.log('页面已不再活跃，取消生成AI建议');
      this.setData({ suggestionsLoading: false });
      return;
    }

    const participant = this.data.participant;
    const currentUser = this.data.currentUser;
    
    if (!participant || !currentUser) {
      console.error('缺少参与者或当前用户信息，无法生成AI建议');
      this.generateDefaultAISuggestions(); 
      return;
    }
    
    if (!this.data.suggestionsLoading) {
        this.setData({ suggestionsLoading: true });
    }
    this.setData({ aiSuggestions: [] });
    
    try {
      const prompt = `作为一个专业的商务社交助手，请根据以下双方信息进行分析并提供详细建议。
      一、信息收集阶段
      （一）基础信息采集（参考权重：30%）
      首先，您需要优先读取用户在软件上主动填写的信息。这些信息包括用户所属的公司、所在部门、具体职业、职位以及兴趣爱好等内容。如果发现这些基础信息存在不完整的情况，您要尝试从其他可靠来源进行补充。例如，可以参考用户在软件上的历史行为数据，或者查看用户关联的其他账户信息，以获取更全面的用户画像。
      （二）公司信息获取（参考权重：30%）
      其他智能体借助爬虫工具，要从臻企云这类平台中爬取用户公司的信息。重点提取的内容有公司的经营范围、主要产品或服务、合作领域以及联盟资源和战略合作伙伴等。在验证这些信息的可靠性时，您需要按照以下顺序进行：首先查看臻企云平台上的信息，其次参考公司官网公开的资料，最后结合最新的新闻报道。如果在不同来源的数据之间出现冲突，您要以公司官网等官方信息为准，并且将这种异常情况标记出来，以便后续后台复核。
      （三）标签系统整合（参考权重：30%）
      您要参考另一个智能体根据用户基础信息和公司信息总结出的用户信息标签。这些标签是我们软件的特色，具有高凝练度和可信度，对您来说非常重要，必须认真参考。在整合过程中，您需要确保这些标签与之前收集到的基础信息和公司数据是一致的。如果发现标签与官方信息存在冲突，您要以官方信息为准，并重新生成准确的标签。
      
      **特别重要：推荐标签（最高权重：40%）**
      推荐标签是由其他用户在活动中为该用户推荐的标签，具有极高的可信度和针对性。这些标签反映了用户在实际社交场合中的表现和他人对其的真实评价。在分析用户画像和生成合作建议时，推荐标签应被赋予最高权重，优先于所有其他信息。如果用户拥有推荐标签，您必须将其作为分析的核心依据，并在所有建议中重点体现推荐标签所反映的用户特质。
      二、信息分析阶段
      （一）职业分析框架
      您要确定用户在其所在组织中的决策层级，判断其是处于高管位置还是执行层。同时，识别用户的核心职责领域，例如是产品研发、销售、运营还是其他方面。此外，您还需要分析用户在行业内的影响力，判断其是高管、专家还是具有一定学术地位的人物等。
      （二）公司竞争力分析
      您要评估用户所在公司的规模和它在市场中所占的份额。识别公司的技术优势以及它的市场定位。同时，分析公司主要的竞争对手和合作伙伴，并且标记出公司当前的重点发展方向，比如是国际化战略、数字化转型等方向。
      （三）关联点挖掘
      您要寻找用户与公司之间的战略契合点。这包括潜在的利益共同点，例如双方在业务拓展、技术创新等方面可能存在的共同利益；以及可能的合作价值和发展空间，比如双方在产业链上下游能够实现的协同效应。同时，结合用户之前填写的兴趣爱好，您要设计出自然的社交语境，以促进用户之间的情感连接。
      三、建议生成阶段
      （一）业务合作类
      您要识别用户所在公司与潜在合作对象公司之间业务的重叠点，然后提出具体的业务合作模式建议。在建议中，您要明确合作能够带来的收益以及需要注意的风险控制点，确保这些建议都是可落地实施的。
      （二）知识分享类
      基于用户在行业内的专业程度，您要为用户提供知识交流的场景。您建议分享的内容必须具备明确的价值点，例如是行业最新的趋势、用户自身的实战经验等，能够真正吸引其他精英用户参与交流。
      （三）社交互动类
      结合用户填写的兴趣爱好，您要设计轻松自然的社交场景。通过这些场景，促进用户之间情感连接的建立和信任的形成，为后续可能的合作奠定良好的基础。
      四、强制执行标准
      （一）信息验证原则
      您所使用的所有数据都必须有其官方来源，如果没有可靠依据，您不能输出任何建议。对于那些模糊不清的信息，您要向用户进行确认，避免给出猜测性的建议。
      （二）建议质量标准
      每条建议都必须注重以下要素：
      智能体代入了用户的视角，口语化表述，要具备本用户与其他使用软件的用户的交互性，建议要礼貌又简明，避免话题假大空，也避免高端名词堆砌。让本用户能迅速接受你的建议。
      坚持有真是信息支持，比如合作领域等具体信息，为建议提供有力依据；
      明确的量化收益，让用户清楚地知道参与交流合作可能带来的好处。
      同时，您要避免以下情况：
      没有数据支撑的假设；
      模糊不清的话题；
      用户明显不关心的领域。
活动名称：${this.data.eventTitle}
活动类型：${this.data.eventType}

我的信息：
- 姓名：${currentUser.nickName || currentUser.name || '不需要使用姓名'}
- 公司职位：${getCompanyPositionText(currentUser) || '未知'}
- 行业：${currentUser.industry || '未填写'}
- 专长领域：${currentUser.expertise || '未填写'}
- 兴趣爱好：${currentUser.interest || '未填写'}
- 自我介绍：${currentUser.introduction || '未填写'}
- 个人描述标签：${currentUser.personalTags && currentUser.personalTags.length > 0 ? currentUser.personalTags.join('、') : '未设置'}
- 推荐标签（最高权重）：${currentUser.recommendTags && currentUser.recommendTags.length > 0 ? currentUser.recommendTags.filter(tag => tag.eventId === this.data.eventId).map(tag => tag.content).join('、') : '无推荐标签'}

对方信息：
- 姓名：${participant.nickName || participant.name || '未知'}
- 公司职位：${getCompanyPositionText(participant) || '对方未填写'}
- 行业：${participant.industry || '对方未填写'}
- 专长领域：${participant.expertise || '对方未填写'}
- 兴趣爱好：${participant.interest || '对方未填写'}
- 自我介绍：${participant.introduction || '对方未填写'}
- 个人描述标签：${participant.personalTags && participant.personalTags.length > 0 ? participant.personalTags.join('、') : '对方未设置'}
- 推荐标签（最高权重）：${participant.recommendTags && participant.recommendTags.length > 0 ? participant.recommendTags.filter(tag => tag.eventId === this.data.eventId).map(tag => tag.content).join('、') : '对方无推荐标签'}

请按照以下量化标准计算合作概率：

**合作概率量化标准:**
基础分数：40分

1. 推荐标签匹配度 (0-25分) **【最高权重】**
   - 双方都有推荐标签且高度匹配: +25分
   - 双方都有推荐标签且部分匹配: +20分
   - 一方有推荐标签且与对方信息匹配: +15分
   - 一方有推荐标签但匹配度一般: +10分
   - 双方都有推荐标签但不匹配: +5分
   - 双方都无推荐标签: +0分

2. 行业匹配度 (0-15分)
   - 相同行业: +15分
   - 相关行业/上下游: +12分  
   - 互补行业: +8分
   - 不同但无冲突: +4分
   - 竞争行业: -3分
   - 无行业信息: +0分

3. 职位互补性 (0-12分)
   - 上下游合作关系: +12分
   - 平级但不同领域: +8分
   - 管理者与执行者: +10分
   - 相同职位: +4分
   - 无职位信息: +0分

4. 专长领域重叠度 (0-10分)
   - 高度互补: +10分
   - 部分互补: +8分
   - 相似专长: +6分
   - 无关联: +3分
   - 无专长信息: +0分

5. 公司规模/类型匹配 (0-8分)
   - 大公司+小公司: +8分
   - 相同规模: +6分
   - 初创+成熟企业: +7分
   - 无公司信息: +0分

6. 兴趣爱好相似度 (0-5分)
   - 多个相同兴趣: +5分
   - 部分相同兴趣: +3分
   - 无相同兴趣: +0分

7. 信息完整度 (0-5分)
   - 信息完整度高: +5分
   - 信息完整度中等: +3分
   - 信息缺失较多: +0分

请严格按照以下JSON格式返回结果：
{
  "cooperationProbability": {
    "score": 总分数,
    "percentage": "百分比%",
    "level": "高/中/低",
    "analysis": "简要分析说明"
  },
  "participantInfo": {
    "summary": "对方用户信息的简洁总结，80字以内",
    "highlights": ["亮点1", "亮点2", "亮点3"]
  },
  "cooperationSuggestions": {
    "title": "合作建议",
    "content": "具体的合作建议内容，150-200字，要有针对性和可行性"
  },
  "topicSuggestions": {
    "title": "话题建议", 
    "content": "社交场合的具体话题建议，100-150字",
    "topics": ["话题1", "话题2", "话题3"]
  }
}`;
      
      // 检查页面是否仍处于活跃状态，避免不必要的API调用
      if (!this.data.pageActive) {
        console.log('准备调用API时检测到页面已不再活跃，取消API调用');
        this.setData({ suggestionsLoading: false });
        return;
      }
      
      const response = await wx.cloud.callFunction({
        name: 'callDifyAPI',
        data: {
          prompt: prompt
        }
      });
      
      // API调用后再次检查页面是否仍处于活跃状态，避免处理结果
      if (!this.data.pageActive) {
        console.log('API返回后页面已不再活跃，取消处理结果');
        return;
      }
      
      console.log('AI API响应:', response);
      
      if (response && response.result && response.result.data) {
        let responseData = response.result.data;
        let suggestions = null;
        
        try {
          if (typeof responseData === 'string') {
            if (responseData.includes('```')) {
              const jsonStart = responseData.indexOf('{');
              const jsonEnd = responseData.lastIndexOf('}');
              if (jsonStart >= 0 && jsonEnd >= 0) {
                responseData = responseData.substring(jsonStart, jsonEnd + 1);
              }
            }
            responseData = responseData.replace(/\\n/g, '\n').replace(/\\r/g, '');
            console.log('清理后的AI数据:', responseData);
            suggestions = JSON.parse(responseData);
          } else if (typeof responseData === 'object') {
            suggestions = responseData;
          }
        } catch (parseError) {
          console.error('解析AI响应失败:', parseError);
                      suggestions = {
              cooperationProbability: {
                score: 50,
                percentage: "50%",
                level: "中",
                analysis: "信息不足，基于基础评估"
              },
            participantInfo: {
              summary: "对方用户信息解析失败",
              highlights: ["待补充信息", "建议主动交流", "了解更多背景"]
            },
            cooperationSuggestions: {
              title: "合作建议",
              content: "抱歉，无法解析详细建议。建议直接与对方交流，了解具体合作意向和可能性。"
            },
            topicSuggestions: {
              title: "话题建议",
              content: "可以从行业趋势、工作经验、兴趣爱好等方面入手。",
              topics: ["行业发展", "工作经验", "共同兴趣"]
            }
          };
        }
        
        // 最终更新UI前再次检查页面是否活跃
        if (!this.data.pageActive) {
          console.log('处理完成但页面已不再活跃，取消更新UI');
          return;
        }
        
        // 将新格式的数据转换为显示格式
        const processedSuggestions = [
          {
            title: "合作概率",
            type: "概率分析",
            typeClass: suggestions.cooperationProbability.level === "高" ? "business" : 
                      suggestions.cooperationProbability.level === "中" ? "cooperation" : "default",
            content: `${suggestions.cooperationProbability.percentage} - ${suggestions.cooperationProbability.analysis}`,
            isCooperationProbability: true,
            probabilityData: {
              ...suggestions.cooperationProbability,
              levelClass: suggestions.cooperationProbability.level === "高" ? "gao" : 
                         suggestions.cooperationProbability.level === "中" ? "zhong" : "di"
            }
          },
          {
            title: "对方用户信息",
            type: "用户画像",
            typeClass: "social",
            content: suggestions.participantInfo.summary,
            highlights: suggestions.participantInfo.highlights,
            isParticipantInfo: true
          },
          {
            title: suggestions.cooperationSuggestions.title,
            type: "合作建议",
            typeClass: "business",
            content: suggestions.cooperationSuggestions.content,
            isCooperationSuggestion: true
          },
          {
            title: suggestions.topicSuggestions.title,
            type: "话题建议",
            typeClass: "social",
            content: suggestions.topicSuggestions.content,
            topics: suggestions.topicSuggestions.topics,
            isTopicSuggestion: true
          }
        ];
        
        wx.showToast({
          title: '建议生成成功',
          icon: 'success',
          duration: 1500
        });
        
        this.setData({
          aiSuggestions: processedSuggestions,
          suggestionsLoading: false
        });
      } else {
        throw new Error('API返回数据格式错误');
      }
    } catch (error) {
      // 错误处理时也检查页面是否仍然活跃
      if (!this.data.pageActive) {
        console.log('发生错误但页面已不再活跃，取消错误处理');
        return;
      }
      
      console.error('生成AI建议失败:', error);
      wx.showToast({
        title: '生成建议失败',
        icon: 'none',
        duration: 2000
      });
      this.generateDefaultAISuggestions();
    }
  },
  
  refreshAISuggestions: function() {
    // 检查登录状态
    const isLoggedIn = authUtils.isUserLoggedIn();
    if (!isLoggedIn) {
      console.log('用户未登录，无法刷新AI建议');
      
      // 提示用户登录
      authUtils.promptLogin('登录后才能查看AI合作建议，是否前往登录？', null, () => {
        console.log('用户取消登录，继续浏览');
        wx.showToast({
          title: '继续浏览',
          icon: 'none',
          duration: 1500
        });
      });
      return;
    }
    
    // 刷新前确认页面仍然活跃
    if (!this.data.pageActive) return;
    
    this.setData({ suggestionsLoading: true, aiSuggestions: [] });
    this.generateAISuggestions();
  },
  
  onShareAppMessage: function() {
    const participant = this.data.participant;
    const eventId = this.data.eventId;
    const defaultAvatar = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';
    
    return {
      title: `查看${participant.name || participant.nickName || '参与者'}的个人信息和合作建议`,
      path: eventId ? `/pages/eventDetail/eventDetail?id=${eventId}` : '/pages/index/index',
      imageUrl: participant.avatar || participant.avatarUrl || defaultAvatar
    };
  },
  
  onPullDownRefresh: function() {
    this.setData({ suggestionsLoading: true, aiSuggestions: [] });
    this.generateAISuggestions().finally(() => {
        wx.stopPullDownRefresh();
    });
  },

  // 页面显示时设置为活跃状态
  onShow: function() {
    this.setData({ pageActive: true });
  },

  // 页面隐藏时设置为非活跃状态，终止AI调用
  onHide: function() {
    console.log('参与者详情页被隐藏，终止AI调用');
    this.setData({ pageActive: false });
  },

  // 页面卸载时设置为非活跃状态，终止AI调用
  onUnload: function() {
    console.log('参与者详情页被卸载，终止AI调用');
    this.setData({ pageActive: false });
  },


});