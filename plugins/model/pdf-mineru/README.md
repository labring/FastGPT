# Readme

# 项目介绍
---
本项目参照官方插件**pdf-marker，**基于MinertU实现了一个高效的 **PDF 转 Markdown 接口服务**，通过高性能的接口设计，快速将 PDF 文档转换为 Markdown 格式文本。

- **简洁性：**项目无需修改代码，仅需调整文件路径即可使用，简单易用
- **易用性：**通过提供简洁的 API，开发者只需发送 HTTP 请求即可完成 PDF 转换
- **灵活性：**支持本地部署，便于快速上手和灵活集成

# 配置推荐

配置及速率请参照[MinerU项目](https://github.com/opendatalab/MinerU/blob/master/README_zh-CN.md)官方介绍。

# 本地开发

## 基本流程

1、安装基本环境，主要参照官方文档[使用CPU及GPU](https://github.com/opendatalab/MinerU/blob/master/README_zh-CN.md#%E4%BD%BF%E7%94%A8GPU)运行MinerU的方式进行。具体如下，首先使用anaconda安装基础运行环境

```bash
conda create -n mineru python=3.10
conda activate mineru
pip install -U "magic-pdf[full]" --extra-index-url https://wheels.myhloli.com -i https://mirrors.aliyun.com/pypi/simple
```

2、[下载模型权重文件](https://github.com/opendatalab/MinerU/blob/master/docs/how_to_download_models_zh_cn.md)

```bash
pip install modelscope
wget https://gcore.jsdelivr.net/gh/opendatalab/MinerU@master/scripts/download_models.py -O download_models.py
python download_models.py
```

python脚本会自动下载模型文件并配置好配置文件中的模型目录

配置文件可以在用户目录中找到，文件名为`magic-pdf.json`

> windows的用户目录为 "C:\\Users\\用户名", linux用户目录为 "/home/用户名", macOS用户目录为 "/Users/用户名"

3、如果您的显卡显存大于等于 **8GB** ，可以进行以下流程，测试CUDA解析加速效果。默认为cpu模式，使用显卡的话需修改【用户目录】中配置文件magic-pdf.json中"device-mode"的值。

```bash
{
  "device-mode":"cuda"
}
```

4、如需使用GPU加速，需额外再安装依赖。

```bash
pip install --force-reinstall torch==2.3.1 torchvision==0.18.1 "numpy<2.0.0" --index-url https://download.pytorch.org/whl/cu118
```

```bash
pip install paddlepaddle-gpu==2.6.1
```

5、克隆一个FastGPT的项目文件

```
git clone https://github.com/labring/FastGPT.git
```

6、将主目录设置为 plugins/model 下的pdf-mineru文件夹

```
cd /plugins/model/pdf-mineru/
```

7、执行文件pdf_parser_mineru.py，启动服务

```bash
python pdf_parser_mineru.py
```

# 访问示例

仿照了**pdf-marker**的方式。

```bash
curl --location --request POST "http://localhost:7231/v1/parse/file" \
--header "Authorization: Bearer your_access_token" \
--form "file=@./file/chinese_test.pdf"
```
