// clientManage.js - 客户管理页面
const app = getApp()
const cloudDB = require('../../utils/cloudDB.js')

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

// 常量定义
const CONSTANTS = {
  PAGE_SIZE: 20,
  LOADING_DELAY: 1500,
  SEARCH_DEBOUNCE: 300
}

// 初始状态
const INITIAL_STATE = {
  userInfo: null,
  hasUserInfo: false,
  folders: [],
  clients: [],
  currentFolder: 'all',
  
  // 对话框状态
  dialogs: {
    showFolderDialog: false,
    showClientDialog: false,
    showMoveDialog: false,
    showDeleteDialog: false,
    showDeleteFolderDialog: false
  },
  
  // 表单数据
  forms: {
    newFolderName: '',
    newClient: {
      name: '',
      company: '',
      position: '',
      folderId: '',
      tags: []
    },
    inputTag: ''
  },
  
  // 选择状态
  selection: {
    selectedClientId: '',
    selectedFolderId: '',
    selectedUser: null,
    selectedFolder: null,
    selectedClients: [],
    selectMode: false
  },
  
  // 搜索相关
  search: {
    searchKeyword: '',
    searchQuery: '',
    searchResults: [],
    filteredClients: []
  },
  
  // UI状态
  ui: {
    showEmptyTip: false,
    folderOpen: false,
    isAddingClient: false,
    isAddingFolder: false
  },
  
  // 分页相关
  pagination: {
    currentPage: 1,
    pageSize: CONSTANTS.PAGE_SIZE,
    totalPages: 0,
    totalUsers: 0,
    hasMore: false,
    loading: false
  }
}

Page({
  data: {
    ...INITIAL_STATE
  },

  /**
   * 页面生命周期
   */
  async onLoad(options) {
    console.log('页面加载参数:', options)
    
    try {
      await this.initializePage()
    } catch (error) {
      console.error('页面初始化失败:', error)
      this.showError('页面初始化失败')
    }
  },

  async onShow() {
    // 每次页面显示时，重新加载第一页数据
    await this.loadUsersData(true)
  },

  /**
   * 页面初始化
   */
  async initializePage() {
    const userInfo = this.getUserInfo()
    if (!userInfo) {
      this.handleUnauthorized()
      return
    }

    this.setData({
      userInfo,
      hasUserInfo: true
    })

    // 并行加载数据
    await Promise.all([
      this.loadUsersData(true),
      this.loadFoldersData()
    ])
  },

  /**
   * 获取用户信息
   */
  getUserInfo() {
    return wx.getStorageSync('userInfo')
  },

  /**
   * 处理未授权访问
   */
  handleUnauthorized() {
    wx.showToast({
      title: '请先登录',
      icon: 'none'
    })
    
    setTimeout(() => {
      wx.navigateBack()
    }, CONSTANTS.LOADING_DELAY)
  },

  /**
   * 数据加载方法
   */
  
  // 加载用户数据（支持分页）
  async loadUsersData(reset = false) {
    if (this.data.pagination.loading) return
    
    this.setData({ 'pagination.loading': true })
    
    try {
      const page = reset ? 1 : this.data.pagination.currentPage
      const options = {
        page,
        pageSize: this.data.pagination.pageSize,
        folderId: this.data.currentFolder,
        searchKeyword: this.data.search.searchKeyword
      }
      
      if (reset) {
        this.showLoading('加载中...')
      }
      
      const result = await cloudDB.getAllUsers(options)
      
      const clients = (reset ? result.users : [...this.data.clients, ...result.users]).map(client => ({
        ...client,
        companyPositionText: getCompanyPositionText(client)
      }))
      
      this.setData({
        clients,
        'pagination.currentPage': result.page,
        'pagination.totalPages': result.totalPages,
        'pagination.totalUsers': result.total,
        'pagination.hasMore': result.hasMore,
        'pagination.loading': false,
        currentPage: result.page,
        totalPages: result.totalPages,
        totalUsers: result.total,
        hasMore: result.hasMore,
        loading: false
      })
      
      await this.updateFilteredClients()
      
      if (reset) {
        wx.hideLoading()
      }
      
    } catch (error) {
      this.setData({ 
        'pagination.loading': false,
        loading: false
      })
      console.error('加载用户数据失败:', error)
      this.showError('加载失败，请重试')
      
      if (reset) {
        wx.hideLoading()
      }
    }
  },

  // 加载文件夹数据
  async loadFoldersData() {
    try {
      const folders = await cloudDB.getAllFolders()
      this.setData({ folders })
    } catch (error) {
      console.error('加载文件夹数据失败:', error)
      this.showError('加载文件夹失败')
    }
  },

  // 加载更多数据
  async loadMore() {
    const { hasMore, loading } = this.data.pagination
    
    if (!hasMore || loading) {
      return
    }
    
    this.setData({
      'pagination.currentPage': this.data.pagination.currentPage + 1
    })
    
    await this.loadUsersData(false)
  },

  /**
   * 搜索和过滤方法
   */
  
  // 根据当前文件夹和搜索关键词更新过滤的用户列表
  async updateFilteredClients() {
    const { currentFolder, clients, search: { searchQuery } } = this.data
    
    let filteredClients = this.filterClientsBySearch(clients, searchQuery)
    filteredClients = this.filterClientsByFolder(filteredClients, currentFolder)
    
    this.setData({ 
      'search.filteredClients': filteredClients,
      filteredClients: filteredClients,
      currentPage: this.data.pagination.currentPage,
      totalPages: this.data.pagination.totalPages,
      totalUsers: this.data.pagination.totalUsers,
      hasMore: this.data.pagination.hasMore,
      loading: this.data.pagination.loading
    })
    this.calculateEmptyTip()
  },

  // 根据搜索关键词过滤客户
  filterClientsBySearch(clients, searchQuery) {
    if (!searchQuery) {
      return [...clients]
    }

    const keyword = searchQuery.toLowerCase()
    return clients.filter(client => {
      const searchFields = [
        client.name,
        client.company,
        client.position
      ].filter(Boolean)
      
      return searchFields.some(field => 
        field.toLowerCase().includes(keyword)
      )
    })
  },

  // 根据文件夹过滤客户
  filterClientsByFolder(clients, currentFolder) {
    if (currentFolder === 'all') {
      return clients
    }
    
    return clients.filter(client => client.folderId === currentFolder)
  },

  // 计算是否显示空提示
  calculateEmptyTip() {
    const showEmptyTip = this.data.filteredClients.length === 0
    this.setData({ 
      'ui.showEmptyTip': showEmptyTip,
      showEmptyTip: showEmptyTip
    })
  },

  /**
   * 文件夹操作方法
   */
  
  // 切换文件夹
  async switchFolder(e) {
    const folderId = e.currentTarget.dataset.id
    
    this.setData({
      currentFolder: folderId,
      'pagination.currentPage': 1
    })
    
    await this.loadUsersData(true)
  },

  /**
   * 工具方法
   */
  
  // 获取文件夹名称（供WXML使用）
  getFolderName(folderId, folders) {
    const folder = folders.find(f => f.id === folderId)
    return folder ? folder.name : ''
  },

  // 显示加载提示
  showLoading(title = '加载中...') {
    wx.showLoading({
      title,
      mask: true
    })
  },

  // 显示错误提示
  showError(message) {
    wx.showToast({
      title: message,
      icon: 'none'
    })
  },

  // 显示成功提示
  showSuccess(message) {
    wx.showToast({
      title: message,
      icon: 'success'
    })
  },

  /**
   * 防抖函数
   */
  debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func.apply(this, args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  },

  /**
   * 数据验证方法
   */
  
  // 验证客户数据
  validateClientData(clientData) {
    const { name, company } = clientData
    
    if (!name || !name.trim()) {
      throw new Error('客户姓名不能为空')
    }
    
    if (!company || !company.trim()) {
      throw new Error('公司名称不能为空')
    }
    
    return true
  },

  // 验证文件夹名称
  validateFolderName(folderName) {
    if (!folderName || !folderName.trim()) {
      throw new Error('文件夹名称不能为空')
    }
    
    if (folderName.length > 20) {
      throw new Error('文件夹名称不能超过20个字符')
    }
    
    return true
  },

  /**
   * 性能优化方法
   */
  
  // 批量更新数据
  batchUpdateData(updates) {
    this.setData(updates)
  },

  // 重置页面状态
  resetPageState() {
    this.setData({
      ...INITIAL_STATE,
      userInfo: this.data.userInfo,
      hasUserInfo: this.data.hasUserInfo
    })
  }
})