set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL

CREATE EXTENSION vector;
-- init table
CREATE TABLE modelData (
    id BIGSERIAL PRIMARY KEY,
    vector VECTOR(1536),
    status VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    model_id VARCHAR(50),
    kb_id VARCHAR(50),
    q TEXT NOT NULL,
    a TEXT NOT NULL
);
-- create index
CREATE INDEX modelData_status_index ON modelData USING HASH (status);
CREATE INDEX modelData_userId_index ON modelData USING HASH (user_id);
CREATE INDEX modelData_userId_index ON modelData USING HASH (model_id);
CREATE INDEX modelData_kbId_index ON modelData USING HASH (kb_id);
EOSQL