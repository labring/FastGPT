#!/usr/bin/env bash
#
# param:
# --region=cn 中国大陆
# --region=global 全球(默认)
# --vector=pg pg 版本（默认）
# --vector=milvus milvus 版本
# --vector=zilliz zilliz 版本
# --vector=oceanbase oceanbase 版本

# 默认参数
REGION="global"
VECTOR="pg"

# 解析参数
for arg in "$@"; do
    case $arg in
        --region=*)
            REGION="${arg#*=}"
            shift
            ;;
        --vector=*)
            VECTOR="${arg#*=}"
            shift
            ;;
        *)
            ;;
    esac
done

# 检查参数合法性
VALID_VECTOR=("pg" "milvus" "zilliz" "oceanbase")
VECTOR_VALID=false
for v in "${VALID_VECTOR[@]}"; do
    if [[ "$VECTOR" == "$v" ]]; then
        VECTOR_VALID=true
        break
    fi
done

if ! $VECTOR_VALID; then
    echo "Error: Invalid --vector parameter: $VECTOR"
    echo "Available options: pg, milvus, zilliz, oceanbase"
    exit 1
fi

if [[ "$REGION" != "global" && "$REGION" != "cn" ]]; then
    echo "Error: Invalid --region parameter: $REGION"
    echo "Available options: global, cn"
    exit 1
fi


echo 'Vector Database:' $VECTOR
echo 'Docker Image Registry: ' $REGION
read -p "Confirm? (y/n)" confirm
if [ "$confirm" != "y" ]; then
    echo "Canceled"
    exit 1
fi

echo 'Downloading Docker Compose YAML file'
# get the yml file, url:
# region=cn https://doc.fastgpt.cn/deploy/docker/cn/docker-compose.[vector].yml
# region=global https://doc.fastgpt.io/deploy/docker/global/docker-compose.[vector].yml

# 构建下载链接
if [ "$REGION" == "cn" ]; then
    YML_URL="https://doc.fastgpt.cn/deploy/docker/cn/docker-compose.${VECTOR}.yml"
else
    YML_URL="https://doc.fastgpt.io/deploy/docker/global/docker-compose.${VECTOR}.yml"
fi

# 下载 YAML 文件
curl -O "$YML_URL"

if [ $? -ne 0 ]; then
    echo "Error: Failed to download YAML file from $YML_URL"
    exit 1
fi

echo "Downloaded docker-compose.${VECTOR}.yml from $YML_URL"

# download config.json file

if [ "$REGION" == "cn" ]; then
    CONFIG="https://doc.fastgpt.cn/deploy/config/config.json"
else
    CONFIG="https://doc.fastgpt.io/deploy/config/config.json"
fi

# 下载 config.json 文件
curl -O "$CONFIG"

if [ $? -ne 0 ]; then
    echo "Error: Failed to download config.json file from $CONFIG"
    exit 1
fi

echo "Downloaded config.json from $CONFIG"

mv docker-compose.${VECTOR}.yml docker-compose.yml

echo "Installation success! What's next:"
echo "1. Edit the yml file: vim docker-compose.yml"
echo "2. start the service: docker compose up -d"
echo "3. stop the service: docker compose down"
echo "4. restart the service: docker compose restart"
echo "For more information, please visit https://doc.fastgpt.cn/docs/introduction/development/docker"
