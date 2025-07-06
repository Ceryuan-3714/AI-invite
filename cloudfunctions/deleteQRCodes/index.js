const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { qrCodeIds } = event;
  
  if (!qrCodeIds || !Array.isArray(qrCodeIds) || qrCodeIds.length === 0) {
    return {
      success: false,
      message: '缺少要删除的二维码ID列表'
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

    // 批量获取二维码信息，验证权限
    const qrCodesResult = await db.collection('eventQRCodes')
      .where({
        _id: db.command.in(qrCodeIds)
      })
      .get();

    if (qrCodesResult.data.length === 0) {
      return {
        success: false,
        message: '未找到要删除的二维码'
      };
    }

    // 验证所有二维码都属于当前用户
    const unauthorizedQRCodes = qrCodesResult.data.filter(qr => qr.creatorOpenid !== userOpenid);
    if (unauthorizedQRCodes.length > 0) {
      return {
        success: false,
        message: '只能删除自己创建的二维码'
      };
    }

    // 收集需要删除的云存储文件ID
    const fileIdsToDelete = qrCodesResult.data
      .filter(qr => qr.qrCodeUrl)
      .map(qr => qr.qrCodeUrl);

    // 删除云存储中的文件
    if (fileIdsToDelete.length > 0) {
      try {
        await cloud.deleteFile({
          fileList: fileIdsToDelete
        });
        console.log('成功删除云存储文件:', fileIdsToDelete);
      } catch (deleteFileError) {
        console.warn('删除云存储文件失败:', deleteFileError);
        // 文件删除失败不影响数据库记录删除
      }
    }

    // 批量删除数据库记录
    const deletePromises = qrCodeIds.map(qrCodeId => 
      db.collection('eventQRCodes').doc(qrCodeId).remove()
    );

    await Promise.all(deletePromises);

    return {
      success: true,
      message: `成功删除 ${qrCodeIds.length} 个二维码`,
      deletedCount: qrCodeIds.length
    };

  } catch (error) {
    console.error('删除二维码失败:', error);
    return {
      success: false,
      message: '删除二维码失败',
      error: error.message
    };
  }
};