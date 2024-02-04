---
title: '接入 ReRank 重排模型'
description: '接入 ReRank 重排模型'
icon: 'sort'
draft: false
toc: true
weight: 910
---

## 推荐配置

推荐配置如下：

{{< table "table-hover table-striped-columns" >}}
| 类型 | 内存 | 显存 | 硬盘空间 | 启动命令 |
|------|---------|---------|----------|--------------------------|
| base | >=4GB | >=3GB | >=8GB | python app.py |
{{< /table >}}

## 部署

### 环境要求

- Python 3.10.11
- CUDA 11.7
- 科学上网环境

### 源码部署

1. 根据上面的环境配置配置好环境，具体教程自行 GPT；
2. 下载 [python 文件](https://github.com/labring/FastGPT/tree/main/python/reranker/bge-reranker-base)
3. 在命令行输入命令 `pip install -r requirments.txt`；
4. 按照[https://huggingface.co/BAAI/bge-reranker-base](https://huggingface.co/BAAI/bge-reranker-base)下载模型仓库到app.py同级目录
5. 添加环境变量 `export ACCESS_TOKEN=XXXXXX` 配置 token，这里的 token 只是加一层验证，防止接口被人盗用，默认值为 `ACCESS_TOKEN` ；
6. 执行命令 `python app.py`。

然后等待模型下载，直到模型加载完毕为止。如果出现报错先问 GPT。

启动成功后应该会显示如下地址：

![](/imgs/chatglm2.png)

> 这里的 `http://0.0.0.0:6006` 就是连接地址。

### docker 部署

+ 镜像名: `luanshaotong/reranker:v0.1`  
+ 端口号: 6006
+ 大小：约8GB

**设置安全凭证（即oneapi中的渠道密钥）**
```
ACCESS_TOKEN=mytoken
```

**运行命令示例**

```sh
docker run -d --name reranker -p 6006:6006 -e ACCESS_TOKEN=mytoken luanshaotong/reranker:v0.1
```

## 接入 FastGPT

参考 [ReRank模型接入](/docs/development/configuration/#rerank-接入)，host 变量为部署的域名。