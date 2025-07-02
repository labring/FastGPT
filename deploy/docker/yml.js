const fs = require('fs')
const path = require('path')

const template = `# 数据库的默认账号和密码仅首次运行时设置有效
# 如果修改了账号密码，记得改数据库和项目连接参数，别只改一处~
# 该配置文件只是给快速启动，测试使用。正式使用，记得务必修改账号密码，以及调整合适的知识库参数，共享内存等。
# 如何无法访问 dockerhub 和 git，可以用阿里云（阿里云没有arm包）

version: '3.3'
services:
  # Vector DB
  {{Vector_DB_Service}}

  # DB
  mongo:
    image: mongo:5.0.18 # dockerhub
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/mongo:5.0.18 # 阿里云
    # image: mongo:4.4.29 # cpu不支持AVX时候使用
    container_name: mongo
    restart: always
    networks:
      - fastgpt
    command: mongod --keyFile /data/mongodb.key --replSet rs0
    environment:
      - MONGO_INITDB_ROOT_USERNAME=myusername
      - MONGO_INITDB_ROOT_PASSWORD=mypassword
    volumes:
      - ./mongo/data:/data/db
    entrypoint:
      - bash
      - -c
      - |
        openssl rand -base64 128 > /data/mongodb.key
        chmod 400 /data/mongodb.key
        chown 999:999 /data/mongodb.key
        echo 'const isInited = rs.status().ok === 1
        if(!isInited){
          rs.initiate({
              _id: "rs0",
              members: [
                  { _id: 0, host: "mongo:27017" }
              ]
          })
        }' > /data/initReplicaSet.js
        # 启动MongoDB服务
        exec docker-entrypoint.sh "$$@" &

        # 等待MongoDB服务启动
        until mongo -u myusername -p mypassword --authenticationDatabase admin --eval "print('waited for connection')"; do
          echo "Waiting for MongoDB to start..."
          sleep 2
        done

        # 执行初始化副本集的脚本
        mongo -u myusername -p mypassword --authenticationDatabase admin /data/initReplicaSet.js

        # 等待docker-entrypoint.sh脚本执行的MongoDB服务进程
        wait $$!
  redis:
    image: redis:7.2-alpine
    container_name: redis
    networks:
      - fastgpt
    restart: always
    command: |
      redis-server --requirepass mypassword --loglevel warning --maxclients 10000 --appendonly yes --save 60 10 --maxmemory 4gb --maxmemory-policy noeviction
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', 'mypassword', 'ping']
      interval: 10s
      timeout: 3s
      retries: 3
      start_period: 30s
    volumes:
      - ./redis/data:/data
  fastgpt-minio:
    image: minio/minio:latest
    container_name: fastgpt-minio
    restart: always
    networks:
      - fastgpt
    ports: # comment out if you do not need to expose the port (in production environment, you should not expose the port)
      - '9000:9000'
      - '9001:9001'
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - ./fastgpt-minio:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
      timeout: 20s
      retries: 3

  fastgpt:
    container_name: fastgpt
    image: ghcr.io/labring/fastgpt:v4.10.0-alpha # git
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.9.14 # 阿里云
    ports:
      - 3000:3000
    networks:
      - fastgpt
    depends_on:
      - mongo
      - sandbox
      {{Vector_DB_Depends}}
    restart: always
    environment:
      # 前端外部可访问的地址，用于自动补全文件资源路径。例如 https:fastgpt.cn，不能填 localhost。这个值可以不填，不填则发给模型的图片会是一个相对路径，而不是全路径，模型可能伪造Host。
      - FE_DOMAIN=
      # root 密码，用户名为: root。如果需要修改 root 密码，直接修改这个环境变量，并重启即可。
      - DEFAULT_ROOT_PSW=1234
      # 登录凭证密钥
      - TOKEN_KEY=any
      # root的密钥，常用于升级时候的初始化请求
      - ROOT_KEY=root_key
      # 文件阅读加密
      - FILE_TOKEN_KEY=filetoken
      # 密钥加密key
      - AES256_SECRET_KEY=fastgptkey

      # plugin 地址
      - PLUGIN_BASE_URL=http://fastgpt-plugin:3000
      - PLUGIN_TOKEN=xxxxxx
      # sandbox 地址
      - SANDBOX_URL=http://sandbox:3000
      # AI Proxy 的地址，如果配了该地址，优先使用
      - AIPROXY_API_ENDPOINT=http://aiproxy:3000
      # AI Proxy 的 Admin Token，与 AI Proxy 中的环境变量 ADMIN_KEY
      - AIPROXY_API_TOKEN=aiproxy
      
      # 数据库最大连接数
      - DB_MAX_LINK=30
      # MongoDB 连接参数. 用户名myusername,密码mypassword。
      - MONGODB_URI=mongodb://myusername:mypassword@mongo:27017/fastgpt?authSource=admin
      # Redis 连接参数
      - REDIS_URL=redis://default:mypassword@redis:6379
      # 向量库 连接参数
      {{Vector_DB_ENV}}

      # 日志等级: debug, info, warn, error
      - LOG_LEVEL=info
      - STORE_LOG_LEVEL=warn
      # 工作流最大运行次数
      - WORKFLOW_MAX_RUN_TIMES=1000
      # 批量执行节点，最大输入长度
      - WORKFLOW_MAX_LOOP_TIMES=100
      # 对话文件过期天数
      - CHAT_FILE_EXPIRE_TIME=7
    volumes:
      - ./config.json:/app/data/config.json
  # fastgpt
  sandbox:
    container_name: sandbox
    image: ghcr.io/labring/fastgpt-sandbox:v4.9.14 # git
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-sandbox:v4.9.14 # 阿里云
    networks:
      - fastgpt
    restart: always
  fastgpt-mcp-server:
    container_name: fastgpt-mcp-server
    image: ghcr.io/labring/fastgpt-mcp_server:v4.9.14 # git
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-mcp_server:v4.9.14 # 阿里云
    ports:
      - 3005:3000
    networks:
      - fastgpt
    restart: always
    environment:
      - FASTGPT_ENDPOINT=http://fastgpt:3000
  # fastgpt-plugin
  fastgpt-plugin:
    image: ghcr.io/labring/fastgpt-plugin:v0.0.1 # git
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-plugin:v0.0.1 # 阿里云
    container_name: fastgpt-plugin
    restart: always
    networks:
      - fastgpt
    environment:
      - AUTH_TOKEN=xxxxxx # disable authentication token if you do not set this variable
      # 改成 minio 公网地址
      - MINIO_HOST=ip:9000
      - MINIO_PORT=9000
      - MINIO_USE_SSL=false
      - MINIO_ACCESS_KEY=minioadmin
      - MINIO_SECRET_KEY=minioadmin
      - MINIO_BUCKET=fastgpt-plugins
    depends_on:
      fastgpt-minio:
        condition: service_healthy

  # AI Proxy
  aiproxy:
    image: ghcr.io/labring/aiproxy:v0.1.7
    # image: registry.cn-hangzhou.aliyuncs.com/labring/aiproxy:v0.1.7 # 阿里云
    container_name: aiproxy
    restart: unless-stopped
    depends_on:
      aiproxy_pg:
        condition: service_healthy
    networks:
      - fastgpt
    environment:
      # 对应 fastgpt 里的AIPROXY_API_TOKEN
      - ADMIN_KEY=aiproxy
      # 错误日志详情保存时间（小时）
      - LOG_DETAIL_STORAGE_HOURS=1
      # 数据库连接地址
      - SQL_DSN=postgres://postgres:aiproxy@aiproxy_pg:5432/aiproxy
      # 最大重试次数
      - RETRY_TIMES=3
      # 不需要计费
      - BILLING_ENABLED=false
      # 不需要严格检测模型
      - DISABLE_MODEL_CONFIG=true
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/api/status']
      interval: 5s
      timeout: 5s
      retries: 10
  aiproxy_pg:
    image: pgvector/pgvector:0.8.0-pg15 # docker hub
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/pgvector:v0.8.0-pg15 # 阿里云
    restart: unless-stopped
    container_name: aiproxy_pg
    volumes:
      - ./aiproxy_pg:/var/lib/postgresql/data
    networks:
      - fastgpt
    environment:
      TZ: Asia/Shanghai
      POSTGRES_USER: postgres
      POSTGRES_DB: aiproxy
      POSTGRES_PASSWORD: aiproxy
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'postgres', '-d', 'aiproxy']
      interval: 5s
      timeout: 5s
      retries: 10
networks:
  fastgpt:
`

const list = [
  {
    filename: "./docker-compose-pgvector.yml",
    depends: `- pg`,
    service: `pg:
    image: pgvector/pgvector:0.8.0-pg15 # docker hub
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/pgvector:v0.8.0-pg15 # 阿里云
    container_name: pg
    restart: always
    # ports: # 生产环境建议不要暴露
    #   - 5432:5432
    networks:
      - fastgpt
    environment:
      # 这里的配置只有首次运行生效。修改后，重启镜像是不会生效的。需要把持久化数据删除再重启，才有效果
      - POSTGRES_USER=username
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=postgres
    volumes:
      - ./pg/data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'username', '-d', 'postgres']
      interval: 5s
      timeout: 5s
      retries: 10`,
    env: `- PG_URL=postgresql://username:password@pg:5432/postgres`
  },
  {
    filename: "./docker-compose-zilliz.yml",
    depends: ``,
    service: ``,
    env: `# zilliz 连接参数
      - MILVUS_ADDRESS=zilliz_cloud_address
      - MILVUS_TOKEN=zilliz_cloud_token`
  },
  {
    filename: "./docker-compose-milvus.yml",
    depends: `- milvusStandalone`,
    service: `milvus-minio:
    container_name: milvus-minio
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    environment:
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    ports:
      - '9001:9001'
      - '9000:9000'
    networks:
      - fastgpt
    volumes:
      - ./milvus-minio:/minio_data
    command: minio server /minio_data --console-address ":9001"
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
      timeout: 20s
      retries: 3
  # milvus
  milvusEtcd:
    container_name: milvusEtcd
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
      - ETCD_QUOTA_BACKEND_BYTES=4294967296
      - ETCD_SNAPSHOT_COUNT=50000
    networks:
      - fastgpt
    volumes:
      - ./milvus/etcd:/etcd
    command: etcd -advertise-client-urls=http://127.0.0.1:2379 -listen-client-urls http://0.0.0.0:2379 --data-dir /etcd
    healthcheck:
      test: ['CMD', 'etcdctl', 'endpoint', 'health']
      interval: 30s
      timeout: 20s
      retries: 3
  milvusStandalone:
    container_name: milvusStandalone
    image: milvusdb/milvus:v2.4.3
    command: ['milvus', 'run', 'standalone']
    security_opt:
      - seccomp:unconfined
    environment:
      ETCD_ENDPOINTS: milvusEtcd:2379
      MINIO_ADDRESS: milvus-minio:9000
    networks:
      - fastgpt
    volumes:
      - ./milvus/data:/var/lib/milvus
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9091/healthz']
      interval: 30s
      start_period: 90s
      timeout: 20s
      retries: 3
    depends_on:
      - 'milvusEtcd'
      - 'milvus-minio'`,
    env: `- MILVUS_ADDRESS=http://milvusStandalone:19530
      - MILVUS_TOKEN=none`
  },
  {
    filename: "./docker-compose-oceanbase/docker-compose.yml",
    depends: `- ob`,
    service: `ob:
    image: oceanbase/oceanbase-ce:4.3.5-lts # docker hub
    # image: quay.io/oceanbase/oceanbase-ce:4.3.5-lts # 镜像
    container_name: ob
    restart: always
    # ports: # 生产环境建议不要暴露
    #   - 2881:2881
    networks:
      - fastgpt
    environment:
      # 这里的配置只有首次运行生效。修改后，重启镜像是不会生效的。需要把持久化数据删除再重启，才有效果
      - OB_SYS_PASSWORD=obsyspassword
      # 不同于传统数据库，OceanBase 数据库的账号包含更多字段，包括用户名、租户名和集群名。经典格式为"用户名@租户名#集群名"
      # 比如用mysql客户端连接时，根据本文件的默认配置，应该指定 "-uroot@tenantname"
      - OB_TENANT_NAME=tenantname
      - OB_TENANT_PASSWORD=tenantpassword
      # MODE分为MINI和NORMAL， 后者会最大程度使用主机资源
      - MODE=MINI
      - OB_SERVER_IP=127.0.0.1
      # 更多环境变量配置见oceanbase官方文档： https://www.oceanbase.com/docs/common-oceanbase-database-cn-1000000002013494
    volumes:
      - ./ob/data:/root/ob
      - ./ob/config:/root/.obd/cluster
      - ./init.sql:/root/boot/init.d/init.sql
    healthcheck:
      # obclient -h127.0.0.1 -P2881 -uroot@tenantname -ptenantpassword -e "SELECT 1;"
      test:
        [
          'CMD-SHELL',
          'obclient -h\$\$\$\${OB_SERVER_IP} -P2881 -uroot@\$\$\$\${OB_TENANT_NAME} -p\$\$\$\${OB_TENANT_PASSWORD} -e "SELECT 1;"'
        ]
      interval: 30s
      timeout: 10s
      retries: 1000
      start_period: 10s`,
    env: `- OCEANBASE_URL=mysql://root%40tenantname:tenantpassword@ob:2881/test`
  }
]

list.forEach(item => {
  const { filename, service, env, depends } = item
  const content = template.replace("{{Vector_DB_Service}}", service).replace("{{Vector_DB_ENV}}", env).replace("{{Vector_DB_Depends}}", depends)
  fs.writeFileSync(path.join(__dirname, filename), content, 'utf-8')
})