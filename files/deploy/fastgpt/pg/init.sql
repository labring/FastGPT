set -e
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
