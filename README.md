# Fast GPT 

Fast GPT 允许你使用自己的 openai API KEY 来快速的调用 openai 接口，包括 GPT3 及其微调方法，以及最新的 gpt3.5 接口。

## 初始化
复制 .env.template 成 .env.local ，填写核心参数  

```
AXIOS_PROXY_HOST=axios代理地址，目前 openai 接口都需要走代理，本机的话就填 127.0.0.1
AXIOS_PROXY_PORT=代理端口
MONGODB_URI=mongo数据库地址
MY_MAIL=发送验证码邮箱
MAILE_CODE=邮箱秘钥（代理里设置的是QQ邮箱，不知道怎么找这个 code 的，可以百度搜"nodemailer发送邮件"）
TOKEN_KEY=随便填一个，用于生成和校验 token
OPENAIKEY=openai的key
REDIS_URL=redis的地址
```

```bash
pnpm dev
```

## 部署

### docker 模式
请准备好 docker， mongo，代理, 和 nginx。 镜像走本机的代理，所以用 network=host，port 改成代理的端口，clash 一般都是 7890。

#### docker 打包
```bash
docker build -t imageName:tag .
docker push imageName:tag
# 或者直接拉镜像，见下方
```

#### 服务器拉取镜像和运行
```yml
# docker-compose
version: "3.3"
services:
  fast-gpt:
    image: c121914yu/fast-gpt:latest
    environment:
      AXIOS_PROXY_HOST: 127.0.0.1
      AXIOS_PROXY_PORT: 7890
      MY_MAIL: 
      MAILE_CODE: 
      TOKEN_KEY: 
      MONGODB_URI: 
      OPENAIKEY: 
      REDIS_URL: 
    network_mode: host
    restart: always
    container_name: fast-gpt
```
```bash
#!/bin/bash
# 拉取最新镜像
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

#### 软件教程：docker 安装
```bash
# 安装docker
curl -sSL https://get.daocloud.io/docker | sh
sudo systemctl start docker
```

#### 软件教程：mongo 安装
```bash
docker pull mongo:6.0.4
docker stop mongo
docker rm mongo
docker run -d --name mongo \
    -e MONGO_INITDB_ROOT_USERNAME= \
    -e MONGO_INITDB_ROOT_PASSWORD= \
    -v /root/service/mongo:/data/db \
    mongo:6.0.4

# 检查 mongo 运行情况, 有成功的 logs 代表访问成功
docker logs mongo
```
#### 软件教程: clash 代理
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

# 运行脚本: 删除clash - 到 clash 目录 - 删除缓存 - 执行运行
# 会生成一个 nohup.out 文件，可以看到 clash 的 logs
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

#### 软件教程：Nginx
...没写，这个百度吧。

#### redis

安装
```bash
#!/bin/bash
docker pull redis/redis-stack:6.2.6-v6
docker stop fast-gpt-redis-stack
docker rm fast-gpt-redis-stack

docker run -d --name fast-gpt-redis-stack \
    -v /redis/data:/data \
    -v /etc/localtime:/etc/localtime:ro \
    -v /redis.conf:/redis-stack.conf \
    -e REDIS_ARGS="--requirepass 1111111"\
    -p 8102:6379 \
    -p 8103:8001 \
    --restart unless-stopped \
    redis/redis-stack:6.2.6-v6
```
```bash
# /redis.conf
# 开启aop持久化
appendonly yes
#default: 持久化文件
appendfilename "appendonly.aof"
#default: 每秒同步一次
appendfsync everysec
```
```bash
# 添加索引
FT.CREATE idx:model:data:hash ON HASH PREFIX 1 model:data: SCHEMA modelId TAG userId TAG status TAG q TEXT text TEXT vector VECTOR FLAT 6 DIM 1536 DISTANCE_METRIC COSINE TYPE FLOAT32
```
