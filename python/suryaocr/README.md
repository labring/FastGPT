# 接入Surya OCR文本检测

## 源码部署

### 1. 安装环境

- Python 3.9+
- CUDA 11.8
- 科学上网环境

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 下载模型

代码首次运行时会自动从huggingface下载模型，可跳过以下步骤。
也可以手动下载模型，在对应代码目录下clone模型

```sh
mkdir vikp && cd vikp

git lfs install

git clone https://huggingface.co/vikp/surya_det3
# 镜像下载 https://hf-mirror.com/vikp/surya_det3

git clone https://huggingface.co/vikp/surya_rec2
# 镜像下载 https://hf-mirror.com/vikp/surya_rec2
```

最终手动下载的目录结构如下：

```
vikp/surya_det3
vikp/surya_rec2
app.py
Dockerfile
requirements.txt
```

### 4. 运行代码

```bash
python app.py
```

对应请求地址为
`http://0.0.0.0:7230/v1/surya_ocr`

### 5. 测试

```python
import requests
import base64

IMAGE_PATH = "your/path/to/image.png"
ACCESS_TOKEN = "your_access_token"

with open(IMAGE_PATH, 'rb') as img_file:
    encoded_string = base64.b64encode(img_file.read())
    encoded_image = encoded_string.decode('utf-8')
data = {"images": [encoded_image], "sorted": True}
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {ACCESS_TOKEN}"
}
res = requests.post(url="http://0.0.0.0:7230/v1/surya_ocr",
                    headers=headers,
                    json=data)

print(res.text)
```

## docker部署

### 镜像获取

**本地编译镜像：**
```bash
docker build -t surya_ocr:v0.1 .
```

**或拉取线上镜像：**
Todo：待发布

### docker-compose.yml示例
```yaml
version: '3'
services:
  surya-ocr:
    image: surya_ocr:v0.1
    container_name: surya-ocr
    # GPU运行环境，如果宿主机未安装，将deploy配置隐藏即可
    deploy:
      resources:
        reservations:
          devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
    ports:
      - 7230:7230
    environment:
      - BATCH_SIZE=32
      - ACCESS_TOKEN=YOUR_ACCESS_TOKEN
      - LANGS='["zh","en"]'
```
**环境变量：**
```
BATCH_SIZE：根据实际内存/显存情况配置，每个batch约占用40MB的VRAM，cpu默认32，mps默认64，cuda默认512
ACCESS_TOKEN：服务的access_token
LANGS：支持的语言列表，默认["zh","en"]
```

## 接入FastGPT

Todo: 待补充