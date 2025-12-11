# FastGPT Rerank API 测试快速开始

## 🚀 5分钟快速上手

### 1. 导入配置
1. 打开 Postman
2. 导入 `FastGPT-Rerank-Training-API.postman_collection.json`
3. 导入 `postman-environment.json`
4. 选择 **FastGPT Rerank 测试环境**

### 2. 设置必要变量
在环境中设置：
- `APP_ID`: 你的测试应用ID（必需）
- `AUTH_TYPE`: `cookie`（推荐）
- `FASTGPT_TOKEN`: 从浏览器获取的认证token

### 3. 启动服务
```bash
make dev name=app
```

### 4. 运行测试
执行以下测试验证基本功能：

1. **创建训练集**
   - 请求：`POST /api/core/train/rerank/trainset/create`
   - 将返回的 `trainsetId` 设置到环境变量

2. **查看训练集列表**
   - 请求：`POST /api/core/train/rerank/trainset/list`
   - 验证训练集创建成功

3. **创建训练任务**
   - 请求：`POST /api/core/train/rerank/task/create`
   - 将返回的 `taskId` 设置到环境变量

4. **查询任务状态**
   - 请求：`GET /api/core/train/rerank/task/detail`

## ✅ 验证成功
如果所有接口返回 `code: 200`，说明测试配置正确！

## 🆘 遇到问题？
- 查看完整文档：[README.md](README.md)
- 检查 FastGPT 服务是否正常运行
- 确认 APP_ID 设置正确