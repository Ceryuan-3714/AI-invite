// authUtils.js
// 用户登录状态检查工具类

/**
 * 检查用户当前是否已登录
 * @returns {boolean} 如果用户已登录返回true，未登录返回false
 */
const isUserLoggedIn = () => {
  const app = getApp();
  
  // 检查全局数据中的登录状态和openid
  if (app.globalData && app.globalData.isLoggedIn && app.globalData.openid) {
    return true;
  }
  
  // 检查本地缓存中的用户信息
  const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
  const openid = app.globalData.openid || wx.getStorageSync('openid');
  
  // 如果缓存中有用户信息和openid，则说明用户已登录
  if (userInfo && openid) {
    // 同步更新全局数据
    if (app.globalData) {
      app.globalData.isLoggedIn = true;
      app.globalData.userInfo = userInfo;
      app.globalData.openid = openid;
    }
    return true;
  }
  
  // 否则视为未登录
  return false;
};

/**
 * 跳转到登录页面
 * @param {string} redirectUrl - 登录成功后的跳转地址
 */
const redirectToLogin = (redirectUrl) => {
  // 保存当前页面路径，登录成功后跳回
  if (redirectUrl) {
    wx.setStorageSync('loginRedirectUrl', redirectUrl);
  } else {
    // 如果没有提供redirectUrl，则获取当前页面路径
    const pages = getCurrentPages();
    if (pages && pages.length > 0) {
      const currentPageInstance = pages[pages.length - 1];
      if (currentPageInstance && currentPageInstance.route) {
        let currentPath = `/${currentPageInstance.route}`;
        const options = currentPageInstance.options;
        
        if (options && Object.keys(options).length > 0) {
          const queryParams = Object.keys(options).map(key => `${key}=${options[key]}`);
          currentPath += `?${queryParams.join('&')}`;
        }
        
        // 检查是否是mine页面，若是则不保存重定向URL
        if (!currentPath.includes('/pages/mine/mine')) {
          wx.setStorageSync('loginRedirectUrl', currentPath);
        }
      }
    }
  }
  
  // 检查当前是否在mine页面
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const isMine = currentPage && currentPage.route && currentPage.route.includes('mine');
  
  // 如果是从mine页面调用，不进行导航，返回false表示导航未执行
  if (isMine) {
    console.log('当前在mine页面，不进行登录导航，将在本页内处理登录');
    return false;
  }
  
  // 如果不是mine页面，尝试navigateTo
  console.log('尝试导航到登录页面');
  try {
    wx.navigateTo({ 
      url: '/pages/login/login',
      fail: (err) => {
        console.error('导航到登录页面失败:', err);
        try {
          // 如果navigateTo失败，尝试使用redirectTo
          wx.redirectTo({ 
            url: '/pages/login/login',
            fail: (redirectErr) => {
              console.error('重定向到登录页面也失败:', redirectErr);
              // 不再尝试reLaunch，避免可能的死循环
            }
          });
        } catch (e) {
          console.error('跳转到登录页面时发生错误:', e);
        }
      }
    });
    return true;
  } catch (e) {
    console.error('执行导航操作时发生错误:', e);
    return false;
  }
};

/**
 * 提示用户登录，但不强制跳转
 * @param {string} message - 提示消息
 * @param {function} onConfirm - 用户确认后的回调
 * @param {function} onCancel - 用户取消后的回调
 */
const promptLogin = (message = '您尚未登录，是否前往登录页面？', onConfirm = null, onCancel = null) => {
  // 检查当前是否已经在mine页面，如果是则不弹窗，防止循环
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const isMine = currentPage && currentPage.route && currentPage.route.includes('mine');
  
  if (isMine) {
    // 如果在mine页面，直接调用该页面的登录方法
    console.log('当前在mine页面，不弹登录提示，请使用页面自带登录按钮');
    if (onCancel && typeof onCancel === 'function') {
      onCancel();
    }
    return;
  }

  // 如果不在mine页面，正常显示登录提示弹窗
  wx.showModal({
    title: '提示',
    content: message,
    confirmText: '去登录',
    cancelText: '暂不登录',
    success: (res) => {
      if (res.confirm) {
        // 用户选择登录
        if (onConfirm && typeof onConfirm === 'function') {
          onConfirm();
        } else {
          // 温和提示，使用navigateTo前往登录页
          wx.navigateTo({ 
            url: '/pages/login/login?forced=false',
            fail: () => {
              // 如果导航失败，则尝试使用switchTab跳转到"我的"页面
              console.log('导航到登录页失败，尝试跳转到"我的"页面');
              wx.switchTab({
                url: '/pages/mine/mine',
                fail: (err) => {
                  console.error('跳转到"我的"页面也失败:', err);
                }
              });
            }
          });
        }
      } else if (res.cancel && onCancel && typeof onCancel === 'function') {
        // 用户取消登录，调用取消回调
        onCancel();
      }
    }
  });
};

/**
 * 处理登录成功后的跳转逻辑
 * 如果本地存储中有loginRedirectUrl，则跳回该页面
 * 否则跳转到首页
 */
const handleLoginRedirect = () => {
  const redirectUrl = wx.getStorageSync('loginRedirectUrl');
  if (redirectUrl) {
    wx.removeStorageSync('loginRedirectUrl'); // 清除跳转标记，避免重复使用
    console.log('检测到登录前的页面路径，尝试返回上一页:', redirectUrl);
    
    // 获取当前页面栈
    const pages = getCurrentPages();
    
    // 如果页面栈有多个页面，说明有上一页可返回
    if (pages.length > 1) {
      console.log('检测到页面栈中有上一页，直接返回');
      wx.navigateBack({
        fail: (err) => {
          console.error('返回上一页失败，尝试重定向:', err);
          // 如果返回失败，再尝试重定向方式
          redirectToPageOrHome(redirectUrl);
        }
      });
    } else {
      // 如果没有上一页，使用重定向方式
      console.log('页面栈中没有上一页，使用重定向');
      redirectToPageOrHome(redirectUrl);
    }
  } else {
    // 没有记录则跳转到首页
    console.log('没有登录前的页面记录，跳转到首页');
    wx.switchTab({ url: '/pages/index/index' });
  }
};

// 辅助函数，处理重定向到指定页面或首页
const redirectToPageOrHome = (redirectUrl) => {
  // 判断是否是tabBar页面
  const isTabBarPage = ['/pages/index/index', '/pages/notifications/notifications', '/pages/mine/mine'].includes(redirectUrl.split('?')[0]);
  
  if (isTabBarPage) {
    wx.switchTab({
      url: redirectUrl,
      success: () => {
        // 页面跳转成功后，获取当前页面实例并刷新
        setTimeout(() => {
          const pages = getCurrentPages();
          const currentPage = pages[pages.length - 1];
          if (currentPage && typeof currentPage.onLoad === 'function') {
            // 获取页面参数
            const options = {};
            if (redirectUrl.includes('?')) {
              const queryString = redirectUrl.split('?')[1];
              queryString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                if (key && value) options[key] = value;
              });
            }
            // 调用页面的onLoad方法刷新页面
            currentPage.onLoad(options);
          }
        }, 500); // 延迟执行，确保页面已完成跳转
      },
      fail: (err) => {
        console.error('跳转到TabBar页面失败:', err);
        wx.switchTab({ url: '/pages/index/index' });
      }
    });
  } else {
    wx.redirectTo({
      url: redirectUrl,
      success: () => {
        // 页面重定向成功后，获取当前页面实例并刷新
        setTimeout(() => {
          const pages = getCurrentPages();
          const currentPage = pages[pages.length - 1];
          if (currentPage && typeof currentPage.onLoad === 'function') {
            // 获取页面参数
            const options = {};
            if (redirectUrl.includes('?')) {
              const queryString = redirectUrl.split('?')[1];
              queryString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                if (key && value) options[key] = value;
              });
            }
            // 调用页面的onLoad方法刷新页面
            currentPage.onLoad(options);
          }
        }, 500); // 延迟执行，确保页面已完成跳转
      },
      fail: (err) => {
        console.error('重定向到原页面失败:', err);
        // 如果重定向失败，尝试navigateTo
        wx.navigateTo({
          url: redirectUrl,
          success: () => {
            // 页面导航成功后，获取当前页面实例并刷新
            setTimeout(() => {
              const pages = getCurrentPages();
              const currentPage = pages[pages.length - 1];
              if (currentPage && typeof currentPage.onLoad === 'function') {
                // 获取页面参数
                const options = {};
                if (redirectUrl.includes('?')) {
                  const queryString = redirectUrl.split('?')[1];
                  queryString.split('&').forEach(param => {
                    const [key, value] = param.split('=');
                    if (key && value) options[key] = value;
                  });
                }
                // 调用页面的onLoad方法刷新页面
                currentPage.onLoad(options);
              }
            }, 500); // 延迟执行，确保页面已完成跳转
          },
          fail: (navErr) => {
            console.error('导航到原页面也失败:', navErr);
            // 最后尝试回到首页
            wx.switchTab({ url: '/pages/index/index' });
          }
        });
      }
    });
  }
};

/**
 * 检查用户资料是否完整
 * @param {Object} userInfo - 用户信息对象
 * @returns {boolean} 如果资料完整返回true，不完整返回false
 */
const isUserProfileComplete = (userInfo) => {
  if (!userInfo) return false;
  // 检查用户资料完整性（兼容新旧数据结构）
  const hasValidCompanyPosition = userInfo.companyPositions && Array.isArray(userInfo.companyPositions) && 
    userInfo.companyPositions.some(item => item.company && item.position) ||
    (userInfo.company && userInfo.position);
  
  return !!(userInfo.name && hasValidCompanyPosition);
};

/**
 * 检查用户资料完整性，如果不完整则显示弹窗提示
 * @param {Object} userInfo - 用户信息对象
 * @param {string} action - 操作名称，如"报名"、"签到"等
 * @param {Function} onComplete - 资料完整时的回调函数
 * @param {Function} onIncomplete - 资料不完整时的回调函数（可选）
 * @returns {boolean} 如果资料完整返回true，不完整返回false
 */
const checkUserProfileWithPrompt = (userInfo, action = '操作', onComplete = null, onIncomplete = null) => {
  if (isUserProfileComplete(userInfo)) {
    if (onComplete && typeof onComplete === 'function') {
      onComplete();
    }
    return true;
  }
  
  // 资料不完整，显示弹窗
  wx.showModal({
    title: '完善资料',
    content: `${action}前需要完善个人资料（姓名、公司、职位），是否前往完善？`,
    confirmText: '去完善',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        // 保存当前页面路径，用于完善资料后跳回
        const pages = getCurrentPages();
        if (pages && pages.length > 0) {
          const currentPageInstance = pages[pages.length - 1];
          if (currentPageInstance && currentPageInstance.route) {
            let currentPath = `/${currentPageInstance.route}`;
            const options = currentPageInstance.options;
            
            if (options && Object.keys(options).length > 0) {
              const queryParams = Object.keys(options).map(key => `${key}=${options[key]}`);
              currentPath += `?${queryParams.join('&')}`;
            }
            
            wx.setStorageSync('profileSetupRedirectUrl', currentPath);
          }
        }
        
        // 跳转到资料完善页面
        wx.navigateTo({
          url: '/pages/profile_setup/profile_setup',
          fail: (err) => {
            console.error('跳转到资料完善页面失败:', err);
            wx.showToast({ title: '跳转失败，请重试', icon: 'none' });
          }
        });
      } else {
        // 用户取消，执行取消回调
        if (onIncomplete && typeof onIncomplete === 'function') {
          onIncomplete();
        }
      }
    }
  });
  
  return false;
};

module.exports = {
  isUserLoggedIn,
  redirectToLogin,
  promptLogin,
  handleLoginRedirect,
  isUserProfileComplete,
  checkUserProfileWithPrompt
};