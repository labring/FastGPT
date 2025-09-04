# FastGPT Token 获取指南

## 方法1: 获取Session Token（推荐用于测试）

### 步骤：
1. **登录FastGPT前端**
   - 打开浏览器访问 http://localhost:3000
   - 登录你的FastGPT账号

2. **打开开发者工具**
   - 按 F12 或右键 -> 检查元素
   - 切换到 "Application" 或 "存储" 标签页

3. **查找Cookie中的Token**
   - 在左侧面板找到 "Cookies" -> "http://localhost:3000"
   - 查找名为 `token` 的cookie值
   - 复制这个值

4. **或者从请求Header获取**
   - 切换到 "Network" 标签页
   - 刷新页面或进行任何操作
   - 找到任意一个API请求
   - 查看Request Headers，找到 `token: xxx` 这一行
   - 复制token值

### 更新.env文件：
```bash
TEST_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI...
```

## 方法2: 获取API Key

### 步骤：
1. **登录FastGPT前端**
2. **进入应用管理**
3. **打开任意应用的API访问页面**
4. **复制API Key**
   - 格式通常是：`fastgpt-xxxxxxxxx`

### 更新.env文件：
```bash
TEST_TOKEN=fastgpt-pJvXySapvRI8iGk6liymuOecLG0GlGGhC5eVWTw78OrpUdPazovNdy
```

## 验证Token有效性

### 使用curl测试：

**Session Token测试：**
```bash
curl -X POST http://localhost:3000/api/core/evaluation/task/list \
  -H "Content-Type: application/json" \
  -H "token: YOUR_SESSION_TOKEN_HERE" \
  -d '{"pageNum": 1, "pageSize": 5}'
```

**API Key测试：**
```bash
curl -X POST http://localhost:3000/api/core/evaluation/task/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -d '{"pageNum": 1, "pageSize": 5}'
```

## 故障排查

### 常见问题：

1. **403权限错误**
   - Token格式不正确
   - Token已过期
   - 用户没有评估模块权限

2. **Token过期**
   - Session Token通常24小时过期
   - 需要重新登录获取新token

3. **权限不足**
   - 确认用户对评估模块有访问权限
   - 确认用户在正确的团队中

### 检查Token格式：

**Session Token特征：**
- 长度较长（通常100+字符）
- 以 `eyJ` 开头（JWT格式）
- 包含3个用点分隔的部分

**API Key特征：**
- 以 `fastgpt-` 开头
- 长度固定
- 字母数字组合

## 当前你的Token分析

根据你的.env文件，当前token是：
```
fastgpt-pJvXySapvRI8iGk6liymuOecLG0GlGGhC5eVWTw78OrpUdPazovNdy
```

这是一个API Key格式的token。如果仍然出现403错误，可能原因：

1. **API Key无效或过期**
2. **API Key对应的应用没有评估权限**
3. **需要指定appId**

### 解决建议：

1. **重新获取Session Token**：
   - 按照方法1获取session token
   - 更新TEST_TOKEN为session token

2. **或者获取新的API Key**：
   - 确保API Key对应的应用有评估模块权限
   - 检查API Key是否正确复制

3. **检查FastGPT配置**：
   - 确保评估模块已启用
   - 确保用户有相应权限