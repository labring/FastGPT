## 前提

由于 FastGPT 采用了 monorepo 的方式进行管理，所以在开发时建议先安装`make`。

monorepo 项目名：

- app: 主项目
- ......

## Dev

```sh
# 给自动化脚本代码执行权限(非 linux 系统, 可以手动执行里面的 postinstall.sh 文件内容)
chmod -R +x ./scripts/
# 代码根目录下执行，会安装根 package、projects 和 packages 内所有依赖
pnpm i

# 非 Make 运行
cd projects/app
pnpm dev

# Make 运行
make dev name=app
```


## Build

```sh
# Docker cmd: Build image, not proxy
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app
# Make cmd: Build image, not proxy
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1

# Docker cmd: Build image with proxy
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app --build-arg proxy=taobao
# Make cmd: Build image with proxy
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 proxy=taobao
```

