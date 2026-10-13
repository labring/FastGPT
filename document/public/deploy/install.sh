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
    local value

    if command -v openssl &>/dev/null; then
        value="$(openssl rand -hex "$bytes" 2>/dev/null)"
        if [ -n "$value" ]; then
            printf '%s\n' "$value"
            return
        fi
    fi

    if [ -r /dev/urandom ] && command -v od &>/dev/null; then
        value="$(dd if=/dev/urandom bs="$bytes" count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')"
        if [ -n "$value" ]; then
            printf '%s\n' "$value"
            return
        fi
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

# 端口是宿主机对外监听的端口；容器端口由 Compose 模板决定，不能被访问 URL 覆盖。
normalize_host_port() {
    local value="$1"
    local normalized

    if [[ ! "$value" =~ ^[0-9]{1,5}$ ]]; then
        echo "错误: 端口必须是 1–65535 的十进制整数" >&2
        return 1
    fi
    normalized=$((10#$value))
    if (( normalized < 1 || normalized > 65535 )); then
        echo "错误: 端口必须是 1–65535 的十进制整数" >&2
        return 1
    fi
    printf '%s\n' "$normalized"
}

# 只校验访问地址的协议、主机和可选端口；公网端口不用于推导宿主机映射。
validate_access_url() {
    local value="$1"
    local protocol_pattern="$2"
    local authority port=""
    local url_pattern="^(${protocol_pattern})://([^/?#]+)([/?#].*)?$"

    if [[ "$value" =~ [[:space:][:cntrl:]] ]] ||
        [[ "$value" == *"'"* || "$value" == *'"'* || "$value" == *'\\'* ]]; then
        echo "错误: 请输入有效的 ${protocol_pattern} 完整访问地址" >&2
        return 1
    fi
    if ! [[ "$value" =~ $url_pattern ]]; then
        echo "错误: 请输入有效的 ${protocol_pattern} 完整访问地址" >&2
        return 1
    fi

    authority="${BASH_REMATCH[2]}"
    if [[ "$authority" == \[* ]]; then
        if ! [[ "$authority" =~ ^\[[0-9A-Fa-f:.]+\](:([0-9]+))?$ ]]; then
            echo "错误: IPv6 地址必须使用方括号，端口必须是整数" >&2
            return 1
        fi
        port="${BASH_REMATCH[2]}"
    else
        if [[ "$authority" == *"@"* ]]; then
            echo "错误: 访问地址必须包含有效主机，不支持用户信息或空端口" >&2
            return 1
        fi
        if [[ "$authority" =~ ^[^:@]+(:([0-9]+))?$ ]]; then
            port="${BASH_REMATCH[2]}"
        else
            echo "错误: 访问地址必须包含有效主机，不支持用户信息或空端口" >&2
            return 1
        fi
    fi
    [ -z "$port" ] || normalize_host_port "$port" >/dev/null || return 1
}

validate_fe_domain() { validate_access_url "$1" 'https?'; }
validate_sandbox_preview_proxy_url() { validate_access_url "$1" 'https?'; }
validate_sandbox_proxy_url() { validate_access_url "$1" 'wss?'; }

get_url_host() {
    local authority="${1#*://}"
    authority="${authority%%[/?#]*}"
    if [[ "$authority" == \[* ]]; then
        printf '%s\n' "${authority#\[}" | sed 's/\].*$//'
    else
        printf '%s\n' "${authority%%:*}"
    fi
}

get_url_port() {
    local authority="${1#*://}"
    local port=""
    authority="${authority%%[/?#]*}"
    if [[ "$authority" == \[* ]]; then
        authority="${authority#*\]}"
        [[ "$authority" == :* ]] && port="${authority#:}"
    elif [[ "$authority" == *:* ]]; then
        port="${authority##*:}"
    fi
    [ -z "$port" ] || printf '%s\n' "$port"
}

is_loopback_url() {
    case "$(get_url_host "$1")" in
        localhost | 127.0.0.1 | ::1) return 0 ;;
        *) return 1 ;;
    esac
}

# 本机直连 URL 可继续快捷设置端口；公网/反向代理 URL（例如 :443）不改变宿主映射。
resolve_default_host_port() {
    local configured="$1"
    local url="$2"
    local default_port="$3"
    local url_port

    if [ -n "$configured" ]; then
        normalize_host_port "$configured"
        return
    fi
    url_port="$(get_url_port "$url")"
    if [ -n "$url_port" ] && is_loopback_url "$url"; then
        normalize_host_port "$url_port"
    else
        printf '%s\n' "$default_port"
    fi
}

# 识别官方模板及常见本地 Compose 的短格式映射，不猜测复杂 YAML。
# 第四个参数为空时输出 mapped|host|bind、unpublished、missing 或 unsupported；有值时输出修改后的文件。
compose_service_port() {
    local file="$1"
    local service="$2"
    local container_port="$3"
    local new_host_port="${4:-}"
    local mode=info
    [ -n "$new_host_port" ] && mode=replace

    LC_ALL=C awk -v service="$service" -v target="$container_port" -v replacement="$new_host_port" -v mode="$mode" '
        function emit(value) { if (mode == "replace") print value }
        function replace_token(line, token, replacement, position) {
            position = index(line, token)
            if (!position) return line
            return substr(line, 1, position - 1) replacement substr(line, position + length(token))
        }
        function parse_port(line, token, value, quote) {
            p_valid = 0
            token = line
            sub(/^[[:space:]]*-[[:space:]]*/, "", token)
            match(token, /^[^[:space:]]+/)
            p_token = substr(token, RSTART, RLENGTH)
            value = p_token
            quote = substr(value, 1, 1)
            if (quote == "\047" || quote == "\042") {
                if (substr(value, length(value), 1) != quote) return
                value = substr(value, 2, length(value) - 2)
            }
            p_quote = quote
            p_suffix = ""
            if (value ~ /\/tcp$/) { p_suffix = "/tcp"; sub(/\/tcp$/, "", value) }
            else if (value ~ /\/udp$/) { p_suffix = "/udp"; sub(/\/udp$/, "", value) }
            if (p_suffix == "/udp" || value !~ /:[0-9]+$/) return
            p_container = value
            sub(/^.*:/, "", p_container)
            p_prefix = value
            sub(/:[0-9]+$/, "", p_prefix)
            p_bind = ""
            if (p_prefix ~ /^[0-9]+$/) {
                p_host = p_prefix
            } else if (p_prefix ~ /^[0-9.]+:[0-9]+$/ || p_prefix ~ /^\[[0-9A-Fa-f:.]+\]:[0-9]+$/) {
                p_host = p_prefix
                sub(/^.*:/, "", p_host)
                p_bind = p_prefix
                sub(/[^:]+$/, "", p_bind)
            } else {
                p_invalid = 1
                return
            }
            if (p_host + 0 < 1 || p_host + 0 > 65535) { p_invalid = 1; return }
            p_valid = 1
        }
        {
            line = $0
            if ($0 ~ /^  [A-Za-z0-9_.-]+:[[:space:]]*(#.*)?$/) {
                name = $0
                sub(/^  /, "", name)
                sub(/:.*/, "", name)
                in_service = (name == service)
                if (in_service) service_found = 1
                in_ports = 0
                emit(line)
                next
            }
            if (!in_service) { emit(line); next }
            if ($0 !~ /^ / || $0 ~ /^  [^[:space:]]/) {
                in_service = 0
                in_ports = 0
                emit(line)
                next
            }
            if ($0 ~ /^    ports:[[:space:]]*(#.*)?$/) { in_ports = 1; emit(line); next }
            if ($0 ~ /^    [^[:space:]-]/) { in_ports = 0; emit(line); next }
            if (!in_ports || $0 !~ /^      -[[:space:]]*/) { emit(line); next }

            p_invalid = 0
            p_container = ""
            p_host = ""
            p_bind = ""
            parse_port(line)
            if (!p_valid || p_container != target) {
                if (p_invalid && p_container == target) unsupported = 1
                emit(line)
                next
            }
            matches++
            if (matches == 1) {
                selected_host = p_host + 0
                selected_bind = p_bind
                if (mode == "replace") {
                    new_value = p_bind replacement ":" target
                    new_token = (p_quote == "\047" || p_quote == "\042" ? p_quote new_value p_suffix p_quote : new_value p_suffix)
                    line = replace_token(line, p_token, new_token)
                }
            }
            emit(line)
        }
        END {
            if (mode == "replace") {
                if (!service_found || unsupported || matches != 1) exit 1
            } else if (!service_found) print "missing||"
            else if (unsupported || matches > 1) print "unsupported||"
            else if (matches == 1) print "mapped|" selected_host "|" selected_bind
            else print "unpublished||"
        }
    ' "$file"
}

replace_compose_service_port() {
    local file="$1"
    local service="$2"
    local container_port="$3"
    local host_port="$4"
    local info state old_host tmp

    info="$(compose_service_port "$file" "$service" "$container_port")" || return 1
    IFS='|' read -r state old_host _ <<< "$info"
    [ "$state" = mapped ] || {
        echo "错误: 无法唯一识别 $service 的宿主机端口映射（状态: $state）" >&2
        return 1
    }
    tmp="${file}.port.tmp.$$"
    if ! compose_service_port "$file" "$service" "$container_port" "$host_port" > "$tmp"; then
        rm -f "$tmp"
        echo "错误: $service 的端口映射替换失败" >&2
        return 1
    fi
    if ! mv "$tmp" "$file"; then
        rm -f "$tmp"
        echo "错误: 无法写入 $file" >&2
        return 1
    fi
}

request_host_port() {
    local env_name="$1"
    local label="$2"
    local url="$3"
    local default_port="$4"
    local compose_file="$5"
    local service="$6"
    local container_port="$7"
    local configured="${!env_name}"
    local current_port=""
    local info state detected_port input

    if [ -n "$compose_file" ] && [ -f "$compose_file" ]; then
        info="$(compose_service_port "$compose_file" "$service" "$container_port")" || return 1
        IFS='|' read -r state detected_port _ <<< "$info"
        [ "$state" = mapped ] && current_port="$detected_port"
    fi
    current_port="$(resolve_default_host_port "$configured" "$url" "${current_port:-$default_port}")" || return 1
    if [ -z "$configured" ] && [ "$NON_INTERACTIVE" != true ]; then
        while true; do
            read -r -p "$label 宿主机端口 [$current_port]（与公网访问 URL 独立）: " input
            input="${input:-$current_port}"
            current_port="$(normalize_host_port "$input")" && break
        done
    fi
    printf '%s\n' "$current_port"
}

configure_host_port() {
    local file="$1"
    local service="$2"
    local container_port="$3"
    local host_port="$4"
    local default_port="$5"
    local explicit="$6"
    local info state current

    info="$(compose_service_port "$file" "$service" "$container_port")" || {
        echo "错误: 无法读取 $file 中的端口映射" >&2
        return 1
    }
    IFS='|' read -r state current _ <<< "$info"
    case "$state" in
        mapped)
            [ "$current" = "$host_port" ] || replace_compose_service_port "$file" "$service" "$container_port" "$host_port" || return 1
            ;;
        missing)
            if [ "$explicit" = true ] || [ "$host_port" != "$default_port" ]; then
                echo "错误: Compose 中不存在 $service，无法设置宿主机端口 $host_port" >&2
                return 1
            fi
            ;;
        unpublished | unsupported)
            if [ "$explicit" = true ] || [ "$host_port" != "$default_port" ]; then
                echo "错误: $service 的端口映射格式为 $state，无法安全自动修改；请手工配置后重试" >&2
                return 1
            fi
            echo "警告: $service 未使用可识别的直接端口映射，保留原 Compose 配置" >&2
            ;;
    esac

    info="$(compose_service_port "$file" "$service" "$container_port")" || return 1
    IFS='|' read -r state current _ <<< "$info"
    if [ "$state" = mapped ] && [ "$current" != "$host_port" ]; then
        echo "错误: $service 端口修改结果校验失败" >&2
        return 1
    fi
}

print_host_port() {
    local file="$1"
    local service="$2"
    local container_port="$3"
    local label="$4"
    local info state host bind

    if ! info="$(compose_service_port "$file" "$service" "$container_port")"; then
        echo "  $label: 无法读取 Compose 端口映射" >&2
        return 1
    fi
    IFS='|' read -r state host bind <<< "$info"
    case "$state" in
        mapped) echo "  $label 宿主机映射: ${bind}${host} -> 容器 ${container_port}" ;;
        missing) echo "  $label: Compose 未定义该服务" ;;
        unpublished) echo "  $label: 未发布宿主机端口（保留原配置）" ;;
        *) echo "  $label: 端口映射无法自动识别，请检查 Compose" ;;
    esac
}

request_fe_domain() {
    local input

    if [ -n "$FASTGPT_FE_DOMAIN" ]; then
        input="$FASTGPT_FE_DOMAIN"
    elif [ "$NON_INTERACTIVE" = true ]; then
        echo "错误: 非交互模式必须设置 FASTGPT_FE_DOMAIN，例如 https://fastgpt.example.com" >&2
        exit 1
    else
        while true; do
            read -r -p "请输入 FastGPT 访问地址 (如 http://localhost:3000): " input
            if validate_fe_domain "$input"; then
                break
            fi
        done
    fi

    validate_fe_domain "$input" || exit 1
    FE_DOMAIN_INPUT="$input"
}

request_sandbox_proxy_url() {
    local input

    if [ -n "$FASTGPT_SANDBOX_PROXY_URL" ]; then
        input="$FASTGPT_SANDBOX_PROXY_URL"
    elif [ "$NON_INTERACTIVE" = true ]; then
        echo "错误: 非交互模式必须设置 FASTGPT_SANDBOX_PROXY_URL，例如 wss://sandbox-proxy.example.com" >&2
        exit 1
    else
        while true; do
            read -r -p "请输入 Sandbox-proxy 访问地址 (ws 地址，如 ws://localhost:3006): " input
            if validate_sandbox_proxy_url "$input"; then
                break
            fi
        done
    fi

    validate_sandbox_proxy_url "$input" || exit 1
    SANDBOX_PROXY_URL_INPUT="${input%/}"
}

is_v415_deploy() {
    [ "$DEPLOY_VERSION" = "v4.15" ] ||
        { [ "$DEPLOY_VERSION" = "$LOCAL_DEPLOY_VERSION" ] && grep -q 'fastgpt:v4\.15' "$LOCAL_COMPOSE_PATH" 2>/dev/null; }
}

# v4.14 以及未定义该服务的本地 Compose 不需要 Sandbox Proxy 地址和端口配置。
is_sandbox_proxy_deploy() {
    [ "$DEPLOY_VERSION" != "v4.14" ] || return 1
    [ "$DEPLOY_VERSION" != "$LOCAL_DEPLOY_VERSION" ] ||
        grep -qE '^  fastgpt-agent-sandbox-proxy:[[:space:]]*(#.*)?$' "$LOCAL_COMPOSE_PATH"
}

request_sandbox_preview_proxy_url() {
    local input

    if [ -n "$FASTGPT_SANDBOX_PREVIEW_PROXY_URL" ]; then
        input="$FASTGPT_SANDBOX_PREVIEW_PROXY_URL"
    elif is_v415_deploy; then
        if [[ "$SANDBOX_PROXY_URL_INPUT" == wss://* ]]; then
            input="https://${SANDBOX_PROXY_URL_INPUT#wss://}"
        else
            input="http://${SANDBOX_PROXY_URL_INPUT#ws://}"
        fi
    elif [ "$NON_INTERACTIVE" = true ]; then
        echo "错误: 非交互模式必须设置 FASTGPT_SANDBOX_PREVIEW_PROXY_URL，例如 http://localhost:3006" >&2
        exit 1
    else
        while true; do
            read -r -p "请输入 Sandbox-proxy 访问地址 (http 地址，如 http://localhost:3006): " input
            if validate_sandbox_preview_proxy_url "$input"; then
                break
            fi
        done
    fi

    validate_sandbox_preview_proxy_url "$input" || exit 1
    SANDBOX_PREVIEW_PROXY_URL_INPUT="${input%/}"
}

configure_fe_domain() {
    local input escaped_domain

    input="$FE_DOMAIN_INPUT"
    if [ -z "$input" ]; then
        request_fe_domain
        input="$FE_DOMAIN_INPUT"
    fi

    escaped_domain="$(escape_sed_replacement "$input")"
    if LC_ALL=C grep -qE "^x-fe-domain: &x-fe-domain" docker-compose.yml; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^x-fe-domain: &x-fe-domain.*|x-fe-domain: \\&x-fe-domain '$escaped_domain'|g" docker-compose.yml
        else
            sed -i "s|^x-fe-domain: &x-fe-domain.*|x-fe-domain: \\&x-fe-domain '$escaped_domain'|g" docker-compose.yml
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^\([[:space:]]*FE_DOMAIN:\).*|\1 $escaped_domain|g" docker-compose.yml
    else
        sed -i "s|^\([[:space:]]*FE_DOMAIN:\).*|\1 $escaped_domain|g" docker-compose.yml
    fi
    echo "已更新 FastGPT 访问地址为: $input"
}

configure_sandbox_proxy_urls() {
    local preview_url="$SANDBOX_PREVIEW_PROXY_URL_INPUT"
    local proxy_url="$SANDBOX_PROXY_URL_INPUT"
    local escaped_preview escaped_proxy

    escaped_preview="$(escape_sed_replacement "$preview_url")"
    escaped_proxy="$(escape_sed_replacement "$proxy_url")"
    if LC_ALL=C grep -qE '^x-agent-sandbox-proxy-url: &x-agent-sandbox-proxy-url' docker-compose.yml; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^x-agent-sandbox-proxy-url: &x-agent-sandbox-proxy-url.*|x-agent-sandbox-proxy-url: \\&x-agent-sandbox-proxy-url '$escaped_proxy'|g" docker-compose.yml
            sed -i '' "s|^x-agent-sandbox-preview-proxy-url: &x-agent-sandbox-preview-proxy-url.*|x-agent-sandbox-preview-proxy-url: \\&x-agent-sandbox-preview-proxy-url '$escaped_preview'|g" docker-compose.yml
        else
            sed -i "s|^x-agent-sandbox-proxy-url: &x-agent-sandbox-proxy-url.*|x-agent-sandbox-proxy-url: \\&x-agent-sandbox-proxy-url '$escaped_proxy'|g" docker-compose.yml
            sed -i "s|^x-agent-sandbox-preview-proxy-url: &x-agent-sandbox-preview-proxy-url.*|x-agent-sandbox-preview-proxy-url: \\&x-agent-sandbox-preview-proxy-url '$escaped_preview'|g" docker-compose.yml
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^\([[:space:]]*AGENT_SANDBOX_PREVIEW_PROXY_URL:\).*|\1 $escaped_preview|g" docker-compose.yml
        sed -i '' "s|^\([[:space:]]*AGENT_SANDBOX_PROXY_URL:\).*|\1 $escaped_proxy|g" docker-compose.yml
    else
        sed -i "s|^\([[:space:]]*AGENT_SANDBOX_PREVIEW_PROXY_URL:\).*|\1 $escaped_preview|g" docker-compose.yml
        sed -i "s|^\([[:space:]]*AGENT_SANDBOX_PROXY_URL:\).*|\1 $escaped_proxy|g" docker-compose.yml
    fi
    if [ -n "$preview_url" ]; then
        echo "已更新 Sandbox 预览地址为: $preview_url"
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

is_true() {
    case "$1" in
        true | TRUE | True | 1 | yes | YES | Yes | y | Y | on | ON | On) return 0 ;;
        *) return 1 ;;
    esac
}

is_false() {
    case "$1" in
        false | FALSE | False | 0 | no | NO | No | n | N | off | OFF | Off) return 0 ;;
        *) return 1 ;;
    esac
}

normalize_bool_env() {
    local name="$1"
    local value="$2"

    if is_true "$value"; then
        echo "true"
    elif is_false "$value"; then
        echo "false"
    else
        echo "错误: $name 只支持 true/false、1/0、yes/no、on/off" >&2
        exit 1
    fi
}

normalize_deploy_base_url() {
    local url="$1"
    url="${url%/}"
    url="${url%/deploy}"
    printf '%s/deploy\n' "$url"
}

ROOT_LOGIN_PASSWORD="1234"

randomize_compose_credentials() {
    local system_key file_token_key aes256_secret_key invoke_token_secret
    local plugin_token code_sandbox_token volume_manager_token agent_proxy_secret aiproxy_token
    local root_password mongo_password redis_password minio_password
    local pg_password aiproxy_pg_password oceanbase_sys_password oceanbase_tenant_password seekdb_password opengauss_password

    system_key="$(random_hex 32)"
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
    replace_text "x-file-token-key: &x-file-token-key 'filetokenkey'" "x-file-token-key: &x-file-token-key '$file_token_key'"
    replace_text 'x-file-token-key: &x-file-token-key "filetokenkey"' "x-file-token-key: &x-file-token-key \"$file_token_key\""
    replace_text "x-aes256-secret-key: &x-aes256-secret-key 'fastgptsecret'" "x-aes256-secret-key: &x-aes256-secret-key '$aes256_secret_key'"
    replace_text 'x-aes256-secret-key: &x-aes256-secret-key "fastgptsecret"' "x-aes256-secret-key: &x-aes256-secret-key \"$aes256_secret_key\""
    replace_text "x-invoke-token-secret: &x-invoke-token-secret 'fastgpt_invoke_token_secret_32_chars_min'" "x-invoke-token-secret: &x-invoke-token-secret '$invoke_token_secret'"
    replace_text 'x-invoke-token-secret: &x-invoke-token-secret "fastgpt_invoke_token_secret_32_chars_min"' "x-invoke-token-secret: &x-invoke-token-secret \"$invoke_token_secret\""
    replace_text "x-plugin-auth-token: &x-plugin-auth-token 'token'" "x-plugin-auth-token: &x-plugin-auth-token '$plugin_token'"
    replace_text "x-plugin-auth-token: &x-plugin-auth-token 'fastgpt_plugin_auth_token_32char'" "x-plugin-auth-token: &x-plugin-auth-token '$plugin_token'"
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
    replace_text "FILE_TOKEN_KEY: filetokenkey" "FILE_TOKEN_KEY: $file_token_key"
    replace_text "AES256_SECRET_KEY: fastgptsecret" "AES256_SECRET_KEY: $aes256_secret_key"
    replace_text "INVOKE_TOKEN_SECRET: fastgpt_invoke_token_secret_32_chars_min" "INVOKE_TOKEN_SECRET: $invoke_token_secret"

    # MongoDB 主库与 plugin 独立库使用同一个 Mongo root 密码。
    replace_text "mongodb://myusername:mypassword@fastgpt-mongo:27017/fastgpt?authSource=admin" "mongodb://myusername:$mongo_password@fastgpt-mongo:27017/fastgpt?authSource=admin"
    replace_text "mongodb://myusername:mypassword@fastgpt-mongo:27017/fastgpt-plugin?authSource=admin" "mongodb://myusername:$mongo_password@fastgpt-mongo:27017/fastgpt-plugin?authSource=admin"
    replace_text "- MONGO_INITDB_ROOT_PASSWORD=mypassword" "- MONGO_INITDB_ROOT_PASSWORD=$mongo_password"
    replace_text "'-p', 'mypassword'" "'-p', '$mongo_password'"
    replace_text "'mypassword'," "'$mongo_password',"
    replace_text " mongo -u myusername -p mypassword " " mongo -u myusername -p $mongo_password "

    # Redis 密码需要同时改连接串、启动命令和健康检查。
    replace_text "redis://default:mypassword@fastgpt-redis:6379" "redis://default:$redis_password@fastgpt-redis:6379"
    replace_text "redis-server --requirepass mypassword " "redis-server --requirepass $redis_password "
    replace_text "'redis-cli', '-a', 'mypassword', 'ping'" "'redis-cli', '-a', '$redis_password', 'ping'"
    replace_text '"redis-cli", "-a", "mypassword", "ping"' "\"redis-cli\", \"-a\", \"$redis_password\", \"ping\""

    # FastGPT 自带 MinIO。用户名保持 minioadmin 便于识别和登录控制台，只随机化密钥。
    replace_text "STORAGE_SECRET_ACCESS_KEY: minioadmin" "STORAGE_SECRET_ACCESS_KEY: $minio_password"
    replace_text "MINIO_SECRET_KEY: minioadmin" "MINIO_SECRET_KEY: $minio_password"
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
    "main"
    "v4.15"
    "v4.14"
)
# END GENERATED DEPLOY VERSIONS
LOCAL_DEPLOY_VERSION="local"
LOCAL_DEPLOY_LABEL="本地 docker-compose.yml"
NON_INTERACTIVE=false
if [ -n "$FASTGPT_NON_INTERACTIVE" ]; then
    NON_INTERACTIVE="$(normalize_bool_env FASTGPT_NON_INTERACTIVE "$FASTGPT_NON_INTERACTIVE")"
fi

# 可选宿主机端口覆盖：只改变 Compose 映射左侧，容器端口和容器间访问地址不变。
# FASTGPT_PORT 对应 fastgpt-app -> 3000，FASTGPT_SANDBOX_PROXY_PORT 对应
# fastgpt-agent-sandbox-proxy -> 1006。未设置时使用 Compose 现有映射或官方默认值。

# 可选：指定部署文件下载源的站点地址，例如 https://doc.example.com 或
# https://doc.example.com/deploy。适用于文档站使用自定义域名、内网镜像或本地调试。
CUSTOM_DEPLOY_BASE_URL=""
if [ -n "$FASTGPT_DEPLOY_BASE_URL" ]; then
    CUSTOM_DEPLOY_BASE_URL="$(normalize_deploy_base_url "$FASTGPT_DEPLOY_BASE_URL")"
fi

# 获取部署版本展示文案：main 对应当前稳定版，已停止维护的版本单独标记
get_version_label() {
    local version="$1"
    if [ "$version" == "$LOCAL_DEPLOY_VERSION" ]; then
        echo "$LOCAL_DEPLOY_LABEL"
    elif [ "$version" == "v4.14" ]; then
        echo "稳定版 v4.14 (不再维护)"
    elif [ "$version" == "main" ]; then
        echo "稳定版 v4.16"
    else
        echo "稳定版 $version"
    fi
}

# ========== 1. 选择部署版本 ==========
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
elif [ "$NON_INTERACTIVE" = true ]; then
    DEPLOY_VERSION="${DEPLOY_VERSIONS[0]}"
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

# ========== 2. 选择镜像源 ==========
if [ "$DEPLOY_VERSION" != "$LOCAL_DEPLOY_VERSION" ]; then
    if [ -n "$FASTGPT_REGION" ]; then
        case "$FASTGPT_REGION" in
            cn | CN | china | China)
                REGION="cn"
                BASE_URL="${CUSTOM_DEPLOY_BASE_URL:-https://doc.fastgpt.cn/deploy}"
                ;;
            global | GLOBAL | Global | github | GitHub)
                REGION="global"
                BASE_URL="${CUSTOM_DEPLOY_BASE_URL:-https://doc.fastgpt.io/deploy}"
                ;;
            *)
                echo "错误: 不支持的 FASTGPT_REGION: $FASTGPT_REGION"
                echo "可选值: cn, global"
                exit 1
                ;;
        esac
    elif [ "$NON_INTERACTIVE" = true ]; then
        REGION="cn"
        BASE_URL="${CUSTOM_DEPLOY_BASE_URL:-https://doc.fastgpt.cn/deploy}"
    else
        radio_select "请选择镜像源 (↑↓ 选择, 回车确认):" "阿里云 (中国大陆)" "GitHub (全球)"
        case $RADIO_RESULT in
            1)
                REGION="global"
                BASE_URL="${CUSTOM_DEPLOY_BASE_URL:-https://doc.fastgpt.io/deploy}"
                ;;
            *)
                REGION="cn"
                BASE_URL="${CUSTOM_DEPLOY_BASE_URL:-https://doc.fastgpt.cn/deploy}"
                ;;
        esac
    fi
fi

# ========== 3. 选择向量数据库 ==========
if [ "$DEPLOY_VERSION" == "$LOCAL_DEPLOY_VERSION" ]; then
    VECTOR="local"
elif [ -n "$FASTGPT_VECTOR" ]; then
    case "$FASTGPT_VECTOR" in
        pg | PG | pgvector | PgVector | postgresql | PostgreSQL)
            VECTOR="pg"
            ;;
        milvus | Milvus)
            VECTOR="milvus"
            ;;
        zilliz | Zilliz)
            VECTOR="zilliz"
            ;;
        oceanbase | OceanBase)
            VECTOR="oceanbase"
            ;;
        seekdb | SeekDB)
            VECTOR="seekdb"
            ;;
        *)
            echo "错误: 不支持的 FASTGPT_VECTOR: $FASTGPT_VECTOR"
            echo "可选值: pg, milvus, zilliz, oceanbase, seekdb"
            exit 1
            ;;
    esac
elif [ "$NON_INTERACTIVE" = true ]; then
    VECTOR="pg"
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

# ========== 4. 选择是否自动生成密钥 ==========
if [ -n "$FASTGPT_AUTO_GENERATE_CREDENTIALS" ]; then
    AUTO_GENERATE_CREDENTIALS="$(normalize_bool_env FASTGPT_AUTO_GENERATE_CREDENTIALS "$FASTGPT_AUTO_GENERATE_CREDENTIALS")"
elif [ "$NON_INTERACTIVE" = true ]; then
    AUTO_GENERATE_CREDENTIALS=true
else
    radio_select "是否自动生成登录密码、服务 Token、应用密钥和组件密码? (↑↓ 选择, 回车确认):" "自动生成 (推荐)" "不自动生成"
    case $RADIO_RESULT in
        1) AUTO_GENERATE_CREDENTIALS=false ;;
        *) AUTO_GENERATE_CREDENTIALS=true ;;
    esac
fi

# ========== 5. 检测可用 IP ==========
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
    local preset_endpoint="$3"
    SELECTED_CUSTOM=false

    if [ -n "$preset_endpoint" ]; then
        SELECTED_ADDR="$preset_endpoint"
        SELECTED_CUSTOM=true
        return
    fi

    if [ "$NON_INTERACTIVE" = true ]; then
        if [ ${#IP_LIST[@]} -gt 0 ]; then
            SELECTED_ADDR="${IP_LIST[0]}"
            SELECTED_CUSTOM=false
            return
        fi

        echo "错误: 未检测到可用 IP 地址。请设置 FASTGPT_S3_ENDPOINT 后重试。" >&2
        exit 1
    fi

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

# v4.14 使用旧版 MinIO 下载链路；本地 Compose 则以实际配置决定是否需要外部地址。
NEEDS_S3_EXTERNAL_ENDPOINT=false
if [ "$DEPLOY_VERSION" == "v4.14" ]; then
    NEEDS_S3_EXTERNAL_ENDPOINT=true
elif [ "$DEPLOY_VERSION" == "$LOCAL_DEPLOY_VERSION" ] && LC_ALL=C grep -q "STORAGE_EXTERNAL_ENDPOINT" "$LOCAL_COMPOSE_PATH"; then
    NEEDS_S3_EXTERNAL_ENDPOINT=true
fi

if [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ]; then
    # ========== 6. 选择 S3 访问地址 (端口 9000) ==========
    select_address "请选择 S3 访问地址 - 客户端和容器均需可访问 (↑↓ 选择, 回车确认, 通常默认第一个即可):" 9000 "$FASTGPT_S3_ENDPOINT"
    S3_ADDR="$SELECTED_ADDR"
    S3_CUSTOM=$SELECTED_CUSTOM
fi

# ========== 7. 输入访问地址 ==========
SANDBOX_PROXY_EXPECTED=false
if is_sandbox_proxy_deploy; then
    SANDBOX_PROXY_EXPECTED=true
fi

request_fe_domain
if [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
    request_sandbox_proxy_url
    if ! is_v415_deploy; then
        request_sandbox_preview_proxy_url
    fi
fi

# 访问 URL 与宿主机端口是两个独立配置。仅本机直连 URL 会提供端口作为便利默认值；
# 公网域名（包括 :443）始终保留 Compose 默认端口，避免破坏反向代理上游。
FASTGPT_PORT_EXPLICIT=false
[ -n "$FASTGPT_PORT" ] && FASTGPT_PORT_EXPLICIT=true
FASTGPT_HOST_PORT="$(request_host_port FASTGPT_PORT "FastGPT" "$FE_DOMAIN_INPUT" 3000 "$LOCAL_COMPOSE_PATH" fastgpt-app 3000)" || exit 1

SANDBOX_PROXY_PORT_EXPLICIT=false
[ -n "$FASTGPT_SANDBOX_PROXY_PORT" ] && SANDBOX_PROXY_PORT_EXPLICIT=true
SANDBOX_PROXY_HOST_PORT=""
if [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
    SANDBOX_PROXY_HOST_PORT="$(request_host_port FASTGPT_SANDBOX_PROXY_PORT "Sandbox Proxy" "$SANDBOX_PROXY_URL_INPUT" 3006 "$LOCAL_COMPOSE_PATH" fastgpt-agent-sandbox-proxy 1006)" || exit 1
elif [ "$SANDBOX_PROXY_PORT_EXPLICIT" = true ]; then
    echo "错误: 当前 Compose 未定义 fastgpt-agent-sandbox-proxy，不能设置 FASTGPT_SANDBOX_PROXY_PORT" >&2
    exit 1
fi

# ========== 确认配置 ==========
DEPLOY_VERSION_LABEL="$(get_version_label "$DEPLOY_VERSION")"

REGION_LABEL="阿里云 (中国大陆)"
if [ "$REGION" == "global" ]; then
    REGION_LABEL="GitHub (全球)"
fi

# 构建显示地址
if [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ] && [ -n "$S3_ADDR" ]; then
    if $S3_CUSTOM; then
        S3_DISPLAY="$S3_ADDR"
    else
        S3_DISPLAY="http://$S3_ADDR:9000"
    fi
else
    S3_DISPLAY="未设置"
fi

CREDENTIALS_LABEL="自动生成"
if [ "$AUTO_GENERATE_CREDENTIALS" = false ]; then
    CREDENTIALS_LABEL="不自动生成"
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
if [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ]; then
    echo "  S3 地址:      $S3_DISPLAY"
fi
echo "  FastGPT 地址: $FE_DOMAIN_INPUT"
echo "  FastGPT 宿主端口: $FASTGPT_HOST_PORT -> 容器 3000"
if [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
    echo "  Sandbox WebSocket 地址: $SANDBOX_PROXY_URL_INPUT"
    echo "  Sandbox Proxy 宿主端口: $SANDBOX_PROXY_HOST_PORT -> 容器 1006"
    if ! is_v415_deploy; then
        echo "  Sandbox 预览地址: $SANDBOX_PREVIEW_PROXY_URL_INPUT"
    fi
fi
echo "  密钥处理:     $CREDENTIALS_LABEL"
echo "=============================="
echo "访问 URL 与宿主端口独立；请确认直连地址或反向代理指向上面的实际映射。"
if [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ]; then
    echo "S3 地址需指向 9000 端口。"
fi
echo ""
if [ "$NON_INTERACTIVE" = true ]; then
    echo "非交互模式已自动确认配置"
else
    read -r -p "确认以上配置? (y/n) [y]: " confirm
    if [ "$confirm" == "n" ]; then
        echo "已取消"
        exit 1
    fi
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

# ========== 配置 FastGPT 访问地址 ==========
# 端口只修改对应服务的宿主机一侧，容器间仍使用 3000/1006。
configure_host_port docker-compose.yml fastgpt-app 3000 "$FASTGPT_HOST_PORT" 3000 "$FASTGPT_PORT_EXPLICIT" || exit 1
if [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
    configure_host_port docker-compose.yml fastgpt-agent-sandbox-proxy 1006 "$SANDBOX_PROXY_HOST_PORT" 3006 "$SANDBOX_PROXY_PORT_EXPLICIT" || exit 1
fi

configure_fe_domain
if [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
    configure_sandbox_proxy_urls
fi

# 旧版 Compose 仍挂载 config.json，安装时需要同步下载该文件。
if LC_ALL=C grep -q -- "./config.json:/app/data/config.json" docker-compose.yml; then
    CONFIG_FILE="config.json.tmp"
    if [ "$DEPLOY_VERSION" == "$LOCAL_DEPLOY_VERSION" ]; then
        LOCAL_CONFIG_PATH="$(dirname "$LOCAL_COMPOSE_PATH")/config.json"
        if [ -f "$LOCAL_CONFIG_PATH" ]; then
            cp "$LOCAL_CONFIG_PATH" "$CONFIG_FILE"
            if [ $? -ne 0 ]; then
                echo "错误: 复制本地 config.json 失败: $LOCAL_CONFIG_PATH"
                rm -f "$CONFIG_FILE"
                exit 1
            fi
            validate_config_file "$CONFIG_FILE" "$LOCAL_CONFIG_PATH" true
            mv "$CONFIG_FILE" config.json
            echo "已复制 config.json"
        else
            CONFIG_BASE_URL="${BASE_URL:-${CUSTOM_DEPLOY_BASE_URL:-https://doc.fastgpt.cn/deploy}}"
            CONFIG_URL="${CONFIG_BASE_URL}/config/config.json"
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
    else
        CONFIG_URL="${BASE_URL}/config/config.json"
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
fi

# ========== 随机化默认密钥 ==========
if [ "$AUTO_GENERATE_CREDENTIALS" = true ]; then
    randomize_compose_credentials
    echo "已随机生成 docker-compose.yml 中的登录密码、服务 Token、应用密钥和组件密码"
else
    if LC_ALL=C grep -Eq "x-default-root-psw: &x-default-root-psw ['\"]1234['\"]" docker-compose.yml; then
        ROOT_LOGIN_PASSWORD="1234"
    else
        ROOT_LOGIN_PASSWORD="请查看 docker-compose.yml 中 DEFAULT_ROOT_PSW"
    fi
    echo "已跳过自动生成密钥，请确认 docker-compose.yml 中的默认凭证已手动修改"
fi

# ========== 替换 S3 访问地址 ==========
if [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ] && [ -n "$S3_ADDR" ]; then
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
elif [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ]; then
    echo "警告: 未设置 S3 地址，请手动编辑 docker-compose.yml 中的 http://192.168.0.2:9000"
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
if [ "$AUTO_GENERATE_CREDENTIALS" = true ]; then
    echo "  注意: docker-compose.yml 已随机生成登录密码、服务 Token、应用密钥和组件密码。"
    echo "        请妥善保存该文件，后续升级时不要直接丢失这些凭证。"
else
    echo "  注意: docker-compose.yml 未自动生成登录密码、服务 Token、应用密钥和组件密码。"
    echo "        生产环境启动前请手动修改默认凭证。"
fi
if LC_ALL=C grep -q "opensandbox-agent-sandbox-image" docker-compose.yml; then
    echo "  1. 预拉取镜像: docker compose --profile prepull pull"
    echo "  2. 启动服务:   docker compose up -d"
    if [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ] && [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
        echo "  3. 网络配置:   FastGPT、Sandbox Proxy、S3 请按上方映射配置防火墙或反向代理"
    elif [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ]; then
        echo "  3. 网络配置:   FastGPT、S3 请按上方映射配置防火墙或反向代理"
    elif [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
        echo "  3. 网络配置:   FastGPT、Sandbox Proxy 请按上方映射配置防火墙或反向代理"
    else
        echo "  3. 网络配置:   FastGPT 请按上方映射配置防火墙或反向代理"
    fi
    echo "  4. 访问服务:   $FE_DOMAIN_INPUT"
    echo "  5. 登录服务:   默认账号为 'root', 密码为: '$ROOT_LOGIN_PASSWORD'"
    echo "  6. 配置模型:   在 '账号-模型提供商' 页面，进行模型配置"
else
    echo "  1. 预拉取镜像: docker compose pull"
    echo "  2. 启动服务:   docker compose up -d"
    if [ "$NEEDS_S3_EXTERNAL_ENDPOINT" = true ]; then
        echo "  3. 网络配置:   FastGPT、S3 请按上方映射配置防火墙或反向代理"
    else
        echo "  3. 网络配置:   FastGPT 请按上方映射配置防火墙或反向代理"
    fi
    echo "  4. 访问服务:   $FE_DOMAIN_INPUT"
    echo "  5. 登录服务:   默认账号为 'root', 密码为: '$ROOT_LOGIN_PASSWORD'"
    echo "  6. 配置模型:   在 '账号-模型提供商' 页面，进行模型配置"
fi
echo ""
print_host_port docker-compose.yml fastgpt-app 3000 "FastGPT"
if [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
    print_host_port docker-compose.yml fastgpt-agent-sandbox-proxy 1006 "Sandbox Proxy"
fi
if [ "$SANDBOX_PROXY_EXPECTED" = true ]; then
    echo "Sandbox WebSocket 地址: $SANDBOX_PROXY_URL_INPUT"
fi
if [ "$SANDBOX_PROXY_EXPECTED" = true ] && ! is_v415_deploy; then
    echo "Sandbox 预览地址: $SANDBOX_PREVIEW_PROXY_URL_INPUT"
fi
echo "直连时按实际宿主机映射放行端口；使用反向代理时，公网端口由代理负责。"
echo ""
echo "详细文档: https://doc.fastgpt.cn/self-host/deploy/docker"
