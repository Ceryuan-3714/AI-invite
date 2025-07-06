# 二维码生成

## 活动页面二维码

通过调用 `generateEventQRCode` 云函数可以生成活动页面的小程序二维码。

### 参数

调用云函数时，可以传入以下参数：

- `eventId`: 活动的唯一标识符。
- `name`: 二维码的名称，用于标识和管理。
- `isManagementQR`: 布尔值，指示是否为管理二维码。
- `page`: 小程序页面的路径，例如 `pages/eventDetail/eventDetail`。
- `envVersion`: 要打开的小程序版本。合法值包括 `release`（正式版）、`trial`（体验版）、`develop`（开发版）。默认为 `release`。

### 示例代码

在 `pages/qrCodeManagement/qrCodeManagement.js` 中：

```javascript
wx.cloud.callFunction({
  name: 'generateEventQRCode',
  data: {
    eventId: this.data.eventId,
    name: qrName,
    isManagementQR: true,
    page: 'pages/eventDetail/eventDetail',
    envVersion: 'trial' // 设置为体验版
  }
});
```