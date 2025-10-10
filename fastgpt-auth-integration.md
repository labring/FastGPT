# FastGPT与认证监管系统集成指南

## 系统组成

FastGPT系统现已集成认证监管功能，由以下几个部分组成：

1. **FastGPT主服务**
   - 运行在: `http://10.14.53.120:3000`
   - 目录: `projects/app`
   - 启动方式: `npx next dev -H 10.14.53.120 -p 3000`

2. **认证监管系统**
   - 用户管理服务
     - 运行在: `http://10.14.53.120:3003`
     - 文件: `auth-system/simple-server.js`
     - 功能: 管理用户认证信息
   
   - 认证代理服务
     - 运行在: `http://10.14.53.120:3004`
     - 文件: `auth-system/fixed-proxy.js`
     - 功能: 提供认证代理访问FastGPT

3. **后端数据库服务**
   - MongoDB: 存储用户数据与应用配置
   - Redis: 缓存服务
   - PostgreSQL: 向量存储
   - MinIO: 对象存储

## 启动方法

### 方法一：使用一键启动脚本

```
# 在PowerShell中执行
.\start-all.ps1
```

### 方法二：分别启动各组件

1. 启动用户管理服务:
```
cd C:\Users\Admin\Desktop\FastGPT\auth-system
node simple-server.js
```

2. 启动认证代理服务:
```
cd C:\Users\Admin\Desktop\FastGPT\auth-system
node fixed-proxy.js
```

3. 启动FastGPT主服务:
```
cd C:\Users\Admin\Desktop\FastGPT\projects\app
npx next dev -H 10.14.53.120 -p 3000
```

## 访问方式

- FastGPT主界面: `http://10.14.53.120:3000`
- 用户管理后台: `http://10.14.53.120:3003/admin`
- 通过代理访问分享页: `http://10.14.53.120:3004/share/{shareId}`

## 注意事项

1. 启动服务需要确保MongoDB、Redis等数据库服务已启动
2. 如果要在生产环境中使用，建议使用PM2等进程管理工具
3. IP地址已设置为`10.14.53.120`，确保此IP可在网络中访问
4. 如需更改IP或端口配置，请相应修改启动命令和脚本

## 故障排除

1. 如果服务无法启动，检查数据库连接是否正常
2. 确保所需的端口(3000, 3003, 3004)未被其他程序占用
3. 如遇权限问题，尝试以管理员权限运行命令