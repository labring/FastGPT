#!/usr/bin/env bash

# ========== Radio 选择器 ==========
# 使用方向键 ↑↓ 选择，回车确认
radio_select() {
    local title="$1"
    shift
    local options=("$@")
    local selected=0
    local count=${#options[@]}

    echo ""
    echo "$title"

    # 绘制选项
    for i in "${!options[@]}"; do
        if [ $i -eq $selected ]; then
            printf "  \033[36m●\033[0m %s\n" "${options[$i]}"
        else
            printf "  ○ %s\n" "${options[$i]}"
        fi
    done

    # 隐藏光标
    tput civis 2>/dev/null

    while true; do
        read -rsn1 key
        case "$key" in
            $'\x1b')
                read -rsn2 arrow
                case "$arrow" in
                    '[A') ((selected > 0)) && ((selected--)) ;;
                    '[B') ((selected < count - 1)) && ((selected++)) ;;
                esac
                ;;
            '') break ;;
        esac

        # 光标上移并重绘
        printf "\033[%dA" "$count"
        for i in "${!options[@]}"; do
            printf "\033[K"
            if [ $i -eq $selected ]; then
                printf "  \033[36m●\033[0m %s\n" "${options[$i]}"
            else
                printf "  ○ %s\n" "${options[$i]}"
            fi
        done
    done

    # 恢复光标
    tput cnorm 2>/dev/null
    RADIO_RESULT=$selected
}

# 确保退出时恢复光标
trap 'tput cnorm 2>/dev/null; exit' INT TERM

# ========== 1. 选择镜像源 ==========
radio_select "请选择镜像源 (↑↓ 选择, 回车确认):" "阿里云 (中国大陆)" "GitHub (全球)"
case $RADIO_RESULT in
    1) REGION="global" ;;
    *) REGION="cn" ;;
esac

# ========== 2. 选择向量数据库 ==========
radio_select "请选择向量数据库 (↑↓ 选择, 回车确认):" "PostgreSQL + pgvector" "Milvus" "Zilliz" "OceanBase" "SeekDB"
case $RADIO_RESULT in
    1) VECTOR="milvus" ;;
    2) VECTOR="zilliz" ;;
    3) VECTOR="oceanbase" ;;
    4) VECTOR="seekdb" ;;
    *) VECTOR="pg" ;;
esac

# ========== 3. 检测可用 IP ==========
IP_LIST=()
if command -v ip &>/dev/null; then
    for ip in $(ip -4 addr show 2>/dev/null | awk '/inet / {split($2,a,"/"); print a[1]}' | grep -v '127.0.0.1'); do
        IP_LIST+=("$ip")
    done
elif command -v ifconfig &>/dev/null; then
    for ip in $(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1'); do
        IP_LIST+=("$ip")
    done
fi

# 地址选择函数
# 参数: $1=标题, $2=端口
# 设置 SELECTED_ADDR 和 SELECTED_CUSTOM (true=手动输入, false=列表选择)
select_address() {
    local title="$1"
    local port="$2"
    SELECTED_CUSTOM=false
    if [ ${#IP_LIST[@]} -gt 0 ]; then
        # 构建带完整地址的选项列表
        local opts=()
        for ip in "${IP_LIST[@]}"; do
            opts+=("http://$ip:$port")
        done
        opts+=("其他 (手动输入)")

        radio_select "$title" "${opts[@]}"
        if [ $RADIO_RESULT -eq ${#IP_LIST[@]} ]; then
            echo ""
            read -p "请输入完整地址 (如 http://domain:port): " SELECTED_ADDR
            SELECTED_CUSTOM=true
        else
            SELECTED_ADDR="${IP_LIST[$RADIO_RESULT]}"
        fi
    else
        echo ""
        echo "未检测到可用 IP 地址"
        read -p "请输入完整地址 (如 http://domain:port): " SELECTED_ADDR
        SELECTED_CUSTOM=true
    fi
}

# ========== 4. 选择 S3 访问地址 (端口 9000) ==========
select_address "请选择 S3 访问地址 - 客户端和容器均需可访问 (↑↓ 选择, 回车确认):" 9000
S3_ADDR="$SELECTED_ADDR"
S3_CUSTOM=$SELECTED_CUSTOM

# ========== 5. 选择 SSE MCP 访问地址 (端口 3005) ==========
select_address "请选择 SSE MCP 访问地址 - 客户端和容器均需可访问 (↑↓ 选择, 回车确认):" 3005
MCP_ADDR="$SELECTED_ADDR"
MCP_CUSTOM=$SELECTED_CUSTOM

# ========== 确认配置 ==========
REGION_LABEL="阿里云 (中国大陆)"
if [ "$REGION" == "global" ]; then
    REGION_LABEL="GitHub (全球)"
fi

# 构建显示地址
if [ -n "$S3_ADDR" ]; then
    if $S3_CUSTOM; then
        S3_DISPLAY="$S3_ADDR"
    else
        S3_DISPLAY="http://$S3_ADDR:9000"
    fi
else
    S3_DISPLAY="未设置"
fi

if [ -n "$MCP_ADDR" ]; then
    if $MCP_CUSTOM; then
        MCP_DISPLAY="$MCP_ADDR"
    else
        MCP_DISPLAY="http://$MCP_ADDR:3005"
    fi
else
    MCP_DISPLAY="未设置"
fi

echo ""
echo "=============================="
echo "  镜像源:       $REGION_LABEL"
echo "  向量数据库:   $VECTOR"
echo "  S3 地址:      $S3_DISPLAY"
echo "  MCP 地址:     $MCP_DISPLAY"
echo "=============================="
echo ""
read -p "确认以上配置? (y/n) [y]: " confirm
if [ "$confirm" == "n" ]; then
    echo "已取消"
    exit 1
fi

# ========== 下载文件 ==========
echo ""
echo "正在下载配置文件..."

# 构建下载链接（处理 global 下 zilliz 文件名差异）
VECTOR_FILE="$VECTOR"
if [ "$REGION" == "global" ] && [ "$VECTOR" == "zilliz" ]; then
    VECTOR_FILE="ziliiz"
fi

if [ "$REGION" == "cn" ]; then
    BASE_URL="https://doc.fastgpt.cn/deploy"
    YML_URL="${BASE_URL}/docker/cn/docker-compose.${VECTOR_FILE}.yml"
else
    BASE_URL="https://doc.fastgpt.io/deploy"
    YML_URL="${BASE_URL}/docker/global/docker-compose.${VECTOR_FILE}.yml"
fi

CONFIG_URL="${BASE_URL}/config/config.json"

# 下载 docker-compose YAML
curl -fsSL -O "$YML_URL"
if [ $? -ne 0 ]; then
    echo "错误: 下载 YAML 文件失败: $YML_URL"
    exit 1
fi
mv "docker-compose.${VECTOR_FILE}.yml" docker-compose.yml
echo "已下载 docker-compose.yml"

# 下载 config.json
curl -fsSL -O "$CONFIG_URL"
if [ $? -ne 0 ]; then
    echo "错误: 下载 config.json 失败: $CONFIG_URL"
    exit 1
fi
echo "已下载 config.json"

# ========== 替换 S3 访问地址 ==========
if [ -n "$S3_ADDR" ]; then
    if $S3_CUSTOM; then
        # 自定义输入：提取主机部分替换 docker-compose 中的 IP
        S3_HOST="${S3_ADDR#http://}"
        S3_HOST="${S3_HOST#https://}"
        S3_HOST="${S3_HOST%%:*}"
        S3_HOST="${S3_HOST%%/*}"
    else
        S3_HOST="$S3_ADDR"
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/192\.168\.0\.2/$S3_HOST/g" docker-compose.yml
    else
        sed -i "s/192\.168\.0\.2/$S3_HOST/g" docker-compose.yml
    fi

    if [ $? -eq 0 ]; then
        echo "已更新 S3 访问地址为: $S3_DISPLAY"
    else
        echo "警告: 替换 S3 地址失败，请手动编辑 docker-compose.yml 中的 192.168.0.2"
    fi
else
    echo "警告: 未设置 S3 地址，请手动编辑 docker-compose.yml 中的 192.168.0.2"
fi

# ========== 替换 MCP 访问地址 ==========
if [ -n "$MCP_ADDR" ]; then
    if $MCP_CUSTOM; then
        MCP_ENDPOINT="$MCP_ADDR"
    else
        MCP_ENDPOINT="http://$MCP_ADDR:3005"
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|\"mcpServerProxyEndpoint\": \"\"|\"mcpServerProxyEndpoint\": \"$MCP_ENDPOINT\"|g" config.json
    else
        sed -i "s|\"mcpServerProxyEndpoint\": \"\"|\"mcpServerProxyEndpoint\": \"$MCP_ENDPOINT\"|g" config.json
    fi

    if [ $? -eq 0 ]; then
        echo "已更新 MCP 访问地址为: $MCP_ENDPOINT"
    else
        echo "警告: 替换 MCP 地址失败，请手动编辑 config.json 中的 mcpServerProxyEndpoint"
    fi
else
    echo "警告: 未设置 MCP 地址，请手动编辑 config.json 中的 mcpServerProxyEndpoint"
fi

# ========== 完成 ==========
echo ""
echo "安装完成! 后续操作:"
echo "  1. 编辑配置:   vim docker-compose.yml"
echo "  2. 启动服务:   docker compose up -d"
echo ""
echo "详细文档: https://doc.fastgpt.cn/docs/introduction/development/docker"
