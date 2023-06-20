# FastGpt 本地开发

第一次开发，请先[部署教程](../deploy/docker.md)，需要部署数据库.

client: FastGpt 网页项目
admin: 管理端

## 环境变量配置 (可能更新不及时，以 docker-compose 里的变量为准)

复制.env.template 文件，生成一个.env.local 环境变量文件夹，修改.env.local 里内容。

## 运行

```
pnpm dev
```

## 镜像打包

```bash
# 代理可选，不需要的去掉
docker build -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:latest . --network host  --build-arg HTTP_PROXY=http://127.0.0.1:7890 --build-arg HTTPS_PROXY=http://127.0.0.1:7890
```
