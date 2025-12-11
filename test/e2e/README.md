# FastGPT Rerank Training API 接口测试

本目录包含 FastGPT Rerank 训练模块的 Postman 接口测试配置，用于验证 API 功能的完整性和正确性。

## 📁 文件说明

- `FastGPT-Rerank-Training-API.postman_collection.json` - Postman 测试集合文件
- `postman-environment.json` - Postman 环境变量配置
- `README.md` - 本使用说明文档

## 🚀 快速开始

### 1. 安装 Postman

下载并安装 [Postman](https://www.postman.com/downloads/) 客户端。

### 2. 导入测试集合

1. 打开 Postman 客户端
2. 点击左上角的 **Import** 按钮
3. 选择 **File** 标签页
4. 点击 **Choose Files**，选择 `FastGPT-Rerank-Training-API.postman_collection.json`
5. 确认导入，集合将显示在左侧面板中

### 3. 导入环境变量

1. 点击 Postman 左上角的 **Environment** 按钮（或按 `Ctrl+Alt+E`）
2. 点击 **Import** 按钮
3. 选择 `postman-environment.json` 文件
4. 导入后，在环境下拉菜单中选择 **FastGPT Rerank 测试环境**

### 4. 配置环境变量

在使用测试之前，需要设置以下关键环境变量：

#### 环境变量配置

| 变量名 | 说明 | 默认值 | 是否必需 |
|--------|------|--------|----------|
| `API_BASE_URL` | FastGPT API 服务地址 | `http://localhost:3000` | 否 |
| `APP_ID` | 测试应用ID | `your-app-id-here` | **是** |
| `TASK_ID` | 任务ID（测试时自动设置） | 空 | 否 |
| `TRAINSET_ID` | 训练集ID（测试时自动设置） | 空 | 否 |
| `DATA_ID` | 训练数据ID（测试时自动设置） | 空 | 否 |
| `AUTH_TYPE` | 认证类型 | `cookie` | 否 |

#### 认证配置

FastGPT 支持多种认证方式，根据 `AUTH_TYPE` 环境变量设置：

**Cookie 认证（推荐）**
```json
{
  "AUTH_TYPE": "cookie",
  "FASTGPT_TOKEN": "从浏览器获取的 fastgpt_token"
}
```

**Bearer Token 认证**
```json
{
  "AUTH_TYPE": "bearer",
  "AUTH_TOKEN": "Bearer fastgpt-xxxxx"
}
```

**API Key 认证**
```json
{
  "AUTH_TYPE": "apikey",
  "API_KEY": "your-api-key"
}
```

**Root Key 认证**
```json
{
  "AUTH_TYPE": "root",
  "ROOT_KEY": "your-root-key"
}
```

**注意**：只有 `APP_ID` 是必须手动设置的，认证信息和ID变量会自动填充。

### 🔐 获取认证信息

#### 方法一：从浏览器获取 Cookie Token（推荐）

1. 打开 FastGPT Web 应用并登录
2. 打开浏览器开发者工具（F12）
3. 在 **Network** 标签页中找到任一API请求
4. 查看 **Request Headers** 中的 `Cookie` 字段
5. 复制 `fastgpt_token=xxxxx` 中的值（xxxxx 部分）
6. 在 Postman 环境变量中设置：
   - `AUTH_TYPE`: `cookie`
   - `FASTGPT_TOKEN`: 复制的token值

#### 方法二：使用 API Key

1. 登录 FastGPT 管理后台
2. 进入 API 管理页面
3. 创建新的 API Key
4. 在 Postman 环境变量中设置：
   - `AUTH_TYPE`: `apikey`
   - `API_KEY`: 创建的API Key

#### 方法三：使用 Root Key（管理员）

1. 获取管理员权限的 Root Key
2. 在 Postman 环境变量中设置：
   - `AUTH_TYPE`: `root`
   - `ROOT_KEY`: Root Key 值

## 🧪 测试模块

测试集合包含以下主要模块：

### 1. 训练任务管理
- **创建训练任务** - 创建新的 Rerank 训练任务
- **获取任务详情** - 查询指定任务的详细信息
- **获取任务列表** - 获取训练任务列表，支持分页和状态过滤
- **重试任务** - 重新执行失败或已取消的任务
- **取消任务** - 取消正在执行的任务
- **删除任务** - 删除指定的训练任务

### 2. 训练集管理
- **创建训练集** - 为应用创建新的训练集
- **获取训练集列表** - 查询训练集列表，支持分页和状态过滤
- **获取训练集详情** - 查询训练集的详细信息
- **删除训练集** - 删除指定的训练集

### 3. 训练数据管理
- **生成训练数据** - 从知识库自动生成训练数据
- **创建手动训练数据** - 手动添加训练数据
- **获取训练数据列表** - 获取训练集的数据列表
- **更新训练数据** - 修改已存在的训练数据
- **删除训练数据** - 批量删除训练数据

## 🔧 测试流程

### 完整测试流程示例

1. **创建训练集**
   ```
   使用：创建训练集
   请求：POST /api/core/train/rerank/trainset/create
   参数：appId, name, description
   ```

2. **查看训练集列表**
   ```
   使用：获取训练集列表
   请求：POST /api/core/train/rerank/trainset/list
   参数：appId, status, pageNum, pageSize
   ```

3. **生成训练数据**
   ```
   使用：生成训练数据
   请求：POST /api/core/train/rerank/trainset/data/generate
   参数：trainsetId, forceRegenerate
   ```

3. **创建训练任务**
   ```
   使用：创建训练任务
   请求：POST /api/core/train/rerank/task/create
   参数：appId, name, description
   ```

4. **监控任务状态**
   ```
   使用：获取任务详情
   请求：GET /api/core/train/rerank/task/detail
   参数：taskId
   ```

5. **清理测试数据**
   ```
   使用：删除任务、删除训练集
   请求：DELETE /api/core/train/rerank/task/delete
         DELETE /api/core/train/rerank/trainset/delete
   ```

### 数据流测试

1. **从知识库生成训练数据**
   - 确保应用关联了包含数据的知识库
   - 创建训练集后，使用"生成训练数据"接口
   - 检查生成的训练数据格式和内容

2. **手动添加训练数据**
   - 创建训练集
   - 使用"创建手动训练数据"接口添加测试数据
   - 验证数据是否正确保存

## 📊 预期响应格式

### 成功响应
```json
{
  "code": 200,
  "message": "success",
  "data": {
    // 具体数据内容
  }
}
```

### 错误响应
```json
{
  "code": 400,
  "message": "错误信息",
  "data": null
}
```

## ⚠️ 注意事项

### 测试前准备

1. **确保 FastGPT 服务运行**
   ```bash
   # 在项目根目录启动开发服务器
   make dev name=app
   ```

2. **准备测试数据**
   - 确保有可用的测试应用（APP_ID）
   - 确保应用关联了知识库（用于生成训练数据）
   - 确保知识库包含有效数据

3. **环境变量设置**
   - 正确设置 `APP_ID`，这是创建训练任务的必需参数
   - 验证 `API_BASE_URL` 指向正确的服务地址

### 测试执行建议

1. **按模块顺序测试**：先测试训练集管理，再测试任务管理
2. **数据清理**：测试完成后删除创建的测试数据，避免影响其他测试
3. **错误处理**：注意观察响应中的错误信息，帮助定位问题
4. **性能测试**：关注响应时间，特别是数据生成接口

### 常见问题

1. **应用ID无效**
   ```
   错误：App not found
   解决：检查并设置正确的 APP_ID
   ```

2. **知识库无数据**
   ```
   错误：No datasets found for this app
   解决：确保应用关联了包含数据的知识库
   ```

3. **权限问题**
   ```
   错误：Permission denied
   解决：检查团队ID和成员ID是否正确
   ```

## 🔄 自动化测试

### 使用 Postman Runner

1. 在 Postman 中选择测试集合
2. 点击 **Run** 按钮
3. 选择测试环境和要执行的测试
4. 点击 **Run collection** 开始批量测试

### 集成到 CI/CD

可以将 Postman 集合集成到 CI/CD 流程中：

```bash
# 使用 Newman（Postman CLI）运行测试
npm install -g newman
newman run "FastGPT-Rerank-Training-API.postman_collection.json" \
  -e postman-environment.json \
  --reporters cli,html
```

## 📝 自定义测试

### 添加新测试

1. 在 Postman 中选择相应模块
2. 点击 **Add requests** 添加新的请求
3. 配置请求参数、URL 和测试脚本
4. 保存更新

### 自定义测试脚本

在每个请求的 **Tests** 标签页中，可以添加自定义测试脚本：

```javascript
// 示例：验证特定字段
pm.test("包含 taskId", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData.data).to.have.property("taskId");
});

// 示例：设置环境变量
if (pm.response.code === 200) {
    const taskId = pm.response.json().data.taskId;
    pm.environment.set("TASK_ID", taskId);
}
```

## 🤝 贡献指南

1. 添加新的 API 测试时，请遵循现有的命名和结构规范
2. 为新功能添加相应的测试用例
3. 确保测试脚本的正确性和可读性
4. 更新本文档以反映测试集合的变化

## 📚 相关文档

- [FastGPT 开发指南](../../../README.md)
- [Rerank 模块文档](../../../packages/global/core/train/rerank/)
- [API 文档](../../../projects/app/src/pages/api/core/train/rerank/)