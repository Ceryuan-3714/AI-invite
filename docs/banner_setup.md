# 首页轮播图功能说明

## 功能概述

首页轮播图已从固定的本地代码改为动态从云数据库读取。系统会根据云数据库中的记录数量自动显示对应数量的轮播图。

## 数据库集合结构

### 集合名称：`home_banners`

### 字段说明：

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | String | 是 | 自动生成的唯一标识 |
| imageUrl | String | 是 | 图片URL（支持云存储地址或网络图片地址） |
| title | String | 是 | 轮播图标题 |
| subtitle | String | 否 | 轮播图副标题 |
| jumpPath | String | 否 | 点击跳转路径（小程序页面路径或外部链接） |
| order | Number | 是 | 排序字段（数字越小越靠前） |
| isActive | Boolean | 是 | 是否启用（控制轮播图是否显示） |
| createTime | Date | 是 | 创建时间 |

### 示例数据：

```json
{
  "imageUrl": "cloud://your-env.xxx/banner1.jpg",
  "title": "心光邀约 - 需求问卷调研",
  "subtitle": "点击填写问卷，帮助我们更好改进",
  "jumpPath": "/pages/events/events",
  "order": 1,
  "isActive": true,
  "createTime": "2024-01-01T00:00:00.000Z"
}
```

## 初始化数据

### 方法一：使用云函数初始化

1. 在微信开发者工具中上传并部署 `initBanners` 云函数
2. 在云开发控制台中调用该云函数
3. 云函数会自动创建示例轮播图数据

### 方法二：手动添加数据

1. 在微信开发者工具的云开发控制台中
2. 进入数据库管理
3. 创建 `home_banners` 集合
4. 手动添加轮播图记录

## 功能特性

### 1. 动态数量
- 集合中有多少条 `isActive: true` 的记录，就显示多少个轮播图
- 支持0个轮播图（此时轮播组件不显示）

### 2. 排序控制
- 通过 `order` 字段控制轮播图显示顺序
- 数字越小越靠前显示

### 3. 跳转支持
- 支持小程序内部页面跳转
- 外部链接功能已移除
- 如果 `jumpPath` 为空，点击无效果

### 4. 图片支持
- 支持云存储图片地址
- 支持网络图片地址
- 支持本地图片路径

## 管理轮播图

### 添加新轮播图

在云数据库中添加新记录：

```json
{
  "imageUrl": "你的图片地址",
  "title": "轮播图标题",
  "subtitle": "轮播图副标题",
  "jumpPath": "跳转路径",
  "order": 排序数字,
  "isActive": true,
  "createTime": new Date()
}
```

### 禁用轮播图

将记录的 `isActive` 字段设置为 `false`

### 调整顺序

修改记录的 `order` 字段值

### 删除轮播图

直接删除对应的数据库记录

## 注意事项

1. 图片建议使用云存储，确保加载速度和稳定性
2. 图片尺寸建议保持一致，避免显示异常
3. 跳转路径请确保有效，避免用户点击后无响应
4. 定期检查外部链接的有效性
5. 轮播图数量建议控制在3-5个，过多影响用户体验

## 代码文件说明

- `pages/index/index.js` - 主要逻辑文件，包含轮播图加载和点击处理
- `pages/index/index.wxml` - 页面结构文件，轮播图显示组件
- `cloudfunctions/initBanners/` - 云函数，用于初始化轮播图数据