/**
 * 导出工具函数
 * 用于处理各种数据导出功能
 */

/**
 * 导出参与者名单到Excel格式
 * @param {Array} participants - 参与者数组
 * @param {Object} eventData - 活动数据
 * @returns {Promise} 导出结果
 */
function exportParticipantsToExcel(participants, eventData) {
  return new Promise((resolve, reject) => {
    try {
      // 准备导出数据
      const exportData = participants.map((participant, index) => {
        return {
          '序号': index + 1,
          '姓名': participant.name || '未设置',
          '公司': participant.company || '未知公司',
          '职位': participant.position || '未设置',
          '电话': participant.phone || '未设置',
          '邮箱': participant.email || '未设置',
          '签到状态': participant.checkinStatus === 'checked' ? '已签到' : '未签到',
          '报名时间': participant.registrationTime ? formatTime(participant.registrationTime) : '未知',
          '签到时间': participant.checkinTime ? formatTime(participant.checkinTime) : '未签到'
        };
      });

      // 创建工作表数据
      const worksheetData = [
        // 表头
        ['序号', '姓名', '公司', '职位', '电话', '邮箱', '签到状态', '报名时间', '签到时间'],
        // 数据行
        ...exportData.map(item => Object.values(item))
      ];

      // 生成文件名
      const fileName = `${eventData.title || '活动'}_参与者名单_${formatDate(new Date())}.csv`;
      
      // 转换为CSV格式
      const csvContent = convertToCSV(worksheetData);
      
      // 使用微信小程序的文件系统API保存文件
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      
      fs.writeFile({
        filePath: filePath,
        data: csvContent,
        encoding: 'utf8',
        success: () => {
          // 分享文件
          wx.shareFileMessage({
            filePath: filePath,
            fileName: fileName,
            success: () => {
              resolve({
                success: true,
                message: '导出成功',
                filePath: filePath
              });
            },
            fail: (err) => {
              console.error('分享文件失败:', err);
              // 即使分享失败，也提示导出成功
              resolve({
                success: true,
                message: '导出成功，文件已保存到本地',
                filePath: filePath
              });
            }
          });
        },
        fail: (err) => {
          console.error('写入文件失败:', err);
          reject({
            success: false,
            message: '导出失败，无法写入文件',
            error: err
          });
        }
      });
      
    } catch (error) {
      console.error('导出参与者名单失败:', error);
      reject({
        success: false,
        message: '导出失败',
        error: error
      });
    }
  });
}

/**
 * 将二维数组转换为CSV格式字符串
 * @param {Array} data - 二维数组数据
 * @returns {string} CSV格式字符串
 */
function convertToCSV(data) {
  return data.map(row => {
    return row.map(cell => {
      // 处理包含逗号、引号或换行符的单元格
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }
      return cellStr;
    }).join(',');
  }).join('\n');
}

/**
 * 格式化时间
 * @param {Date|string} time - 时间对象或字符串
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(time) {
  if (!time) return '';
  
  const date = time instanceof Date ? time : new Date(time);
  if (isNaN(date.getTime())) return '';
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 格式化日期（用于文件名）
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}

/**
 * 导出二维码统计数据
 * @param {Object} qrCodeStats - 二维码统计数据
 * @param {Object} eventData - 活动数据
 * @returns {Promise} 导出结果
 */
function exportQRCodeStats(qrCodeStats, eventData) {
  return new Promise((resolve, reject) => {
    try {
      // 准备导出数据
      const exportData = qrCodeStats.qrCodeList.map((qrCode, index) => {
        return {
          '排名': index + 1,
          '二维码名称': qrCode.name || '未命名',
          '扫描次数': qrCode.count || 0,
          '创建时间': qrCode.createTime ? formatTime(qrCode.createTime) : '未知',
          '最后扫描时间': qrCode.lastScanTime ? formatTime(qrCode.lastScanTime) : '未扫描'
        };
      });

      // 创建工作表数据
      const worksheetData = [
        // 统计概览
        ['二维码统计概览'],
        ['二维码总数', qrCodeStats.totalQRCodes || 0],
        ['总扫描次数', qrCodeStats.totalScans || 0],
        [''], // 空行
        // 详细数据表头
        ['排名', '二维码名称', '扫描次数', '创建时间', '最后扫描时间'],
        // 数据行
        ...exportData.map(item => Object.values(item))
      ];

      // 生成文件名
      const fileName = `${eventData.title || '活动'}_二维码统计_${formatDate(new Date())}.csv`;
      
      // 转换为CSV格式
      const csvContent = convertToCSV(worksheetData);
      
      // 使用微信小程序的文件系统API保存文件
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      
      fs.writeFile({
        filePath: filePath,
        data: csvContent,
        encoding: 'utf8',
        success: () => {
          // 分享文件
          wx.shareFileMessage({
            filePath: filePath,
            fileName: fileName,
            success: () => {
              resolve({
                success: true,
                message: '导出成功',
                filePath: filePath
              });
            },
            fail: (err) => {
              console.error('分享文件失败:', err);
              resolve({
                success: true,
                message: '导出成功，文件已保存到本地',
                filePath: filePath
              });
            }
          });
        },
        fail: (err) => {
          console.error('写入文件失败:', err);
          reject({
            success: false,
            message: '导出失败，无法写入文件',
            error: err
          });
        }
      });
      
    } catch (error) {
      console.error('导出二维码统计失败:', error);
      reject({
        success: false,
        message: '导出失败',
        error: error
      });
    }
  });
}

module.exports = {
  exportParticipantsToExcel,
  exportQRCodeStats,
  formatTime,
  formatDate
};