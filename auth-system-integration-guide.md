# FastGPT认证监管系统使用指南

## 整体架构

FastGPT认证监管系统由三个主要组件组成：

1. **FastGPT主服务** - 运行在 http://10.14.53.120:3000
2. **用户认证服务** - 运行在 http://10.14.53.120:3003
3. **认证代理服务** - 运行在 http://10.14.53.120:3004

## 使用方法

### 1. 启动所有服务

使用以下命令启动所有服务：

```powershell
# 如果服务已运行，先停止现有服务
Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue

# 启动用户管理服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node simple-server.js"

# 启动认证代理服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node fixed-proxy.js"

# 启动FastGPT服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\projects\app; npx next dev -H 10.14.53.120 -p 3000"
```

### 2. 创建分享链接

1. 访问FastGPT： http://10.14.53.120:3000
2. 创建应用并进入详情页面 
3. 在应用详情页面，选择"发布"选项卡
4. 创建分享链接

### 3. 修改分享链接

**重要：** 您必须修改分享链接，使其通过认证代理服务访问：

原始链接：
```
http://10.14.53.120:3000/chat/share?shareId=YOUR_SHARE_ID
```

修改为：
```
http://10.14.53.120:3004/chat/share?shareId=YOUR_SHARE_ID
```

只需将端口从 `3000` 改为 `3004`，其他保持不变。

### 4. 测试认证流程

1. 使用私密浏览器窗口访问修改后的分享链接
2. 系统将自动重定向到登录页面：http://10.14.53.120:3003/login.html
3. 使用默认管理员账号登录：
   - 用户名：admin
   - 密码：123456
4. 或者点击"立即注册"创建新账号
5. 登录后，系统将自动将您重定向回分享页面，现在您可以正常使用对话功能

### 5. 查看监控数据

作为管理员，您可以查看所有用户和对话记录：

1. 访问管理页面：http://10.14.53.120:3003/admin
2. 使用管理员账号登录
3. 在"用户管理"选项卡查看所有注册用户
4. 在"对话记录"选项卡查看所有通过代理的对话内容

## 工作原理

1. 用户访问修改后的分享链接（端口3004）
2. 认证代理检查用户是否有有效token
3. 如无token，重定向到登录页面
4. 登录成功后，登录页面将token添加到原始URL并重定向
5. 认证代理验证token，并将请求代理到FastGPT
6. 对话内容被记录到监控系统中

## 注意事项

1. 不需要重新build FastGPT，因为集成主要通过代理和重定向实现
2. 确保所有三个服务同时运行
3. 分享链接必须修改为使用3004端口
4. 如遇问题，请检查各服务的控制台输出