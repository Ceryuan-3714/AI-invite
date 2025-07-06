const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { qrCodeId, name, eventId } = event;
  
  if (!qrCodeId || !name || !eventId) {
    return {
      success: false,
      message: '缺少必要参数'
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

    // 验证二维码是否存在且用户有权限修改
    const qrCodeResult = await db.collection('eventQRCodes').doc(qrCodeId).get();
    
    if (!qrCodeResult.data) {
      return {
        success: false,
        message: '二维码不存在'
      };
    }

    const qrCode = qrCodeResult.data;
    if (qrCode.creatorOpenid !== userOpenid) {
      return {
        success: false,
        message: '只有创建者可以修改二维码名称'
      };
    }

    // 更新二维码名称
    await db.collection('eventQRCodes').doc(qrCodeId).update({
      data: {
        name: name.trim(),
        updateTime: db.serverDate()
      }
    });

    return {
      success: true,
      message: '二维码名称更新成功'
    };

  } catch (error) {
    console.error('更新二维码名称失败:', error);
    return {
      success: false,
      message: '更新二维码名称失败',
      error: error.message
    };
  }
};