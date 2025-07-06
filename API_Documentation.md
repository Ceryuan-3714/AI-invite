# 接口文档

## 1. 活动详情接口
- **接口描述**: 获取活动的详细信息，包括参与者和AI建议。
- **请求方法**: GET
- **请求参数**:
  - `id`: 活动ID，字符串类型，必填。
- **响应格式**:
  ```json
  {
    "id": "string",
    "title": "string",
    "date": "string",
    "time": "string",
    "location": "string",
    "participants": "number",
    "maxParticipants": "number",
    "tags": ["string"],
    "status": "string",
    "cover": "string",
    "description": "string",
    "organizer": {
      "name": "string",
      "avatar": "string",
      "company": "string",
      "position": "string"
    }
  }
  ```

## 2. 活动列表接口
- **接口描述**: 获取活动列表，根据标签筛选。
- **请求方法**: GET
- **请求参数**:
  - `tab`: 标签类型，字符串类型，可选值为`最新活动`、`热门活动`、`我的邀约`。
- **响应格式**:
  ```json
  [
    {
      "id": "string",
      "title": "string",
      "date": "string",
      "time": "string",
      "location": "string",
      "participants": "number",
      "maxParticipants": "number",
      "tags": ["string"],
      "status": "string",
      "cover": "string"
    }
  ]
  ```

## 3. 用户登录接口
- **接口描述**: 用户通过微信登录，获取用户信息。
- **请求方法**: POST
- **请求参数**:
  - `code`: 微信登录凭证，字符串类型，必填。
- **响应格式**:
  ```json
  {
    "userInfo": {
      "name": "string",
      "avatar": "string",
      "company": "string",
      "position": "string"
    },
    "isLoggedIn": "boolean"
  }
  ```

## 4. AI建议接口
- **接口描述**: 获取AI社交建议。
- **请求方法**: POST
- **请求参数**:
  - `userInfo`: 当前用户信息，JSON对象，必填。
  - `participants`: 其他参与者信息，JSON数组，必填。
- **响应格式**:
  ```json
  [
    {
      "person": {
        "name": "string",
        "company": "string",
        "position": "string"
      },
      "topics": ["string"],
      "probability": "number",
      "script": "string"
    }
  ]
  ```

## 5. 按钮操作接口

### 1) 活动报名接口
- **接口描述**: 处理用户报名状态变更
- **请求方法**: POST
- **请求参数**:
  - `userId`: 用户ID，字符串类型，必填
  - `eventId`: 活动ID，字符串类型，必填
  - `actionType`: 操作类型（报名/取消），字符串类型，必填
- **响应格式**:
  ```json
  {
    "status": "success|error",
    "errorCode": "number",
    "message": "string"
  }
  ```

### 2) 收藏接口
- **接口描述**: 管理用户收藏行为
- **请求方法**: POST
- **请求参数**:
  - `userId`: 用户ID，字符串类型，必填
  - `eventId`: 活动ID，字符串类型，必填
  - `actionType`: 操作类型（收藏/取消），字符串类型，必填
- **响应格式**: 同报名接口

### 3) 分享统计接口
- **接口描述**: 记录分享行为并返回统计信息
- **请求方法**: POST
- **请求参数**:
  - `userId`: 用户ID，字符串类型，必填
  - `eventId`: 活动ID，字符串类型，必填
  - "platform": "微信|朋友圈|微博"
- **响应格式**:
  ```json
  {
    "shareCount": "number",
    "status": "success|error",
    "errorCode": "number"
  }
  ```

### 4) 通用状态变更接口
- **接口描述": 统一处理各类状态变更
- **请求方法": POST
- **请求参数":
  - `userId": 用户ID，字符串类型，必填
  - `eventId": 活动ID，字符串类型，必填
  - `actionType": 操作类型（like, follow, report等）
- **响应格式": 同报名接口

## 6. AI社交建议接口

### 1) 获取基于特定场景的社交建议
- **接口描述**: 获取基于特定场景的社交建议
- **请求方法**: POST
- **请求参数**:
  - `targetUserId`: 目标用户ID，字符串类型，必填
  - `eventId`: 活动ID，字符串类型，必填
  - `context`: 上下文信息，字符串类型，必填
- **响应格式**:
  ```json
  {
    "advice": "详细的社交建议",
    "topics": ["话题1", "话题2"],
    "confidence": 0.85
  }
  ```

GET /api/v1/events/joined
描述: 获取我参与的活动
请求头: Authorization: Bearer {token}
参数: page=1&size=10&status=all
响应: { "total": 8, "items": [{活动1}, {活动2}, ...] }