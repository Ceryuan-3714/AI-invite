// 名片识别云函数
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { imageUrl } = event
  
  if (!imageUrl) {
    return {
      success: false,
      error: '缺少图片URL参数'
    }
  }
  
  try {
    // 调用豆包视觉API进行名片识别
    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      "model": "doubao-1.5-vision-pro-250328",
      "messages": [
        {
          "content": [
            {"text": "请识别这张名片图片中的信息，并以JSON格式返回。名片上可能有多个公司和职位的配对信息，请全部识别出来。请严格按照以下格式返回，如果某个信息无法识别，请写'未能识别'：\n{\n  \"姓名\": \"识别到的姓名\",\n  \"公司职位配对\": [\n    {\n      \"公司\": \"第一个公司名称\",\n      \"职位\": \"第一个职位\"\n    },\n    {\n      \"公司\": \"第二个公司名称\",\n      \"职位\": \"第二个职位\"\n    }\n  ],\n  \"电话\": \"识别到的电话号码\"\n}\n请只返回JSON格式的结果，不要包含其他文字说明。\n要求：\n1. 如果只有一个公司职位，也要放在数组中\n2. 电话号码识别后，只保留核心11位作为输出内容\n3. 请仔细识别名片上所有的公司和职位信息，有些人可能在多个公司任职",
              "type": "text"
            },
            {
              "image_url": {
                "url": imageUrl
              },
              "type": "image_url"
            }
          ],
          "role": "user"
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-doubao-api-key'
      }
    })
    
    // 解析API响应
    const apiResult = response.data
    if (apiResult && apiResult.choices && apiResult.choices[0] && apiResult.choices[0].message) {
      const content = apiResult.choices[0].message.content
      
      try {
        // 尝试解析JSON
        const recognizedInfo = JSON.parse(content)
        
        // 验证返回的数据格式
        const result = {
          姓名: recognizedInfo.姓名 || '未能识别',
          公司职位配对: recognizedInfo.公司职位配对 || [{ 公司: '未能识别', 职位: '未能识别' }],
          电话: recognizedInfo.电话 || '未能识别'
        }
        
        // 确保公司职位配对是数组格式
        if (!Array.isArray(result.公司职位配对)) {
          result.公司职位配对 = [{ 公司: '未能识别', 职位: '未能识别' }];
        }
        
        return {
          success: true,
          data: result
        }
      } catch (parseError) {
        console.error('解析API返回的JSON失败:', parseError)
        // 即使解析失败，也返回默认的数据结构
        return {
          success: true,
          data: {
            姓名: '未能识别',
            公司职位配对: [{ 公司: '未能识别', 职位: '未能识别' }],
            电话: '未能识别'
          },
          error: '解析识别结果失败，返回默认值',
          rawContent: content
        }
      }
    } else {
      return {
        success: true,
        data: {
          姓名: '未能识别',
          公司职位配对: [{ 公司: '未能识别', 职位: '未能识别' }],
          电话: '未能识别'
        },
        error: 'API返回格式异常，返回默认值',
        rawResponse: apiResult
      }
    }
    
  } catch (error) {
    console.error('名片识别失败:', error)
    return {
      success: true,
      data: {
        姓名: '未能识别',
        公司职位配对: [{ 公司: '未能识别', 职位: '未能识别' }],
        电话: '未能识别'
      },
      error: error.message || '名片识别服务异常，返回默认值'
    }
  }
}