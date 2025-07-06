// 名片识别工具类
class BusinessCardRecognition {
  
  /**
   * 上传图片到云存储并进行名片识别
   * @param {string} tempFilePath 临时图片路径
   * @returns {Promise} 识别结果
   */
  static async recognizeBusinessCard(tempFilePath) {
    try {
      wx.showLoading({
        title: '正在识别名片...',
        mask: true
      })
      
      // 1. 上传图片到云存储
      const uploadResult = await this.uploadImageToCloud(tempFilePath)
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || '图片上传失败')
      }
      
      // 2. 调用云函数进行名片识别
      const recognitionResult = await this.callRecognitionCloudFunction(uploadResult.fileID)
      
      wx.hideLoading()
      
      if (recognitionResult.success) {
        return {
          success: true,
          data: recognitionResult.data,
          fileID: uploadResult.fileID
        }
      } else {
        throw new Error(recognitionResult.error || '名片识别失败')
      }
      
    } catch (error) {
      wx.hideLoading()
      console.error('名片识别过程失败:', error)
      return {
        success: false,
        error: error.message || '名片识别失败'
      }
    }
  }
  
  /**
   * 上传图片到云存储
   * @param {string} filePath 本地图片路径
   * @returns {Promise} 上传结果
   */
  static uploadImageToCloud(filePath) {
    return new Promise((resolve, reject) => {
      // 生成唯一的云存储路径
      const timestamp = new Date().getTime()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const cloudPath = `business_cards/${timestamp}_${randomStr}.jpg`
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath,
        success: res => {
          console.log('图片上传成功:', res.fileID)
          resolve({
            success: true,
            fileID: res.fileID,
            cloudPath: cloudPath
          })
        },
        fail: err => {
          console.error('图片上传失败:', err)
          resolve({
            success: false,
            error: '图片上传失败'
          })
        }
      })
    })
  }
  
  /**
   * 调用名片识别云函数
   * @param {string} fileID 云存储文件ID
   * @returns {Promise} 识别结果
   */
  static callRecognitionCloudFunction(fileID) {
    return new Promise((resolve, reject) => {
      // 获取云文件的临时链接
      wx.cloud.getTempFileURL({
        fileList: [fileID],
        success: res => {
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            const imageUrl = res.fileList[0].tempFileURL
            
            // 调用名片识别云函数
            wx.cloud.callFunction({
              name: 'recognizeBusinessCard',
              data: {
                imageUrl: imageUrl
              },
              success: result => {
                console.log('名片识别云函数调用成功:', result)
                resolve(result.result)
              },
              fail: err => {
                console.error('名片识别云函数调用失败:', err)
                resolve({
                  success: false,
                  error: '名片识别服务调用失败'
                })
              }
            })
          } else {
            resolve({
              success: false,
              error: '获取图片临时链接失败'
            })
          }
        },
        fail: err => {
          console.error('获取临时文件URL失败:', err)
          resolve({
            success: false,
            error: '获取图片链接失败'
          })
        }
      })
    })
  }
  
  /**
   * 选择并识别名片图片
   * @returns {Promise} 识别结果
   */
  static async chooseAndRecognizeBusinessCard() {
    return new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: async (res) => {
          const tempFilePath = res.tempFilePaths[0]
          const result = await this.recognizeBusinessCard(tempFilePath)
          resolve(result)
        },
        fail: (err) => {
          console.error('选择图片失败:', err)
          resolve({
            success: false,
            error: '选择图片失败'
          })
        }
      })
    })
  }
  
  /**
   * 清理上传的名片图片（可选）
   * @param {string} fileID 云存储文件ID
   */
  static async deleteBusinessCardImage(fileID) {
    try {
      await wx.cloud.deleteFile({
        fileList: [fileID]
      })
      console.log('名片图片删除成功:', fileID)
    } catch (error) {
      console.error('删除名片图片失败:', error)
    }
  }
}

module.exports = BusinessCardRecognition