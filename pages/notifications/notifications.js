// notifications.js
const app = getApp()

Page({
  data: {
    loading: true,
    notifications: [],
    isEmpty: false,
    touchStartX: 0,
    // 新增删除已读通知按钮状态
    hasReadNotifications: false
  },
  
  onLoad: function() {
    this.loadNotifications()
  },
  
  onShow: function() {
    // 每次页面显示时刷新通知列表
    this.loadNotifications()
    
    // 更新通知角标
    app.updateNotificationBadge()
  },
  
  onPullDownRefresh: function() {
    this.loadNotifications()
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 500)
  },
  
  // 加载通知数据（从云数据库获取）
  loadNotifications: async function() {
    console.log('=== 开始加载通知数据 ===')
    this.setData({ loading: true })
    
    try {
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
      console.log('当前用户信息:', JSON.stringify(userInfo))
      
      if (!userInfo || !userInfo.openid) {
        console.warn('用户信息不完整，无法加载通知。userInfo:', userInfo)
        this.setData({
          loading: false,
          isEmpty: true,
          notifications: []
        })
        return
      }
      
      console.log('使用的查询openid:', userInfo.openid)
      
      // 从云数据库获取当前用户的通知
      const db = wx.cloud.database()
      const _ = db.command
      
      console.log('开始查询数据库，查询条件: recipientId =', userInfo.openid)
      
      const res = await db.collection('notifications')
        .where({
          recipientId: userInfo.openid
        })
        .orderBy('createdAt', 'desc')
        .get()
      
      console.log('数据库查询结果:', res)
      console.log('查询到的通知数量:', res.data ? res.data.length : 0)
      
      if (res.data && res.data.length > 0) {
        console.log('查询到的通知详情:', JSON.stringify(res.data, null, 2))
      }
      
      if (!res.data || res.data.length === 0) {
        console.log('没有查询到任何通知记录')
        this.setData({
          loading: false,
          isEmpty: true,
          notifications: []
        })
        return
      }
      
      // 处理通知数据，更新未读消息为已读
      const notifications = res.data
      const unreadNotifications = notifications.filter(n => !n.read)
      
      console.log('未读通知数量:', unreadNotifications.length)
      
      // 有未读通知时，标记为已读
      if (unreadNotifications.length > 0) {
        // 获取所有未读通知的ID
        const unreadIds = unreadNotifications.map(n => n._id)
        console.log('准备更新为已读的通知ID:', unreadIds)
        
        // 批量更新未读通知为已读
        try {
          // 注意：小程序端每次最多能更新20条数据，如果超过需要分批处理
          // 这里简化处理，实际项目中可能需要考虑分批
          const MAX_BATCH = 20
          let totalUpdated = 0
          for (let i = 0; i < unreadIds.length; i += MAX_BATCH) {
            const batchIds = unreadIds.slice(i, i + MAX_BATCH)
            console.log('批量更新通知为已读，批次:', batchIds)
            const updateResult = await db.collection('notifications').where({
              _id: _.in(batchIds),
              recipientId: userInfo.openid
            }).update({
              data: { read: true }
            })
            console.log('批次更新结果:', updateResult)
            totalUpdated += updateResult.stats.updated
          }
          console.log('总共更新了', totalUpdated, '条通知为已读状态')
          
          // 更新本地数据状态
          notifications.forEach(notification => {
            if (!notification.read) {
              notification.read = true
            }
          })
          console.log('成功更新通知为已读状态')
        } catch (err) {
          console.error('批量更新通知状态失败，详细错误信息:', err)
          console.error('失败时的未读通知ID列表:', unreadIds)
          console.error('当前用户openid:', userInfo.openid)
        }
      }
      
      // 设置数据，包括是否有已读通知
      const hasRead = notifications.some(n => n.read)
      console.log('最终设置的通知数据:', {
        notificationCount: notifications.length,
        hasReadNotifications: hasRead,
        isEmpty: false
      })
      
      this.setData({
        loading: false,
        notifications,
        isEmpty: false,
        hasReadNotifications: hasRead
      })
      
      console.log('页面数据设置完成，当前页面notifications数组长度:', this.data.notifications.length)
      
      // 更新通知角标
      app.updateNotificationBadge()
    } catch (error) {
      console.error('加载通知失败，详细错误:', error)
      this.setData({
        loading: false,
        isEmpty: true,
        notifications: []
      })
    
    wx.showToast({
        title: '加载通知失败',
      icon: 'none'
    })
    }
    
    console.log('=== 通知数据加载完成 ===')
  },
  
  // 删除通知
  deleteNotification: function(e) {
    const index = e.currentTarget.dataset.index
    const notifications = this.data.notifications
    const notificationToDelete = notifications[index]
    
    if (!notificationToDelete || !notificationToDelete._id) {
      wx.showToast({
        title: '无法删除该通知',
        icon: 'none'
      })
      return
    }
    
    // 显示确认对话框
    wx.showModal({
      title: '提示',
      content: '确定要删除这条通知吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 从云数据库删除通知
            const db = wx.cloud.database()
            console.log('开始删除单个通知，通知ID:', notificationToDelete._id)
            console.log('删除的通知详情:', notificationToDelete)
            // 验证通知是否属于当前用户
            const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
            const deleteResult = await db.collection('notifications').where({
              _id: notificationToDelete._id,
              recipientId: userInfo.openid
            }).remove()
            console.log('单个通知删除结果:', deleteResult)
            
            // 更新本地数据
          notifications.splice(index, 1)
          
          this.setData({
            notifications,
              isEmpty: notifications.length === 0,
              hasReadNotifications: notifications.some(n => n.read)
            })
          
          wx.showToast({
            title: '已删除',
            icon: 'success'
          })
          console.log('成功删除通知并更新本地数据')
          } catch (error) {
            console.error('删除通知失败，详细错误:', error)
            console.error('删除失败的通知ID:', notificationToDelete._id)
            wx.showToast({
              title: '删除失败，请重试',
              icon: 'none'
            })
          }
        }
      }
    })
  },
  
  // 删除所有已读通知
  deleteAllReadNotifications: async function() {
    const readNotifications = this.data.notifications.filter(n => n.read)
    console.log('准备删除的已读通知数量:', readNotifications.length)
    console.log('已读通知详情:', readNotifications)
    
    if (readNotifications.length === 0) {
      wx.showToast({
        title: '没有已读通知',
        icon: 'none'
      })
      return
    }
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除所有 ${readNotifications.length} 条已读通知吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database()
            const _ = db.command
            const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
            const readIds = readNotifications.map(n => n._id)
            console.log('准备批量删除的已读通知ID列表:', readIds)
            
            // 批量删除已读通知
            const deleteResult = await db.collection('notifications').where({
              _id: _.in(readIds),
              recipientId: userInfo.openid
            }).remove()
            console.log('批量删除已读通知结果:', deleteResult)
            
            // 更新本地数据
            const remainingNotifications = this.data.notifications.filter(n => !n.read)
            console.log('删除后剩余通知数量:', remainingNotifications.length)
            
            this.setData({
              notifications: remainingNotifications,
              isEmpty: remainingNotifications.length === 0,
              hasReadNotifications: false
            })
            
            wx.showToast({
              title: '已删除所有已读通知',
              icon: 'success'
            })
            console.log('成功批量删除已读通知并更新本地数据')
          } catch (error) {
            console.error('批量删除通知失败，详细错误:', error)
            console.error('删除失败的已读通知ID列表:', readIds)
            wx.showToast({
              title: '删除失败，请重试',
              icon: 'none'
            })
          }
        }
      }
    })
  },
  
  // 处理触摸开始事件
  handleTouchStart: function(e) {
    this.setData({
      touchStartX: e.touches[0].clientX
    })
  },
  
  // 处理触摸结束事件
  handleTouchEnd: function(e) {
    const touchEndX = e.changedTouches[0].clientX
    const { touchStartX } = this.data
    const index = e.currentTarget.dataset.index
    const notifications = this.data.notifications
    
    // 计算滑动距离
    const slideDistance = touchStartX - touchEndX
    
    // 右滑至少50px显示删除按钮
    if (slideDistance > 50) {
      // 重置其他项的滑动状态
      notifications.forEach((item, i) => {
        if (i !== index) {
          item.slide = false
        }
      })
      
      // 切换当前项的滑动状态
      notifications[index].slide = !notifications[index].slide
      
      this.setData({ notifications })
    } else if (slideDistance < -50) {
      // 左滑恢复原状态
      notifications[index].slide = false
      this.setData({ notifications })
    }
  },
  
  // 转到相关页面
  navigateToRelated: function(e) {
    const index = e.currentTarget.dataset.index
    const notification = this.data.notifications[index]
    
    if (notification.type === 'event' || notification.type === 'checkin' || notification.type === 'registration') {
      if (notification.eventId) {
      wx.navigateTo({
        url: `/pages/eventDetail/eventDetail?id=${notification.eventId}`
      })
      } else {
        wx.showToast({
          title: '无法找到相关活动',
          icon: 'none'
        })
      }
    } else if (notification.type === 'client') {
      wx.navigateTo({
        url: `/pages/clientManage/clientManage`
      })
    } else if (notification.type === 'timeConfirmation' && notification.selectionId) {
      wx.navigateTo({
        url: `/pages/timeSelection/timeSelection?id=${notification.selectionId}&view=true`
      })
    } else if (notification.type === 'tag_recommendation') {
      // 标签推荐通知，显示接受/忽略选项
      this.showTagRecommendationDialog(notification, index)
    }
  },
  
  // 临时调试函数：查看数据库中所有通知记录
  debugCheckAllNotifications: async function() {
    console.log('=== 开始调试检查所有通知记录 ===')
    try {
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
      console.log('当前用户完整信息:', JSON.stringify(userInfo, null, 2))
      
      const db = wx.cloud.database()
      const allNotificationsRes = await db.collection('notifications').get()
      
      console.log('数据库中所有通知记录数量:', allNotificationsRes.data.length)
      console.log('数据库中所有通知记录:', JSON.stringify(allNotificationsRes.data, null, 2))
      
      if (userInfo && userInfo.openid) {
        const matchingNotifications = allNotificationsRes.data.filter(n => n.recipientId === userInfo.openid)
        console.log('匹配当前用户openid的通知数量:', matchingNotifications.length)
        console.log('匹配的通知记录:', JSON.stringify(matchingNotifications, null, 2))
        
        // 检查是否有其他相似的openid
        const allRecipientIds = [...new Set(allNotificationsRes.data.map(n => n.recipientId))]
        console.log('数据库中所有不同的recipientId:', allRecipientIds)
        console.log('当前用户openid:', userInfo.openid)
        
        // 检查是否有部分匹配的openid
        allRecipientIds.forEach(id => {
          if (id && id.includes(userInfo.openid.substring(0, 10))) {
            console.log('发现可能相关的recipientId:', id)
          }
        })
      }
    } catch (error) {
      console.error('调试检查通知记录失败:', error)
    }
    console.log('=== 调试检查完成 ===')
  },
  
  // 添加测试通知（仅用于演示，实际应用中可删除）


  // 显示标签推荐对话框
  showTagRecommendationDialog: function(notification, index) {
    const that = this;
    wx.showModal({
      title: '标签推荐',
      content: `${notification.senderName}为您推荐了标签"${notification.tagContent}"，是否接受？`,
      confirmText: '接受',
      cancelText: '忽略',
      success: function(res) {
        if (res.confirm) {
          // 用户选择接受
          that.acceptTagRecommendation(notification, index);
        } else if (res.cancel) {
          // 用户选择忽略
          that.ignoreTagRecommendation(notification, index);
        }
      }
    });
  },

  // 接受标签推荐
  acceptTagRecommendation: async function(notification, index) {
    try {
      wx.showLoading({ title: '处理中...' });
      
      const db = wx.cloud.database();
      const _ = db.command;
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
      
      // 1. 更新推荐标签状态为已接受
      await db.collection('users').where({
        openid: userInfo.openid
      }).update({
        data: {
          recommendTags: _.elemMatch({
            eventId: notification.eventId,
            content: notification.tagContent,
            recommenderId: notification.senderOpenid
          }).set({
            status: 'accepted'
          })
        }
      });
      
      // 2. 将标签添加到个人描述标签中
      const userDoc = await db.collection('users').where({
        openid: userInfo.openid
      }).get();
      
      if (userDoc.data.length > 0) {
        const userData = userDoc.data[0];
        const personalTags = userData.personalTags || [];
        
        // 检查标签是否已存在
        if (!personalTags.includes(notification.tagContent)) {
          await db.collection('users').where({
            openid: userInfo.openid
          }).update({
            data: {
              personalTags: _.push(notification.tagContent)
            }
          });
        }
      }
      
      // 3. 标记通知为已读
      console.log('标记标签推荐通知为已读，通知ID:', notification._id)
      await db.collection('notifications').doc(notification._id).update({
        data: {
          read: true
        }
      });
      console.log('成功标记标签推荐通知为已读')
      
      wx.hideLoading();
      wx.showToast({ title: '已接受推荐标签', icon: 'success' });
      
      // 刷新通知列表
      this.loadNotifications();
      
    } catch (error) {
      wx.hideLoading();
      console.error('接受标签推荐失败:', error);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  // 忽略标签推荐
  ignoreTagRecommendation: async function(notification, index) {
    try {
      wx.showLoading({ title: '处理中...' });
      
      const db = wx.cloud.database();
      const _ = db.command;
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
      
      // 1. 更新推荐标签状态为已忽略
      await db.collection('users').where({
        openid: userInfo.openid
      }).update({
        data: {
          recommendTags: _.elemMatch({
            eventId: notification.eventId,
            content: notification.tagContent,
            recommenderId: notification.senderOpenid
          }).set({
            status: 'ignored'
          })
        }
      });
      
      // 2. 标记通知为已读
      console.log('标记忽略标签推荐通知为已读，通知ID:', notification._id)
      await db.collection('notifications').doc(notification._id).update({
        data: {
          read: true
        }
      });
      console.log('成功标记忽略标签推荐通知为已读')
      
      wx.hideLoading();
      wx.showToast({ title: '已忽略推荐标签', icon: 'success' });
      
      // 刷新通知列表
      this.loadNotifications();
      
    } catch (error) {
      wx.hideLoading();
      console.error('忽略标签推荐失败:', error);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  }

})