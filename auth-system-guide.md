# FastGPT认证监管系统使用指南

## 系统概述

FastGPT认证监管系统是一个为FastGPT应用提供用户认证和对话监控功能的系统。它由三个主要组件构成：

1. **FastGPT主服务**：原始的FastGPT应用服务
2. **用户管理服务**：提供用户注册、登录和管理功能
3. **认证代理服务**：拦截分享链接访问，强制进行用户认证，并记录对话内容

通过这个系统，您可以：
- 要求用户必须登录后才能访问FastGPT的分享链接
- 监控和记录用户与AI的所有对话内容
- 通过管理后台查看用户信息和对话记录

## 系统架构

### 核心组件

| 组件名称 | 运行地址 | 核心文件 | 功能描述 |
|---------|---------|---------|---------|
| FastGPT主服务 | http://10.14.53.120:3000 | projects/app/ 目录下的文件 | 提供FastGPT的所有功能 |
| 用户管理服务 | http://10.14.53.120:3003 | auth-system/simple-server.js | 用户注册、登录、验证和管理 |
| 认证代理服务 | http://10.14.53.120:3004 | auth-system/fixed-proxy.js | 拦截请求，认证用户，代理请求到FastGPT |

### 关键文件列表

| 文件路径 | 作用 | 可能需要修改的内容 |
|---------|------|-----------------|
| auth-system/simple-server.js | 用户管理服务的主要逻辑 | 用户数据结构、API接口、存储方式 |
| auth-system/fixed-proxy.js | 认证代理的主要逻辑 | 代理规则、认证逻辑、监控方式 |
| auth-system/login.html | 登录和注册页面 | 页面样式、字段验证、重定向逻辑 |
| auth-system/admin.html | 管理后台页面 | 数据展示方式、管理功能、页面布局 |
| projects/app/src/auth-proxy/index.js | FastGPT端的认证集成模块 | 认证检查逻辑、日志记录方式 |
| projects/app/src/pages/chat/share.tsx | 分享页面组件 | 认证集成、对话记录发送 |

## 启动系统

### 方法1：一键启动（推荐）

使用以下PowerShell脚本一键启动所有组件：

```powershell
# 保存为 start-integrated-system.ps1
# 关闭现有Node.js进程
Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force -ErrorAction SilentlyContinue

# 等待进程完全关闭
Start-Sleep -Seconds 2

# 启动用户管理服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node simple-server.js"

# 等待服务启动
Start-Sleep -Seconds 2

# 启动认证代理服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\auth-system; node fixed-proxy.js"

# 等待服务启动
Start-Sleep -Seconds 2

# 启动FastGPT服务
Start-Process powershell -ArgumentList "-Command cd C:\Users\Admin\Desktop\FastGPT\projects\app; npx next dev -H 10.14.53.120 -p 3000"

Write-Host "所有服务已启动完成！" -ForegroundColor Green
```

运行脚本：
```
.\start-integrated-system.ps1
```

### 方法2：分别启动

1. **启动用户管理服务**:
```powershell
cd C:\Users\Admin\Desktop\FastGPT\auth-system
node simple-server.js
```

2. **启动认证代理服务**:
```powershell
cd C:\Users\Admin\Desktop\FastGPT\auth-system
node fixed-proxy.js
```

3. **启动FastGPT服务**:
```powershell
cd C:\Users\Admin\Desktop\FastGPT\projects\app
npx next dev -H 10.14.53.120 -p 3000
```

## 使用流程

### 1. 创建分享链接

1. 访问FastGPT: http://10.14.53.120:3000
2. 登录您的FastGPT账号
3. 创建或选择一个现有应用
4. 进入应用详情页面，例如：http://10.14.53.120:3000/app/detail?appId=YOUR_APP_ID&currentTab=publish
5. 在"发布"选项卡下创建分享链接
6. 复制生成的分享链接

### 2. 修改分享链接

**重要：** 必须修改分享链接，将端口从3000改为3004：

原始链接：
```
http://10.14.53.120:3000/chat/share?shareId=YOUR_SHARE_ID
```

修改为：
```
http://10.14.53.120:3004/chat/share?shareId=YOUR_SHARE_ID
```

### 3. 用户访问流程

1. 用户访问修改后的分享链接
2. 如果用户未登录，系统会重定向到登录页面
3. 用户登录或注册账号
4. 登录成功后，系统自动跳转回分享页面
5. 用户可以正常与AI进行对话
6. 所有对话内容被记录到监管系统

### 4. 管理监控

1. 访问管理后台：http://10.14.53.120:3003/admin
2. 使用管理员账号登录：
   - 用户名：admin
   - 密码：123456
3. 在"用户管理"选项卡查看所有注册用户
4. 在"对话记录"选项卡查看所有对话内容

## 系统定制与修改指南

### 修改登录页面

如果您想修改登录页面的样式或功能，需要编辑以下文件：

```
C:\Users\Admin\Desktop\FastGPT\auth-system\login.html
```

主要可修改内容：
- 页面标题和描述
- 表单字段和验证规则
- 页面样式（CSS）
- 登录和注册逻辑（JavaScript）

### 修改管理后台

如果您想修改管理后台的功能或样式，需要编辑以下文件：

```
C:\Users\Admin\Desktop\FastGPT\auth-system\admin.html
```

主要可修改内容：
- 数据展示方式
- 管理功能和权限
- 页面布局和样式
- 数据过滤和搜索功能

### 修改认证代理规则

如果您想修改认证代理的规则或行为，需要编辑以下文件：

```
C:\Users\Admin\Desktop\FastGPT\auth-system\fixed-proxy.js
```

主要可修改内容：
- 代理规则和路由
- 认证逻辑
- 对话监控和记录方式
- 错误处理和回退机制

### 修改用户管理服务

如果您想修改用户管理服务的功能，需要编辑以下文件：

```
C:\Users\Admin\Desktop\FastGPT\auth-system\simple-server.js
```

主要可修改内容：
- API接口和路由
- 用户数据结构
- 认证逻辑
- 数据存储方式（可替换为数据库）

### 修改FastGPT集成

如果您想修改FastGPT的认证集成方式，需要编辑以下文件：

```
C:\Users\Admin\Desktop\FastGPT\projects\app\src\auth-proxy\index.js
```

主要可修改内容：
- 认证检查逻辑
- 重定向规则
- 对话记录方式

## 工作原理详解

### 认证流程

1. 用户访问分享链接（端口3004）
2. 认证代理服务检查请求中是否包含有效的token
3. 如果没有token，重定向到登录页面，并在URL中加入原始URL作为redirect参数
4. 用户登录或注册账号
5. 登录成功后，系统将token添加到原始URL中，并重定向回分享页面
6. 认证代理服务验证token有效，然后将请求代理到FastGPT
7. FastGPT处理请求并返回结果
8. 认证代理服务将结果返回给用户

### 监控记录流程

1. 用户在分享页面与AI对话
2. 对话请求通过认证代理服务
3. 代理服务记录问题和回答
4. 同时，FastGPT端的集成模块也会将对话发送到监控系统
5. 管理员可以在管理后台查看所有对话记录

## 常见问题与解决方案

### 1. 服务无法启动

**问题**: 尝试启动服务时出现EADDRINUSE错误

**解决方案**:
```powershell
# 找出并结束占用端口的进程
Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force
```

### 2. 登录后无法重定向回分享页面

**问题**: 登录成功但没有跳转回原始页面

**解决方案**:
- 检查login.html中的重定向逻辑
- 确保URL参数正确传递
- 检查浏览器控制台是否有错误

### 3. 对话记录未显示在管理后台

**问题**: 对话进行了但管理后台看不到记录

**解决方案**:
- 检查fixed-proxy.js中的记录逻辑
- 确保auth-proxy/index.js中的logChatToAuthSystem函数被正确调用
- 检查API请求是否成功（查看网络请求）

## 安全注意事项

1. 默认的管理员账号（admin/123456）仅用于测试，生产环境请修改为复杂密码
2. 当前实现使用内存存储数据，系统重启后数据会丢失，生产环境请使用数据库
3. Token实现采用简单方式，生产环境建议使用JWT并添加过期时间
4. 分享链接的认证仅对通过3004端口访问的请求有效，直接访问3000端口仍可绕过认证

## 结语

本认证监管系统为FastGPT提供了基本的用户认证和对话监控功能。您可以根据需求进一步扩展和完善系统，例如：

- 集成真实数据库（MongoDB、MySQL等）
- 添加更多管理功能（数据分析、风险监控等）
- 完善用户管理（角色权限、审核机制等）
- 增强安全性（HTTPS、API权限等）

通过本指南，您应该能够成功部署和使用FastGPT认证监管系统，并根据需要进行定制和修改。