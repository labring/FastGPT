## Mac 上部署可能遇到的问题

### 前置条件

1、可以 curl api.openai.com

2、有 openai key

3、有邮箱 MAILE_CODE

4、有 docker

```
docker -v
```

5、有 pnpm ，可以使用`brew install pnpm`安装

6、需要创建一个放置 pg 和 mongo 数据的文件夹，这里创建在`~/fastgpt`目录中,里面有`pg` 和`mongo `两个文件夹

```
➜  fastgpt pwd
/Users/jie/fastgpt
➜  fastgpt ls
mongo pg
```

### docker 部署方式

这种方式主要是为了方便调试，可以使用`pnpm dev ` 运行 fastgpt 项目

**1、.env.local 文件**

```
# proxy
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT_FAST=7890
AXIOS_PROXY_PORT_NORMAL=7890
# email
MY_MAIL= {Your Mail}
MAILE_CODE={Yoir Mail code}
# ali ems
aliAccessKeyId=xxx
aliAccessKeySecret=xxx
aliSignName=xxx
aliTemplateCode=SMS_xxx
# token
TOKEN_KEY=sswada
# 使用 oneapi 
ONEAPI_URL=[https://api.xyz.com/v1](https://xxxxx.cloud.sealos.io/v1)
ONEAPI_KEY=sk-xxxxxx
# openai
OPENAIKEY=sk-xxx # 对话用的key
OPENAI_TRAINING_KEY=sk-xxx # 训练用的key
# db
MONGODB_URI=mongodb://username:password@0.0.0.0:27017/test?authSource=admin
PG_HOST=0.0.0.0
PG_PORT=8100
PG_USER=xxx
PG_PASSWORD=xxx
PG_DB_NAME=fastgpt
```

**2、部署 mongo**

```
docker run --name mongo -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=username -e MONGO_INITDB_ROOT_PASSWORD=password -v ~/fastgpt/mongo/data:/data/db -d mongo:4.0.1
```

**3、部署 pgsql**

```
docker run -it --name pg -e "POSTGRES_DB=fastgpt" -e "POSTGRES_PASSWORD=xxx" -e POSTGRES_USER=xxx -p 8100:5432 -v ~/fastgpt/pg/data:/var/lib/postgresql/data -d octoberlan/pgvector:v0.4.1
```

进 pgsql 容器运行

```
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

CREATE EXTENSION IF NOT EXISTS vector;
-- init table
CREATE TABLE IF NOT EXISTS modeldata (
    id BIGSERIAL PRIMARY KEY,
    vector VECTOR(1536) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    kb_id VARCHAR(50) NOT NULL,
    source VARCHAR(100),
    q TEXT NOT NULL,
    a TEXT NOT NULL
);
-- 索引设置，按需取
-- CREATE INDEX IF NOT EXISTS modeldata_userId_index ON modeldata USING HASH (user_id);
-- CREATE INDEX IF NOT EXISTS modeldata_kbId_index ON modeldata USING HASH (kb_id);
-- CREATE INDEX IF NOT EXISTS idx_model_data_md5_q_a_user_id_kb_id ON modeldata (md5(q), md5(a), user_id, kb_id);
-- CREATE INDEX modeldata_id_desc_idx ON modeldata (id DESC);
-- vector 索引，可以参考 [pg vector](https://github.com/pgvector/pgvector) 去配置，根据数据量去配置
EOSQL
```

4、**最后在 FASTGPT 项目里面运行 pnpm dev 运行项目，然后进入 localhost:3000 看项目是否跑起来了**
