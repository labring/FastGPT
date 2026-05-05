# FastGPT 反向调用处理器设计

**反向调用** 是指 FastGPT 提供一系列接口供 FastGPT-Plugin 调用以进行文件上传、模型调用、知识库检索等操作。

## 反向调用流程

### 1. 插件声明权限

在插件开发过程中声明权限，在插件安装解析时、插件市场中显示权限，确认安装则视为授权。

### 2. FastGPT 签发 InvokeToken

Payload: 权限、必要信息, 过期时间 30 分钟

### 3. FastGPT-Plugin 发送 invoke 请求，携带 token

### 4. FastGPT 处理 invoke 请求，返回结果。

## TODO

- [ ] 插件权限展示相关逻辑
