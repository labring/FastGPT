# docker-compose 快速部署

## 一、预先准备

### 1. 准备好代理环境（国外服务器可忽略）

确保可访问到 OpenAI，方案可参考：[sealos nginx 中转](../proxy/sealos)

### 2. OneAPI (可选，需要多模型和 key 轮询时使用)

推荐使用 [one-api](https://github.com/songquanpeng/one-api) 项目来管理 key 池，兼容 openai 、微软和国内主流模型等。

部署可以看该项目的 [README.md](https://github.com/songquanpeng/one-api)，也可以看 [在 Sealos 1 分钟部署 one-api](../oneapi)

## 二、安装 docker 和 docker-compose

这个不同系统略有区别，百度安装下。验证安装成功后进行下一步。下面给出 centos 一个例子：

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

## 三、创建 docker-compose.yml 文件

随便找一个目录，创建一个 `docker-compose.yml` 文件，粘贴下面的内容。只需要改 fastgpt 容器的 3 个参数即可启动。

```yml
# 非 host 版本, 不使用本机代理
version: '3.3'
services:
  pg:
    image: ankane/pgvector:v0.4.2 # docker
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/pgvector:v0.4.2 # 阿里云
    container_name: pg
    restart: always
    ports: # 生产环境建议不要暴露
      - 5432:5432
    networks:
      - fastgpt
    environment:
      # 这里的配置只有首次运行生效。修改后，重启镜像是不会生效的。需要把持久化数据删除再重启，才有效果
      - POSTGRES_USER=username
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=postgres
    volumes:
      - ./pg/data:/var/lib/postgresql/data
  mongo:
    image: mongo:5.0.18
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/mongo:5.0.18 # 阿里云
    container_name: mongo
    restart: always
    ports: # 生产环境建议不要暴露
      - 27017:27017
    networks:
      - fastgpt
    environment:
      # 这里的配置只有首次运行生效。修改后，重启镜像是不会生效的。需要把持久化数据删除再重启，才有效果
      - MONGO_INITDB_ROOT_USERNAME=username
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - ./mongo/data:/data/db
  fastgpt:
    container_name: fastgpt
    # image: c121914yu/fast-gpt:latest # docker hub
    image: ghcr.io/labring/fastgpt:latest # 阿里云
    ports:
      - 3000:3000
    networks:
      - fastgpt
    depends_on:
      - mongo
      - pg
    restart: always
    environment:
      # root 密码，用户名为: root
      - DEFAULT_ROOT_PSW=1234
      # 中转地址，如果是用官方号，不需要管
      - OPENAI_BASE_URL=https://api.openai.com/v1
      - CHAT_API_KEY=sk-xxxx
      - DB_MAX_LINK=5 # database max link
      - TOKEN_KEY=any
      - ROOT_KEY=root_key
      # mongo 配置，不需要改. 如果连不上，可能需要去掉 ?authSource=admin
      - MONGODB_URI=mongodb://username:password@mongo:27017/fastgpt?authSource=admin
      # pg配置. 不需要改
      - PG_URL=postgresql://username:password@pg:5432/postgres
networks:
  fastgpt:
```

```yml
# host 版本, 不推荐。
version: '3.3'
services:
pg:
image: ankane/pgvector:v0.4.2 # dockerhub
# image: registry.cn-hangzhou.aliyuncs.com/fastgpt/pgvector:v0.4.2 # 阿里云
container_name: pg
restart: always
ports: # 生产环境建议不要暴露
    - 5432:5432
environment:
    # 这里的配置只有首次运行生效。修改后，重启镜像是不会生效的。需要把持久化数据删除再重启，才有效果
    - POSTGRES_USER=username
    - POSTGRES_PASSWORD=password
    - POSTGRES_DB=postgres
volumes:
    - ./pg/data:/var/lib/postgresql/data
mongo:
image: mongo:5.0.18
# image: registry.cn-hangzhou.aliyuncs.com/fastgpt/mongo:5.0.18 # 阿里云
container_name: mongo
restart: always
ports: # 生产环境建议不要暴露
    - 27017:27017
environment:
    # 这里的配置只有首次运行生效。修改后，重启镜像是不会生效的。需要把持久化数据删除再重启，才有效果
    - MONGO_INITDB_ROOT_USERNAME=username
    - MONGO_INITDB_ROOT_PASSWORD=password
volumes:
    - ./mongo/data:/data/db
    - ./mongo/logs:/var/log/mongodb
fastgpt:
# image: ghcr.io/c121914yu/fastgpt:latest # github
# image: c121914yu/fast-gpt:latest # docker hub
image: ghcr.io/labring/fastgpt:latest # 阿里云
network_mode: host
restart: always
container_name: fastgpt
environment:
    # root 密码，用户名为: root
    - DEFAULT_ROOT_PSW=1234
    # 中转地址，如果是用官方号，不需要管
    - OPENAI_BASE_URL=https://api.openai.com/v1
    - CHAT_API_KEY=sk-xxxx
    - DB_MAX_LINK=5 # database max link
    # token加密凭证（随便填，作为登录凭证）
    - TOKEN_KEY=any
    # root key, 最高权限，可以内部接口互相调用
    - ROOT_KEY=root_key
    # mongo 配置，不需要改. 如果连不上，可能需要去掉 ?authSource=admin
    - MONGODB_URI=mongodb://username:password@0.0.0.0:27017/fastgpt?authSource=admin
    # pg配置. 不需要改
    - PG_URL=postgresql://username:password@0.0.0.0:5432/postgres
```

## 四、运行 docker-compose

```bash
# 在 docker-compose.yml 同级目录下执行
docker-compose up -d
```

## 五、访问

如果需要域名访问，自行安装 Nginx。目前可以通过: `ip:3000` 直接访问(注意防火墙)。登录用户名为 root，密码为刚刚环境变量里设置的 `DEFAULT_ROOT_PSW`

## 一些问题

### 1. 如何更新？

执行 `docker-compose up -d` 会自动拉取最新镜像，一般情况下不需要执行额外操作。

### 2. 挂载配置文件

在和 `docker-compose.yml` 同级目录，创建一个 `config.json` 文件，内容如下：

```json
{
  "FeConfig": {
    "show_emptyChat": true,
    "show_register": false,
    "show_appStore": false,
    "show_userDetail": false,
    "show_git": true,
    "systemTitle": "FastGPT",
    "authorText": "Made by FastGPT Team.",
    "gitLoginKey": "",
    "scripts": []
  },
  "SystemParams": {
    "gitLoginSecret": "",
    "vectorMaxProcess": 15,
    "qaMaxProcess": 15,
    "pgIvfflatProbe": 20
  },
  "plugins": {},
  "ChatModels": [
    {
      "model": "gpt-3.5-turbo",
      "name": "GPT35-4k",
      "contextMaxToken": 4000,
      "quoteMaxToken": 2000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
    },
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "contextMaxToken": 16000,
      "quoteMaxToken": 8000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
    },
    {
      "model": "gpt-4",
      "name": "GPT4-8k",
      "contextMaxToken": 8000,
      "quoteMaxToken": 4000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
    }
  ],
  "QAModels": [
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxToken": 16000,
      "price": 0
    }
  ],
  "VectorModels": [
    {
      "model": "text-embedding-ada-002",
      "name": "Embedding-2",
      "price": 0
    }
  ]
}
```

修改 docker-compose.yml 中 fastgpt 容器内容，增加挂载。具体配置可参考 [config 配置说明](/docs/category/data-config)

```yml
fastgpt:
  container_name: fastgpt
  image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:latest # 阿里云
  ports:
    - 3000:3000
  networks:
    - fastgpt
  depends_on:
    - mongo
    - pg
  restart: always
  environment:
    # root 密码，用户名为: root
    - DEFAULT_ROOT_PSW=1234
  volumes:
    - ./config.json:/app/data/config.json
```
