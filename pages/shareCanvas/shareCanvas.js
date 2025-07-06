// shareCanvas.js - 分享海报生成页面
Page({
  data: {
    canvasWidth: 600, // 5:4比例，宽度600px
    canvasHeight: 480, // 高度480px，确保标准5:4比例
    event: null,
    shareImageUrl: ''
  },

  onLoad: function(options) {
    // 从页面参数获取活动信息
    if (options.eventData) {
      try {
        const event = JSON.parse(decodeURIComponent(options.eventData));
        this.setData({ event });
        this.generateShareImage();
      } catch (e) {
        console.error('解析活动数据失败:', e);
        wx.showToast({
          title: '数据解析失败',
          icon: 'error'
        });
      }
    }
  },

  // 生成分享海报
  generateShareImage: function() {
    const { event, canvasWidth, canvasHeight } = this.data;
    if (!event) return;

    const ctx = wx.createCanvasContext('shareCanvas', this);
    
    // 设置画布背景为白色
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 计算各部分尺寸
    const coverHeight = Math.floor(canvasHeight * 0.6); // 封面占60%高度
    const infoHeight = canvasHeight - coverHeight; // 信息区域占40%高度，占满剩余空间
    
    // 绘制活动封面
    this.drawEventCover(ctx, event.cover, 0, 0, canvasWidth, coverHeight);
    
    // 绘制活动信息（分两行显示）
    this.drawEventInfo(ctx, event, 0, coverHeight, canvasWidth, infoHeight);
    
    // 绘制完成后保存为图片
    ctx.draw(false, () => {
      setTimeout(() => {
        this.saveCanvasAsImage();
      }, 500);
    });
  },

  // 绘制活动封面
  drawEventCover: function(ctx, coverUrl, x, y, width, height) {
    if (coverUrl) {
      // 如果有封面图片，先下载到本地再绘制
      wx.getImageInfo({
        src: coverUrl,
        success: (res) => {
          // 计算图片绘制位置，保持16:9比例居中显示
          const imgRatio = res.width / res.height;
          const targetRatio = 16 / 9;
          
          let drawWidth = width;
          let drawHeight = height;
          let drawX = x;
          let drawY = y;
          
          if (imgRatio > targetRatio) {
            // 图片更宽，以高度为准
            drawWidth = height * targetRatio;
            drawX = x + (width - drawWidth) / 2;
          } else {
            // 图片更高，以宽度为准
            drawHeight = width / targetRatio;
            drawY = y + (height - drawHeight) / 2;
          }
          
          ctx.drawImage(res.path, drawX, drawY, drawWidth, drawHeight);
          ctx.draw(true);
        },
        fail: () => {
          // 如果图片加载失败，绘制默认背景
          this.drawDefaultCover(ctx, x, y, width, height);
        }
      });
    } else {
      // 没有封面图片，绘制默认背景
      this.drawDefaultCover(ctx, x, y, width, height);
    }
  },

  // 绘制默认封面
  drawDefaultCover: function(ctx, x, y, width, height) {
    // 绘制渐变背景
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, '#3270be');
    gradient.addColorStop(1, '#1c4f9c');
    ctx.setFillStyle(gradient);
    ctx.fillRect(x, y, width, height);
    
    // 绘制活动标题
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(24);
    ctx.setTextAlign('center');
    const title = this.data.event.title || '精彩活动';
    ctx.fillText(title, x + width / 2, y + height / 2);
  },

  // 绘制活动信息（分两行显示）
  drawEventInfo: function(ctx, event, x, y, width, height) {
    // 设置信息区域背景
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(x, y, width, height);
    
    const padding = 40;
    const iconSize = 26;
    const titleFontSize = 24;
    const contentFontSize = 22;
    const rowHeight = height / 2.2; // 两行布局，减小行间距
    
    // 第一行：时间信息
    if (event.date && event.startTime && event.endTime) {
      const timeY = y + padding;
      
      // 绘制时间图标
      ctx.setFillStyle('#4a90e2');
      ctx.fillRect(x + padding, timeY, 4, iconSize);
      
      // 绘制"时间"标题
      ctx.setFillStyle('#666666');
      ctx.setFontSize(titleFontSize);
      ctx.setTextAlign('left');
      ctx.fillText('时间', x + padding + 15, timeY + 20);
      
      // 绘制时间内容
      ctx.setFillStyle('#333333');
      ctx.setFontSize(contentFontSize);
      const timeText = `${event.date} ${event.startTime}-${event.endTime}`;
      ctx.fillText(timeText, x + padding + 15, timeY + 50);
    }
    
    // 第二行：地点信息
    if (event.location) {
      const locationY = y + rowHeight + padding;
      
      // 绘制地点图标
      ctx.setFillStyle('#4a90e2');
      ctx.fillRect(x + padding, locationY, 4, iconSize);
      
      // 绘制"地点"标题
      ctx.setFillStyle('#666666');
      ctx.setFontSize(titleFontSize);
      ctx.setTextAlign('left');
      ctx.fillText('地点', x + padding + 15, locationY + 20);
      
      // 绘制地点内容（处理长文本换行）
      ctx.setFillStyle('#333333');
      ctx.setFontSize(contentFontSize);
      const maxCharsPerLine = 25;
      const locationText = event.location;
      
      if (locationText.length <= maxCharsPerLine) {
        ctx.fillText(locationText, x + padding + 15, locationY + 50);
      } else {
        const line1 = locationText.substring(0, maxCharsPerLine);
        const line2 = locationText.substring(maxCharsPerLine);
        ctx.fillText(line1, x + padding + 15, locationY + 50);
        if (line2) {
          ctx.fillText(line2.length > maxCharsPerLine ? line2.substring(0, maxCharsPerLine - 3) + '...' : line2, x + padding + 15, locationY + 75);
        }
      }
    }
  },



  // 保存Canvas为图片
  saveCanvasAsImage: function() {
    wx.canvasToTempFilePath({
      canvasId: 'shareCanvas',
      success: (res) => {
        console.log('分享海报生成成功:', res.tempFilePath);
        this.setData({ shareImageUrl: res.tempFilePath });
        
        // 通过全局回调函数返回生成的图片路径
        const app = getApp();
        if (app.globalData && app.globalData.shareImageCallback) {
          app.globalData.shareImageCallback(res.tempFilePath);
          app.globalData.shareImageCallback = null; // 清除回调
        }
        
        wx.navigateBack();
      },
      fail: (err) => {
        console.error('生成分享海报失败:', err);
        
        // 失败时也要调用回调
        const app = getApp();
        if (app.globalData && app.globalData.shareImageCallback) {
          app.globalData.shareImageCallback(null);
          app.globalData.shareImageCallback = null;
        }
        
        wx.showToast({
          title: '生成海报失败',
          icon: 'error'
        });
        
        wx.navigateBack();
      }
    }, this);
  },

  // 预览生成的海报
  previewImage: function() {
    if (this.data.shareImageUrl) {
      wx.previewImage({
        urls: [this.data.shareImageUrl]
      });
    }
  }
});