// 管理预设标签的云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, tagData } = event
  
  try {
    switch (action) {
      case 'getAll':
        // 获取所有预设标签
        const result = await db.collection('presetTags')
          .orderBy('order', 'asc')
          .orderBy('createTime', 'desc')
          .get()
        return {
          success: true,
          data: result.data
        }
        
      case 'add':
        // 添加新的预设标签
        const { name, category = 'general', order = 0 } = tagData
        
        if (!name || !name.trim()) {
          return {
            success: false,
            error: '标签名称不能为空'
          }
        }
        
        // 检查标签是否已存在
        const existingTag = await db.collection('presetTags')
          .where({ name: name.trim() })
          .get()
          
        if (existingTag.data.length > 0) {
          return {
            success: false,
            error: '标签已存在'
          }
        }
        
        const addResult = await db.collection('presetTags').add({
          data: {
            name: name.trim(),
            category,
            order,
            createTime: db.serverDate(),
            updateTime: db.serverDate(),
            isActive: true
          }
        })
        
        return {
          success: true,
          data: { _id: addResult._id }
        }
        
      case 'update':
        // 更新预设标签
        const { _id, ...updateData } = tagData
        
        if (!_id) {
          return {
            success: false,
            error: '标签ID不能为空'
          }
        }
        
        const updateResult = await db.collection('presetTags')
          .doc(_id)
          .update({
            data: {
              ...updateData,
              updateTime: db.serverDate()
            }
          })
          
        return {
          success: true,
          data: updateResult
        }
        
      case 'delete':
        // 删除预设标签
        const { tagId } = tagData
        
        if (!tagId) {
          return {
            success: false,
            error: '标签ID不能为空'
          }
        }
        
        const deleteResult = await db.collection('presetTags')
          .doc(tagId)
          .remove()
          
        return {
          success: true,
          data: deleteResult
        }
        
      case 'toggleActive':
        // 切换标签激活状态
        const { toggleId, isActive } = tagData
        
        if (!toggleId) {
          return {
            success: false,
            error: '标签ID不能为空'
          }
        }
        
        const toggleResult = await db.collection('presetTags')
          .doc(toggleId)
          .update({
            data: {
              isActive: isActive,
              updateTime: db.serverDate()
            }
          })
          
        return {
          success: true,
          data: toggleResult
        }
        
      default:
        return {
          success: false,
          error: '不支持的操作类型'
        }
    }
  } catch (error) {
    console.error('管理预设标签失败:', error)
    return {
      success: false,
      error: error.message || '操作失败'
    }
  }
}