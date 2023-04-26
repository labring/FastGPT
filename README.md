# Fast GPT 

Fast GPT 允许你使用自己的 openai API KEY 来快速的调用 openai 接口，目前集成了 gpt35 和 embedding. 可构建自己的知识库。

## 知识库原理
![KBProcess](docs/imgs/KBProcess.jpg?raw=true "KBProcess")

## 开发
复制 .env.template 成 .env.local ，填写核心参数。可选内容不需要可留空或去掉。

```bash
# proxy（可选）
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT=7890
# openai 中转连接（可选）
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_BASE_URL_AUTH=可选的安全凭证
# 是否开启队列任务。 1-开启，0-关闭（请求parentUrl去执行任务,单机时直接填1）
queueTask=1
parentUrl=https://hostname/api/openapi/startEvents
# email，参考 nodeMail 获取参数
MY_MAIL=xxx@qq.com
MAILE_CODE=xxx
# 阿里短信服务
aliAccessKeyId=xxx
aliAccessKeySecret=xxx
aliSignName=xxx
aliTemplateCode=SMS_xxx
# token（随便填，登录凭证）
TOKEN_KEY=xxx
# openai key
OPENAIKEY=sk-xxx
# mongo连接地址
MONGODB_URI=mongodb://username:password@0.0.0.0:27017/test?authSource=admin
MONGODB_NAME=xxx # mongo数据库名称
# pg 数据库相关内容，和 docker-compose 对上
PG_HOST=0.0.0.0 
PG_PORT=8102
PG_USER=xxx
PG_PASSWORD=xxx
PG_DB_NAME=xxx
```
```bash
pnpm dev
```

## docker 部署

### 安装 docker 和 docker-compose
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

### 安装 clash 代理（选）
```bash
# 下载包
curl https://glados.rocks/tools/clash-linux.zip -o clash.zip 
# 解压
unzip clash.zip
# 下载终端配置⽂件（改成自己配置文件路径）
curl https://update.glados-config.com/clash/98980/8f30944/70870/glados-terminal.yaml > config.yaml
# 赋予运行权限
chmod +x ./clash-linux-amd64-v1.10.0 
# 记得配置端口变量：
export ALL_PROXY=socks5://127.0.0.1:7891
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

# 运行脚本: 删除clash - 到 clash 目录 - 删除缓存 - 执行运行. 会生成一个 nohup.out 文件，可以看到 clash 的 logs
OLD_PROCESS=$(pgrep clash)
if [ ! -z "$OLD_PROCESS" ]; then
  echo "Killing old process: $OLD_PROCESS"
  kill $OLD_PROCESS
fi
sleep 2
cd  **/clash
rm -f ./nohup.out || true
rm -f ./cache.db || true
nohup ./clash-linux-amd64-v1.10.0  -d ./ &
echo "Restart clash"
```

### 准备初始化文件，需要自己创建
可以直接把 deploy 里内容复制过去
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
version: "3.3"
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
      - PG_USER=xxx
      - PG_PASSWORD=xxx
      - PG_DB_NAME=xxx
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
      - POSTGRES_USER=xxx
      - POSTGRES_PASSWORD=xxx
      - POSTGRES_DB=xxx
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
### 辅助运行脚本
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

## Mac 可能的问题
> 因为教程有部分镜像不兼容arm64，所以写个文档指导新手如何快速在mac上面搭建fast-gpt[如何在mac上面部署fastgpt](./docs/mac.md)

## Git Action 配置
1. 创建账号 session: 头像 -> settings -> 最底部 Developer settings ->  Personal access tokens -> tokens(classic) -> 创建新 session，把一些看起来需要的权限勾上。
2. 添加 session 到仓库: 仓库 -> settings -> Secrets and variables -> Actions -> 创建secret
3. 填写 secret: Name-GH_PAT, Secret-第一步的tokens 