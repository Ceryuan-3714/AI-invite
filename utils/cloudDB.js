// cloudDB.js - 云数据库操作工具
const DB_NAME = {
  EVENTS: 'events',
  USERS: 'users',
  CLIENTS: 'clients',
  CLIENT_FOLDERS: 'clientFolders',
  TIME_SELECTIONS: 'timeSelections',
  NOTIFICATIONS: 'notifications'
};

/**
 * 初始化云环境
 */
function initCloud() {
  if (!wx.cloud) {
    console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    return false;
  }
  
  wx.cloud.init({
    env: 'your-cloud-env-id', // 云环境ID，需要替换为实际的环境ID（更换小程序需要改的地方）
    traceUser: true
  });
  
  return true;
}

// 初始化云环境
initCloud();

/**
 * 获取云数据库实例
 */
function getDB() {
  return wx.cloud.database();
}

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
async function isShortIdExists(shortId) {
  try {
    const db = getDB();
    const result = await db.collection(DB_NAME.EVENTS).where({
      shortId: shortId
    }).count();
    
    return result.total > 0;
  } catch (error) {
    console.error('检查短ID是否存在失败', error);
    return true; // 出错时保守返回true
  }
}

/**
 * 生成唯一的短ID
 * @returns {Promise<string>} 唯一的短ID
 */
async function generateUniqueShortId() {
  let shortId = generateShortId();
  let attempts = 0;
  const maxAttempts = 5; // 最大尝试次数
  
  // 检查是否已存在，如存在则重新生成
  while (await isShortIdExists(shortId) && attempts < maxAttempts) {
    shortId = generateShortId();
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    console.error('无法生成唯一短ID，达到最大尝试次数');
    // 在ID后加上时间戳，确保唯一性
    shortId += Date.now().toString().slice(-4);
  }
  
  return shortId;
}

// ==================== 活动相关的数据库操作 ====================

/**
 * 获取所有活动
 * @returns {Promise<Array>} 活动列表
 */
async function getAllEvents() {
  try {
    const db = getDB();
    // 添加一个简单的限制条件，避免全表扫描
    const res = await db.collection(DB_NAME.EVENTS)
      .limit(100)  // 限制返回数量
      .orderBy('createdAt', 'desc')  // 按创建时间排序，确保有索引
      .get();
    return res.data || [];
  } catch (error) {
    console.error('获取所有活动失败', error);
    return [];
  }
}

/**
 * 根据ID获取活动
 * @param {string} id 活动ID
 * @returns {Promise<Object|null>} 活动详情
 */
async function getEventById(id) {
  try {
    console.log('尝试获取活动，ID:', id, '类型:', typeof id);
    
    // 验证ID参数
    if (!id || id === 'undefined' || typeof id !== 'string') {
      console.error('getEventById: 无效的ID参数:', id);
      return null;
    }
    
    const db = getDB();
    
    // 主方法：直接使用doc查询
    let data = null;
    try {
      const result = await db.collection(DB_NAME.EVENTS).doc(id).get();
      data = result.data;
      console.log('直接doc查询结果:', data ? '成功' : '未找到');
    } catch (docError) {
      console.error('直接doc查询失败:', docError);
      
      // 备选方法1：使用where查询_id字段
      try {
        console.log('尝试使用where查询_id:', id);
        
        // 再次验证ID参数（防止在doc查询失败后仍然传入无效ID）
        if (!id || id === 'undefined' || typeof id !== 'string') {
          console.error('where查询: 无效的ID参数:', id);
          return null;
        }
        
        const whereResult = await db.collection(DB_NAME.EVENTS).where({
          _id: id
        }).get();
        
        if (whereResult.data && whereResult.data.length > 0) {
          data = whereResult.data[0];
          console.log('通过where _id查询找到活动');
        } else {
          console.log('通过where _id查询未找到活动');
          
          // 备选方法2：使用where查询id字段
          try {
            console.log('尝试使用where查询id字段:', id);
            const idResult = await db.collection(DB_NAME.EVENTS).where({
              id: id
            }).get();
            
            if (idResult.data && idResult.data.length > 0) {
              data = idResult.data[0];
              console.log('通过where id查询找到活动');
            } else {
              console.log('所有方法都未找到活动');
            }
          } catch (idError) {
            console.error('where id查询失败:', idError);
          }
        }
      } catch (whereError) {
        console.error('where _id查询失败:', whereError);
      }
    }
    
    if (!data) {
      console.log('未找到活动', id);
      return null;
    }
    
    // 处理旧格式数据
    if (!data._id && data.id) {
      data._id = data.id;
    }
    
    // 确保有participants字段
    if (!data.participants) {
      data.participants = [];
    }
    
    // 确保 currentAttendees 与 participants 表一致
    // 注意: 始终使用participants数组长度作为准确的currentAttendees值
    data.currentAttendees = data.participants.length;
    
    // 处理活动时间和日期
    if (data.date && typeof data.date === 'string') {
      // 日期字符串形式保持不变
    } else if (data.date instanceof Date) {
      data.date = data.date.toISOString().split('T')[0];
    } else if (data.date && data.date._seconds) {
      // Firestore 时间戳转换
      const date = new Date(data.date._seconds * 1000);
      data.date = date.toISOString().split('T')[0];
    }
    
    // 处理时间格式
    if (data.time && typeof data.time === 'string') {
      // 如果是时间段格式（开始时间-结束时间）
      if (data.time.includes('-')) {
        const timeParts = data.time.split('-');
        if (timeParts.length === 2) {
          data.startTime = timeParts[0].trim();
          data.endTime = timeParts[1].trim();
        }
      } else {
        // 如果只有单一时间，设置为开始时间
        data.startTime = data.time;
        
        // 结束时间默认为开始时间+1小时
        try {
          const hourMinute = data.time.split(':');
          let hour = parseInt(hourMinute[0]) + 1;
          if (hour > 23) hour = 23;
          data.endTime = `${hour.toString().padStart(2, '0')}:${hourMinute[1]}`;
        } catch (e) {
          console.error('设置结束时间失败:', e);
          data.endTime = data.time; // 默认与开始时间相同
        }
      }
    }
    
    // 如果没有设置日期，使用当前日期
    if (!data.date) {
      data.date = new Date().toISOString().split('T')[0];
    }
    
    // 如果没有设置时间相关字段，使用默认值
    if (!data.startTime) {
      data.startTime = '09:00';
    }
    if (!data.endTime) {
      data.endTime = '10:00';
    }
    
    console.log('处理后的活动数据:', 
                '日期:', data.date, 
                '开始时间:', data.startTime, 
                '结束时间:', data.endTime);
    return data;
  } catch (error) {
    console.error('获取活动失败', error);
    return null;
  }
}

/**
 * 根据短ID获取活动
 * @param {string} shortId 活动短ID
 * @returns {Promise<Object|null>} 活动详情
 */
async function getEventByShortId(shortId) {
  try {
    console.log('尝试通过短ID获取活动，shortID:', shortId);
    const db = getDB();
    
    const result = await db.collection(DB_NAME.EVENTS).where({
      shortId: shortId
    }).get();
    
    if (result.data && result.data.length > 0) {
      console.log('通过短ID找到活动:', result.data[0]);
      return result.data[0];
    }
    
    console.log('未找到活动，shortID:', shortId);
    return null;
  } catch (error) {
    console.error('通过短ID获取活动失败', error);
    return null;
  }
}

/**
 * 按条件查询活动
 * @param {Object} query 查询条件
 * @param {Object} options 排序、限制等选项
 * @returns {Promise<Array>} 活动列表
 */
async function queryEvents(query = {}, options = {}) {
  try {
    const db = getDB();
    
    // 如果query是空对象，添加一个非筛选条件来避免全表扫描警告
    // 使用createdAt字段，因为几乎所有记录都有这个字段
    const queryObj = Object.keys(query).length === 0 ? 
      { createdAt: db.command.gt(new Date(0)) } : query;
    
    let dbQuery = db.collection(DB_NAME.EVENTS).where(queryObj);
    
    // 添加排序
    if (options.orderBy) {
      dbQuery = dbQuery.orderBy(options.orderBy.field, options.orderBy.direction || 'desc');
    } else {
      // 默认按创建时间排序
      dbQuery = dbQuery.orderBy('createdAt', 'desc');
    }
    
    // 添加限制
    if (options.limit) {
      dbQuery = dbQuery.limit(options.limit);
    } else {
      // 默认限制返回100条
      dbQuery = dbQuery.limit(100);
    }
    
    // 添加偏移量
    if (options.skip) {
      dbQuery = dbQuery.skip(options.skip);
    }
    
    const res = await dbQuery.get();
    return res.data || [];
  } catch (error) {
    console.error('查询活动失败', error);
    return [];
  }
}

/**
 * 添加新活动
 * @param {Object} eventData 活动数据
 * @returns {Promise<Object|null>} 新创建的活动
 */
async function addEvent(eventData) {
  try {
    const db = getDB();
    
    // 生成唯一短ID
    const shortId = await generateUniqueShortId();
    console.log('为新活动生成的短ID:', shortId);
    
    const res = await db.collection(DB_NAME.EVENTS).add({
      data: {
        ...eventData,
        shortId: shortId, // 添加短ID字段
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    
    if (res._id) {
      // 获取新添加的活动详情
      return await getEventById(res._id);
    }
    return null;
  } catch (error) {
    console.error('添加活动失败', error);
    return null;
  }
}

/**
 * 更新活动
 * @param {string} id 活动ID
 * @param {Object} eventData 活动数据
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateEvent(id, eventData) {
  try {
    const db = getDB();
    
    // 创建一个不包含系统保留字段的新对象
    const safeEventData = {...eventData};
    
    // 移除系统保留字段，避免Invalid Key Name错误
    if (safeEventData._openid) {
      delete safeEventData._openid;
    }
    
    // 确保使用_id字段，删除可能存在的id字段
    if (safeEventData.id) {
      delete safeEventData.id;
    }
    
    // 移除_id字段，这是MongoDB系统字段，不能更新
    if (safeEventData._id) {
      delete safeEventData._id;
    }
    
    // 检查是否已有shortId，如果没有，生成一个
    if (!safeEventData.shortId) {
      // 先获取现有活动信息
      const existingEvent = await getEventById(id);
      if (existingEvent && !existingEvent.shortId) {
        safeEventData.shortId = await generateUniqueShortId();
        console.log('为现有活动生成的短ID:', safeEventData.shortId);
      }
    }
    
    // 记录这次更新的字段，用于调试
    console.log('更新活动字段:', Object.keys(safeEventData));
    console.log('使用的活动ID:', id);
    
    await db.collection(DB_NAME.EVENTS).doc(id).update({
      data: {
        ...safeEventData,
        updatedAt: db.serverDate()
      }
    });
    return true;
  } catch (error) {
    console.error('更新活动失败', error);
    console.error('错误详情:', error.errMsg || error.message || '未知错误');
    return false;
  }
}

/**
 * 删除活动
 * @param {string} id 活动ID
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteEvent(id) {
  try {
    const db = getDB();
    
    // 先获取活动详情，以便删除其封面图
    const event = await getEventById(id);
    
    if (event) {
      // 如果活动有封面图，删除对应的云存储文件
      if (event.cover && event.cover.includes('cloud://')) {
        console.log('活动删除: 正在删除活动封面图', event.cover);
        
        try {
          const deleteResult = await deleteCloudFile(event.cover);
          console.log('活动封面图删除结果:', deleteResult);
        } catch (fileError) {
          // 即使封面图删除失败也继续删除活动记录
          console.error('删除活动封面图失败', fileError);
        }
      }
      
      // 删除活动的二维码文件
      try {
        // 查询该活动的所有二维码
        const qrCodesResult = await db.collection('eventQRCodes')
          .where({
            eventId: id
          })
          .get();
        
        if (qrCodesResult.data && qrCodesResult.data.length > 0) {
          // 收集需要删除的云存储文件ID
          const fileIdsToDelete = qrCodesResult.data
            .filter(qr => qr.qrCodeUrl)
            .map(qr => qr.qrCodeUrl);
          
          // 删除云存储中的二维码文件
          if (fileIdsToDelete.length > 0) {
            try {
              const deleteResult = await deleteCloudFile(fileIdsToDelete);
              console.log('活动二维码文件删除结果:', deleteResult);
            } catch (fileError) {
              console.error('删除活动二维码文件失败', fileError);
            }
          }
          
          // 删除二维码数据库记录
          const deletePromises = qrCodesResult.data.map(qr => 
            db.collection('eventQRCodes').doc(qr._id).remove()
          );
          await Promise.all(deletePromises);
          console.log(`已删除活动相关的 ${qrCodesResult.data.length} 个二维码记录`);
        }
      } catch (qrError) {
        console.error('删除活动二维码失败', qrError);
        // 二维码删除失败不影响活动删除
      }
      
      // 删除活动的主二维码文件（如果存在）
      if (event.qrCodePath) {
        try {
          const deleteResult = await deleteCloudFile(event.qrCodePath);
          console.log('活动主二维码文件删除结果:', deleteResult);
        } catch (fileError) {
          console.error('删除活动主二维码文件失败', fileError);
        }
      }
    }
    
    // 删除活动记录
    await db.collection(DB_NAME.EVENTS).doc(id).remove();
    console.log('活动记录删除成功:', id);
    return true;
  } catch (error) {
    console.error('删除活动失败', error);
    return false;
  }
}

/**
 * 参加活动
 * @param {string} eventId 活动ID
 * @param {Object} userInfo 用户信息
 * @returns {Promise<boolean>} 是否操作成功
 */
async function joinEvent(eventId, userInfo) {
  try {
    console.log('开始参加活动:', eventId);
    console.log('用户信息:', userInfo);
    
    if (!eventId) {
      console.error('缺少活动ID');
      return false;
    }
    
    if (!userInfo || !userInfo.openid) {
      console.error('用户信息不完整，缺少openid');
      return false;
    }
    
    const db = getDB();
    const event = await getEventById(eventId);
    
    if (!event) {
      console.error('未找到活动:', eventId);
      return false;
    }
    
    // 确保参与者列表存在
    const participants = event.participants || [];
    console.log('当前参与者列表:', participants);
    
    // 检查用户是否已经在参与者列表中 - 只检查openid
    const userExists = participants.includes(userInfo.openid);
    
    console.log('用户是否已在参与者列表中:', userExists);
    
    if (userExists) {
      console.log('用户已经参加，无需重复操作');
      return true; // 用户已经参加，无需重复操作
    }
    
    // 将用户的openid添加到参与者列表
    console.log('添加用户openid到参与者列表:', userInfo.openid);
    
    // 添加用户到参与者列表
    participants.push(userInfo.openid);
    
    // 更新活动参与者和参与人数
    console.log('正在更新活动参与者列表...');
    
    try {
      // 更新participants和currentAttendees
      await db.collection(DB_NAME.EVENTS).doc(eventId).update({
        data: {
          participants: participants,
          currentAttendees: participants.length,
          updatedAt: db.serverDate()
        }
      });
      
      // 日志
      console.log('活动参与者更新完成，当前参与人数:', participants.length);
    } catch (txError) {
      // 错误处理
      console.error('更新活动参与者失败:', txError);
      throw txError;
    }
    
    console.log('活动参与者列表更新完成');
    return true;
  } catch (error) {
    console.error('参加活动失败', error);
    return false;
  }
}

/**
 * 取消参加活动
 * @param {string} eventId 活动ID
 * @param {Object} userInfo 用户信息
 * @returns {Promise<boolean>} 是否操作成功
 */
async function cancelJoinEvent(eventId, userInfo) {
  try {
    console.log('开始取消参加活动:', eventId);
    console.log('用户信息:', userInfo);
    
    if (!eventId) {
      console.error('缺少活动ID');
      return false;
    }
    
    if (!userInfo || !userInfo.openid) {
      console.error('用户信息不完整，缺少openid');
      return false;
    }
    
    const db = getDB();
    const event = await getEventById(eventId);
    
    if (!event) {
      console.error('未找到活动:', eventId);
      return false;
    }
    
    // 确保参与者列表存在
    let participants = event.participants || [];
    console.log('当前参与者列表:', participants);
    
    // 检查用户是否在参与者列表中 - 只检查openid
    const userIndex = participants.indexOf(userInfo.openid);
    const userFound = userIndex !== -1;
    
    // 如果没有找到用户，直接返回成功
    if (!userFound) {
      console.log('用户未参加活动，无需操作');
      return true;
    }
    
    // 从参与者列表中移除用户的openid
    console.log('从参与者列表中移除用户openid:', userInfo.openid);
    participants.splice(userIndex, 1);
    
    // 更新活动参与者和参与人数
    try {
      await db.collection(DB_NAME.EVENTS).doc(eventId).update({
        data: {
          participants: participants,
          currentAttendees: participants.length,
          updatedAt: db.serverDate()
        }
      });
      
      console.log('已移除用户从活动参与者列表，当前参与人数:', participants.length);
      return true;
    } catch (updateError) {
      console.error('取消参加活动更新失败:', updateError);
      return false;
    }
  } catch (error) {
    console.error('取消参加活动失败', error);
    return false;
  }
}

// ==================== 用户相关的数据库操作 ====================

/**
 * 获取用户信息
 * @param {string} userId 用户ID
 * @returns {Promise<Object|null>} 用户信息
 */
async function getUserById(userId) {
  try {
    if (!userId) {
      console.error('getUserById: userId 不能为空');
      return null;
    }
    
    console.log('尝试获取用户信息，userId:', userId);
    const db = getDB();
    const res = await db.collection(DB_NAME.USERS).doc(userId).get();
    console.log('获取用户信息成功:', res.data);
    return res.data || null;
  } catch (error) {
    console.error('获取用户信息失败', error);
    return null;
  }
}

/**
 * 添加或更新用户信息
 * @param {Object} userInfo 用户信息
 * @returns {Promise<Object|null>} 用户信息
 */
async function saveUserInfo(userInfo) {
  try {
    console.log('保存用户信息, 输入:', userInfo);
    const db = getDB();
    
    // 注释：已取消同名用户检测，所有新用户使用随机字符串作为用户名
    
    // 检查用户是否已存在
    let user = null;
    
    // 注意：不要尝试手动设置_openid，这是系统字段
    // 但我们可以使用openid作为自定义字段
    
    // 首先通过openid查找用户
    if (userInfo.openid) {
      console.log('通过openid查找用户:', userInfo.openid);
      try {
        const openidRes = await db.collection(DB_NAME.USERS)
          .where({ openid: userInfo.openid })
          .get();
        
        if (openidRes.data && openidRes.data.length > 0) {
          user = openidRes.data[0];
          console.log('通过openid找到用户:', user);
        }
      } catch (err) {
        console.error('通过openid查找用户失败:', err);
      }
    }
    
    // 如果没找到，再尝试通过ID查找
    if (!user && userInfo._id) {
      console.log('通过_id查找用户:', userInfo._id);
      try {
        user = await getUserById(userInfo._id);
        console.log('通过_id找到用户:', user);
      } catch (err) {
        console.error('通过_id查找用户失败:', err);
      }
    }
    
    if (user) {
      // 用户存在，更新用户信息
      console.log('更新用户信息, _id:', user._id);
      
      // 确保使用正确的ID字段
      const updateData = { ...userInfo };
      delete updateData._id; // 移除_id字段，避免更新主键
      
      // 重要：移除_openid字段，这是系统字段不能手动更新
      if (updateData._openid) {
        delete updateData._openid;
      }
      
      await db.collection(DB_NAME.USERS).doc(user._id).update({
        data: {
          ...updateData,
          updatedAt: db.serverDate()
        }
      });
      
      console.log('用户信息更新成功');
      return await getUserById(user._id);
    } else {
      // 添加新用户
      console.log('创建新用户');
      const addData = { ...userInfo };
      
      // 移除可能存在的无效ID字段
      delete addData._id;
      
      // 重要：移除_openid字段，这是系统字段不能手动设置
      if (addData._openid) {
        delete addData._openid;
      }
      
      // 删除原始名称字段防止在前端显示
      delete addData.nickName;
      // 确保任何其他个人识别信息被清除
      if (addData.originalName) delete addData.originalName;
      
      const res = await db.collection(DB_NAME.USERS).add({
        data: {
          ...addData,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      
      console.log('新用户创建成功, _id:', res._id);
      
      if (res._id) {
        return await getUserById(res._id);
      }
    }
    
    return null;
  } catch (error) {
    console.error('保存用户信息失败', error);
    return null;
  }
}

/**
 * 通过OpenID获取用户信息
 * @param {string} openid 微信OpenID
 * @returns {Promise<Object|null>} 用户信息
 */
async function getUserByOpenId(openid) {
  try {
    const db = getDB();
    const res = await db.collection(DB_NAME.USERS).where({
      openid: openid
    }).get();
    
    if (res.data && res.data.length > 0) {
      return res.data[0];
    }
    
    return null;
  } catch (error) {
    console.error('通过OpenID获取用户信息失败', error);
    return null;
  }
}

/**
 * 更新用户信息
 * @param {string} userId 用户ID
 * @param {Object} updateData 要更新的数据
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateUser(userId, updateData) {
  try {
    if (!userId) {
      console.error('updateUser: userId 不能为空');
      return false;
    }
    
    console.log('更新用户信息, userId:', userId, 'updateData:', updateData);
    const db = getDB();
    
    // 移除不应该更新的系统字段
    const safeUpdateData = { ...updateData };
    delete safeUpdateData._id;
    delete safeUpdateData._openid;
    delete safeUpdateData.openid; // 保护openid字段
    
    await db.collection(DB_NAME.USERS).doc(userId).update({
      data: {
        ...safeUpdateData,
        updatedAt: db.serverDate()
      }
    });
    
    console.log('用户信息更新成功');
    return true;
  } catch (error) {
    console.error('更新用户信息失败', error);
    return false;
  }
}

/**
 * 更新用户所属文件夹
 * @param {string} userId 用户ID
 * @param {string} folderId 文件夹ID
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateUserFolder(userId, folderId) {
  try {
    const db = getDB();
    
    // 获取用户当前的文件夹ID
    const userRes = await db.collection(DB_NAME.USERS).doc(userId).get();
    const oldFolderId = userRes.data ? userRes.data.folderId : '';
    
    // 更新用户的文件夹ID
    const res = await db.collection(DB_NAME.USERS).doc(userId).update({
      data: {
        folderId: folderId || '',
        updatedAt: db.serverDate()
      }
    });
    
    if (res.stats && res.stats.updated > 0) {
      // 更新文件夹计数
      if (oldFolderId && oldFolderId !== folderId) {
        await updateFolderCount(oldFolderId, -1);
      }
      if (folderId && folderId !== oldFolderId) {
        await updateFolderCount(folderId, 1);
      }
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('更新用户文件夹失败', error);
    return false;
  }
}

/**
 * 通过多个OpenID批量获取用户信息
 * @param {Array<string>} openids 微信OpenID数组
 * @returns {Promise<Array<Object>>} 用户信息数组
 */
async function getUsersByOpenIds(openids) {
  if (!openids || !openids.length) return [];
  
  try {
    const db = getDB();
    const command = db.command;
    const batchSize = 100; // 每批处理的数量
    let allUsers = [];
    
    // 将openids分成多个批次处理
    for (let i = 0; i < openids.length; i += batchSize) {
      const batchOpenids = openids.slice(i, i + batchSize);
      console.log(`处理第 ${i/batchSize + 1} 批用户数据，数量: ${batchOpenids.length}`);
      
      // 使用in操作符批量查询当前批次
      const res = await db.collection(DB_NAME.USERS).where({
        openid: command.in(batchOpenids)
      }).get();
      
      if (res.data && res.data.length > 0) {
        allUsers = allUsers.concat(res.data);
      }
    }
    
    console.log(`总共获取到 ${allUsers.length} 个用户的信息`);
    
    // 标准化用户信息格式，确保字段名称的一致性
    return allUsers.map(user => {
      // 处理头像字段
      const avatarUrl = user.avatarUrl || '/images/default-avatar.png';
      
      // 处理名称字段
      const name = user.nickName || user.name || '匿名用户';
      
      return {
        // 基础信息
        openid: user.openid,
        _id: user._id,
        name: name,
        avatarUrl: avatarUrl,
        
        // 专业信息
        company: user.company || '',
        position: user.position || '',
        industry: user.industry || '',
        expertise: user.expertise || '',
        
        // 个人信息
        interest: user.interest || '',
        introduction: user.introduction || '',
        
        // 联系信息
        phone: user.phone || '',
        email: user.email || '',
        
        // 其他信息，保留原有字段
        ...user
      };
    });
  } catch (error) {
    console.error('批量获取用户信息失败', error);
    return [];
  }
}

// ==================== 客户相关的数据库操作 ====================

/**
 * 获取所有用户（支持分页、文件夹过滤和搜索）
 * @param {Object} options 查询选项
 * @param {number} options.page 页码（从1开始）
 * @param {number} options.pageSize 每页数量
 * @param {string} options.folderId 文件夹ID过滤
 * @param {string} options.searchKeyword 搜索关键词
 * @returns {Promise<Object>} 包含用户列表和分页信息的对象
 */
async function getAllUsers(options = {}) {
  try {
    const db = getDB();
    const { page = 1, pageSize = 20, folderId, searchKeyword } = options;
    const skip = (page - 1) * pageSize;
    
    let query = db.collection(DB_NAME.USERS);
    let whereCondition = {};
    
    // 如果指定了文件夹ID，添加过滤条件
    if (folderId && folderId !== 'all') {
      whereCondition.folderId = folderId;
    }
    
    // 添加搜索条件
    if (searchKeyword && searchKeyword.trim()) {
      const keyword = searchKeyword.trim();
      const command = db.command;
      const searchCondition = command.or([
        { name: db.RegExp({ regexp: keyword, options: 'i' }) },
        { company: db.RegExp({ regexp: keyword, options: 'i' }) },
        { position: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]);
      
      if (Object.keys(whereCondition).length > 0) {
        whereCondition = command.and([whereCondition, searchCondition]);
      } else {
        whereCondition = searchCondition;
      }
    }
    
    // 应用查询条件
    if (Object.keys(whereCondition).length > 0) {
      query = query.where(whereCondition);
    }
    
    // 获取总数
    const countRes = await query.count();
    const total = countRes.total || 0;
    
    // 获取分页数据
    const res = await query
      .skip(skip)
      .limit(pageSize)
      .orderBy('_createTime', 'desc')
      .get();
    
    // 标准化用户信息格式
    const users = (res.data || []).map(user => {
      const avatarUrl = user.avatarUrl || '/images/default-avatar.png';
      const name = user.nickName || user.name || '匿名用户';
      
      return {
        _id: user._id,
        name: name,
        avatar: avatarUrl,
        company: user.company || '',
        position: user.position || '',
        industry: user.industry || '',
        expertise: user.expertise || '',
        interest: user.interest || '',
        introduction: user.introduction || '',
        phone: user.phone || '',
        email: user.email || '',
        tags: user.tags || [],
        folderId: user.folderId || '',
        openid: user.openid
      };
    });
    
    return {
      users: users,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total
    };
  } catch (error) {
    console.error('获取所有用户失败', error);
    return {
      users: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      hasMore: false
    };
  }
}

/**
 * 获取所有客户
 * @returns {Promise<Array>} 客户列表
 */
async function getAllClients() {
  try {
    const db = getDB();
    // 添加一个简单的限制条件，避免全表扫描
    const res = await db.collection(DB_NAME.CLIENTS)
      .limit(100)  // 限制返回数量
      .orderBy('createdAt', 'desc')  // 按创建时间排序
      .get();
    return res.data || [];
  } catch (error) {
    console.error('获取所有客户失败', error);
    return [];
  }
}

/**
 * 根据文件夹ID获取客户
 * @param {string} folderId 文件夹ID
 * @returns {Promise<Array>} 客户列表
 */
async function getClientsByFolder(folderId) {
  try {
    const db = getDB();
    let query;
    
    if (folderId === 'all') {
      // 使用createdAt字段作为非筛选条件，避免空查询
      query = { createdAt: db.command.gt(new Date(0)) };
    } else {
      query = { folderId: folderId };
    }
    
    const res = await db.collection(DB_NAME.CLIENTS)
      .where(query)
      .limit(100)  // 限制返回数量
      .orderBy('createdAt', 'desc')  // 按创建时间排序
      .get();
      
    return res.data || [];
  } catch (error) {
    console.error('获取文件夹客户失败', error);
    return [];
  }
}

/**
 * 搜索客户
 * @param {string} keyword 搜索关键词
 * @returns {Promise<Array>} 客户列表
 */
async function searchClients(keyword) {
  if (!keyword) return getAllClients();
  
  try {
    const db = getDB();
    const _ = db.command;
    const res = await db.collection(DB_NAME.CLIENTS).where(_.or([
      { name: db.RegExp({ regexp: keyword, options: 'i' }) },
      { company: db.RegExp({ regexp: keyword, options: 'i' }) },
      { position: db.RegExp({ regexp: keyword, options: 'i' }) }
    ])).get();
    
    return res.data || [];
  } catch (error) {
    console.error('搜索客户失败', error);
    return [];
  }
}

/**
 * 获取所有客户文件夹
 * @returns {Promise<Array>} 文件夹列表
 */
async function getAllFolders() {
  try {
    const db = getDB();
    // 添加一个简单的限制条件，避免全表扫描
    const res = await db.collection(DB_NAME.CLIENT_FOLDERS)
      .limit(50)  // 文件夹通常较少，限制50个
      .orderBy('createdAt', 'desc')  // 按创建时间排序
      .get();
    return res.data || [];
  } catch (error) {
    console.error('获取所有文件夹失败', error);
    return [];
  }
}

/**
 * 添加客户
 * @param {Object} clientData 客户数据
 * @returns {Promise<Object|null>} 新客户数据
 */
async function addClient(clientData) {
  try {
    const db = getDB();
    const res = await db.collection(DB_NAME.CLIENTS).add({
      data: {
        ...clientData,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    
    if (res._id) {
      // 更新文件夹计数
      if (clientData.folderId) {
        await updateFolderCount(clientData.folderId, 1);
      }
      
      // 获取新添加的客户详情
      const client = await db.collection(DB_NAME.CLIENTS).doc(res._id).get();
      return client.data || null;
    }
    
    return null;
  } catch (error) {
    console.error('添加客户失败', error);
    return null;
  }
}

/**
 * 更新文件夹计数
 * @param {string} folderId 文件夹ID
 * @param {number} delta 变化量
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateFolderCount(folderId, delta) {
  try {
    const db = getDB();
    await db.collection(DB_NAME.CLIENT_FOLDERS).doc(folderId).update({
      data: {
        count: db.command.inc(delta),
        updatedAt: db.serverDate()
      }
    });
    return true;
  } catch (error) {
    console.error('更新文件夹计数失败', error);
    return false;
  }
}

/**
 * 根据ID获取客户详情
 * @param {string} clientId 客户ID
 * @returns {Promise<Object|null>} 客户详情
 */
async function getClientById(clientId) {
  try {
    if (!clientId) {
      console.error('getClientById: clientId 不能为空');
      return null;
    }
    
    console.log('尝试获取客户信息，clientId:', clientId);
    const db = getDB();
    const res = await db.collection(DB_NAME.CLIENTS).doc(clientId).get();
    console.log('获取客户信息成功:', res.data);
    return res.data || null;
  } catch (error) {
    console.error('获取客户信息失败', error);
    return null;
  }
}

/**
 * 更新客户信息
 * @param {string} clientId 客户ID
 * @param {Object} clientData 更新的客户数据
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateClient(clientId, clientData) {
  try {
    if (!clientId) {
      console.error('updateClient: clientId 不能为空');
      return false;
    }
    
    console.log('更新客户信息, clientId:', clientId, '数据:', clientData);
    const db = getDB();
    
    // 检查是否有文件夹变更，如果有需要更新文件夹计数
    const originalClient = await getClientById(clientId);
    const oldFolderId = originalClient?.folderId;
    const newFolderId = clientData.folderId;
    
    if (oldFolderId !== newFolderId) {
      // 如果原文件夹存在，减少旧文件夹计数
      if (oldFolderId) {
        await updateFolderCount(oldFolderId, -1);
      }
      
      // 如果新文件夹存在，增加新文件夹计数
      if (newFolderId) {
        await updateFolderCount(newFolderId, 1);
      }
    }
    
    await db.collection(DB_NAME.CLIENTS).doc(clientId).update({
      data: {
        ...clientData,
        updatedAt: db.serverDate()
      }
    });
    
    console.log('客户信息更新成功');
    return true;
  } catch (error) {
    console.error('更新客户信息失败', error);
    return false;
  }
}

/**
 * 删除客户
 * @param {string} clientId 客户ID
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteClient(clientId) {
  try {
    if (!clientId) {
      console.error('deleteClient: clientId 不能为空');
      return false;
    }
    
    console.log('删除客户, clientId:', clientId);
    const db = getDB();
    
    // 获取客户信息，以便更新相关文件夹计数
    const client = await getClientById(clientId);
    
    if (client && client.folderId) {
      // 更新文件夹计数
      await updateFolderCount(client.folderId, -1);
    }
    
    await db.collection(DB_NAME.CLIENTS).doc(clientId).remove();
    console.log('客户删除成功');
    return true;
  } catch (error) {
    console.error('删除客户失败', error);
    return false;
  }
}

/**
 * 添加文件夹
 * @param {Object} folderData 文件夹数据
 * @returns {Promise<Object|null>} 新文件夹数据
 */
async function addFolder(folderData) {
  try {
    const db = getDB();
    const res = await db.collection(DB_NAME.CLIENT_FOLDERS).add({
      data: {
        ...folderData,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    
    if (res._id) {
      // 获取新添加的文件夹详情
      const folder = await db.collection(DB_NAME.CLIENT_FOLDERS).doc(res._id).get();
      return folder.data || null;
    }
    
    return null;
  } catch (error) {
    console.error('添加文件夹失败', error);
    return null;
  }
}

/**
 * 删除文件夹
 * @param {string} folderId 文件夹ID
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteFolder(folderId) {
  try {
    if (!folderId) {
      console.error('deleteFolder: folderId 不能为空');
      return false;
    }
    
    console.log('删除文件夹, folderId:', folderId);
    const db = getDB();
    
    // 查找该文件夹下的所有客户
    const clientsRes = await db.collection(DB_NAME.CLIENTS)
      .where({ folderId: folderId })
      .get();
    
    const clients = clientsRes.data || [];
    
    // 将该文件夹下的所有客户移出文件夹（设置folderId为空）
    if (clients.length > 0) {
      // 使用云函数批量更新会更高效，但这里简单处理
      for (const client of clients) {
        await db.collection(DB_NAME.CLIENTS).doc(client._id).update({
          data: {
            folderId: '',
            updatedAt: db.serverDate()
          }
        });
      }
    }
    
    // 删除文件夹
    await db.collection(DB_NAME.CLIENT_FOLDERS).doc(folderId).remove();
    console.log('文件夹删除成功');
    return true;
  } catch (error) {
    console.error('删除文件夹失败', error);
    return false;
  }
}

/**
 * 删除云存储中的文件
 * @param {string|string[]} fileIDs 文件ID或文件ID数组
 * @returns {Promise<Object>} 删除结果
 */
async function deleteCloudFile(fileIDs) {
  if (!fileIDs) return { success: true, deletedCount: 0 };
  
  // 如果传入的是云文件URL，提取文件ID
  const getFileID = (fileUrl) => {
    if (!fileUrl || typeof fileUrl !== 'string') return null;
    // 如果不是云存储URL，跳过
    if (!fileUrl.includes('cloud://')) return null;
    
    try {
      // 从 URL 中提取文件 ID
      const cloudPrefix = 'cloud://';
      const startIndex = fileUrl.indexOf(cloudPrefix);
      if (startIndex === -1) return null;
      
      return fileUrl.slice(startIndex);
    } catch (error) {
      console.error('从 URL 提取文件 ID 失败:', error);
      return null;
    }
  };
  
  // 处理单个文件ID或数组
  let ids = [];
  
  if (Array.isArray(fileIDs)) {
    // 如果是数组，处理每个项
    ids = fileIDs.map(id => typeof id === 'string' ? getFileID(id) : null).filter(id => id);
  } else if (typeof fileIDs === 'string') {
    // 如果是字符串，尝试提取文件ID
    const id = getFileID(fileIDs);
    if (id) ids.push(id);
  }
  
  // 如果没有有效的文件ID，直接返回
  if (ids.length === 0) {
    return { success: true, deletedCount: 0 };
  }
  
  try {
    console.log('尝试删除云存储文件:', ids);
    const result = await wx.cloud.deleteFile({
      fileList: ids
    });
    
    console.log('云存储文件删除结果:', result);
    
    // 计算成功删除的数量
    const successCount = result.fileList.filter(file => file.status === 0).length;
    
    return {
      success: true,
      deletedCount: successCount,
      result: result
    };
  } catch (error) {
    console.error('删除云存储文件失败:', error);
    return {
      success: false,
      error: error,
      deletedCount: 0
    };
  }
}

/**
 * 向指定集合添加数据
 * @param {string} collection 集合名称
 * @param {Object} data 要添加的数据
 * @returns {Promise<Object>} 添加结果，包含_id字段
 */
async function add(collection, data) {
  try {
    if (!collection) {
      console.error('add: collection 不能为空');
      return null;
    }
    
    console.log(`向集合 ${collection} 添加数据:`, data);
    const db = getDB();
    
    const res = await db.collection(collection).add({
      data: {
        ...data,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    
    console.log(`数据添加成功，_id: ${res._id}`);
    return res;
  } catch (error) {
    console.error(`向集合 ${collection} 添加数据失败:`, error);
    throw error;
  }
}

// 导出所有函数
module.exports = {
  // 数据库常量
  DB_NAME,
  
  // 初始化
  initCloud,
  
  // 活动相关
  getAllEvents,
  getEventById,
  getEventByShortId,
  queryEvents,
  addEvent,
  updateEvent,
  deleteEvent,
  joinEvent,
  cancelJoinEvent,
  
  // 短ID相关
  generateUniqueShortId,
  
  // 用户相关
  getAllUsers,
  getUserById,
  saveUserInfo,
  updateUser,
  updateUserFolder,
  getUserByOpenId,
  getUsersByOpenIds,
  
  // 客户相关
  getAllClients,
  getClientsByFolder,
  searchClients,
  getAllFolders,
  addClient,
  updateClient,
  deleteClient,
  getClientById,
  addFolder,
  updateFolderCount,
  deleteFolder,
  
  // 云存储相关
  deleteCloudFile,
  
  // 通用方法
  add
};