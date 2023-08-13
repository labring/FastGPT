## Common Issues You Might Encounter When Deploying on Mac (Old Version)

### Prerequisites

1. Can curl api.openai.com
2. Have an OpenAI API key
3. Have an email `MAILE_CODE`
4. Have Docker installed (`docker -v`)
5. Have pnpm installed (`brew install pnpm`)
6. Create a directory to store pg and mongo data (e.g., `~/fastgpt`), containing `pg` and `mongo` subdirectories.

### Docker Deployment Method

This method is mainly for debugging purposes and involves using `pnpm dev` to run the FastGPT project.

**1. .env.local File**

```plaintext
# proxy
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT_FAST=7890
AXIOS_PROXY_PORT_NORMAL=7890
# email
MY_MAIL={Your Mail}
MAILE_CODE={Your Mail code}
# ali ems
aliAccessKeyId=xxx
aliAccessKeySecret=xxx
aliSignName=xxx
aliTemplateCode=SMS_xxx
# token
TOKEN_KEY=sswada
# Use oneapi
ONEAPI_URL=https://api.xyz.com/v1
ONEAPI_KEY=sk-xxxxxx
# openai
OPENAIKEY=sk-xxx # Dialog API key
OPENAI_TRAINING_KEY=sk-xxx # Training API key
# db
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

Run the following commands inside the PostgreSQL container:

```bash
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
-- Index settings, adjust as needed
-- CREATE INDEX IF NOT EXISTS modeldata_userId_index ON modeldata USING HASH (user_id);
-- CREATE INDEX IF NOT EXISTS modeldata_kbId_index ON modeldata USING HASH (kb_id);
-- CREATE INDEX IF NOT EXISTS idx_model_data_md5_q_a_user_id_kb_id ON modeldata (md5(q), md5(a), user_id, kb_id);
-- CREATE INDEX modeldata_id_desc_idx ON modeldata (id DESC);
-- Vector index configuration; refer to [pg vector](https://github.com/pgvector/pgvector) for details and adjust based on data volume
EOSQL
```

**4. Finally, run `pnpm dev` within the FastGPT project. Visit `localhost:3000` to see if the project is up and running.**