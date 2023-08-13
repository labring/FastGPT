# Deploying on Mac: Potential Issues (Legacy Version)

### Prerequisites

1. You can curl api.openai.com.
2. You have an OpenAI API key.
3. You have an email and a MAIL_CODE.
4. Docker is installed (check with `docker -v`).
5. You have pnpm installed (you can install it using `brew install pnpm`).
6. Create a directory to store the pg and mongo data. In this example, it's created in the `~/fastgpt` directory, containing `pg` and `mongo` subdirectories.

### Docker Deployment Method

This method is mainly for debugging purposes. You can use `pnpm dev` to run the fastgpt project.

**1. Create an .env.local file**

```
# Proxy
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT_FAST=7890
AXIOS_PROXY_PORT_NORMAL=7890
# Email
MY_MAIL={Your Mail}
MAILE_CODE={Your Mail Code}
# Ali EMS
aliAccessKeyId=xxx
aliAccessKeySecret=xxx
aliSignName=xxx
aliTemplateCode=SMS_xxx
# Token
TOKEN_KEY=sswada
# Using oneapi
ONEAPI_URL=[https://api.xyz.com/v1](https://xxxxx.cloud.sealos.io/v1)
ONEAPI_KEY=sk-xxxxxx
# OpenAI
OPENAIKEY=sk-xxx # Key for chat
OPENAI_TRAINING_KEY=sk-xxx # Key for training
# Database
MONGODB_URI=mongodb://username:password@0.0.0.0:27017/test?authSource=admin
PG_HOST=0.0.0.0
PG_PORT=8100
PG_USER=xxx
PG_PASSWORD=xxx
PG_DB_NAME=fastgpt
```

**2. Deploy Mongo**

```bash
docker run --name mongo -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=username -e MONGO_INITDB_ROOT_PASSWORD=password -v ~/fastgpt/mongo/data:/data/db -d mongo:4.0.1
```

**3. Deploy PostgreSQL**

```bash
docker run -it --name pg -e "POSTGRES_DB=fastgpt" -e "POSTGRES_PASSWORD=xxx" -e POSTGRES_USER=xxx -p 8100:5432 -v ~/fastgpt/pg/data:/var/lib/postgresql/data -d octoberlan/pgvector:v0.4.1
```

Inside the PostgreSQL container, run:

```bash
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

CREATE EXTENSION IF NOT EXISTS vector;
-- Initialize table
CREATE TABLE IF NOT EXISTS modeldata (
    id BIGSERIAL PRIMARY KEY,
    vector VECTOR(1536) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    kb_id VARCHAR(50) NOT NULL,
    source VARCHAR(100),
    q TEXT NOT NULL,
    a TEXT NOT NULL
);
-- Index configuration (adjust as needed)
-- CREATE INDEX IF NOT EXISTS modeldata_userId_index ON modeldata USING HASH (user_id);
-- CREATE INDEX IF NOT EXISTS modeldata_kbId_index ON modeldata USING HASH (kb_id);
-- CREATE INDEX IF NOT EXISTS idx_model_data_md5_q_a_user_id_kb_id ON modeldata (md5(q), md5(a), user_id, kb_id);
-- CREATE INDEX modeldata_id_desc_idx ON modeldata (id DESC);
-- Vector index configuration (you can refer to pgvector's documentation for this)
EOSQL
```

**4. Finally, run `pnpm dev` inside the FASTGPT project to start the project. Then, visit localhost:3000 to see if the project is up and running.**