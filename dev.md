# 打包命令

```sh
# Build image, not proxy
docker build -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.4.7 --build-arg name=app .

# build image with proxy
docker build -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.4.7 --build-arg name=app --build-arg proxy=taobao .
```

# Pg 常用索引

```sql
CREATE INDEX IF NOT EXISTS modelData_dataset_id_index ON modeldata (dataset_id);
CREATE INDEX IF NOT EXISTS modelData_collection_id_index ON modeldata (collection_id);
CREATE INDEX IF NOT EXISTS modelData_teamId_index ON modeldata (team_id);
```