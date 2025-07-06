const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const rp = require('request-promise'); // 需要安装此依赖

// 获取access_token的函数
async function getAccessToken() {
  try {
    // 从云环境中读取小程序appid和secret，避免硬编码
    // 您需要将下面的appid和secret替换为您实际的小程序凭证
    const { APPID, SECRET } = await cloud.getWXContext();
    const appid = process.env.APPID || APPID; // 优先使用环境变量
    const secret = process.env.SECRET || 'your-miniprogram-secret'; // 请替换为实际的secret
    
    console.log('[generateEventQRCode] 即将获取access_token，使用appid:', appid);
    
    // 从微信服务器获取access_token
    const result = await rp({
      method: 'GET',
      url: `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`,
      json: true
    });
    
    if (result.access_token) {
      console.log('[generateEventQRCode] 成功获取access_token');
      return result.access_token;
    } else {
      throw new Error('获取access_token失败: ' + JSON.stringify(result));
    }
  } catch (error) {
    console.error('[generateEventQRCode] 获取access_token异常:', error);
    throw error;
  }
}

// 生成唯一的QrCodeId
function generateQrCodeId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = 'QR';
  const length = 8; // QrCodeId长度为8位
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

// 云函数入口函数
exports.main = async (event, context) => {
  // 从客户端接收参数，确保 page 和 scene 被正确传递和使用
  const { eventId, page = 'pages/checkinSuccess/checkinSuccess', scene, qrNamePrefix, envVersion = 'release', name, isManagementQR = false } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    console.log(`[generateEventQRCode] 开始处理，接收参数: eventId=${eventId}, page=${page}, scene=${scene}`);

    // 1. 检查参数 (eventId 必须存在)
    if (!eventId) {
      return { success: false, message: '缺少活动ID参数' };
    }

    // 1.5. 生成唯一的QrCodeId
    const qrCodeId = generateQrCodeId();
    console.log(`[generateEventQRCode] 生成QrCodeId: ${qrCodeId}`);

    // 2. 查询活动信息，获取或生成 shortId
    let shortId;
    let existingEvent = null;
    
    if (scene) {
      // 如果客户端直接提供了scene参数，使用它
      shortId = scene;
      console.log(`[generateEventQRCode] 使用客户端提供的scene参数: ${shortId}`);
    } else {
      try {
        // 尝试从数据库获取活动信息
        const event = await db.collection('events').doc(eventId).get();
        existingEvent = event.data;
        
        if (event && event.data) {
          // 如果活动存在，检查是否已有 shortId
          shortId = event.data.shortId;
          
          if (!shortId) {
            // 如果没有 shortId，生成一个唯一的并更新活动
            let attempts = 0;
            const maxAttempts = 10;
            
            do {
              shortId = 'E' + generateShortId().substring(1); // 添加E前缀
              attempts++;
              
              // 检查是否已存在
              const exists = await checkShortIdExists(shortId);
              if (!exists) {
                break; // 找到唯一的shortId
              }
              
              if (attempts >= maxAttempts) {
                throw new Error('生成唯一shortId失败，请重试');
              }
            } while (attempts < maxAttempts);
            
            // 更新活动记录，添加 shortId
            await db.collection('events').doc(eventId).update({
              data: {
                shortId: shortId,
                updatedAt: db.serverDate()
              }
            });
            
            console.log(`[generateEventQRCode] 为活动生成了新的shortId: ${shortId}`);
          } else {
            console.log(`[generateEventQRCode] 使用活动已有的shortId: ${shortId}`);
          }
        } else {
          return { success: false, message: '未找到活动信息' };
        }
      } catch (dbError) {
        console.error('[generateEventQRCode] 数据库操作失败:', dbError);
        return { success: false, message: '查询活动信息失败', error: dbError };
      }
    }

    // 3. 构造场景值，使用 sid=shortId&qid=qrCodeId 格式
    const formattedScene = `sid=${shortId}&qid=${qrCodeId}`; // 添加QrCodeId到场景参数

    console.log(`[generateEventQRCode] 使用短ID "${shortId}" 和QrCodeId "${qrCodeId}" 为页面 "${page}" 生成二维码`);

    // 3.5. 删除原有的二维码文件（如果存在）
    if (existingEvent && existingEvent.qrCodePath) {
      try {
        await cloud.deleteFile({
          fileList: [existingEvent.qrCodePath]
        });
        console.log(`[generateEventQRCode] 已删除原有二维码文件: ${existingEvent.qrCodePath}`);
      } catch (deleteError) {
        console.warn(`[generateEventQRCode] 删除原有二维码文件失败: ${deleteError.message}`);
        // 删除失败不影响后续流程，继续生成新二维码
      }
    }

    try {
      // 获取access_token
      const accessToken = await getAccessToken();
       console.log("路径："+page+formattedScene);
       // 使用HTTP方式调用微信API生成小程序码
      const qrcodeResult = await rp({
        method: 'POST',
        url: `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`,
        body: {
          scene: formattedScene,
          page: page,
          check_path: false,
          env_version: envVersion
        },
        json: true,
        encoding: null  // 必须设置为null才能正确接收二进制响应
      });
      
      // 检查返回是否为JSON格式的错误信息
      let isError = false;
      let errorObj = null;
      
      try {
        // 尝试将返回内容解析为JSON，如果成功则说明返回的是错误信息而非图片
        const textDecoder = new TextDecoder('utf-8');
        const jsonString = textDecoder.decode(Buffer.from(qrcodeResult));
        errorObj = JSON.parse(jsonString);
        isError = true;
      } catch (e) {
        // 解析JSON失败，说明返回的是正常的二进制图片数据
        isError = false;
      }
      
      if (isError && errorObj) {
        console.error('[generateEventQRCode] 生成小程序码API调用失败:', errorObj);
        return { 
          success: false, 
          message: `生成小程序码失败: ${errorObj.errmsg || '未知错误'}`, 
          errorData: errorObj 
        };
      }
      
      // 4. 上传小程序码到云存储
      const qrCodeName = `${qrNamePrefix || 'qr'}_${shortId}_${Date.now()}.jpg`;
      const cloudPath = `qrcodes/${qrCodeName}`;
      
      // 上传文件到云存储
      const uploadResult = await cloud.uploadFile({
        cloudPath: cloudPath,
        fileContent: qrcodeResult, // 二进制图片数据
      });
      
      if (uploadResult.fileID) {
        // 5. 获取小程序码的临时URL
        const tempUrlResult = await cloud.getTempFileURL({
          fileList: [uploadResult.fileID]
        });
        
        if (tempUrlResult.fileList && tempUrlResult.fileList.length > 0) {
          const qrCodeUrl = tempUrlResult.fileList[0].tempFileURL;
          const qrCodePath = `${page}?sid=${shortId}&qid=${qrCodeId}`;
          
          // 如果是管理页面的二维码，保存到eventQRCodes集合
          if (isManagementQR) {
            await db.collection('eventQRCodes').add({
              data: {
                eventId: eventId,
                name: name || `二维码${Date.now()}`,
                qrCodeUrl: uploadResult.fileID, // 只保存fileID，不保存临时URL
                qrCodePath: qrCodePath,
                shortId: shortId,
                qrCodeId: qrCodeId, // 添加QrCodeId字段
                count: 0, // 初始化访问计数为0
                status: 'active',
                createTime: db.serverDate(),
                creatorOpenid: openid
              }
            });
            console.log(`[generateEventQRCode] 已保存二维码到eventQRCodes集合，fileID: ${uploadResult.fileID}`);
          } else {
            // 更新活动记录，保存二维码URL和文件ID
            await db.collection('events').doc(eventId).update({
              data: {
                qrCodeUrl: qrCodeUrl,
                qrCodePath: uploadResult.fileID, // 存储云存储文件ID用于删除
                qrCodePagePath: qrCodePath, // 存储页面路径用于跳转
                updatedAt: db.serverDate()
              }
            });
            console.log(`[generateEventQRCode] 已更新活动记录，保存二维码信息: ${qrCodeUrl}`);
          }
          
          return {
            success: true,
            message: '成功生成小程序码',
            qrCodeUrl: qrCodeUrl,
            qrCodePath: qrCodePath,
            shortId: shortId,
            qrCodeId: qrCodeId, // 返回QrCodeId
            fileID: uploadResult.fileID
          };
        }
      }
      
      throw new Error('获取小程序码URL失败');
    } catch (apiError) {
      console.error('[generateEventQRCode] 调用微信API或上传小程序码失败:', apiError);
      return { 
        success: false, 
        message: apiError.message || '生成或上传小程序码失败', 
        errorData: apiError 
      };
    }
  } catch (error) {
    console.error('[generateEventQRCode] 处理二维码生成请求时发生严重错误:', error);
    return { success: false, message: error.message || '生成小程序码失败', errorCode: error.errCode };
  }
};

/**
 * 生成6位短ID，用于活动唯一标识
 * 结合字母和数字，便于在二维码scene中使用
 * @returns {string} 6位短ID
 */
function generateShortId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // 移除容易混淆的字符
  let result = '';
  const length = 6; // 短ID长度为6位
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

/**
 * 检查短ID是否已存在
 * @param {string} shortId 要检查的短ID
 * @returns {Promise<boolean>} 是否存在
 */
async function checkShortIdExists(shortId) {
  try {
    const result = await db.collection('events').where({
      shortId: shortId
    }).count();
    
    return result.total > 0;
  } catch (error) {
    console.error('检查短ID是否存在失败', error);
    return false; // 出错时假设不存在，继续流程
  }
}