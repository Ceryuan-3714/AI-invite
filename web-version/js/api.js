/**
 * API模块 - 模拟微信小程序的云函数和API调用
 */
const API = {
    /**
     * 模拟获取用户openid的云函数
     * @returns {Promise<Object>} 包含openid的对象
     */
    getOpenid: function() {
        return new Promise((resolve) => {
            // 模拟网络延迟
            setTimeout(() => {
                // 检查是否已登录
                const userInfo = Storage.getStorageSync('userInfo');
                
                if (userInfo && userInfo.openid) {
                    resolve({
                        result: {
                            openid: userInfo.openid
                        }
                    });
                } else {
                    // 生成一个随机的openid
                    const randomOpenid = 'openid_' + Math.random().toString(36).substr(2, 9);
                    resolve({
                        result: {
                            openid: randomOpenid
                        }
                    });
                }
            }, 300);
        });
    },

    /**
     * 模拟通过openid获取用户信息
     * @param {string} openid 用户的openid
     * @returns {Promise<Object|null>} 用户信息对象
     */
    getUserByOpenId: function(openid) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const users = Storage.getStorageSync('users') || [];
                const user = users.find(u => u.openid === openid);
                resolve(user || null);
            }, 300);
        });
    },

    /**
     * 模拟保存用户信息
     * @param {Object} userInfo 用户信息
     * @returns {Promise<Object>} 保存后的用户信息
     */
    saveUserInfo: function(userInfo) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const users = Storage.getStorageSync('users') || [];
                
                // 检查用户是否已存在
                const existingUserIndex = users.findIndex(u => u.openid === userInfo.openid);
                
                if (existingUserIndex !== -1) {
                    // 更新现有用户
                    users[existingUserIndex] = {
                        ...users[existingUserIndex],
                        ...userInfo
                    };
                } else {
                    // 添加新用户
                    const newUser = {
                        id: 'user' + (users.length + 1).toString().padStart(3, '0'),
                        isProfileComplete: false,
                        ...userInfo
                    };
                    users.push(newUser);
                    userInfo = newUser;
                }
                
                Storage.setStorageSync('users', users);
                resolve(userInfo);
            }, 300);
        });
    },

    /**
     * 模拟用户登录
     * @param {string} username 用户名
     * @param {string} password 密码
     * @returns {Promise<Object>} 登录结果
     */
    login: function(username, password) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                const users = Storage.getStorageSync('users') || [];
                
                // 在实际应用中，这里应该进行密码验证
                // 为了演示，我们只检查用户名是否存在
                const user = users.find(u => u.name === username || u.email === username);
                
                if (user) {
                    // 登录成功
                    Storage.setStorageSync('isLoggedIn', true);
                    Storage.setStorageSync('userInfo', user);
                    
                    resolve({
                        success: true,
                        userInfo: user
                    });
                } else {
                    // 登录失败
                    reject({
                        success: false,
                        message: '用户名或密码错误'
                    });
                }
            }, 500);
        });
    },

    /**
     * 模拟用户登出
     * @returns {Promise<Object>} 登出结果
     */
    logout: function() {
        return new Promise((resolve) => {
            setTimeout(() => {
                Storage.setStorageSync('isLoggedIn', false);
                Storage.setStorageSync('userInfo', null);
                
                resolve({
                    success: true
                });
            }, 300);
        });
    },

    /**
     * 获取时间选择数据
     * @param {string} id 时间选择ID
     * @returns {Promise<Object|null>} 时间选择数据
     */
    getTimeSelection: function(id) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const pendingTimeSelections = Storage.getStorageSync('pendingTimeSelections') || {};
                const selectionData = pendingTimeSelections[id];
                resolve(selectionData || null);
            }, 300);
        });
    },

    /**
     * 更新时间选择数据
     * @param {string} id 时间选择ID
     * @param {Object} data 更新的数据
     * @returns {Promise<boolean>} 是否更新成功
     */
    updateTimeSelection: function(id, data) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const pendingTimeSelections = Storage.getStorageSync('pendingTimeSelections') || {};
                
                if (pendingTimeSelections[id]) {
                    pendingTimeSelections[id] = {
                        ...pendingTimeSelections[id],
                        ...data
                    };
                    
                    Storage.setStorageSync('pendingTimeSelections', pendingTimeSelections);
                    resolve(true);
                } else {
                    resolve(false);
                }
            }, 300);
        });
    },

    /**
     * 添加通知
     * @param {Object} notification 通知对象
     * @returns {Promise<Object>} 添加后的通知对象
     */
    addNotification: function(notification) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const notifications = Storage.getStorageSync('notifications') || [];
                
                // 创建通知对象
                const newNotification = {
                    id: 'n' + Date.now(),
                    ...notification,
                    read: false,
                    createdAt: new Date().toISOString()
                };
                console.log('Web版本添加新通知:', newNotification);
                
                // 将新通知添加到数组开头
                notifications.unshift(newNotification);
                
                // 更新存储
                Storage.setStorageSync('notifications', notifications);
                
                // 更新未读通知数量
                const unreadCount = Storage.getStorageSync('unreadNotifications') || 0;
                Storage.setStorageSync('unreadNotifications', unreadCount + 1);
                
                resolve(newNotification);
            }, 300);
        });
    },

    /**
     * 获取通知列表
     * @returns {Promise<Array>} 通知列表
     */
    getNotifications: function() {
        return new Promise((resolve) => {
            setTimeout(() => {
                const notifications = Storage.getStorageSync('notifications') || [];
                resolve(notifications);
            }, 300);
        });
    },

    /**
     * 标记通知为已读
     * @param {string} id 通知ID
     * @returns {Promise<boolean>} 是否标记成功
     */
    markNotificationAsRead: function(id) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const notifications = Storage.getStorageSync('notifications') || [];
                const notificationIndex = notifications.findIndex(n => n.id === id);
                
                if (notificationIndex !== -1 && !notifications[notificationIndex].read) {
                    console.log('Web版本标记通知为已读，通知ID:', id);
                    notifications[notificationIndex].read = true;
                    Storage.setStorageSync('notifications', notifications);
                    console.log('Web版本成功标记通知为已读');
                    
                    // 更新未读通知数量
                    const unreadCount = Storage.getStorageSync('unreadNotifications') || 0;
                    if (unreadCount > 0) {
                        Storage.setStorageSync('unreadNotifications', unreadCount - 1);
                    }
                    
                    resolve(true);
                } else {
                    resolve(false);
                }
            }, 300);
        });
    },

    /**
     * 获取未读通知数量
     * @returns {Promise<number>} 未读通知数量
     */
    getUnreadNotificationCount: function() {
        return new Promise((resolve) => {
            setTimeout(() => {
                const unreadCount = Storage.getStorageSync('unreadNotifications') || 0;
                resolve(unreadCount);
            }, 300);
        });
    },

    /**
     * 格式化日期
     * @param {Date} date 日期对象
     * @returns {string} 格式化后的日期字符串 (YYYY-MM-DD)
     */
    formatDate: function(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};

// 导出API对象
window.API = API;