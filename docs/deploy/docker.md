# Docker 部署 FastGpt

## 代理环境（国外服务器可忽略）

选择一个即可。这只是代理！！！不是项目。

1. [sealos nginx 方案](./proxy/sealos.md) - 推荐。约等于不用钱，不需要额外准备任何东西。
2. [clash 方案](./proxy/clash.md) - 仅需一台服务器（需要有 clash）
3. [nginx 方案](./proxy/nginx.md) - 需要一台国外服务器
4. [cloudflare 方案](./proxy/cloudflare.md) - 需要有域名（每日免费 10w 次代理请求）
5. [腾讯云函数代理方案](https://github.com/easychen/openai-api-proxy/blob/master/FUNC.md) - 仅需一台服务器

## openai key 池管理方案

推荐使用 [one-api](https://github.com/songquanpeng/one-api) 项目来管理 key 池，兼容 openai 和微软等多渠道。部署可以看该项目的 README.md，也可以看 [在 Sealos 1 分钟部署 one-api](./one-api/sealos.md)

### 1. 准备一些内容

> 1. 服务器开通 80 端口。用代理的话，对应的代理端口也需要打开。
> 2. QQ 邮箱 Code：进入 QQ 邮箱 -> 账号 -> 申请 SMTP 账号
> 3. 有域名的准备好 SSL 证书

### 2. 安装 docker 和 docker-compose

这个不同系统略有区别，百度安装下。验证安装成功后进行下一步。下面给出一个例子：

```bash
# 安装docker
curl -L https://get.daocloud.io/docker | sh
sudo systemctl start docker
# 安装 docker-compose
curl -L https://github.com/docker/compose/releases/download/1.23.2/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
# 验证安装
docker -v
docker-compose -v
# 如果docker-compose运行不了，可以把 deploy/fastgpt/docker-compose 文件复制到服务器，然后在 docker-compose 文件夹里执行 sh init.sh。会把docker-compose文件复制到对应目录。
```

### 2. 创建 3 个初始化文件

fastgpt 文件夹。分别为：fastgpt/docker-compose.yaml, fastgpt/pg/init.sql, fastgpt/nginx/nginx.conf

手动创建或者直接把 fastgpt 文件夹复制过去。

### 3. 运行 docker-compose

下面是一个辅助脚本，也可以直接 docker-compose up -d

**run.sh 运行文件**

```bash
#!/bin/bash
docker-compose pull
docker-compose up -d

echo "Docker Compose 重新拉取镜像完成！"

# 删除本地旧镜像
images=$(docker images --format "{{.ID}} {{.Repository}}" | grep fastgpt)

# 将镜像 ID 和名称放入数组中
IFS=$'\n' read -rd '' -a image_array <<<"$images"

# 遍历数组并删除所有旧的镜像
for ((i=1; i<${#image_array[@]}; i++))
do
    image=${image_array[$i]}
    image_id=${image%% *}
    docker rmi $image_id
done
```

## FastGpt Admin

参考 admin 里的 README.md

## 其他优化点

# Git Action 自动打包镜像

.github 里拥有一个 git 提交到 main 分支时自动打包 amd64 和 arm64 镜像的 actions。你仅需要提前在 git 配置好 session。

1. 创建账号 session: 头像 -> settings -> 最底部 Developer settings -> Personal access tokens -> tokens(classic) -> 创建新 session，把一些看起来需要的权限勾上。
2. 添加 session 到仓库: 仓库 -> settings -> Secrets and variables -> Actions -> 创建 secret
3. 填写 secret: Name-GH_PAT, Secret-第一步的 tokens

## 其他问题

### Mac 可能的问题

> 因为教程有部分镜像不兼容 arm64，所以写个文档指导新手如何快速在 mac 上面搭建 fast-gpt[在 mac 上面部署 fastgpt 可能存在的问题](./mac.md)
