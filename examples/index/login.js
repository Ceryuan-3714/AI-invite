// 云函数方式 - 不需要单独获取openid，云函数中可以直接获取
function queryOpenIdFn(code) {
	return new Promise(resolve => {
		// 云函数中可以直接获取openid，这里直接返回
		resolve({ openid: 'from_cloud_function' })
	})
}

// 云函数 - 获取手机号
// 优化后的获取手机号函数
function getPhoneNumberFn(phoneCode, openId) {
	return new Promise((resolve, reject) => {
		console.log('开始调用云函数获取手机号, code:', phoneCode)
		
		wx.cloud.callFunction({
			name: 'getPhoneNumber',
			data: {
				code: phoneCode
			},
			success: (res) => {
				console.log('云函数调用成功，完整返回:', res)
				
				// 现在云函数直接返回手机号字符串
				if (res.result && typeof res.result === 'string') {
					console.log('手机号获取成功:', res.result)
					resolve({
						code: 0,
						content: {
							phone_info: {
								phoneNumber: res.result
							}
						}
					})
				} else {
					console.error('未获取到手机号:', res)
					reject('未获取到手机号')
				}
			},
			fail: (err) => {
				console.error('云函数调用失败:', err)
				reject(err.errMsg || '云函数调用失败')
			}
		})
	})
}

// 微信api : 微信登录
function loginFn() {
	return new Promise((resolve, reject) => {
		wx.login({
			success: async (res) => {
				queryOpenIdFn(res.code).then(res => {
					resolve(res)
				})
			},
			fail: (err) => {
				console.log('login fail:', err);
				reject(err)
			}
		})
	})
}

module.exports = {
	loginFn,
	getPhoneNumberFn
}