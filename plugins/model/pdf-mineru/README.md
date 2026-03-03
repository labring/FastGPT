# **MinerU SaaS Wrapper For Fastgpt 详细部署文档**  
**—— 为 FastGPT 提供稳定、高效、开箱即用的纯白嫖文档解析服务，转接服务用grok写的，文档也是，有不明白出问题了，`docker logs -f mineru-saas-wrapper` 查看日志，问他~**

---

> **适用人群**：FastGPT 开发者、后端工程师、DevOps、AI 应用集成者  
> **目标**：在 **5 分钟内**完成从零到生产可用的 MinerU saas服务api的文档解析服务部署

---

## 一、项目概述

| 项目 | 说明 |
|------|------|
| **名称** | MinerU SaaS Wrapper for FastGPT |
| **框架** | FastAPI + Uvicorn |
| **核心功能** | 接收文件 → 调用 MinerU 官方 SaaS API → 轮询结果 → 返回内嵌图片的 Markdown → fasgpt读取解析内容转为知识库 |
| **部署方式** | Docker（推荐） / docker-compose |
| **接口路径** | `POST /v2/parse/file` |

---

## 二、前置条件
| **MinerU Token** | 在 [https://mineru.net](https://mineru.net) 注册并获取 SaaS Token |

> **获取 Token 步骤**：
> 1. 登录 MinerU 官网
> 2. 进入 **控制台 → API 密钥**
> 3. 创建新密钥（建议命名 `fastgpt-wrapper`）
> 4. 复制完整 Token（以 `eyJ...` 开头）

---

## 三、目录结构说明

```bash
mineru-saas-wrapper/
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── mineru_saas_api.py          # 主服务逻辑
├── requirements.txt            # 依赖包
├── .env                        # （可选）环境变量文件
└── README.md
```

---

## 四、部署方式一：使用 `docker-compose`（推荐）

### 步骤 1：克隆项目

```bash
mkdir mineru-saas-wrapper
cd mineru-saas-wrapper
```

### 步骤 2：创建 `.env` 文件（推荐，防止 Token 泄露）

```bash
touch .env
```

编辑 `.env`：

```env
MINERU_TOKEN=官网申请的API 密钥
POLL_INTERVAL=3
POLL_TIMEOUT=600
PORT=1234
```

### 步骤 3：修改 `docker-compose.yml`

```yaml
services:
  mineru-saas-wrapper:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mineru-saas-wrapper
    restart: unless-stopped
    ports:
      - "1234:1234"
    env_file:
      - .env                     # 改为读取 .env 文件
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1234/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 步骤 4：启动服务

```bash
docker-compose up -d --build
```

### 步骤 5：验证服务状态

```bash
# 查看容器状态
docker ps | grep mineru-saas-wrapper

# 查看健康检查
curl http://localhost:1234/health
# 预期输出：
{"status":"healthy"}
```


## 五、接口测试

### 1. 使用 `curl` 测试

```bash
curl -X POST "http://localhost:1234/v2/parse/file" \
  -F "file=@./sample.pdf" | jq
```

### 2. 预期成功响应

```json
{
  "success": true,
  "message": "",
  "markdown": "# 标题\n\n![](data:image/png;base64,iVBORw0KGgoAAA...) ...",
  "pages": 8
}
```

### 查看详细日志

```bash
docker logs -f mineru-saas-wrapper
```

关键日志关键词：
- `Got upload url` → 上传成功
- `Polling ... -> done` → 解析完成
- `Parse finished, X pages` → 成功返回

---

## 九、FastGPT 集成指南

### 1. 在 FastGPT 中配置「文档解析」节点

| 字段 | 值 |
|------|---- |
| **解析服务地址** | `http://your-server-ip:1234/v2/parse/file` |
| **请求方式** | POST |
| **文件字段名** | `file` |
| **响应字段映射** | `markdown` → 内容，`pages` → 页数 |

### 2. FastGPT 示例配置（JSON）

```json
// 已使用 json5 进行解析，会自动去掉注释，无需手动去除
{
  "feConfigs": {
    "lafEnv": "https://laf.dev", // laf环境。 https://laf.run （杭州阿里云） ,或者私有化的laf环境。如果使用 Laf openapi 功能，需要最新版的 laf 。
    "mcpServerProxyEndpoint": "" // mcp server 代理地址，例如： http://localhost:3005
  },
  "systemEnv": {
    "datasetParseMaxProcess": 10, // 知识库文件解析最大线程数量
    "vectorMaxProcess": 10, // 向量处理线程数量
    "qaMaxProcess": 10, // 问答拆分线程数量
    "vlmMaxProcess": 10, // 图片理解模型最大处理进程
    "tokenWorkers": 30, // Token 计算线程保持数，会持续占用内存，不能设置太大。
    "hnswEfSearch": 100, // 向量搜索参数，仅对 PG 和 OB 生效。越大，搜索越精确，但是速度越慢。设置为100，有99%+精度。
    "hnswMaxScanTuples": 100000, // 向量搜索最大扫描数据量，仅对 PG生效。
    "customPdfParse": {
      "url": "http://your-server-ip:1234/v2/parse/file", // 自定义 PDF 解析服务地址
      "key": "", // 自定义 PDF 解析服务密钥
      "doc2xKey": "", // doc2x 服务密钥
      "price": 0 // PDF 解析服务价格
    }
  }
}
```
---

**部署完成！**  
现在你的 FastGPT 已拥有强大的 **MinerU 文档解析能力**，支持 PDF + 图片 → 完美 Markdown 内嵌渲染。

> 如有问题，欢迎提交 Issue 或查看日志排查。祝你解析愉快！