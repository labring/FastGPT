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