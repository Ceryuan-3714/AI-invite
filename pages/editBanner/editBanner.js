const cloudDB = require('../../utils/cloudDB.js')

Page({
  data: {
    bannerList: [],
    loading: true,
    showEditModal: false,
    editingBanner: {
      _id: null,
      title: '',
      subtitle: '',
      imageUrl: '',
      jumpPath: '',
      selectedActivity: null,
      order: 1,
      isActive: true
    },
    saving: false,
    tempImageUrl: '',
    tempImagePath: '',
    // 活动选择相关
    showActivityModal: false,
    activities: [],
    filteredActivities: [],
    loadingActivities: false,
    searchKeyword: ''
  },

  onLoad: function(options) {
    this.loadBannerList()
  },

  onShow: function() {
    // 从图片裁剪页面返回时刷新数据
    if (this.data.needRefresh) {
      this.loadBannerList()
      this.setData({ needRefresh: false })
    }
  },

  // 加载轮播图列表
  loadBannerList: function() {
    this.setData({ loading: true })
    
    const db = wx.cloud.database()
    db.collection('home_banners')
      .orderBy('order', 'asc')
      .get()
      .then(res => {
        console.log('轮播图列表:', res.data)
        this.setData({
          bannerList: res.data,
          loading: false
        })
      })
      .catch(err => {
        console.error('加载轮播图失败:', err)
        wx.showToast({
          title: '加载失败',
          icon: 'error'
        })
        this.setData({ loading: false })
      })
  },

  // 添加轮播图
  addBannerItem: function() {
    this.setData({
      showEditModal: true,
      editingBanner: {
        _id: null,
        title: '',
        subtitle: '',
        imageUrl: '',
        jumpPath: '',
        selectedActivity: null,
        order: this.data.bannerList.length + 1,
        isActive: true
      }
    })
  },

  // 编辑轮播图
  editBannerItem: function(e) {
    const id = e.currentTarget.dataset.id
    const banner = this.data.bannerList.find(item => item._id === id)
    
    if (banner) {
      this.setData({
        showEditModal: true,
        editingBanner: { ...banner }
      })
    }
  },

  // 切换轮播图状态
  toggleBannerStatus: function(e) {
    const id = e.currentTarget.dataset.id
    const banner = this.data.bannerList.find(item => item._id === id)
    
    if (!banner) return
    
    wx.showLoading({ title: '更新中...' })
    
    const db = wx.cloud.database()
    db.collection('home_banners')
      .doc(id)
      .update({
        data: {
          isActive: !banner.isActive
        }
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        })
        this.loadBannerList()
      })
      .catch(err => {
        wx.hideLoading()
        console.error('更新状态失败:', err)
        wx.showToast({
          title: '更新失败',
          icon: 'error'
        })
      })
  },

  // 删除轮播图
  deleteBannerItem: function(e) {
    const id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个轮播图吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          
          const db = wx.cloud.database()
          
          // 先获取轮播图数据，以便删除对应的图片文件
          db.collection('home_banners')
            .doc(id)
            .get()
            .then(res => {
              const bannerData = res.data
              const imageUrl = bannerData.imageUrl
              
              // 删除数据库记录
              return db.collection('home_banners')
                .doc(id)
                .remove()
                .then(() => {
                  // 如果有图片且是云存储文件，则删除图片
                  if (imageUrl && imageUrl.startsWith('cloud://')) {
                    wx.cloud.deleteFile({
                      fileList: [imageUrl],
                      success: function(deleteRes) {
                        console.log('轮播图图片删除成功:', deleteRes)
                      },
                      fail: function(deleteErr) {
                        console.error('轮播图图片删除失败:', deleteErr)
                      }
                    })
                  }
                  
                  wx.hideLoading()
                  wx.showToast({
                    title: '删除成功',
                    icon: 'success'
                  })
                  this.loadBannerList()
                })
            })
            .catch(err => {
              wx.hideLoading()
              console.error('删除失败:', err)
              wx.showToast({
                title: '删除失败',
                icon: 'error'
              })
            })
        }
      }
    })
  },

  // 上传图片
  uploadImage: function() {
    const that = this
    
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        const tempFilePath = res.tempFiles[0].tempFilePath
        console.log('选择轮播图成功', tempFilePath)
        
        // 使用微信官方图像裁剪接口，固定比例16:9
        wx.cropImage({
          src: tempFilePath,
          cropScale: '16:9', // 固定比例16:9
          success: function(cropRes) {
            console.log('图片裁剪成功', cropRes.tempFilePath)
            // 更新临时图片URL和路径
            that.setData({
              tempImageUrl: cropRes.tempFilePath,
              tempImagePath: cropRes.tempFilePath,
              'editingBanner.imageUrl': cropRes.tempFilePath
            })
            
            wx.showToast({
              title: '图片已设置',
              icon: 'success',
              duration: 1500
            })
          },
          fail: function(cropErr) {
            console.error('图片裁剪失败', cropErr)
            // 如果裁剪失败，直接使用原图
            that.setData({
              tempImageUrl: tempFilePath,
              tempImagePath: tempFilePath,
              'editingBanner.imageUrl': tempFilePath
            })
            
            wx.showToast({
              title: '裁剪失败，使用原图',
              icon: 'none'
            })
          }
        })
      },
      fail: function(err) {
        console.error('选择轮播图失败', err)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 预览图片
  previewImage: function() {
    if (this.data.editingBanner.imageUrl) {
      wx.previewImage({
        urls: [this.data.editingBanner.imageUrl]
      })
    }
  },

  // 删除图片
  removeImage: function() {
    this.setData({
      'editingBanner.imageUrl': '',
      tempImageUrl: '',
      tempImagePath: ''
    })
  },

  // 表单输入处理
  onTitleInput: function(e) {
    this.setData({
      'editingBanner.title': e.detail.value
    })
  },

  onSubtitleInput: function(e) {
    this.setData({
      'editingBanner.subtitle': e.detail.value
    })
  },

  onJumpPathInput: function(e) {
    this.setData({
      'editingBanner.jumpPath': e.detail.value
    })
  },

  // 打开活动选择弹窗
  openActivitySelector: function() {
    this.setData({ showActivityModal: true })
    this.loadActivities()
  },

  // 关闭活动选择弹窗
  closeActivityModal: function() {
    this.setData({ 
      showActivityModal: false,
      searchKeyword: '',
      filteredActivities: this.data.activities
    })
  },

  // 加载活动列表
  loadActivities: function() {
    this.setData({ loadingActivities: true })
    
    const db = wx.cloud.database()
    db.collection('events')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()
      .then(res => {
        console.log('活动列表:', res.data)
        this.setData({
          activities: res.data,
          filteredActivities: res.data,
          loadingActivities: false
        })
      })
      .catch(err => {
        console.error('加载活动失败:', err)
        wx.showToast({
          title: '加载活动失败',
          icon: 'error'
        })
        this.setData({ loadingActivities: false })
      })
  },

  // 搜索输入处理
  onSearchInput: function(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })
    this.filterActivities(keyword)
  },

  // 搜索活动
  searchActivities: function() {
    this.filterActivities(this.data.searchKeyword)
  },

  // 清除搜索
  clearSearch: function() {
    this.setData({ 
      searchKeyword: '',
      filteredActivities: this.data.activities
    })
  },

  // 过滤活动
  filterActivities: function(keyword) {
    if (!keyword.trim()) {
      this.setData({ filteredActivities: this.data.activities })
      return
    }
    
    const filtered = this.data.activities.filter(activity => {
      return activity.title && activity.title.toLowerCase().includes(keyword.toLowerCase())
    })
    
    this.setData({ filteredActivities: filtered })
  },

  // 选择活动
  selectActivity: function(e) {
    const activity = e.currentTarget.dataset.activity
    this.setData({
      'editingBanner.selectedActivity': activity,
      'editingBanner.jumpPath': `/pages/eventDetail/eventDetail?id=${activity._id}`
    })
  },

  // 确认活动选择
  confirmActivitySelection: function() {
    this.closeActivityModal()
    wx.showToast({
      title: '活动已选择',
      icon: 'success'
    })
  },

  // 预览活动
  previewActivity: function() {
    if (this.data.editingBanner.selectedActivity) {
      wx.navigateTo({
        url: `/pages/eventDetail/eventDetail?id=${this.data.editingBanner.selectedActivity._id}`
      })
    }
  },

  onOrderInput: function(e) {
    this.setData({
      'editingBanner.order': parseInt(e.detail.value) || 1
    })
  },

  onStatusChange: function(e) {
    this.setData({
      'editingBanner.isActive': e.detail.value
    })
  },

  // 保存轮播图
  saveBannerItem: async function() {
    const banner = this.data.editingBanner
    
    // 验证必填字段
    if (!banner.title.trim()) {
      wx.showToast({
        title: '请输入标题',
        icon: 'error'
      })
      return
    }
    
    if (!banner.imageUrl) {
      wx.showToast({
        title: '请上传图片',
        icon: 'error'
      })
      return
    }
    
    this.setData({ saving: true })
    
    try {
      let imageUrl = banner.imageUrl
      
      // 如果有临时图片路径，需要上传到云存储
      if (this.data.tempImagePath && this.data.tempImagePath === banner.imageUrl) {
        imageUrl = await this.uploadImageToCloud(this.data.tempImagePath)
      }
      
      const data = {
        title: banner.title.trim(),
        subtitle: banner.subtitle.trim(),
        imageUrl: imageUrl,
        jumpPath: banner.jumpPath.trim(),
        selectedActivity: banner.selectedActivity,
        order: banner.order,
        isActive: banner.isActive
      }
      
      const db = wx.cloud.database()
      const promise = banner._id 
        ? db.collection('home_banners').doc(banner._id).update({ data })
        : db.collection('home_banners').add({ data })
      
      await promise
      
      this.setData({ saving: false })
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      this.closeEditModal()
      this.loadBannerList()
    } catch (err) {
      this.setData({ saving: false })
      console.error('保存失败:', err)
      wx.showToast({
        title: '保存失败',
        icon: 'error'
      })
    }
  },

  // 关闭编辑弹窗
  closeEditModal: function() {
    this.setData({
      showEditModal: false,
      editingBanner: {
        _id: null,
        title: '',
        subtitle: '',
        imageUrl: '',
        jumpPath: '',
        selectedActivity: null,
        order: 1,
        isActive: true
      },
      tempImageUrl: '',
      tempImagePath: ''
    })
  },

  // 阻止事件冒泡
  stopPropagation: function() {
    // 阻止点击模态框内容时关闭弹窗
  },

  // 将图片上传到云存储
  uploadImageToCloud: function(filePath) {
    const that = this
    return new Promise(function(resolve, reject) {
      // 获取原有图片地址
      const oldImageUrl = that.data.editingBanner && that.data.editingBanner.imageUrl ? that.data.editingBanner.imageUrl : null
      
      let fileExt = 'png'
      const extMatch = filePath.match(/\.(\w+)$/)
      if (extMatch && extMatch[1]) {
        fileExt = extMatch[1]
      }
      
      const fileName = `banner_${Date.now()}.${fileExt}`
      
      wx.cloud.uploadFile({
        cloudPath: `banners/${fileName}`,
        filePath: filePath,
        success: function(uploadRes) {
          console.log('图片上传成功:', uploadRes.fileID)
          
          // 删除旧图片（如果存在且是云存储文件）
          if (oldImageUrl && oldImageUrl.startsWith('cloud://')) {
            wx.cloud.deleteFile({
              fileList: [oldImageUrl],
              success: function(deleteRes) {
                console.log('旧图片删除成功:', deleteRes)
              },
              fail: function(deleteErr) {
                console.error('旧图片删除失败:', deleteErr)
              }
            })
          }
          
          resolve(uploadRes.fileID)
        },
        fail: function(uploadErr) {
          console.error('图片上传失败:', uploadErr)
          reject(uploadErr)
        }
      })
    })
  }
})