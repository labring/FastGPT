set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

CREATE EXTENSION IF NOT EXISTS vector;
-- init table
CREATE TABLE IF NOT EXISTS modelData (
    id BIGSERIAL PRIMARY KEY,
    vector VECTOR(1536) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    kb_id VARCHAR(50),
    q TEXT NOT NULL,
    a TEXT NOT NULL
);
-- create index
CREATE INDEX IF NOT EXISTS modelData_userId_index ON modelData USING HASH (user_id);
CREATE INDEX IF NOT EXISTS modelData_kbId_index ON modelData USING HASH (kb_id);
-- vector 索引，可以到 pg vector 去配置，根据数据量去配置
EOSQL
