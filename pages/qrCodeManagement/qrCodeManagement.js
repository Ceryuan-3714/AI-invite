const app = getApp();
const cloudDB = require('../../utils/cloudDB.js');
const authUtils = require('../../utils/authUtils.js');

Page({
  data: {
    eventId: '',
    qrCodes: [],
    isEditingName: false,
    editingName: '',
    loading: true,
    deleteMode: false,
    selectedCount: 0,
    allSelected: false,
    showPreview: false,
    currentPreviewQR: null,
    showDeleteConfirm: false,
    nextQRNumber: 1, // 用于生成默认名称的序号
    showNameModal: false, // 显示命名蒙版
    newQRName: '' // 新二维码名称
  },

  onLoad: function(options) {
    console.log('二维码管理页面加载，参数:', options);
    
    if (options.eventId) {
      this.setData({
        eventId: options.eventId
      });
      this.loadQRCodes();
    } else {
      wx.showToast({
        title: '缺少活动ID参数',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  // 加载二维码列表
  loadQRCodes: async function() {
    try {
      this.setData({ loading: true });
      
      // 检查 eventId 是否存在
      if (!this.data.eventId) {
        console.error('加载二维码列表失败: eventId 不存在');
        wx.showToast({
          title: '加载失败，缺少活动ID',
          icon: 'none'
        });
        this.setData({ loading: false });
        return;
      }
      
      console.log('开始加载二维码列表，eventId:', this.data.eventId);
      
      // 调用云函数获取二维码列表
      const result = await wx.cloud.callFunction({
        name: 'getEventQRCodes',
        data: {
          eventId: this.data.eventId
        }
      });

      console.log('getEventQRCodes 云函数返回结果:', result);
      console.log('赋值前的result数据:', result.result.data);
      const qrCodes = result.result.data || [];
      console.log('赋值后的qrCodes数组:', qrCodes);
      console.log(`获取到 ${qrCodes.length} 个二维码`);
        
      // 处理二维码数据，添加显示需要的字段
      const processedQRCodes = qrCodes.map((qr, index) => {
        // 检查二维码对象是否有效
        if (!qr || !qr._id) {
          console.warn(`发现无效的二维码数据，索引: ${index}`, qr);
        }
        
        return {
          ...qr,
          selected: false,
          editing: false,
          createTime: this.formatDate(qr.createTime),
          statusText: qr.status === 'active' ? '有效' : '已失效'
        };
      });

      // 计算下一个序号
      const maxNumber = qrCodes.reduce((max, qr) => {
        const match = qr.name?.match(/^二维码(\d+)$/);
        if (match) {
          return Math.max(max, parseInt(match[1]));
        }
        return max;
      }, 0);

      this.setData({
        qrCodes: processedQRCodes,
        nextQRNumber: maxNumber + 1,
        loading: false
      });
      
      console.log('二维码列表加载完成，数据已更新');
    } catch (error) {
      console.error('加载二维码列表失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  // 显示命名蒙版
  addQRCode: function() {
    this.setData({
      showNameModal: true,
      newQRName: `二维码${this.data.nextQRNumber}`
    });
  },

  // 输入二维码名称
  onQRNameInput: function(e) {
    this.setData({
      newQRName: e.detail.value
    });
  },

  // 取消命名
  cancelNaming: function() {
    this.setData({
      showNameModal: false,
      newQRName: ''
    });
  },

  // 确认创建二维码
  confirmCreateQR: async function() {
    const qrName = this.data.newQRName.trim();
    
    if (!qrName) {
      wx.showToast({
        title: '请输入二维码名称',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '生成中...' });
      
      console.log('开始生成二维码，参数:', {
        eventId: this.data.eventId,
        name: qrName,
        isManagementQR: true,
        page: 'pages/eventDetail/eventDetail'
      });
      
      // 调用云函数生成新的二维码
      const result = await wx.cloud.callFunction({
        name: 'generateEventQRCode',
        data: {
          eventId: this.data.eventId,
          name: qrName,
          isManagementQR: true,
          page: 'pages/eventDetail/eventDetail'
        }
      });

      wx.hideLoading();
      
      console.log('云函数返回结果:', result);

      if (result.result && result.result.success) {
        wx.showToast({
          title: '生成成功',
          icon: 'success'
        });
        
        // 关闭蒙版
        this.setData({
          showNameModal: false,
          newQRName: ''
        });
        
        // 重新加载列表
        this.loadQRCodes();
      } else {
        console.error('云函数执行失败:', result.result);
        throw new Error(result.result?.message || '生成二维码失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('生成二维码失败:', error);
      console.error('错误详情:', {
        message: error.message,
        stack: error.stack,
        errCode: error.errCode
      });
      wx.showToast({
        title: error.message || '生成失败',
        icon: 'none'
      });
    }
  },

  // 切换删除模式
  toggleDeleteMode: function() {
    const newDeleteMode = !this.data.deleteMode;
    
    // 如果退出删除模式，清除所有选择
    if (!newDeleteMode) {
      const qrCodes = this.data.qrCodes.map(qr => ({
        ...qr,
        selected: false
      }));
      
      this.setData({
        deleteMode: newDeleteMode,
        qrCodes: qrCodes,
        selectedCount: 0,
        allSelected: false
      });
    } else {
      this.setData({
        deleteMode: newDeleteMode
      });
    }
  },

  // 切换二维码选择状态
  toggleSelectQR: function(e) {
    if (!this.data.deleteMode) return;
    
    const index = e.currentTarget.dataset.index;
    const qrCodes = [...this.data.qrCodes];
    qrCodes[index].selected = !qrCodes[index].selected;
    
    const selectedCount = qrCodes.filter(qr => qr.selected).length;
    const allSelected = selectedCount === qrCodes.length;
    
    this.setData({
      qrCodes: qrCodes,
      selectedCount: selectedCount,
      allSelected: allSelected
    });
  },

  // 切换全选状态
  toggleSelectAll: function() {
    const newAllSelected = !this.data.allSelected;
    const qrCodes = this.data.qrCodes.map(qr => ({
      ...qr,
      selected: newAllSelected
    }));
    
    this.setData({
      qrCodes: qrCodes,
      allSelected: newAllSelected,
      selectedCount: newAllSelected ? qrCodes.length : 0
    });
  },

  // 编辑二维码名称
  editQRName: function(e) {
    console.log("点击编辑按钮", e);
    const index = e.currentTarget.dataset.index;
    const qrId = e.currentTarget.dataset.qrid;
    console.log("编辑的二维码索引:", index, "二维码ID:", qrId);
    
    if (!qrId) {
      wx.showToast({
        title: '无法获取二维码ID',
        icon: 'none'
      });
      return;
    }
    
    const qrCodes = [...this.data.qrCodes];
    qrCodes[index].editing = true;
    
    console.log("更新前的二维码数据:", qrCodes[index]);
    
    this.setData({
      qrCodes: qrCodes
    }, () => {
      console.log("更新后的二维码数据:", this.data.qrCodes[index]);
    });
  },

  saveQRName: async function(e) {
    console.log('点击预览事件对象:', e);
    console.log('dataset内容:', JSON.stringify(e.currentTarget.dataset));
    const index = e.currentTarget.dataset.index;
    const qrId = e.currentTarget.dataset.qrid;
    const newName = e.detail.value.trim();
    const qrCodes = [...this.data.qrCodes];
    const qrCode = qrCodes[index];
    const originalName = qrCode.name;

    if (newName === "") {
      wx.showToast({
        title: '名称不能为空',
        icon: 'none'
      });
      qrCodes[index].editing = false;
      this.setData({ qrCodes });
      return;
    }

    if (newName === originalName) {
      qrCodes[index].editing = false;
      this.setData({ qrCodes });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'updateQRCodeName',
        data: {
          qrCodeId: qrId || qrCode._id,
          name: newName,
          eventId: this.data.eventId
        }
      });

      if (res.result.success) {
        qrCodes[index].name = newName;
        qrCodes[index].editing = false;
        this.setData({ qrCodes });
        wx.showToast({ title: '名称更新成功' });
      } else {
        throw new Error(res.result.message);
      }
    } catch (error) {
      console.error("更新二维码名称失败:", error);
      wx.showToast({
        title: '更新失败，请重试',
        icon: 'none'
      });
      qrCodes[index].editing = false;
      this.setData({ qrCodes });
    } finally {
      wx.hideLoading();
    }
  },

  // 取消编辑二维码名称
  cancelEditQRName: function(e) {
    const index = e.currentTarget.dataset.index;
    const qrCodes = [...this.data.qrCodes];
    qrCodes[index].editing = false;
    
    this.setData({
      qrCodes: qrCodes
    });
  },

  // 预览二维码
  previewQRCode: function(e) {
    if (this.data.deleteMode) return;
    
    const index = e.currentTarget.dataset.index;
    if (index < 0 || index >= this.data.qrCodes.length) {
      console.error('预览二维码失败: 索引无效', index);
      return;
    }
    
    const qrCode = this.data.qrCodes[index];
    if (!qrCode) {
      console.error('预览二维码失败: 二维码对象不存在');
      return;
    }
    
    // 添加更详细的日志，检查 qrCode 对象的完整结构
    console.log('预览二维码，原始 qrCode 对象:', JSON.stringify(qrCode));
    console.log('预览二维码，qrCode._id:', qrCode._id);
    
    // 使用深拷贝避免引用问题
    const qrCodeCopy = {
      ...qrCode,
      _id: qrCode._id
    };
    
    // 检查深拷贝后的对象
    console.log('预览二维码，深拷贝后的 qrCodeCopy 对象:', JSON.stringify(qrCodeCopy));
    console.log('预览二维码，qrCodeCopy._id:', qrCodeCopy._id);
    
    this.setData({
      showPreview: true,
      currentPreviewQR: qrCodeCopy,
      currentPreviewIndex: index // 保存索引，以便在需要时可以重新获取
    });
    
    // 确认设置成功
    console.log('预览二维码设置完成，currentPreviewQR:', JSON.stringify(this.data.currentPreviewQR));
    console.log('预览二维码设置完成，currentPreviewQR._id:', this.data.currentPreviewQR?._id);
    console.log('预览二维码设置完成，currentPreviewIndex:', this.data.currentPreviewIndex);
  },

  // 关闭预览
  closePreview() {
    // 添加日志，记录关闭预览前的状态
    console.log('关闭预览，当前状态:', {
      showPreview: this.data.showPreview,
      currentPreviewQR: JSON.stringify(this.data.currentPreviewQR),
      currentPreviewQR_id: this.data.currentPreviewQR?._id,
      currentPreviewIndex: this.data.currentPreviewIndex,
      isEditingName: this.data.isEditingName
    });
    
    // 修改关闭预览的行为，保留currentPreviewQR和currentPreviewIndex
    this.setData({
      showPreview: false,
      isEditingName: false,
      editingName: ''
      // 保留 currentPreviewQR 和 currentPreviewIndex
    });
    
    // 添加日志，确认状态
    console.log('预览已关闭，保留的数据:', {
      currentPreviewQR: JSON.stringify(this.data.currentPreviewQR),
      currentPreviewQR_id: this.data.currentPreviewQR?._id,
      currentPreviewIndex: this.data.currentPreviewIndex
    });
  },

  // 保存二维码到相册
  saveQRToAlbum: function() {
    if (!this.data.currentPreviewQR) return;
    
    wx.saveImageToPhotosAlbum({
      filePath: this.data.currentPreviewQR.qrCodeUrl,
      success: () => {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
      },
      fail: (error) => {
        console.error('保存到相册失败:', error);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  // 分享二维码
  shareQRCode: function() {
    if (!this.data.currentPreviewQR) return;
    
    // 这里可以实现分享功能
    wx.showToast({
      title: '分享功能开发中',
      icon: 'none'
    });
  },

  // 确认删除
  confirmDelete: function() {
    if (this.data.selectedCount === 0) {
      wx.showToast({
        title: '请选择要删除的二维码',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      showDeleteConfirm: true
    });
  },

  // 取消删除
  cancelDelete: function() {
    this.setData({
      showDeleteConfirm: false
    });
  },

  // 执行删除
  executeDelete: async function() {
    try {
      wx.showLoading({ title: '删除中...' });
      
      const selectedQRCodes = this.data.qrCodes.filter(qr => qr.selected);
      const qrCodeIds = selectedQRCodes.map(qr => qr._id);
      
      // 调用云函数删除二维码
      const result = await wx.cloud.callFunction({
        name: 'deleteQRCodes',
        data: {
          qrCodeIds: qrCodeIds
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
        
        this.setData({
          showDeleteConfirm: false,
          deleteMode: false
        });
        
        // 重新加载列表
        this.loadQRCodes();
      } else {
        throw new Error(result.result?.message || '删除失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('删除二维码失败:', error);
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  // 图片加载错误处理
  onImageError: function(e) {
    const index = e.currentTarget.dataset.index;
    const qrCode = this.data.qrCodes[index];
    
    console.log(`二维码图片加载失败:`, {
      index: index,
      qrCodeId: qrCode?._id,
      qrCodeName: qrCode?.name,
      qrCodeUrl: qrCode?.qrCodeUrl,
      errorDetail: e.detail
    });
    
    // 标记该二维码图片加载失败
    const qrCodes = [...this.data.qrCodes];
    if (qrCodes[index]) {
      qrCodes[index].imageLoadError = true;
    }
    
    this.setData({ qrCodes });
    
    wx.showToast({
      title: `二维码"${qrCode?.name || ''}"加载失败`,
      icon: 'none',
      duration: 2000
    });
  },

  // 格式化日期
  formatDate: function(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // 如果是今天
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 如果是昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
      return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // 其他日期
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  },

  editName: function(e) {
    const qrId = e.currentTarget.dataset.qrid;
    if (this.data.currentPreviewQR && this.data.currentPreviewQR._id === qrId) {
      this.setData({
        isEditingName: true,
        editingName: this.data.currentPreviewQR.name
      });
    } else {
      wx.showToast({
        title: '无法编辑',
        icon: 'none'
      });
    }
  },

  onNameInput(e) {
    this.setData({
      editingName: e.detail.value
    });
  },

  saveName: async function() {
    const newName = this.data.editingName.trim();
    if (!newName) {
      wx.showToast({ title: '名称不能为空', icon: 'none' });
      return;
    }

    const qrCode = this.data.currentPreviewQR;
    if (!qrCode || !qrCode._id) {
      wx.showToast({ title: '无法获取二维码信息', icon: 'none' });
      return;
    }

    if (newName === qrCode.name) {
      this.setData({ isEditingName: false });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'updateQRCodeName',
        data: {
          qrCodeId: qrCode._id,
          name: newName,
          eventId: this.data.eventId
        }
      });

      if (res.result.success) {
        const qrCodes = [...this.data.qrCodes];
        const index = qrCodes.findIndex(item => item._id === qrCode._id);
        if (index > -1) {
          qrCodes[index].name = newName;
        }
        this.setData({
          'currentPreviewQR.name': newName,
          qrCodes: qrCodes,
          isEditingName: false
        });
        wx.showToast({ title: '名称更新成功' });
      } else {
        throw new Error(res.result.message);
      }
    } catch (error) {
      console.error("更新二维码名称失败:", error);
      wx.showToast({ title: '更新失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  cancelEdit() {
    console.log('取消编辑，当前状态:', {
      currentPreviewQR: JSON.stringify(this.data.currentPreviewQR),
      currentPreviewQR_id: this.data.currentPreviewQR?._id,
      currentPreviewIndex: this.data.currentPreviewIndex,
      isEditingName: this.data.isEditingName,
      editingName: this.data.editingName
    });
    
    this.setData({
      isEditingName: false,
      editingName: ''
      // 保留 currentPreviewQR 和 currentPreviewIndex
    });
    
    console.log('编辑已取消，保留的数据:', {
      currentPreviewQR: JSON.stringify(this.data.currentPreviewQR),
      currentPreviewQR_id: this.data.currentPreviewQR?._id,
      currentPreviewIndex: this.data.currentPreviewIndex
    });
  },

  // 页面分享
  onShareAppMessage: function() {
    return {
      title: '活动二维码管理',
      path: `/pages/qrCodeManagement/qrCodeManagement?eventId=${this.data.eventId}`
    };
  },

  // 跳转到二维码对应的页面（用于验证二维码跳转有效性）
  navigateToQRPage: async function() {
    const qrCode = this.data.currentPreviewQR;
    if (!qrCode || !qrCode.qrCodePath) {
      wx.showToast({
        title: '无法获取跳转路径',
        icon: 'none'
      });
      return;
    }

    try {
      let path = qrCode.qrCodePath;
      
      // 确保路径格式正确
      if (path && !path.startsWith('/')) {
        path = '/' + path;
      }
      
      console.log('原始跳转路径:', path);
      
      // 解析路径中的shortId参数，统一转换为活动ID格式，但保留所有参数
      if (path.includes('sid=')) {
        console.log('检测到shortId参数，开始解析并统一参数格式');
        wx.showLoading({ title: '验证跳转路径...' });
        
        try {
          // 提取所有参数
          const urlParts = path.split('?');
          if (urlParts.length > 1) {
            const params = urlParts[1];
            const shortIdMatch = params.match(/sid=([^&]+)/);
            const qrCodeIdMatch = params.match(/qid=([^&]+)/);
            
            if (shortIdMatch && shortIdMatch[1]) {
              const shortId = shortIdMatch[1];
              const qrCodeId = qrCodeIdMatch ? qrCodeIdMatch[1] : null;
              
              console.log('提取到参数:', { shortId, qrCodeId });
              
              // 通过shortId获取活动信息
              const event = await cloudDB.getEventByShortId(shortId);
              if (!event) {
                throw new Error('未找到对应的活动');
              }
              
              // 验证活动对象是否包含有效的_id
              if (!event._id || typeof event._id !== 'string') {
                console.error('获取到的活动对象缺少有效的_id字段:', event);
                throw new Error('活动数据异常');
              }
              
              console.log('找到活动，ID:', event._id);
              
              // 构造新的跳转路径，统一使用活动ID格式，但保留所有参数
              const basePage = urlParts[0];
              let newPath = `${basePage}?id=${event._id}`;
              
              // 保留qrCodeId参数（用于访问计数）
              if (qrCodeId) {
                newPath += `&qid=${qrCodeId}`;
              }
              
              // 保留其他可能的参数
              const otherParams = params.replace(/sid=[^&]+/g, '').replace(/qid=[^&]+/g, '').replace(/^&+|&+$/g, '').replace(/&+/g, '&');
              if (otherParams) {
                newPath += `&${otherParams}`;
              }
              
              console.log('统一参数格式后的跳转路径:', newPath);
              path = newPath;
            }
          }
        } catch (error) {
          wx.hideLoading();
          console.error('解析shortId或查找活动失败:', error);
          wx.showToast({
            title: error.message || '验证跳转路径失败',
            icon: 'none'
          });
          return;
        }
        
        wx.hideLoading();
      }
      
      console.log('最终验证跳转路径:', path);
      
      // 关闭预览弹窗
      this.setData({ showPreview: false });
      
      // 尝试导航（验证跳转有效性）
      wx.navigateTo({
        url: path,
        success: () => {
          console.log('二维码跳转验证成功');
        },
        fail: (err) => {
          console.error('二维码跳转验证失败:', err);
          // 如果是tabBar页面，尝试使用switchTab
          if (path.includes('/pages/index/index') || 
              path.includes('/pages/mine/mine') || 
              path.includes('/pages/notifications/notifications')) {
            wx.switchTab({
              url: path.split('?')[0], // tabBar页面不支持参数
              success: () => {
                console.log('二维码跳转验证成功（tabBar页面）');
              },
              fail: (switchErr) => {
                console.error('二维码跳转验证失败（tabBar页面）:', switchErr);
                wx.showToast({
                  title: '二维码跳转验证失败',
                  icon: 'none'
                });
              }
            });
          } else {
            wx.showToast({
              title: '二维码跳转验证失败',
              icon: 'none'
            });
          }
        }
      });
    } catch (error) {
      console.error('验证二维码跳转过程中发生错误:', error);
      wx.showToast({
        title: '验证过程中发生错误',
        icon: 'none'
      });
    }
  },

  // 空操作函数，用于阻止事件冒泡
  noop: function() {}
});