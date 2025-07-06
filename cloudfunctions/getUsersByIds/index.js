// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  
  // 获取传入的用户ID列表
  const { userIds } = event;
  
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return {
      success: false,
      message: '未提供有效的用户ID列表',
      users: []
    };
  }
  
  try {
    // 查询用户表
    const result = await db.collection('users')
      .where({
        openid: _.in(userIds)
      })
      .limit(100) // 限制最多返回100个用户
      .get();
    
    return {
      success: true,
      users: result.data || []
    };
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return {
      success: false,
      message: error.message || '获取用户信息失败',
      users: []
    };
  }
} 