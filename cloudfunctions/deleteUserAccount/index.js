// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 检查集合是否存在的辅助函数
async function collectionExists(collectionName) {
  try {
    // 尝试获取集合的一条记录
    await db.collection(collectionName).limit(1).get();
    return true;
  } catch (error) {
    if (error.errCode === -502005) { // 集合不存在错误码
      console.log(`集合 ${collectionName} 不存在`);
      return false;
    }
    throw error; // 其他错误继续抛出
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { userId, openid } = event
  
  // 验证调用者身份，确保只能删除自己的账号
  const callerOpenid = wxContext.OPENID
  if (callerOpenid !== openid) {
    return {
      success: false,
      message: '无权操作他人账号'
    }
  }
  
  try {
    const tasks = []
    
    // 1. 删除用户个人信息 - 先检查users集合是否存在
    const usersExists = await collectionExists('users');
    if (usersExists) {
      tasks.push(
        db.collection('users').where({
          openid: openid
        }).remove()
      );
    }
    
    // 2. 查找所有包含该用户的活动，并从参与者列表中移除该用户
    const eventsExists = await collectionExists('events');
    if (eventsExists) {
      const eventsToUpdate = await db.collection('events')
        .where({
          participants: openid
        }).get();
      
      if (eventsToUpdate && eventsToUpdate.data && eventsToUpdate.data.length > 0) {
        for (const event of eventsToUpdate.data) {
          tasks.push(
            db.collection('events').doc(event._id).update({
              data: {
                participants: _.pull(openid)
              }
            })
          );
        }
      }
      
      // 3. 标记用户创建的活动为"已注销用户"
      const createdEvents = await db.collection('events').where({
        creatorOpenid: openid
      }).get();
      
      if (createdEvents && createdEvents.data && createdEvents.data.length > 0) {
        for (const event of createdEvents.data) {
          tasks.push(
            db.collection('events').doc(event._id).update({
              data: {
                creatorStatus: 'deleted',
                updatedAt: db.serverDate()
              }
            })
          );
        }
      }
    }
    
    // 执行所有数据库操作
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
    
    return {
      success: true,
      message: '账号注销成功'
    };
  } catch (error) {
    console.error('注销账号失败:', error);
    return {
      success: false,
      message: '注销账号失败: ' + error.message,
      error: error
    };
  }
} 