// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 0. 获取手机号 (如果从小程序端通过 getPhoneNumber 获取并传递 cloudID)
    let phoneNumber = null;
    if (event.cloudID) {
      try {
        const phoneRes = await cloud.getOpenData({
          list: [event.cloudID]
        });
        if (phoneRes.list && phoneRes.list.length > 0 && phoneRes.list[0].data) {
          phoneNumber = phoneRes.list[0].data.phoneNumber;
        } else {
          console.warn('getPhoneNumber cloudID an unresolvable value or no data:', event.cloudID, phoneRes);
          // 不抛出错误，允许无手机号登录，但可以记录
        }
      } catch (phoneErr) {
        console.warn('Error getting phone number with CloudID:', phoneErr);
        // 不因为获取手机号失败而中断登录流程
      }
    }

    // 1. 根据 openid 查询用户是否已存在
    let userRecord = await db.collection('users').where({
      openid: openid
    }).limit(1).get()

    let userInfo = null
    let isNewUser = false

    if (userRecord.data.length > 0) {
      // 用户已存在，直接返回用户信息
      userInfo = userRecord.data[0]
      console.log('Existing user found:', userInfo.name, userInfo.openid)

      // 可选：如果用户存在但没有手机号，且本次获取到了，可以更新
      if (phoneNumber && !userInfo.phoneNumber) {
        await db.collection('users').doc(userInfo._id).update({
          data: {
            phoneNumber: phoneNumber,
            updatedAt: db.serverDate()
          }
        });
        userInfo.phoneNumber = phoneNumber; // Update in returned object
      }

    } else {
      // 用户不存在，创建新用户
      isNewUser = true
      const defaultAvatar = 'cloud://your-cloud-env-id.your-cloud-path/default-avatar.png'; // 请替换为您的默认头像云存储地址

      const newUser = {
        openid: openid,
        name: '', // 新用户姓名留空，等待用户填写
        nickName: '', // 可以尝试从 event.userInfo 获取，如果小程序端有 wx.getUserProfile
        avatarUrl: defaultAvatar, // 默认头像
        phoneNumber: phoneNumber || '', // 保存获取到的手机号
        company: '',
        position: '',
        industry: '',
        email: '',
        bio: '',
        tags: [],
        isProfileComplete: false, // 标记为资料未完善
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        role: 'user', // 默认角色
        eventStats: {
          created: 0,
          joined: 0,
        },
        preferences: {} // 用户偏好设置
      }
      
      // 尝试从 event 中获取基础的 userInfo (如果小程序端通过 wx.getUserProfile 传递了)
      // 这通常在旧版登录中使用，新版主要依赖手机号，用户信息在 profile_setup 中完善
      if (event.userInfoFromWx) { // 假设小程序端传递了这个字段
          newUser.nickName = event.userInfoFromWx.nickName || '';
          newUser.avatarUrl = event.userInfoFromWx.avatarUrl || defaultAvatar;
      }


      const addUserResult = await db.collection('users').add({
        data: newUser
      })

      if (!addUserResult._id) {
        throw new Error('Failed to create new user in database.')
      }
      
      // 获取完整的新用户信息，包含_id
      userInfo = { ...newUser, _id: addUserResult._id };
      console.log('New user created:', userInfo.openid);
    }

    return {
      success: true,
      data: {
        userInfo: userInfo,
        isNewUser: isNewUser
      },
      message: '登录成功'
    }

  } catch (error) {
    console.error('Login cloud function error:', error)
    return {
      success: false,
      error: error.message,
      message: '登录处理失败'
    }
  }
}