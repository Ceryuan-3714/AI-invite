Component({
  properties: {
    iconPath: {
      type: String,
      value: '/images/assistant.png'
    },
    visible: {
      type: Boolean,
      value: true
    }
  },
  
  data: {
    showChatBox: false,
    inputText: '',
    messages: [
      {
        type: 'assistant',
        content: '您好！我是您的智能小助理，可以为您提供各种邀约社交相关的帮助和建议。请问有什么可以帮您的吗？'
      }
    ]
  },
  
  methods: {
    // 切换聊天框显示状态
    toggleChatBox() {
      this.setData({
        showChatBox: !this.data.showChatBox
      });
      
      // 触发事件，通知页面组件聊天框状态已改变
      this.triggerEvent('toggleChat', { isOpen: this.data.showChatBox });
    },
    
    // 处理输入变化
    onInputChange(e) {
      this.setData({
        inputText: e.detail.value
      });
    },
    
    // 发送消息
    sendMessage() {
      const { inputText } = this.data;
      if (!inputText.trim()) return;
      
      // 添加用户消息
      const newMessages = [...this.data.messages, {
        type: 'user',
        content: inputText
      }];
      
      this.setData({
        messages: newMessages,
        inputText: ''
      });
      
      // 模拟助手回复
      setTimeout(() => {
        this.replyMessage(inputText);
      }, 500);
      
      // 触发消息发送事件，通知页面组件
      this.triggerEvent('sendMessage', { message: inputText });
    },
    
    // 助手回复消息
    replyMessage(userMessage) {
      // 这里可以接入实际的 AI 回复逻辑，现在先用简单的回复
      let reply = '';
      
      if (userMessage.includes('活动') || userMessage.includes('邀约')) {
        reply = '您想了解关于活动或邀约的哪些内容呢？我可以帮您创建活动、管理邀请或提供活动建议。';
      } else if (userMessage.includes('客户') || userMessage.includes('联系人')) {
        reply = '您需要管理客户信息吗？您可以在"客户管理"中添加、编辑和分类您的客户信息。';
      } else if (userMessage.includes('话题') || userMessage.includes('建议')) {
        reply = '我可以为您生成个性化的社交话题和互动建议，帮助您在活动中更好地与他人交流。';
      } else {
        reply = '感谢您的问题。目前该功能仍在开发中，我们将很快提供更多智能服务。请问还有其他我可以帮助您的吗？';
      }
      
      const newMessages = [...this.data.messages, {
        type: 'assistant',
        content: reply
      }];
      
      this.setData({
        messages: newMessages
      });
    }
  }
}) 