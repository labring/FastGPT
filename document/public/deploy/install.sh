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

# 自动处理 S3 外部地址
echo ""
echo "Detecting available IP addresses for S3 external endpoint..."

# 使用 ifconfig 获取所有 IPv4 地址（排除 127.0.0.1）
IP_LIST=()
while IFS= read -r line; do
    IP_LIST+=("$line")
done < <(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1')

# 显示所有检测到的 IP 地址供用户选择
if [ ${#IP_LIST[@]} -gt 0 ]; then
    echo "Available IP addresses:"
    for i in "${!IP_LIST[@]}"; do
        echo "  [$((i+1))] ${IP_LIST[$i]}"
    done
    echo "  [0] Enter custom IP or domain"
    echo ""

    read -p "Select IP address (1-${#IP_LIST[@]}, 0 for custom, Enter for #1): " ip_choice

    # 默认选择第一个
    if [ -z "$ip_choice" ]; then
        ip_choice=1
    fi

    if [ "$ip_choice" == "0" ]; then
        read -p "Enter your custom IP address or domain: " LOCAL_IP
    elif [ "$ip_choice" -ge 1 ] 2>/dev/null && [ "$ip_choice" -le ${#IP_LIST[@]} ] 2>/dev/null; then
        LOCAL_IP="${IP_LIST[$((ip_choice-1))]}"
    else
        echo "Invalid selection, using first IP: ${IP_LIST[0]}"
        LOCAL_IP="${IP_LIST[0]}"
    fi
else
    echo "Could not detect any IP address"
    read -p "Enter your IP address or domain for S3 external endpoint: " LOCAL_IP
fi

# 替换 docker-compose.yml 中 192.168.0.2 为选定的地址
if [ -n "$LOCAL_IP" ]; then
    echo "Replacing 192.168.0.2 with $LOCAL_IP in docker-compose.yml..."

    # 根据操作系统选择 sed 命令
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/192\.168\.0\.2/$LOCAL_IP/g" docker-compose.yml
    else
        # Linux
        sed -i "s/192\.168\.0\.2/$LOCAL_IP/g" docker-compose.yml
    fi

    if [ $? -eq 0 ]; then
        echo "Successfully updated S3 external endpoint to: http://$LOCAL_IP:9000"
    else
        echo "Warning: Failed to replace IP address. Please manually edit docker-compose.yml"
    fi
else
    echo "Warning: No IP address provided. Please manually edit docker-compose.yml to replace 192.168.0.2"
fi

echo ""
echo "Installation success! What's next:"
echo "1. Edit the yml file: vim docker-compose.yml"
echo "2. start the service: docker compose up -d"
echo "3. stop the service: docker compose down"
echo "4. restart the service: docker compose restart"
echo "For more information, please visit https://doc.fastgpt.cn/docs/introduction/development/docker"
