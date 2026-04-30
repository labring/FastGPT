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
PRIMARY_IP=""

# 尝试获取主路由 IP (默认网关对应的 IP)
if command -v ip &>/dev/null; then
    PRIMARY_IP=$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
fi

# 获取所有物理/主要网卡 IP，过滤掉本地回环、Docker桥接、虚拟网卡等
if command -v ip &>/dev/null; then
    VALID_IPS=$(ip -4 -o addr show | grep -vE ' lo|docker[0-9]+|br-[a-z0-9]+|veth' | awk '{split($4,a,"/"); print a[1]}')
    for ip in $VALID_IPS; do
        if [ "$ip" != "127.0.0.1" ]; then
            IP_LIST+=("$ip")
        fi
    done
elif command -v ifconfig &>/dev/null; then
    for ip in $(ifconfig 2>/dev/null | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1'); do
        IP_LIST+=("$ip")
    done
fi

# 去重并确保 PRIMARY_IP 排在第一位
UNIQUE_IPS=()
if [ -n "$PRIMARY_IP" ]; then
    UNIQUE_IPS+=("$PRIMARY_IP")
fi

for ip in "${IP_LIST[@]}"; do
    match=false
    for u_ip in "${UNIQUE_IPS[@]}"; do
        if [ "$u_ip" == "$ip" ]; then
            match=true
            break
        fi
    done
    if [ "$match" = false ]; then
        UNIQUE_IPS+=("$ip")
    fi
done
IP_LIST=("${UNIQUE_IPS[@]}")

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
        for i in "${!IP_LIST[@]}"; do
            if [ $i -eq 0 ] && [ -n "$PRIMARY_IP" ] && [ "${IP_LIST[$i]}" == "$PRIMARY_IP" ]; then
                opts+=("http://${IP_LIST[$i]}:$port (推荐/主IP)")
            else
                opts+=("http://${IP_LIST[$i]}:$port")
            fi
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
select_address "请选择 S3 访问地址 - 客户端和容器均需可访问 (↑↓ 选择, 回车确认, 通常默认第一个即可):" 9000
S3_ADDR="$SELECTED_ADDR"
S3_CUSTOM=$SELECTED_CUSTOM

# ========== 5. 选择 SSE MCP 访问地址 (端口 3003) ==========
select_address "请选择 SSE MCP 访问地址 - 客户端和容器均需可访问 (↑↓ 选择, 回车确认, 通常默认第一个即可):" 3003
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
        MCP_DISPLAY="http://$MCP_ADDR:3003"
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
    VECTOR_FILE="zilliz"
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
        # 自定义输入：解析 scheme / host / port，整体替换模板中的完整地址
        S3_RAW="$S3_ADDR"
        if [[ "$S3_RAW" == https://* ]]; then
            S3_SCHEME="https"
            S3_RAW="${S3_RAW#https://}"
        elif [[ "$S3_RAW" == http://* ]]; then
            S3_SCHEME="http"
            S3_RAW="${S3_RAW#http://}"
        else
            S3_SCHEME="http"
        fi
        S3_RAW="${S3_RAW%%/*}"
        if [[ "$S3_RAW" == *:* ]]; then
            S3_HOST="${S3_RAW%%:*}"
            S3_PORT="${S3_RAW##*:}"
        else
            S3_HOST="$S3_RAW"
            S3_PORT="9000"
        fi
        S3_NEW="${S3_SCHEME}://${S3_HOST}:${S3_PORT}"
    else
        S3_PORT="9000"
        S3_NEW="http://${S3_ADDR}:9000"
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|http://192\.168\.0\.2:9000|${S3_NEW}|g" docker-compose.yml
    else
        sed -i "s|http://192\.168\.0\.2:9000|${S3_NEW}|g" docker-compose.yml
    fi
    S3_ENDPOINT_RC=$?

    # minio 容器内部始终监听 9000，只改宿主端口映射
    if [ "$S3_PORT" != "9000" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|- 9000:9000|- ${S3_PORT}:9000|g" docker-compose.yml
        else
            sed -i "s|- 9000:9000|- ${S3_PORT}:9000|g" docker-compose.yml
        fi
    fi

    if [ $S3_ENDPOINT_RC -eq 0 ]; then
        echo "已更新 S3 访问地址为: $S3_NEW"
    else
        echo "警告: 替换 S3 地址失败，请手动编辑 docker-compose.yml 中的 http://192.168.0.2:9000"
    fi
else
    echo "警告: 未设置 S3 地址，请手动编辑 docker-compose.yml 中的 http://192.168.0.2:9000"
fi

# ========== 替换 MCP 访问地址 ==========
if [ -n "$MCP_ADDR" ]; then
    if $MCP_CUSTOM; then
        MCP_ENDPOINT="$MCP_ADDR"
    else
        MCP_ENDPOINT="http://$MCP_ADDR:3003"
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

# ========== 检测并替换 docker.sock 路径 ==========
# 某些发行版 / Docker Desktop / rootless 模式下，宿主机 docker.sock 不在 /var/run/docker.sock
# 若路径错误，Docker 会把挂载目标在容器内创建为空目录，导致 volume-manager / opensandbox 无法调用 Docker API
detect_docker_sock() {
    # 1. DOCKER_HOST 环境变量
    if [ -n "$DOCKER_HOST" ] && [[ "$DOCKER_HOST" == unix://* ]]; then
        local sock="${DOCKER_HOST#unix://}"
        [ -S "$sock" ] && { echo "$sock"; return 0; }
    fi

    # 2. docker context 当前上下文
    if command -v docker &>/dev/null; then
        local ctx
        ctx=$(docker context inspect --format '{{ .Endpoints.docker.Host }}' 2>/dev/null)
        if [[ "$ctx" == unix://* ]]; then
            ctx="${ctx#unix://}"
            [ -S "$ctx" ] && { echo "$ctx"; return 0; }
        fi
    fi

    # 3. 常见路径依次探测
    local candidates=(
        "/var/run/docker.sock"
        "/run/docker.sock"
        "$HOME/.docker/run/docker.sock"         # macOS Docker Desktop
        "$HOME/.docker/desktop/docker.sock"
        "/run/user/$(id -u 2>/dev/null)/docker.sock"  # rootless
    )
    for p in "${candidates[@]}"; do
        [ -S "$p" ] && { echo "$p"; return 0; }
    done

    return 1
}

HOST_SOCK=$(detect_docker_sock)
if [ -n "$HOST_SOCK" ]; then
    if [ "$HOST_SOCK" != "/var/run/docker.sock" ]; then
        # 只改宿主侧路径（冒号左边），容器内仍为 /var/run/docker.sock
        ESCAPED_SOCK=$(printf '%s' "$HOST_SOCK" | sed -e 's/[\/&|]/\\&/g')
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|- /var/run/docker.sock:/var/run/docker.sock|- ${ESCAPED_SOCK}:/var/run/docker.sock|g" docker-compose.yml
        else
            sed -i "s|- /var/run/docker.sock:/var/run/docker.sock|- ${ESCAPED_SOCK}:/var/run/docker.sock|g" docker-compose.yml
        fi
        echo "已检测到 Docker socket: $HOST_SOCK，已更新 docker-compose.yml 挂载路径"
    else
        echo "Docker socket 路径正常: /var/run/docker.sock"
    fi
else
    echo "警告: 未检测到 Docker socket。请确认 Docker 正在运行，"
    echo "      并手动编辑 docker-compose.yml，将两处 '- /var/run/docker.sock:/var/run/docker.sock'"
    echo "      左侧改成宿主机实际的 socket 路径。"
fi

# ========== 完成 ==========
echo ""
echo "配置下载成功! 后续操作:"
echo "  1. 预热沙盒:   docker compose --profile prepull pull opensandbox-agent-sandbox-image opensandbox-execd-image opensandbox-egress-image"
echo "  2. 启动服务:   docker compose up -d"
echo "  3. 开放端口:   3000, 9000, 3003"
echo "  4. 访问服务:   http://localhost:3000"
echo "  5. 登录服务:   默认账号为 'root', 密码为: '1234'"
echo "  6. 配置模型:   在 '账号-模型提供商' 页面，进行模型配置"
echo ""
echo "详细文档: https://doc.fastgpt.cn/self-host/deploy/docker"
