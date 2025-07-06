# 🎯 AI邀约小程序 - 智能活动管理平台

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini%20Program-green.svg)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![AI Powered](https://img.shields.io/badge/AI-Powered-blue.svg)](https://dify.ai/)

一个基于微信小程序的智能活动邀约管理平台，集成AI助手功能，支持名片识别、智能推荐、活动管理等功能。

## ✨ 功能特色

- 🤖 **AI智能助手**: 集成Dify AI，提供智能活动推荐和参与者匹配
- 📇 **名片识别**: 基于豆包视觉API的智能名片信息提取
- 📅 **活动管理**: 完整的活动创建、编辑、参与流程
- 👥 **参与者管理**: 智能参与者匹配和管理
- 📊 **数据统计**: 活动数据分析和报表
- 🔔 **消息通知**: 微信订阅消息推送
- 📱 **二维码生成**: 活动专属二维码分享
- 🎨 **现代化UI**: 美观的用户界面设计

## 🏗️ 技术架构

- **前端**: 微信小程序 (WXML + WXSS + JavaScript)
- **后端**: 微信云开发 (云函数 + 云数据库 + 云存储)
- **AI服务**: Dify AI API
- **视觉识别**: 豆包视觉API (字节跳动)
- **数据库**: 微信云数据库 (MongoDB)

## 📋 系统要求

- 微信开发者工具 1.06.0+
- Node.js 16.0+
- 微信小程序账号
- 微信云开发环境
- Dify AI账号
- 豆包视觉API账号

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/your-username/ai-invitation-miniprogram.git
cd ai-invitation-miniprogram
```

### 2. 配置微信小程序

1. 在微信公众平台注册小程序账号
2. 获取小程序的 `AppID`
3. 在 `project.config.json` 中修改 `appid` 字段

### 3. 开通微信云开发

1. 在微信开发者工具中打开项目
2. 点击「云开发」按钮
3. 开通云开发服务，创建环境
4. 记录环境ID (env)

### 4. 配置API密钥

#### 4.1 配置Dify AI API

1. 访问 [Dify官网](https://dify.ai/) 注册账号

2. 创建chatflow或聊天助手，填入以下提示词：

3. 

   > ​    请基于参与者的职业背景和公司信息，提供一个简短的社交建议，帮助用户更好地与这位参与者互动。建议应该是具体的、有建设性的，并且考虑到活动的性质和双方可能的共同职业话题，content部分用段落式回复，不要用markdown格式返回
   >
   > ​    请用以下格式返回：
   >
   > ​    {
   >
   > ​      "title": "建议标题",
   >
   > ​      "content": "有什么合作，有无可以与对方展开合作的话题，直接给出结论，不超过50个字",
   >
   > ​      "tips": ["基于content，提供2到3个简短的话题标签，用列表呈现"]
   >
   > ​    }
   >
   > 
   >
   > content举例：
   >
   > 1. 李总所在银行最近推出了针对科技创新企业的金融产品，可以讨论如何利用这些产品降低融资成本。
   > 2. 关于新能源行业的投资机会，可以与王总探讨他们公司在光伏领域的布局和未来合作可能性。

   发布dify，然后在“访问API”中获取其API Key

   

4. 在 `cloudfunctions/callDifyAPI/index.js` 中修改：

```javascript
const DIFY_API_KEY = 'your-dify-api-key' // 替换为你的Dify API Key
```



#### 4.2 配置豆包视觉API

1. 访问 [火山引擎](https://console.volcengine.com/) 注册账号
2. 开通豆包视觉服务，获取API Key
3. 在 `cloudfunctions/recognizeBusinessCard/index.js` 中配置API密钥

#### 4.3 配置微信小程序密钥

在 `cloudfunctions/generateEventQRCode/index.js` 中修改：

```javascript
const secret = 'your-miniprogram-secret'; // 替换为你的小程序secret
```

#### 4.4 配置登录页面图片

登录页面使用了云存储的图片资源，需要替换为你自己的云存储路径：

1. 在 `pages/login/login.wxml` 中修改：
```html
<image class="login-page-logo" src="cloud://your-cloud-env-id.your-cloud-path/logos/logo_login.png" mode="aspectFit"></image>
```

2. 在 `pages/login/login.wxss` 中修改：
```css
background-image: url('cloud://your-cloud-env-id.your-cloud-path/images/login_top_bg.png');
```

请将 `your-cloud-env-id` 和 `your-cloud-path` 替换为你的实际云环境ID和云存储路径。

### 5. 部署云函数

在微信开发者工具中，右键每个云函数文件夹，选择「上传并部署」：

- `addNotification` - 添加通知
- `callAIAssistant` - AI助手调用
- `callDifyAPI` - Dify API调用
- `deleteQRCodes` - 删除二维码
- `deleteUserAccount` - 删除用户账号
- `expectRerun` - 期望重新运行
- `generateEventQRCode` - 生成活动二维码
- `getEventQRCodes` - 获取活动二维码
- `getOpenid` - 获取用户OpenID
- `getPhoneNumber` - 获取手机号
- `getUsersByIds` - 根据ID获取用户
- `login` - 用户登录
- `managePresetTags` - 管理预设标签
- `markCheckin` - 标记签到
- `recognizeBusinessCard` - 名片识别
- `sendSubscribeMessage` - 发送订阅消息
- `updateQRCodeName` - 更新二维码名称
- `updateUserSubscription` - 更新用户订阅

### 6. 配置云数据库

#### 6.1 创建数据库集合

在云开发控制台创建以下集合：

- `checkinRecords` - 签到记录
- `clientFolders` - 客户文件夹
- `eventQRCodes` - 活动二维码
- `eventTopicPreferences` - 活动主题偏好
- `events` - 活动信息
- `expectRerun` - 期望重新运行
- `home_banners` - 首页横幅
- `notifications` - 通知消息
- `presetTags` - 预设标签
- `survey_responses` - 调查回复
- `users` - 用户信息

#### 6.2 配置数据库权限

**重要**: 需要为以下集合配置特殊权限，以确保小程序用户能共享数据读取：

1. **events集合权限配置**:
   - 允许所有用户读取
   - 允许所有用户修改 `participants` 字段
   ```json
   {
     "read": true,
     "write": "doc.participants || auth != null"
   }
   ```

2. **eventQRCodes集合权限配置**:
   - 允许所有用户读取和修改，确保 `count` 字段正常更新
   ```json
   {
     "read": true,
     "write": true
   }
   ```

3. **users集合权限配置**:
   - 允许用户读取自己的数据和其他用户的公开信息
   ```json
   {
     "read": true,
     "write": "doc._openid == auth.openid"
   }
   ```

### 7. 配置云存储权限

在云开发控制台的「云存储」中：

1. 点击「权限设置」
2. 设置为「所有用户可读，仅创建者可写」
3. 确保所有用户都能查看其他人上传的图片

### 8. 配置订阅消息

1. 在微信公众平台配置订阅消息模板
2. 在小程序中申请订阅消息权限
3. 配置消息推送逻辑

## 📱 使用教程

### 用户端使用

1. **注册登录**
   - 微信授权登录
   - 完善个人资料（姓名、公司、职位、手机号）
   - 支持名片扫描自动填写

2. **浏览活动**
   - 首页查看最新活动
   - 按标签筛选活动
   - 查看活动详情

3. **参与活动**
   - 点击「参加活动」
   - 查看其他参与者
   - 获取AI智能推荐

4. **管理活动**
   - 创建新活动
   - 编辑活动信息
   - 管理参与者
   - 查看活动统计

### 管理员功能

1. **活动管理**
   - 审核活动申请
   - 管理活动状态
   - 查看活动数据

2. **用户管理**
   - 查看用户列表
   - 管理用户权限
   - 处理用户反馈

3. **内容管理**
   - 管理首页横幅
   - 设置预设标签
   - 配置系统参数

## 🤖 AI功能说明

### 智能推荐
- 基于用户画像和活动特征进行智能匹配
- 推荐相关活动和潜在合作伙伴
- 提供个性化的参与建议

### 名片识别
- 支持拍照识别名片信息
- 自动提取姓名、公司、职位、电话
- 支持多公司职位识别

## 🤝 贡献指南

我们欢迎所有技术人员参与AI邀约小程序的开发和完善！

### 社区交流

- 💬 **讨论区**: 在GitHub Issues中讨论功能需求和问题
- 📧 **邮件联系**: [1075983130@qq.com]
- 🐛 **Bug报告**: 使用Issue模板报告问题
- 💡 **功能建议**: 通过Issue提出新功能建议

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

## 🙏 致谢

感谢以下开源项目和服务：

- [微信小程序](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [微信云开发](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)
- [Dify AI](https://dify.ai/)
- [豆包视觉API](https://www.volcengine.com/)

## 📞 联系我们

如果你有任何问题或建议，欢迎通过以下方式联系我们：

- 📧 Email: [1075983130@qq.com]
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/ai-invitation-miniprogram/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-username/ai-invitation-miniprogram/discussions)

---

⭐ 如果这个项目对你有帮助，请给我们一个Star！

🚀 让我们一起构建更智能的活动邀约平台！