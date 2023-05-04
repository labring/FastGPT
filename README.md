# Fast GPT

Fast GPT 允许你使用自己的 openai API KEY 来快速的调用 openai 接口，目前集成了 gpt35 和 embedding. 可构建自己的知识库。

## 知识库原理

![KBProcess](docs/imgs/KBProcess.jpg?raw=true 'KBProcess')

## 开发

**配置环境变量**

```bash
# proxy（可选）
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT=7890
# openai 中转连接（可选）
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_BASE_URL_AUTH=可选的安全凭证
# 是否开启队列任务。 1-开启，0-关闭（请求 parentUrl 去执行任务,单机时直接填1）
queueTask=1
parentUrl=https://hostname/api/openapi/startEvents
# 发送邮箱验证码配置。参考 nodeMail 获取参数，自行百度。
MY_MAIL=xxx@qq.com
MAILE_CODE=xxx
# 阿里短信服务（邮箱和短信至少二选一）
aliAccessKeyId=xxx
aliAccessKeySecret=xxx
aliSignName=xxx
aliTemplateCode=SMS_xxx
# token（随便填，作为登录凭证）
TOKEN_KEY=xxx
# openai key
OPENAIKEY=sk-xxx
# mongo连接地址
MONGODB_URI=mongodb://username:password@0.0.0.0:27017/test?authSource=admin
# mongo数据库名称
MONGODB_NAME=xxx
# pg 数据库相关内容，和 docker-compose pg 部分对上
PG_HOST=0.0.0.0
PG_PORT=8102
PG_USER=fastgpt
PG_PASSWORD=1234
PG_DB_NAME=fastgpt
```

**运行**

```
pnpm dev
```

## 部署

### 代理环境（国外服务器可忽略）

1. [clash 方案](./docs/proxy/clash.md) - 仅需一台服务器（需要有 clash）
2. [nginx 方案](./docs/proxy/nginx.md) - 需要一台国外服务器
3. [cloudflare 方案](./docs/proxy/cloudflare.md) - 需要有域名（每日免费 10w 次代理请求）

### docker 部署

#### 1. 安装 docker 和 docker-compose

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
```

#### 2. 创建 3 个初始化文件

手动创建或者直接把 deploy 里内容复制过去

**/root/fast-gpt/pg/init.sql**

```sql
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

CREATE EXTENSION vector;
-- init table
CREATE TABLE modelData (
    id BIGSERIAL PRIMARY KEY,
    vector VECTOR(1536),
    status VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    model_id VARCHAR(50) NOT NULL,
    q TEXT NOT NULL,
    a TEXT NOT NULL
);
-- create index
CREATE INDEX modelData_status_index ON modelData USING HASH (status);
CREATE INDEX modelData_userId_index ON modelData USING HASH (user_id);
CREATE INDEX modelData_modelId_index ON modelData USING HASH (model_id);
EOSQL
```

**/root/fast-gpt/nginx/nginx.conf**

```conf
user nginx;
worker_processes auto;
worker_rlimit_nofile 51200;

events {
    worker_connections 1024;
}

http {
    access_log off;
    server_names_hash_bucket_size 512;
    client_header_buffer_size 32k;
    large_client_header_buffers 4 32k;
    client_max_body_size 50M;

    gzip  on;
    gzip_min_length   1k;
    gzip_buffers  4 8k;
    gzip_http_version 1.1;
    gzip_comp_level 6;
    gzip_vary on;
    gzip_types  text/plain application/x-javascript text/css application/javascript application/json application/xml;
    gzip_disable "MSIE [1-6]\.";

    open_file_cache max=1000 inactive=1d;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 8;
    open_file_cache_errors off;

    server {
        listen 443 ssl;
        server_name docgpt.ahapocket.cn;
        ssl_certificate /ssl/docgpt.pem;
        ssl_certificate_key /ssl/docgpt.key;
        ssl_session_timeout 5m;

        location / {
            proxy_pass http://localhost:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
    server {
        listen 80;
        server_name docgpt.ahapocket.cn;
        rewrite ^(.*) https://$server_name$1 permanent;
    }
}
```

**/root/fast-gpt/docker-compose.yml**

```yml
version: '3.3'
services:
  fast-gpt:
    image: c121914yu/fast-gpt:latest
    network_mode: host
    restart: always
    container_name: fast-gpt
    environment:
      # - AXIOS_PROXY_HOST=127.0.0.1
      # - AXIOS_PROXY_PORT=7890
      # - OPENAI_BASE_URL=https://api.openai.com/v1
      # - OPENAI_BASE_URL_AUTH=可选的安全凭证
      - MY_MAIL=xxxx@qq.com
      - MAILE_CODE=xxxx
      - aliAccessKeyId=xxxx
      - aliAccessKeySecret=xxxx
      - aliSignName=xxxxx
      - aliTemplateCode=SMS_xxxx
      - TOKEN_KEY=xxxx
      - queueTask=1
      - parentUrl=https://hostname/api/openapi/startEvents
      - MONGODB_URI=mongodb://username:passsword@0.0.0.0:27017/?authSource=admin
      - MONGODB_NAME=xxx
      - PG_HOST=0.0.0.0
      - PG_PORT=8100
      - PG_USER=fastgpt
      - PG_PASSWORD=1234
      - PG_DB_NAME=fastgpt
      - OPENAIKEY=sk-xxxxx
  nginx:
    image: nginx:alpine3.17
    container_name: nginx
    restart: always
    network_mode: host
    volumes:
      - /root/fast-gpt/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /root/fast-gpt/nginx/logs:/var/log/nginx
      - /root/fast-gpt/nginx/ssl/docgpt.key:/ssl/docgpt.key
      - /root/fast-gpt/nginx/ssl/docgpt.pem:/ssl/docgpt.pem
  pg:
    image: ankane/pgvector
    container_name: pg
    restart: always
    ports:
      - 8100:5432
    environment:
      - POSTGRES_USER=fastgpt
      - POSTGRES_PASSWORD=1234
      - POSTGRES_DB=fastgpt
    volumes:
      - /root/fast-gpt/pg/data:/var/lib/postgresql/data
      - /root/fast-gpt/pg/init.sql:/docker-entrypoint-initdb.d/init.sh
      - /etc/localtime:/etc/localtime:ro
  mongodb:
    image: mongo:4.0.1
    container_name: mongo
    restart: always
    ports:
      - 27017:27017
    environment:
      - MONGO_INITDB_ROOT_USERNAME=username
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - /root/fast-gpt/mongo/data:/data/db
      - /root/fast-gpt/mongo/logs:/var/log/mongodb
      - /etc/localtime:/etc/localtime:ro
```

#### 3. 运行 docker-compose

下面是一个辅助脚本，也可以直接 docker-compose up -d
**run.sh 运行文件**

```bash
#!/bin/bash
docker-compose pull
docker-compose up -d

echo "Docker Compose 重新拉取镜像完成！"

# 删除本地旧镜像
images=$(docker images --format "{{.ID}} {{.Repository}}" | grep fast-gpt)

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

## 其他优化点

### Git Action 自动打包镜像

.github 里拥有一个 git 提交到 main 分支时自动打包 amd64 和 arm64 镜像的 actions。你仅需要提前在 git 配置好 session。

1. 创建账号 session: 头像 -> settings -> 最底部 Developer settings -> Personal access tokens -> tokens(classic) -> 创建新 session，把一些看起来需要的权限勾上。
2. 添加 session 到仓库: 仓库 -> settings -> Secrets and variables -> Actions -> 创建 secret
3. 填写 secret: Name-GH_PAT, Secret-第一步的 tokens

## 其他问题

### Mac 可能的问题

> 因为教程有部分镜像不兼容 arm64，所以写个文档指导新手如何快速在 mac 上面搭建 fast-gpt[如何在 mac 上面部署 fastgpt](./docs/mac.md)
