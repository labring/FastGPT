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
    echo ""
    RADIO_RESULT=$selected
}

# 确保退出时恢复光标
trap 'tput cnorm 2>/dev/null; exit' INT TERM

# 生成安装期随机密钥。
# 只使用 hex 字符，避免写入 YAML、URL、命令参数时触发转义问题。
random_hex() {
    local bytes="${1:-32}"

    if command -v openssl &>/dev/null; then
        openssl rand -hex "$bytes"
        return
    fi

    if [ -r /dev/urandom ] && command -v od &>/dev/null; then
        dd if=/dev/urandom bs="$bytes" count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
        echo
        return
    fi

    echo "错误: 未找到 openssl，且无法读取 /dev/urandom 生成随机密钥" >&2
    exit 1
}

escape_sed_replacement() {
    printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

replace_text() {
    local old="$1"
    local new="$2"
    local file="${3:-docker-compose.yml}"
    local escaped_new

    escaped_new="$(escape_sed_replacement "$new")"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|$old|$escaped_new|g" "$file"
    else
        sed -i "s|$old|$escaped_new|g" "$file"
    fi
}

content_error() {
    local file="$1"
    local source="$2"
    local type="$3"
    local cleanup="${4:-false}"

    if [ "$cleanup" = true ]; then
        rm -f "$file"
    fi

    echo "错误: ${type} 文件内容异常: $source" >&2
    echo "      请确认该文件已经发布且内容正确，不能是 HTML 页面或空文件。" >&2
    exit 1
}

validate_compose_file() {
    local file="$1"
    local source="$2"
    local cleanup="${3:-false}"

    if [ ! -s "$file" ]; then
        content_error "$file" "$source" "docker-compose YAML" "$cleanup"
    fi

    if LC_ALL=C grep -qiE '<!doctype html|<html[[:space:]>]' "$file"; then
        content_error "$file" "$source" "docker-compose YAML" "$cleanup"
    fi

    if ! LC_ALL=C grep -qE '^[[:space:]]*services:' "$file"; then
        content_error "$file" "$source" "docker-compose YAML" "$cleanup"
    fi
}

validate_config_file() {
    local file="$1"
    local source="$2"
    local cleanup="${3:-false}"

    if [ ! -s "$file" ]; then
        content_error "$file" "$source" "config.json" "$cleanup"
    fi

    if LC_ALL=C grep -qiE '<!doctype html|<html[[:space:]>]' "$file"; then
        content_error "$file" "$source" "config.json" "$cleanup"
    fi

    if ! LC_ALL=C grep -q '"systemEnv"' "$file"; then
        content_error "$file" "$source" "config.json" "$cleanup"
    fi
}

resolve_input_path() {
    local input="$1"

    if [ "$input" = "~" ]; then
        input="$HOME"
    elif [[ "$input" == ~/* ]]; then
        input="$HOME/${input#~/}"
    fi

    if [[ "$input" != /* ]]; then
        input="$(pwd)/$input"
    fi

    printf '%s\n' "$input"
}

prompt_local_compose_path() {
    local input resolved

    while true; do
        read -r -p "请输入本地 docker-compose.yml 路径: " input
        if [ -z "$input" ]; then
            echo "路径不能为空"
            continue
        fi

        resolved="$(resolve_input_path "$input")"
        if [ -f "$resolved" ]; then
            LOCAL_COMPOSE_PATH="$resolved"
            break
        fi

        echo "未找到文件: $resolved"
    done
}

ROOT_LOGIN_PASSWORD="1234"

randomize_compose_credentials() {
    local system_key token_key file_token_key aes256_secret_key invoke_token_secret
    local plugin_token code_sandbox_token volume_manager_token agent_proxy_secret aiproxy_token
    local root_password mongo_password redis_password minio_password
    local pg_password aiproxy_pg_password oceanbase_sys_password oceanbase_tenant_password seekdb_password opengauss_password

    system_key="$(random_hex 32)"
    token_key="$(random_hex 32)"
    file_token_key="$(random_hex 32)"
    aes256_secret_key="$(random_hex 32)"
    invoke_token_secret="$(random_hex 32)"
    plugin_token="$(random_hex 32)"
    code_sandbox_token="$(random_hex 32)"
    volume_manager_token="$(random_hex 32)"
    agent_proxy_secret="$(random_hex 32)"
    aiproxy_token="$(random_hex 32)"
    root_password="$(random_hex 8)"
    mongo_password="$(random_hex 16)"
    redis_password="$(random_hex 16)"
    minio_password="$(random_hex 16)"
    pg_password="$(random_hex 16)"
    aiproxy_pg_password="$(random_hex 16)"
    oceanbase_sys_password="$(random_hex 16)"
    oceanbase_tenant_password="$(random_hex 16)"
    seekdb_password="$(random_hex 16)"
    # openGauss 要求密码同时包含大小写、数字和特殊字符。放在 URL 中时 @ 需要编码。
    opengauss_password="Fg$(random_hex 12)@123"

    if LC_ALL=C grep -Eq "x-default-root-psw: &x-default-root-psw ['\"]1234['\"]" docker-compose.yml; then
        ROOT_LOGIN_PASSWORD="$root_password"
        replace_text "x-default-root-psw: &x-default-root-psw '1234'" "x-default-root-psw: &x-default-root-psw '$root_password'"
        replace_text 'x-default-root-psw: &x-default-root-psw "1234"' "x-default-root-psw: &x-default-root-psw \"$root_password\""
    else
        ROOT_LOGIN_PASSWORD="请查看 docker-compose.yml 中 DEFAULT_ROOT_PSW"
    fi

    # YAML anchors: 多个服务共用的 token 只改锚点，引用方自动同步。
    replace_text "x-system-key: &x-system-key 'fastgpt-xxx'" "x-system-key: &x-system-key '$system_key'"
    replace_text 'x-system-key: &x-system-key "fastgpt-xxx"' "x-system-key: &x-system-key \"$system_key\""
    replace_text "x-token-key: &x-token-key 'fastgpt'" "x-token-key: &x-token-key '$token_key'"
    replace_text 'x-token-key: &x-token-key "fastgpt"' "x-token-key: &x-token-key \"$token_key\""
    replace_text "x-file-token-key: &x-file-token-key 'filetokenkey'" "x-file-token-key: &x-file-token-key '$file_token_key'"
    replace_text 'x-file-token-key: &x-file-token-key "filetokenkey"' "x-file-token-key: &x-file-token-key \"$file_token_key\""
    replace_text "x-aes256-secret-key: &x-aes256-secret-key 'fastgptsecret'" "x-aes256-secret-key: &x-aes256-secret-key '$aes256_secret_key'"
    replace_text 'x-aes256-secret-key: &x-aes256-secret-key "fastgptsecret"' "x-aes256-secret-key: &x-aes256-secret-key \"$aes256_secret_key\""
    replace_text "x-invoke-token-secret: &x-invoke-token-secret 'fastgpt_invoke_token_secret_32_chars_min'" "x-invoke-token-secret: &x-invoke-token-secret '$invoke_token_secret'"
    replace_text 'x-invoke-token-secret: &x-invoke-token-secret "fastgpt_invoke_token_secret_32_chars_min"' "x-invoke-token-secret: &x-invoke-token-secret \"$invoke_token_secret\""
    replace_text "x-plugin-auth-token: &x-plugin-auth-token 'token'" "x-plugin-auth-token: &x-plugin-auth-token '$plugin_token'"
    replace_text 'x-plugin-auth-token: &x-plugin-auth-token "token"' "x-plugin-auth-token: &x-plugin-auth-token \"$plugin_token\""
    replace_text "x-plugin-auth-token: &x-plugin-auth-token 'fastgpt-plugin-token-please-change'" "x-plugin-auth-token: &x-plugin-auth-token '$plugin_token'"
    replace_text 'x-plugin-auth-token: &x-plugin-auth-token "fastgpt-plugin-token-please-change"' "x-plugin-auth-token: &x-plugin-auth-token \"$plugin_token\""
    replace_text "x-code-sandbox-token: &x-code-sandbox-token 'codesandbox'" "x-code-sandbox-token: &x-code-sandbox-token '$code_sandbox_token'"
    replace_text 'x-code-sandbox-token: &x-code-sandbox-token "codesandbox"' "x-code-sandbox-token: &x-code-sandbox-token \"$code_sandbox_token\""
    replace_text "x-volume-manager-auth-token: &x-volume-manager-auth-token 'vmtoken'" "x-volume-manager-auth-token: &x-volume-manager-auth-token '$volume_manager_token'"
    replace_text 'x-volume-manager-auth-token: &x-volume-manager-auth-token "vmtoken"' "x-volume-manager-auth-token: &x-volume-manager-auth-token \"$volume_manager_token\""
    replace_text "x-agent-sandbox-proxy-secret: &x-agent-sandbox-proxy-secret 'default_fastgpt_agent_sandbox_proxy_secret'" "x-agent-sandbox-proxy-secret: &x-agent-sandbox-proxy-secret '$agent_proxy_secret'"
    replace_text 'x-agent-sandbox-proxy-secret: &x-agent-sandbox-proxy-secret "default_fastgpt_agent_sandbox_proxy_secret"' "x-agent-sandbox-proxy-secret: &x-agent-sandbox-proxy-secret \"$agent_proxy_secret\""
    replace_text "x-aiproxy-token: &x-aiproxy-token 'token'" "x-aiproxy-token: &x-aiproxy-token '$aiproxy_token'"
    replace_text 'x-aiproxy-token: &x-aiproxy-token "token"' "x-aiproxy-token: &x-aiproxy-token \"$aiproxy_token\""

    # 旧版本没有为这些密钥设置 anchor，需要直接替换环境变量默认值。
    replace_text "TOKEN_KEY: fastgpt" "TOKEN_KEY: $token_key"
    replace_text "FILE_TOKEN_KEY: filetokenkey" "FILE_TOKEN_KEY: $file_token_key"
    replace_text "AES256_SECRET_KEY: fastgptsecret" "AES256_SECRET_KEY: $aes256_secret_key"
    replace_text "INVOKE_TOKEN_SECRET: fastgpt_invoke_token_secret_32_chars_min" "INVOKE_TOKEN_SECRET: $invoke_token_secret"

    # MongoDB 主库与 plugin 独立库使用同一个 Mongo root 密码。
    replace_text "mongodb://myusername:mypassword@fastgpt-mongo:27017/fastgpt?authSource=admin" "mongodb://myusername:$mongo_password@fastgpt-mongo:27017/fastgpt?authSource=admin"
    replace_text "mongodb://myusername:mypassword@fastgpt-mongo:27017/fastgpt-plugin?authSource=admin" "mongodb://myusername:$mongo_password@fastgpt-mongo:27017/fastgpt-plugin?authSource=admin"
    replace_text "- MONGO_INITDB_ROOT_PASSWORD=mypassword" "- MONGO_INITDB_ROOT_PASSWORD=$mongo_password"
    replace_text "'-p', 'mypassword'" "'-p', '$mongo_password'"
    replace_text " mongo -u myusername -p mypassword " " mongo -u myusername -p $mongo_password "

    # Redis 密码需要同时改连接串、启动命令和健康检查。
    replace_text "redis://default:mypassword@fastgpt-redis:6379" "redis://default:$redis_password@fastgpt-redis:6379"
    replace_text "redis-server --requirepass mypassword " "redis-server --requirepass $redis_password "
    replace_text "'redis-cli', '-a', 'mypassword', 'ping'" "'redis-cli', '-a', '$redis_password', 'ping'"

    # FastGPT 自带 MinIO。用户名保持 minioadmin 便于识别和登录控制台，只随机化密钥。
    replace_text "STORAGE_SECRET_ACCESS_KEY: minioadmin" "STORAGE_SECRET_ACCESS_KEY: $minio_password"
    replace_text "- MINIO_ROOT_PASSWORD=minioadmin" "- MINIO_ROOT_PASSWORD=$minio_password"

    # 本地 PG 向量库，仅在选择 pg 时存在。
    replace_text "PG_URL: postgresql://username:password@fastgpt-vector:5432/postgres" "PG_URL: postgresql://username:$pg_password@fastgpt-vector:5432/postgres"
    replace_text "- POSTGRES_PASSWORD=password" "- POSTGRES_PASSWORD=$pg_password"

    # AIProxy 自带 PG。
    replace_text "SQL_DSN: postgres://postgres:aiproxy@fastgpt-aiproxy-pg:5432/aiproxy" "SQL_DSN: postgres://postgres:$aiproxy_pg_password@fastgpt-aiproxy-pg:5432/aiproxy"
    replace_text "POSTGRES_PASSWORD: aiproxy" "POSTGRES_PASSWORD: $aiproxy_pg_password"

    # OceanBase / SeekDB 向量库，仅在对应选择下存在。
    replace_text "OCEANBASE_URL: mysql://root%40tenantname:tenantpassword@fastgpt-vector:2881/mysql" "OCEANBASE_URL: mysql://root%40tenantname:$oceanbase_tenant_password@fastgpt-vector:2881/mysql"
    replace_text "- OB_SYS_PASSWORD=obsyspassword" "- OB_SYS_PASSWORD=$oceanbase_sys_password"
    replace_text "- OB_TENANT_PASSWORD=tenantpassword" "- OB_TENANT_PASSWORD=$oceanbase_tenant_password"
    replace_text "-ptenantpassword" "-p$oceanbase_tenant_password"
    replace_text "SEEKDB_URL: mysql://root:seekdbpassword@fastgpt-vector:2881/mysql" "SEEKDB_URL: mysql://root:$seekdb_password@fastgpt-vector:2881/mysql"
    replace_text "- ROOT_PASSWORD=seekdbpassword" "- ROOT_PASSWORD=$seekdb_password"
    replace_text "'-pseekdbpassword'" "'-p$seekdb_password'"

    # openGauss 向量库，仅在对应选择下存在。连接串中的 @ 必须编码为 %40。
    replace_text "OPENGAUSS_URL: postgresql://gaussdb:FastGPT@123@fastgpt-vector:5432/fastgpt" "OPENGAUSS_URL: postgresql://gaussdb:${opengauss_password/@/%40}@fastgpt-vector:5432/fastgpt"
    replace_text "- GS_PASSWORD=FastGPT@123" "- GS_PASSWORD=$opengauss_password"
}

# ========== 部署版本列表（由 deploy/init.mjs 自动生成） ==========
# BEGIN GENERATED DEPLOY VERSIONS
DEPLOY_VERSIONS=(
    "v4.15"
    "v4.14"
    "main"
)
# END GENERATED DEPLOY VERSIONS
LOCAL_DEPLOY_VERSION="local"
LOCAL_DEPLOY_LABEL="本地 docker-compose.yml"

# 获取部署版本展示文案：main 为迭代版，其他版本均视为稳定版
get_version_label() {
    local version="$1"
    if [ "$version" == "$LOCAL_DEPLOY_VERSION" ]; then
        echo "$LOCAL_DEPLOY_LABEL"
    elif [ "$version" == "main" ]; then
        echo "迭代版 main"
    else
        echo "稳定版 $version"
    fi
}

# ========== 1. 选择镜像源 ==========
radio_select "请选择镜像源 (↑↓ 选择, 回车确认):" "阿里云 (中国大陆)" "GitHub (全球)"
case $RADIO_RESULT in
    1)
        REGION="global"
        BASE_URL="https://doc.fastgpt.io/deploy"
        ;;
    *)
        REGION="cn"
        BASE_URL="https://doc.fastgpt.cn/deploy"
        ;;
esac

# ========== 2. 选择部署版本 ==========
if [ ${#DEPLOY_VERSIONS[@]} -eq 0 ]; then
    echo "错误: 未配置部署版本"
    exit 1
fi

LOCAL_COMPOSE_PATH=""
if [ -n "$FASTGPT_LOCAL_COMPOSE_PATH" ]; then
    DEPLOY_VERSION="$LOCAL_DEPLOY_VERSION"
    LOCAL_COMPOSE_PATH="$(resolve_input_path "$FASTGPT_LOCAL_COMPOSE_PATH")"
    if [ ! -f "$LOCAL_COMPOSE_PATH" ]; then
        echo "错误: FASTGPT_LOCAL_COMPOSE_PATH 指向的文件不存在: $LOCAL_COMPOSE_PATH"
        exit 1
    fi
elif [ -n "$FASTGPT_DEPLOY_VERSION" ]; then
    version_matched=false
    for version in "${DEPLOY_VERSIONS[@]}"; do
        if [ "$FASTGPT_DEPLOY_VERSION" == "$version" ]; then
            version_matched=true
            break
        fi
    done

    if [ "$version_matched" = true ]; then
        DEPLOY_VERSION="$FASTGPT_DEPLOY_VERSION"
    else
        echo "错误: 不支持的 FASTGPT_DEPLOY_VERSION: $FASTGPT_DEPLOY_VERSION"
        echo "可选版本: ${DEPLOY_VERSIONS[*]} $LOCAL_DEPLOY_VERSION"
        exit 1
    fi
else
    VERSION_OPTIONS=()
    for version in "${DEPLOY_VERSIONS[@]}"; do
        VERSION_OPTIONS+=("$(get_version_label "$version")")
    done
    VERSION_OPTIONS+=("$LOCAL_DEPLOY_LABEL")

    radio_select "请选择部署版本 (↑↓ 选择, 回车确认):" "${VERSION_OPTIONS[@]}"
    if [ $RADIO_RESULT -eq ${#DEPLOY_VERSIONS[@]} ]; then
        DEPLOY_VERSION="$LOCAL_DEPLOY_VERSION"
        prompt_local_compose_path
    else
        DEPLOY_VERSION="${DEPLOY_VERSIONS[$RADIO_RESULT]}"
    fi
fi

# ========== 3. 选择向量数据库 ==========
if [ "$DEPLOY_VERSION" == "$LOCAL_DEPLOY_VERSION" ]; then
    VECTOR="local"
else
    radio_select "请选择向量数据库 (↑↓ 选择, 回车确认):" "PostgreSQL + pgvector" "Milvus" "Zilliz" "OceanBase" "SeekDB"
    case $RADIO_RESULT in
        1) VECTOR="milvus" ;;
        2) VECTOR="zilliz" ;;
        3) VECTOR="oceanbase" ;;
        4) VECTOR="seekdb" ;;
        *) VECTOR="pg" ;;
    esac
fi

# ========== 4. 检测可用 IP ==========
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

# ========== 5. 选择 S3 访问地址 (端口 9000) ==========
select_address "请选择 S3 访问地址 - 客户端和容器均需可访问 (↑↓ 选择, 回车确认, 通常默认第一个即可):" 9000
S3_ADDR="$SELECTED_ADDR"
S3_CUSTOM=$SELECTED_CUSTOM

# ========== 6. 选择 SSE MCP 访问地址 (端口 3003) ==========
select_address "请选择 SSE MCP 访问地址 - 客户端和容器均需可访问 (↑↓ 选择, 回车确认, 通常默认第一个即可):" 3003
MCP_ADDR="$SELECTED_ADDR"
MCP_CUSTOM=$SELECTED_CUSTOM

# ========== 确认配置 ==========
DEPLOY_VERSION_LABEL="$(get_version_label "$DEPLOY_VERSION")"

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
echo "  部署版本:     $DEPLOY_VERSION_LABEL"
if [ "$DEPLOY_VERSION" == "$LOCAL_DEPLOY_VERSION" ]; then
    echo "  Compose 文件: $LOCAL_COMPOSE_PATH"
else
    echo "  镜像源:       $REGION_LABEL"
    echo "  向量数据库:   $VECTOR"
fi
echo "  S3 地址:      $S3_DISPLAY"
echo "  MCP 地址:     $MCP_DISPLAY"
echo "=============================="
echo ""
read -p "确认以上配置? (y/n) [y]: " confirm
if [ "$confirm" == "n" ]; then
    echo "已取消"
    exit 1
fi

# ========== 获取配置文件 ==========
echo ""
if [ "$DEPLOY_VERSION" == "$LOCAL_DEPLOY_VERSION" ]; then
    echo "正在复制本地配置文件..."
else
    echo "正在下载配置文件..."
fi

if [ "$DEPLOY_VERSION" == "$LOCAL_DEPLOY_VERSION" ]; then
    LOCAL_COMPOSE_TMP="docker-compose.yml.tmp"
    cp "$LOCAL_COMPOSE_PATH" "$LOCAL_COMPOSE_TMP"
    if [ $? -ne 0 ]; then
        echo "错误: 复制本地 docker-compose.yml 失败: $LOCAL_COMPOSE_PATH"
        rm -f "$LOCAL_COMPOSE_TMP"
        exit 1
    fi
    validate_compose_file "$LOCAL_COMPOSE_TMP" "$LOCAL_COMPOSE_PATH" true
    mv "$LOCAL_COMPOSE_TMP" docker-compose.yml
    echo "已复制 docker-compose.yml"
else
    # 构建下载链接（处理 global 下 zilliz 文件名差异）
    VECTOR_FILE="$VECTOR"
    if [ "$REGION" == "global" ] && [ "$VECTOR" == "zilliz" ]; then
        VECTOR_FILE="zilliz"
    fi

    YML_URL="${BASE_URL}/docker/${DEPLOY_VERSION}/${REGION}/docker-compose.${VECTOR_FILE}.yml"

    # 下载 docker-compose YAML
    YML_FILE="docker-compose.${VECTOR_FILE}.yml"
    curl -fsSL "$YML_URL" -o "$YML_FILE"
    if [ $? -ne 0 ]; then
        echo "错误: 下载 YAML 文件失败: $YML_URL"
        rm -f "$YML_FILE"
        exit 1
    fi
    validate_compose_file "$YML_FILE" "$YML_URL" true
    mv "$YML_FILE" docker-compose.yml
    echo "已下载 docker-compose.yml"
fi

CONFIG_URL="${BASE_URL}/config/config.json"

USES_CONFIG_JSON=false
if LC_ALL=C grep -q -- "./config.json:/app/data/config.json" docker-compose.yml; then
    USES_CONFIG_JSON=true

    # 下载旧版本 docker-compose 仍挂载的 config.json。
    CONFIG_FILE="config.json.tmp"
    curl -fsSL "$CONFIG_URL" -o "$CONFIG_FILE"
    if [ $? -ne 0 ]; then
        echo "错误: 下载 config.json 失败: $CONFIG_URL"
        rm -f "$CONFIG_FILE"
        exit 1
    fi
    validate_config_file "$CONFIG_FILE" "$CONFIG_URL" true
    mv "$CONFIG_FILE" config.json
    echo "已下载 config.json"
fi

# ========== 随机化默认密钥 ==========
randomize_compose_credentials
echo "已随机生成 docker-compose.yml 中的登录密码、服务 Token、应用密钥和组件密码"

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

    if $USES_CONFIG_JSON; then
        # 旧版本 compose 挂载 config.json，只能继续写旧字段；main 已迁移到环境变量。
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|\"mcpServerProxyEndpoint\": \"\"|\"mcpServerProxyEndpoint\": \"$MCP_ENDPOINT\"|g" config.json
        else
            sed -i "s|\"mcpServerProxyEndpoint\": \"\"|\"mcpServerProxyEndpoint\": \"$MCP_ENDPOINT\"|g" config.json
        fi
    else
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^      SSE_MCP_SERVER_PROXY_ENDPOINT:.*|      SSE_MCP_SERVER_PROXY_ENDPOINT: $MCP_ENDPOINT|g" docker-compose.yml
        else
            sed -i "s|^      SSE_MCP_SERVER_PROXY_ENDPOINT:.*|      SSE_MCP_SERVER_PROXY_ENDPOINT: $MCP_ENDPOINT|g" docker-compose.yml
        fi
    fi

    if [ $? -eq 0 ]; then
        echo "已更新 MCP 访问地址为: $MCP_ENDPOINT"
    else
        if $USES_CONFIG_JSON; then
            echo "警告: 替换 MCP 地址失败，请手动编辑旧版 config.json 中的 mcpServerProxyEndpoint"
        else
            echo "警告: 替换 MCP 地址失败，请手动编辑 docker-compose.yml 中的 SSE_MCP_SERVER_PROXY_ENDPOINT"
        fi
    fi
else
    if $USES_CONFIG_JSON; then
        echo "警告: 未设置 MCP 地址，请手动编辑旧版 config.json 中的 mcpServerProxyEndpoint"
    else
        echo "警告: 未设置 MCP 地址，请手动编辑 docker-compose.yml 中的 SSE_MCP_SERVER_PROXY_ENDPOINT"
    fi
fi

if LC_ALL=C grep -q -- "- /var/run/docker.sock:/var/run/docker.sock" docker-compose.yml; then
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
            printf '已检测到 Docker socket: %s，已更新 docker-compose.yml 挂载路径\n' "$HOST_SOCK"
        else
            echo "Docker socket 路径正常: /var/run/docker.sock"
        fi
    else
        echo "警告: 未检测到 Docker socket。请确认 Docker 正在运行，"
        echo "      并手动编辑 docker-compose.yml，将两处 '- /var/run/docker.sock:/var/run/docker.sock'"
        echo "      左侧改成宿主机实际的 socket 路径。"
    fi
fi

# ========== 完成 ==========
echo ""
echo "配置下载成功! 后续操作:"
echo "  注意: docker-compose.yml 已随机生成登录密码、服务 Token、应用密钥和组件密码。"
echo "        请妥善保存该文件，后续升级时不要直接丢失这些凭证。"
if LC_ALL=C grep -q "opensandbox-agent-sandbox-image" docker-compose.yml; then
    echo "  1. 预热沙盒:   docker compose --profile prepull pull opensandbox-agent-sandbox-image opensandbox-execd-image opensandbox-egress-image"
    echo "  2. 启动服务:   docker compose up -d"
    echo "  3. 开放端口:   3000, 9000, 3003"
    echo "  4. 访问服务:   http://localhost:3000"
    echo "  5. 登录服务:   默认账号为 'root', 密码为: '$ROOT_LOGIN_PASSWORD'"
    echo "  6. 配置模型:   在 '账号-模型提供商' 页面，进行模型配置"
else
    echo "  1. 启动服务:   docker compose up -d"
    echo "  2. 开放端口:   3000, 9000, 3003"
    echo "  3. 访问服务:   http://localhost:3000"
    echo "  4. 登录服务:   默认账号为 'root', 密码为: '$ROOT_LOGIN_PASSWORD'"
    echo "  5. 配置模型:   在 '账号-模型提供商' 页面，进行模型配置"
fi
echo ""
echo "详细文档: https://doc.fastgpt.cn/self-host/deploy/docker"
