# 接入 bge-rerank 重排模型

## 不同模型推荐配置

推荐配置如下：

| 模型名           | 内存  | 显存  | 硬盘空间 | 启动命令      |
| ---------------- | ----- | ----- | -------- | ------------- |
| bge-reranker-base  | >=4GB | >=4GB | >=8GB    | python app.py |
| bge-reranker-large | >=8GB | >=8GB | >=8GB    | python app.py |
| bge-reranker-v2-m3 | >=8GB | >=8GB | >=8GB    | python app.py |

## 源码部署

### 1. 安装环境

- Python 3.9, 3.10
- CUDA 11.7
- 科学上网环境

### 2. 下载代码

3 个模型代码分别为：

1. [https://github.com/labring/FastGPT/tree/main/python/bge-rerank/bge-reranker-base](https://github.com/labring/FastGPT/tree/main/python/bge-rerank/bge-reranker-base)
2. [https://github.com/labring/FastGPT/tree/main/python/bge-rerank/bge-reranker-large](https://github.com/labring/FastGPT/tree/main/python/bge-rerank/bge-reranker-large)
3. [https://github.com/labring/FastGPT/tree/main/python/bge-rerank/bge-reranker-v2-m3](https://github.com/labring/FastGPT/tree/main/python/bge-rerank/bge-reranker-v2-m3)

### 3. 安装依赖

```sh
pip install -r requirements.txt
```

### 4. 下载模型

3个模型的 huggingface 仓库地址如下：

1. [https://huggingface.co/BAAI/bge-reranker-base](https://huggingface.co/BAAI/bge-reranker-base)
2. [https://huggingface.co/BAAI/bge-reranker-large](https://huggingface.co/BAAI/bge-reranker-large)
3. [https://huggingface.co/BAAI/bge-reranker-v2-m3](https://huggingface.co/BAAI/bge-reranker-v2-m3)

在对应代码目录下 clone 模型。目录结构：

```
bge-reranker-base/
app.py
Dockerfile
requirements.txt
```

### 5. 运行代码

```bash
python app.py
```

启动成功后应该会显示如下地址：

![](./rerank1.png)

> 这里的 `http://0.0.0.0:6006` 就是请求地址。

## docker 部署

**镜像名分别为:**

1. registry.cn-hangzhou.aliyuncs.com/fastgpt/bge-rerank-base:v0.1
2. registry.cn-hangzhou.aliyuncs.com/fastgpt/bge-rerank-large:v0.1
3. registry.cn-hangzhou.aliyuncs.com/fastgpt/bge-rerank-v2-m3:v0.1

**端口**

6006

**环境变量**

```
ACCESS_TOKEN=访问安全凭证，请求时，Authorization: Bearer ${ACCESS_TOKEN}
```

**运行命令示例**

```sh
# auth token 为mytoken
docker run -d --name reranker -p 6006:6006 -e ACCESS_TOKEN=mytoken --gpus all registry.cn-hangzhou.aliyuncs.com/fastgpt/bge-rerank-base:v0.1
```

**docker-compose.yml示例**

```
version: "3"
services:
  reranker:
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/bge-rerank-base:v0.1
    container_name: reranker
    # GPU运行环境，如果宿主机未安装，将deploy配置隐藏即可
    deploy:
      resources:
        reservations:
          devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
    ports:
      - 6006:6006
    environment:
      - ACCESS_TOKEN=mytoken

```

## 接入 FastGPT

参考 [ReRank模型接入](https://doc.tryfastgpt.ai/docs/development/configuration/#rerank-接入)
