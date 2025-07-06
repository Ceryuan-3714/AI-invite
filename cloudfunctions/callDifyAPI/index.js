const cloud = require('wx-server-sdk')
const request = require('request-promise')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// Dify API 配置
const DIFY_API_KEY = 'your-dify-api-key' // 请替换为你的 Dify API Key
// 确保使用正确的API端点和授权key格式
const DIFY_API_ENDPOINT = 'https://api.dify.ai/v1/chat-messages'

exports.main = async (event, context) => {
  try {
    // 获取传入的参数
    const { prompt } = event

    if (!prompt) {
      throw new Error('缺少必要参数: prompt')
    }
    
    // 准备请求数据，确保与Dify文档格式一致
    const requestData = {
      inputs: {}, // 必要的输入参数，即使为空
      query: prompt, // 用户提问
      response_mode: 'blocking', // 可以是 'streaming' 或 'blocking'
      conversation_id: null, // 使用null而非空字符串创建新会话
      user: 'default-user' // 用户标识符
    }

    console.log('发送到Dify的请求数据:', JSON.stringify(requestData))
    
    // 使用类似wx.request的方式调用API
    const response = await request({
      method: 'POST',
      uri: DIFY_API_ENDPOINT,
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: requestData,
      json: true // 自动转换JSON
    })

    console.log('Dify API 响应数据:', JSON.stringify(response))
    
    // 输出原始响应以便调试
    console.log('原始响应:', JSON.stringify(response));
    
    // 提取纯文本并自行清理
    let responseText = '';
    try {
      // 尝试不同方式提取文本
      if (response.answer) {
        responseText = response.answer;
      } else if (response.text) {
        responseText = response.text;
      } else if (typeof response === 'string') {
        responseText = response;
      } else {
        responseText = JSON.stringify(response);
      }
      
      // 如果是纯JSON字符串，尝试直接返回对象
      if (responseText.trim().startsWith('{') && responseText.trim().endsWith('}')) {
        return {
          success: true,
          data: responseText,
          isJson: true
        };
      }
    } catch (e) {
      console.error('处理响应文本时出错:', e);
      responseText = '无法获取有效响应';
    }
    
    // 返回纯文本响应
    return {
      success: true,
      data: responseText,
      isJson: false
    }

  } catch (error) {
    console.error('调用 Dify API 失败:', error.message)
    // 输出错误信息
    console.error('错误详情:', error)
    
    // 格式化错误响应，便于小程序端处理
    return {
      success: false,
      error: error.message || '调用 AI 服务失败',
      details: error.error || error
    }
  }
}