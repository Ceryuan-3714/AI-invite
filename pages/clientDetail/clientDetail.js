// pages/clientDetail/clientDetail.js
const app = getApp();
const cloudDB = require('../../utils/cloudDB.js');

// 兼容新旧数据结构的辅助函数
function getCompanyPositionText(userInfo) {
  if (!userInfo) return '';
  
  // 新数据结构：使用 companyPositions 数组
  if (userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && userInfo.companyPositions.length > 0) {
    // 显示所有公司和职位组合
    const positions = userInfo.companyPositions
      .filter(item => item.company || item.position) // 过滤掉空的条目
      .map(item => `${item.company || ''} ${item.position || ''}`.trim())
      .filter(text => text.length > 0); // 过滤掉空字符串
    return positions.length > 0 ? positions.join(' | ') : '';
  }
  
  // 旧数据结构：使用单独的 company 和 position 字段
  return `${userInfo.company || ''} ${userInfo.position || ''}`.trim();
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    clientId: '',
    client: null,
    folders: [],
    folderName: '',
    showMenu: false,
    showEditModal: false,
    showMoveModal: false,
    showDeleteModal: false,
    editForm: {
      name: '',
      company: '',
      position: '',
      phone: '',
      email: '',
      tags: [],
      notes: ''
    },
    newTag: '',
    selectedFolderId: '',
    // 互动记录示例数据，实际应从数据库获取
    interactions: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: async function(options) {
    if (options.id) {
      this.setData({ 
        clientId: options.id,
      });
      
      // 加载客户详情和文件夹数据
      await this.loadClientData();
      await this.loadFolders();
    } else {
      wx.showToast({
        title: '客户ID不存在',
        icon: 'none'
      });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 加载客户数据
   */
  loadClientData: async function() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      const client = await cloudDB.getClientById(this.data.clientId);
      
      if (!client) {
        wx.hideLoading();
        wx.showToast({
          title: '未找到客户信息',
          icon: 'none'
        });
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }
      
      // 设置初始的编辑表单数据
      const editForm = {
        name: client.name || '',
        company: client.company || '',
        position: client.position || '',
        phone: client.phone || '',
        email: client.email || '',
        tags: client.tags || [],
        notes: client.notes || ''
      };
      
      this.setData({ 
        client,
        editForm,
        selectedFolderId: client.folderId || ''
      });
      
      wx.hideLoading();
      
      // 更新文件夹名称
      if (client.folderId) {
        this.updateFolderName(client.folderId);
      }
    } catch (error) {
      wx.hideLoading();
      console.error('加载客户数据失败', error);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 加载所有文件夹
   */
  loadFolders: async function() {
    try {
      const folders = await cloudDB.getAllFolders();
      this.setData({ folders });
      
      // 如果客户有文件夹ID，更新文件夹名称
      if (this.data.client && this.data.client.folderId) {
        this.updateFolderName(this.data.client.folderId);
      }
    } catch (error) {
      console.error('加载文件夹失败', error);
    }
  },
  
  /**
   * 更新文件夹名称
   */
  updateFolderName: function(folderId) {
    const { folders } = this.data;
    const folder = folders.find(f => f._id === folderId);
    
    if (folder) {
      this.setData({ folderName: folder.name });
    } else {
      this.setData({ folderName: '' });
    }
  },

  /**
   * 返回上一页
   */
  goBack: function() {
    wx.navigateBack();
  },

  /**
   * 切换菜单显示
   */
  toggleMenu: function() {
    this.setData({ showMenu: !this.data.showMenu });
  },

  /**
   * 编辑客户信息
   */
  editClient: function() {
    this.setData({
      showMenu: false,
      showEditModal: true
    });
  },

  /**
   * 移动客户到其他分组
   */
  moveClient: function() {
    this.setData({
      showMenu: false,
      showMoveModal: true,
      selectedFolderId: this.data.client.folderId || ''
    });
  },

  /**
   * 确认删除客户
   */
  confirmDelete: function() {
    this.setData({
      showMenu: false,
      showDeleteModal: true
    });
  },

  /**
   * 关闭编辑对话框
   */
  closeEditModal: function() {
    this.setData({ showEditModal: false });
  },

  /**
   * 关闭移动对话框
   */
  closeMoveModal: function() {
    this.setData({ showMoveModal: false });
  },

  /**
   * 关闭删除对话框
   */
  closeDeleteModal: function() {
    this.setData({ showDeleteModal: false });
  },

  /**
   * 关闭所有模态框
   */
  closeAllModals: function() {
    this.setData({
      showEditModal: false,
      showMoveModal: false,
      showDeleteModal: false
    });
  },

  /**
   * 输入编辑表单
   */
  inputEditForm: function(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    
    this.setData({
      [`editForm.${field}`]: value
    });
  },

  /**
   * 输入新标签
   */
  inputNewTag: function(e) {
    this.setData({ newTag: e.detail.value });
  },

  /**
   * 添加标签
   */
  addTag: function() {
    const { newTag, editForm } = this.data;
    const tag = newTag.trim();
    
    if (!tag) return;
    
    if (editForm.tags.includes(tag)) {
      wx.showToast({
        title: '标签已存在',
        icon: 'none'
      });
      return;
    }
    
    const tags = [...editForm.tags, tag];
    this.setData({
      'editForm.tags': tags,
      newTag: ''
    });
  },

  /**
   * 删除标签
   */
  removeTag: function(e) {
    const { index } = e.currentTarget.dataset;
    const tags = [...this.data.editForm.tags];
    tags.splice(index, 1);
    
    this.setData({
      'editForm.tags': tags
    });
  },

  /**
   * 选择文件夹
   */
  selectFolder: function(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedFolderId: id });
  },

  /**
   * 保存客户信息
   */
  saveClientInfo: async function() {
    const { editForm, clientId } = this.data;
    
    if (!editForm.name) {
      wx.showToast({
        title: '客户姓名不能为空',
        icon: 'none'
      });
      return;
    }
    
    try {
      wx.showLoading({ title: '保存中...' });
      
      // 保存到云数据库
      const success = await cloudDB.updateClient(clientId, editForm);
      
      wx.hideLoading();
      
      if (success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        
        // 重新加载客户数据
        await this.loadClientData();
        
        this.setData({ showEditModal: false });
      } else {
        throw new Error('保存失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('保存客户信息失败', error);
      wx.showToast({
        title: '保存失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 移动到文件夹
   */
  moveToFolder: async function() {
    const { clientId, selectedFolderId, client } = this.data;
    
    // 如果文件夹没有变化，直接关闭对话框
    if (selectedFolderId === (client.folderId || '')) {
      this.setData({ showMoveModal: false });
      return;
    }
    
    try {
      wx.showLoading({ title: '移动中...' });
      
      // 更新客户文件夹
      const success = await cloudDB.updateClient(clientId, { folderId: selectedFolderId });
      
      wx.hideLoading();
      
      if (success) {
        wx.showToast({
          title: '移动成功',
          icon: 'success'
        });
        
        // 重新加载客户数据
        await this.loadClientData();
        
        this.setData({ showMoveModal: false });
      } else {
        throw new Error('移动失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('移动客户失败', error);
      wx.showToast({
        title: '移动失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 删除客户
   */
  deleteClient: async function() {
    const { clientId } = this.data;
    
    try {
      wx.showLoading({ title: '删除中...' });
      
      const success = await cloudDB.deleteClient(clientId);
      
      wx.hideLoading();
      
      if (success) {
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        });
        
        // 返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error('删除失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('删除客户失败', error);
      wx.showToast({
        title: '删除失败，请重试',
        icon: 'none'
      });
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})