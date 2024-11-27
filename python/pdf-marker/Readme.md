# 本地开发

## 基本流程

克隆一个FastGPT的项目文件

```bash
>git clone https://github.com/labring/FastGPT.git
```

将主目录设置为 python下的pdf-marker文件

```bash
>cd python/pdf-marker
```

创建Anaconda并安装requirement.txt文件

```bash
>conda create -n pdf-marker python=3.10
>pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
>conda activate pdf-marker
```

执行主文件启动pdf2md服务

```
>python api_mp.py
```

访问端口：7231
并通过file参数传入本地文件的路径（**只需把这个地址改为自己本地的文件地址即可**）

- windows访问方法

  >curl --location --request POST "http://localhost:7231/v1/parse/file" ^
  >--header "Authorization: Bearer your_access_token" ^
  >--form "file=@./file/chinese_test.pdf"

- linux访问方法

  >curl --location --request POST "http://localhost:7231/v1/parse/file" \
  >--header "Authorization: Bearer your_access_token" \
  >--form "file=@./file/chinese_test.pdf"

## 问题

如果出现huggingface模型下载不下来?

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

# docker容器部署

## 环境

24G显存的显卡若干

## 打包镜像

在 `pdf-marker` 根目录下执行：

```bash
sudo docker build -t model_pdf -f Dockerfile .
```

## 运行容器

```bash
sudo docker run --gpus all -itd -p 7231:7231 --name model_pdf_v1 model_pdf
```

## 访问示例

用Post方法访问端口为 `7321 ` 的 `v1/parse/file` 服务

参数：file-->本地文件的地址

示例一：

```bash
curl --location --request POST "http://localhost:7231/v1/parse/file" \
--header "Authorization: Bearer your_access_token" \
--form "file=@./file/chinese_test.pdf"
```

示例二：

```bash
curl --location --request POST "http://localhost:7231/v1/parse/file" \
--header "Authorization: Bearer your_access_token" \
--form "file=@./file/englist_test.pdf"
```

## 多文件测试数据

运行 `test` 文件下的 `test.py` 文件，修改里面的 `file_paths` 为自己仓库的 `url` 即可