# FastGPT 项目上下文文档

## 项目概述

FastGPT 是一个基于 OpenAI API 的智能知识库问答平台，允许用户使用自己的 API KEY 来构建和管理私有知识库，支持多种 AI 模型（GPT-3.5、GPT-4、Claude）进行智能问答。

### 核心特性

- **知识库管理**: 支持用户创建、管理多个知识库
- **多格式文档导入**: 支持 CSV、Word、URL 抓取等多种数据导入方式
- **向量化搜索**: 使用 OpenAI Embedding + PostgreSQL Vector 实现语义搜索
- **多模型支持**: 支持 GPT-3.5、GPT-4、Claude 等多种 AI 模型
- **用户系统**: 完整的用户认证、权限管理、分享功能
- **对话管理**: 聊天记录保存、上下文管理
- **计费系统**: 集成微信支付、充值系统

### 在线体验

- 国内版: https://fastgpt.run/
- 海外版: https://ai.fastgpt.run/

## 技术栈

### 前端
- **框架**: Next.js 13.1.6 (React 18.2.0)
- **语言**: TypeScript 4.9.5
- **UI 库**: Chakra UI 2.5
- **状态管理**: Zustand 4.3.5
- **数据请求**: @tanstack/react-query 4.24.10
- **样式**: Emotion + Sass
- **Markdown**: react-markdown, rehype, remark

### 后端
- **框架**: Next.js API Routes
- **数据库**:
  - MongoDB (用户数据、聊天记录、知识库元数据)
  - PostgreSQL + Vector Extension (向量存储)
  - Redis (缓存)
- **ORM**: Mongoose 6.10.0
- **AI SDK**: openai 3.2.1
- **Token 计算**: @dqbd/tiktoken

### 第三方服务集成
- **支付**: wxpay-v3 (微信支付)
- **短信**: @alicloud/dysmsapi20170525 (阿里云短信)
- **邮件**: nodemailer
- **文档处理**: mammoth (Word), papaparse (CSV)

## 项目结构

```
FastGPT/
├── src/
│   ├── pages/              # Next.js 页面和 API 路由
│   │   ├── api/           # API 端点
│   │   │   ├── model/     # 知识库相关 API
│   │   │   ├── chat/      # 聊天相关 API
│   │   │   ├── user/      # 用户相关 API
│   │   │   ├── openapi/   # 开放 API
│   │   │   ├── system/    # 系统配置 API
│   │   │   └── tools/     # 工具类 API
│   │   ├── chat/          # 聊天页面
│   │   ├── model/         # 知识库管理页面
│   │   ├── login/         # 登录页面
│   │   ├── number/        # 数字（计费）页面
│   │   └── promotion/     # 推广页面
│   ├── components/         # React 组件
│   │   ├── Layout/        # 布局组件
│   │   ├── Markdown/      # Markdown 渲染
│   │   ├── Icon/          # 图标组件
│   │   └── ...
│   ├── service/           # 服务层（数据库模型）
│   │   └── models/        # MongoDB 模型定义
│   ├── api/               # API 请求封装
│   ├── store/             # 状态管理
│   ├── hooks/             # 自定义 React Hooks
│   ├── utils/             # 工具函数
│   ├── constants/         # 常量定义
│   └── styles/            # 全局样式
├── public/                # 静态资源
├── docs/                  # 文档
│   ├── deploy/           # 部署文档
│   │   ├── docker.md     # Docker 部署
│   │   └── proxy/        # 代理配置
│   └── dev/              # 开发文档
├── .env.template         # 环境变量模板
├── Dockerfile            # Docker 配置
└── package.json          # 项目配置
```

## 核心 API 路由

### 用户相关
- `/api/user/loginout` - 用户登录登出
- `/api/user/*` - 用户信息管理

### 知识库管理
- `/api/model/create` - 创建知识库
- `/api/model/list` - 获取知识库列表
- `/api/model/detail` - 获取知识库详情
- `/api/model/update` - 更新知识库
- `/api/model/del` - 删除知识库

### 知识库数据
- `/api/model/data/getModelData` - 获取知识库数据
- `/api/model/data/pushModelDataInput` - 手动输入数据
- `/api/model/data/pushModelDataCsv` - CSV 导入
- `/api/model/data/fetchingUrlData` - URL 抓取
- `/api/model/data/splitData` - 数据分割
- `/api/model/data/getTrainingData` - 获取训练数据
- `/api/model/data/exportModelData` - 导出数据
- `/api/model/data/delModelDataById` - 删除数据
- `/api/model/data/putModelData` - 更新数据

### 分享功能
- `/api/model/share/getModels` - 获取分享的知识库
- `/api/model/share/collection` - 收藏分享
- `/api/model/share/getCollection` - 获取收藏

### 系统
- `/api/system/getModels` - 获取可用模型
- `/api/system/getFiling` - 获取备案信息

### 开放 API
- `/api/openapi/startEvents` - 启动队列任务事件

## 环境变量配置

### 必需配置

```bash
# MongoDB 数据库
MONGODB_URI=mongodb://username:password@host:27017/dbname?authSource=admin

# PostgreSQL 向量数据库
PG_HOST=localhost
PG_PORT=8100
PG_USER=fastgpt
PG_PASSWORD=your_password
PG_DB_NAME=fastgpt

# OpenAI API
OPENAIKEY=sk-xxx
GPT4KEY=sk-xxx  # 可选，GPT-4 专用

# Token 加密密钥
TOKEN_KEY=your_random_key

# 队列任务配置
queueTask=1  # 1-开启，0-关闭
parentUrl=https://your-domain.com/api/openapi/startEvents
```

### 可选配置

```bash
# 代理设置
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT=7890

# OpenAI 中转
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_BASE_URL_AUTH=your_auth_token

# Claude 模型
CLAUDE_BASE_URL=your_claude_endpoint
CLAUDE_KEY=your_claude_key

# 邮箱验证码（QQ 邮箱）
MY_MAIL=xxx@qq.com
MAILE_CODE=your_mail_code

# 阿里云短信服务
aliAccessKeyId=your_key_id
aliAccessKeySecret=your_key_secret
aliSignName=your_sign_name
aliTemplateCode=SMS_xxx
```

## 数据库架构

### MongoDB 集合

主要用于存储:
- 用户信息
- 知识库元数据
- 聊天记录
- 分享配置
- 计费记录

### PostgreSQL

使用 Vector 扩展存储:
- 文档向量 (Embeddings)
- 向量索引
- 用于语义相似度搜索

### Redis

缓存层，用于:
- 会话缓存
- API 限流
- 临时数据存储

## 知识库工作原理

1. **文档导入**: 用户上传 CSV/Word/URL 等数据源
2. **文本分割**: 将长文档按段落/语义分割成小块
3. **向量化**: 使用 OpenAI Embedding API 将文本转换为向量
4. **存储**: 向量存储到 PostgreSQL Vector，元数据存储到 MongoDB
5. **检索**: 用户提问时，问题向量化后在向量数据库中进行相似度搜索
6. **生成**: 检索到的相关内容作为上下文，结合 GPT 生成答案

## 开发指南

### 本地开发环境搭建

1. 安装依赖:
```bash
pnpm install
```

2. 配置环境变量:
```bash
cp .env.template .env.local
# 编辑 .env.local，填入实际配置
```

3. 启动数据库:
```bash
# 参考 docs/deploy/docker.md 部署 MongoDB 和 PostgreSQL
```

4. 启动开发服务器:
```bash
pnpm dev
```

### 代码规范

- 使用 Prettier 格式化: `pnpm format`
- 使用 ESLint 检查: `pnpm lint`
- 提交前自动格式化 (husky + lint-staged)

### 构建部署

```bash
pnpm build
pnpm start
```

## 部署方式

### Docker Compose
详见: `docs/deploy/docker.md`

### 代理配置
- Nginx: `docs/deploy/proxy/nginx.md`
- Cloudflare: `docs/deploy/proxy/cloudflare.md`
- Clash: `docs/deploy/proxy/clash.md`
- Sealos: `docs/deploy/proxy/sealos.md`

## 关键依赖说明

- **@dqbd/tiktoken**: Token 计数，用于成本计算和限制
- **eventsource-parser**: SSE 流式响应解析
- **graphemer**: Unicode 字符处理
- **hyperdown**: Markdown 解析
- **formidable**: 文件上传处理
- **sharp**: 图片处理
- **tunnel**: HTTP 代理隧道

## 项目特色

1. **私有化部署**: 完全可以私有化部署，数据安全可控
2. **低成本**: 使用自己的 API KEY，按实际使用付费
3. **易扩展**: 基于 Next.js 的模块化架构
4. **多租户**: 支持多用户隔离
5. **分享机制**: 知识库可以分享给其他用户

## 相关资源

- RoadMap: https://kjqvjse66l.feishu.cn/docx/RVUxdqE2WolDYyxEKATcM0XXnte
- 常见问题: https://kjqvjse66l.feishu.cn/docx/HtrgdT0pkonP4kxGx8qcu6XDnGh
- 更新记录: https://www.bilibili.com/video/BV1Lo4y147Qh/
- 知识库演示: https://www.bilibili.com/video/BV1Wo4y1p7i1/

## 贡献者

项目使用 AGPL-3.0 许可证，欢迎贡献。

---

**最后更新**: 2025-10-21
**版本**: 0.1.0
**维护者**: c121914yu
