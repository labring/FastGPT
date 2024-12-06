# 项目介绍

本项目实现了一个高效的 **PDF 转 Markdown 接口服务**，支持多进程并行处理多个 PDF 文件。通过高性能的接口设计，快速将 PDF 文档转换为 Markdown 格式文本。

- **简洁性：**项目无需修改代码，仅需调整文件路径即可使用，简单易用
- **易用性：**通过提供简洁的 API，开发者只需发送 HTTP 请求即可完成 PDF 转换
- **灵活性：**支持本地部署和 Docker 容器部署两种方式，便于快速上手和灵活集成

# 配置推荐

## 常规配置

24G显存的显卡两张，可以支持四个文件同时处理

## 最低配置

**不低于11G** 显存的显卡一张

并设置每张卡处理的进程数为1

```bash
export PROCESSES_PER_GPU="1"
```

## 单文件实测速率

| 显卡          | 中文PDF      | 英文PDF      | 扫描件       |
| ------------- | ------------ | ------------ | ------------ |
| **4090D 24G** | **0.75s/页** | **1.60s/页** | **3.26s/页** |
| **P40 24G**   | **0.99s/页** | **2.22s/页** | **5.24s/页** |

## 多文件实测速率

中文PDF+英文PDF

| 显卡          | 串行处理     | 并行处理     | 提升效率  |
| ------------- | ------------ | ------------ | --------- |
| **4090D 24G** | **0.92s/页** | **0.62s/页** | **31.9%** |
| **P40 24G**   | **1.22s/页** | **0.85s/页** | **30.5%** |

# 本地开发

## 基本流程

1. 克隆一个FastGPT的项目文件

   ```
   git clone https://github.com/labring/FastGPT.git
   ```

2. 将主目录设置为 python下的pdf-marker文件

   ```
   cd python/pdf-marker
   ```

3. 创建Anaconda并安装requirement.txt文件

   安装的Anaconda版本：**conda 24.7.1**

   ```
   conda create -n pdf-marker python=3.11
   pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
   conda activate pdf-marker
   ```

4. 执行主文件启动pdf2md服务

   ```
   python api_mp.py
   ```

# 镜像打包和部署

## 本地构建镜像

1. 在 `pdf-marker` 根目录下执行：

    ```bash
    sudo docker build -t model_pdf -f Dockerfile .
    ```
2. 运行容器
    ```bash
    sudo docker run --gpus all -itd -p 7231:7231 --name model_pdf_v1 model_pdf
    ```
## 快速构建镜像
```dockerfile
docker pull crpi-h3snc261q1dosroc.cn-hangzhou.personal.cr.aliyuncs.com/marker11/marker_images:latest
docker run --gpus all -itd -p 7231:7231 --name model_pdf_v1 crpi-h3snc261q1dosroc.cn-hangzhou.personal.cr.aliyuncs.com/marker11/marker_images:latest
```
# 访问示例

用Post方法访问端口为 `7321 ` 的 `v1/parse/file` 服务

参数：file-->本地文件的地址

- 访问方法

  ```
  curl --location --request POST "http://localhost:7231/v1/parse/file" \
  --header "Authorization: Bearer your_access_token" \
  --form "file=@./file/chinese_test.pdf"
  ```

- 多文件测试数据

  运行 `test` 文件下的 `test.py` 文件，修改里面的 `file_paths` 为自己仓库的 `url` 即可

# FQA

- 如果出现huggingface模型下载不下来?

  可以选择在环境变量中加入huggingface镜像

  ```bash
  export HF_ENDPOINT=https://hf-mirror.com
  export HF_DATASETS_CACHE=/huggingface
  export HUGGINGFACE_HUB_CACHE=/huggingface
  export HF_HOME=/huggingface
  ```

  也可以直接访问 [huggingface][https://huggingface.co] 来下载模型到 `/huggingface` 文件夹下

  ```
  https://huggingface.co/vikp/surya_det3/tree/main
  https://huggingface.co/vikp/surya_layout3/tree/main
  https://huggingface.co/vikp/surya_order/tree/main
  https://huggingface.co/vikp/surya_rec2/tree/main
  https://huggingface.co/vikp/surya_tablerec/tree/main
  https://huggingface.co/vikp/texify2/tree/main
  ```

  