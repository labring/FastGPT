# FastGPT 开发文档

FastGPT 采用 monorepo 方式管理。

## 📁 仓库结构

- `projects/app`: 开源主应用
- `projects/code-sandbox`: 代码沙盒
- `pro/admin`: 商业版后台

## 启用开发

```sh
# 赋予脚本自动执行权限（非 Linux 系统可以手动执行 postinstall.sh 文件中的内容）
chmod -R +x ./scripts/
# 在代码根目录下执行，会安装根 package、projects 和 packages 中的所有依赖
pnpm i
# 如果没有自动触发构建依赖，可以手动执行
pnpm build:sdks

# 不使用 make 命令启动
cd projects/app
pnpm dev

# 使用 make 命令
make dev name=app
make dev name=admin
```


## 插件安装

### 安装 i18n-ally 插件

安装 `i18n Ally` 插件，用于自动生成国际化文件。

## 构建

```sh
# Docker 命令：构建镜像，不使用代理
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app
# Docker 命令：构建商业版 admin 镜像，不使用代理
docker build -f ./pro/admin/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin:v4.8.1 . --build-arg name=admin
# Docker 命令：构建商业版 sso 镜像，不使用代理
docker build -f ./pro/sso/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.8.1 . --build-arg name=sso
# Make 命令：构建镜像，不使用代理
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1
make build name=admin image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin:v4.8.1
make build name=sso image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sso-service:v4.8.1

# Docker 命令：使用代理构建镜像
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app --build-arg proxy=taobao
# Docker 命令：使用代理构建商业版 admin 镜像
docker build -f ./pro/admin/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin:v4.8.1 . --build-arg name=admin --build-arg proxy=taobao
# Make 命令：使用代理构建镜像
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 proxy=taobao
make build name=admin image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin:v4.8.1 proxy=taobao
```
