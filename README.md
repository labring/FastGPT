# Fast GPT 

Fast GPT 允许你使用自己的 openai API KEY 来快速的调用 openai 接口，包括 GPT3 及其微调方法，以及最新的 gpt3.5 接口。

## 初始化
复制 .env.template 成 .env.local ，填写核心参数  

```
AXIOS_PROXY_HOST=axios代理地址，目前 openai 接口都需要走代理，本机的话就填 127.0.0.1
AXIOS_PROXY_PORT=代理端口
MONGODB_URI=mongo数据库地址（例如：mongodb://username:password@ip:27017/?authSource=admin&readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false）
MY_MAIL=发送验证码邮箱
MAILE_CODE=邮箱秘钥（代理里设置的是QQ邮箱，不知道怎么找这个 code 的，可以百度搜"nodemailer发送邮件"）
TOKEN_KEY=随便填一个，用于生成和校验 token
```

```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 部署

### docker 模式
请准备好 docker， mongo，代理, 和nginx。 镜像走本机的代理，所以用 network=host，port 改成代理的端口，clash 一般都是 7890。

#### docker 打包
```bash
docker build -t imageName:tag .
docker push imageName:tag
```

#### 服务器拉取镜像和运行
```bash
# 服务器拉取部署, imageName 替换成镜像名
docker pull imageName:tag
docker stop fast-gpt || true
docker rm fast-gpt || true
docker run -d --network=host --name fast-gpt \
    -e AXIOS_PROXY_HOST=127.0.0.1 \
    -e AXIOS_PROXY_PORT=7890 \
    -e MY_MAIL=your email\
    -e MAILE_CODE=your email code \
    -e TOKEN_KEY=任意一个内容 \
    -e MONGODB_URI="mongodb://user:password@127.0.0.0:27017/?authSource=admin&readPreference=primary&appname=MongoDB%20Compass&ssl=false" \
    imageName:tag
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

```bash
# 索引
# FT.CREATE idx:model:data ON JSON PREFIX 1 model:data: SCHEMA $.modelId AS modelId TAG $.dataId AS dataId TAG $.vector AS vector VECTOR FLAT 6 DIM 1536 DISTANCE_METRIC COSINE TYPE FLOAT32
# FT.CREATE idx:model:data:hash ON HASH PREFIX 1 model:data: SCHEMA modelId TAG dataId TAG vector VECTOR FLAT 6 DIM 1536 DISTANCE_METRIC COSINE TYPE FLOAT32
FT.CREATE idx:model:data ON HASH PREFIX 1 model:data: SCHEMA modelId TAG userId TAG q TEXT text TEXT vector VECTOR FLAT 6 DIM 1536 DISTANCE_METRIC COSINE TYPE FLOAT32
```
