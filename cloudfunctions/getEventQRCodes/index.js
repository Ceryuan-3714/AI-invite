const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { eventId } = event;
  
  if (!eventId) {
    return {
      success: false,
      message: '缺少活动ID参数'
    };
  }

  try {
    // 获取当前用户信息
    const wxContext = cloud.getWXContext();
    const userOpenid = wxContext.OPENID;

    if (!userOpenid) {
      return {
        success: false,
        message: '用户未登录'
      };
    }

    // 验证用户是否为活动创建者
    const eventResult = await db.collection('events').doc(eventId).get();
    
    if (!eventResult.data) {
      return {
        success: false,
        message: '活动不存在'
      };
    }

    const event = eventResult.data;
    if (event.creatorOpenid !== userOpenid) {
      return {
        success: false,
        message: '只有活动创建者可以管理二维码'
      };
    }

    // 查询该活动的所有二维码
    const qrCodesResult = await db.collection('eventQRCodes')
      .where({
        eventId: eventId
      })
      .orderBy('createTime', 'desc')
      .get();

    // 获取所有二维码文件的临时URL
    const fileIDs = qrCodesResult.data.map(qr => qr.qrCodeUrl).filter(id => id);
    let tempUrlMap = {};
    
    if (fileIDs.length > 0) {
      try {
        const tempUrlResult = await cloud.getTempFileURL({
          fileList: fileIDs
        });
        
        // 创建fileID到临时URL的映射
        tempUrlResult.fileList.forEach(file => {
          if (file.status === 0) { // 成功获取临时URL
            tempUrlMap[file.fileID] = file.tempFileURL;
          }
        });
      } catch (error) {
        console.error('获取临时URL失败:', error);
      }
    }

    const qrCodes = qrCodesResult.data.map(qr => ({
      _id: qr._id,
      name: qr.name,
      qrCodeUrl: tempUrlMap[qr.qrCodeUrl] || '', // 将qrCodeUrl(fileID)映射为临时URL
      qrCodePath: qr.qrCodePath,
      shortId: qr.shortId,
      status: qr.status || 'active',
      createTime: qr.createTime,
      eventId: qr.eventId
    }));

    return {
      success: true,
      data: qrCodes,
      message: '获取二维码列表成功'
    };

  } catch (error) {
    console.error('获取二维码列表失败:', error);
    return {
      success: false,
      message: '获取二维码列表失败',
      error: error.message
    };
  }
};