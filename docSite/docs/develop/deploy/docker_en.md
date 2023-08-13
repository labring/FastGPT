# Quick Deployment with Docker Compose

## Step 1: Preparing in Advance

### 1. Set Up Proxy Environment (Ignore if Using Foreign Servers)

Ensure that you can access OpenAI. You can refer to the scheme here: [sealos nginx proxy](../proxy/sealos)

### 2. OneAPI (Optional, for Multiple Models and Key Rotation)

It's recommended to use the [one-api](https://github.com/songquanpeng/one-api) project to manage the key pool, which supports OpenAI, Microsoft, and popular domestic models.

For deployment, you can refer to the project's [README.md](https://github.com/songquanpeng/one-api), or you can see [Deploying one-api on Sealos in 1 Minute](../oneapi)

## Step 2: Install Docker and Docker Compose

The installation steps slightly vary depending on the operating system. You can search for installation methods online. Once installation is successful, proceed to the next step. Here's an example for CentOS:

```bash
# Install Docker
curl -L https://get.daocloud.io/docker | sh
sudo systemctl start docker

# Install Docker Compose
curl -L https://github.com/docker/compose/releases/download/1.29.2/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker -v
docker-compose -v
```

## Step 3: Create docker-compose.yml File

Create a `docker-compose.yml` file in any directory and paste the content below. Modify the parameters of the `fastgpt` container to start the deployment.

```yaml
# Non-host version, without using local proxy
version: '3.3'
services:
  pg:
    image: ankane/pgvector:v0.4.2 # git
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/pgvector:v0.4.2 # Alibaba Cloud
    container_name: pg
    restart: always
    ports: # Consider not exposing in production
      - 5432:5432
    networks:
      - fastgpt
    environment:
      # These configurations only take effect on the first run. After modification, you need to delete the persistent data before restarting for changes to take effect.
      - POSTGRES_USER=username
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=postgres
    volumes:
      - ./pg/data:/var/lib/postgresql/data
  mongo:
    image: mongo:5.0.18
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/mongo:5.0.18 # Alibaba Cloud
    container_name: mongo
    restart: always
    ports: # Consider not exposing in production
      - 27017:27017
    networks:
      - fastgpt
    environment:
      # These configurations only take effect on the first run. After modification, you need to delete the persistent data before restarting for changes to take effect.
      - MONGO_INITDB_ROOT_USERNAME=username
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - ./mongo/data:/data/db
  fastgpt:
    container_name: fastgpt
    # image: c121914yu/fast-gpt:latest # Docker Hub
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:latest # Alibaba Cloud
    ports:
      - 3000:3000
    networks:
      - fastgpt
    depends_on:
      - mongo
      - pg
    restart: always
    environment:
      # Root password, username: root
      - DEFAULT_ROOT_PSW=1234
      # Transfer URL, not needed if using official account
      - OPENAI_BASE_URL=https://api.openai.com/v1
      - CHAT_API_KEY=sk-xxxx
      - DB_MAX_LINK=5 # Database max link
      - TOKEN_KEY=any
      - ROOT_KEY=root_key
      # MongoDB configuration, no need to modify
      - MONGODB_URI=mongodb://username:password@mongo:27017/?authSource=admin
      - MONGODB_NAME=fastgpt
      # pg configuration.
      - PG_HOST=pg
      - PG_PORT=5432
      - PG_USER=username
      - PG_PASSWORD=password
      - PG_DB_NAME=postgres

networks:
  fastgpt:
```

```yaml
# Host version, not recommended.
version: '3.3'
services:
  pg:
    image: ankane/pgvector:v0.4.2 # Docker Hub
    # image: registry.cn-hangzhou.aliyuncs.com/fastgpt/pgvector:v0.4.2 # Alibaba Cloud
    container_name: pg
    restart: always
    ports: # Consider not exposing in production
      - 5432:5432
    environment:
      # These configurations only take effect on the first run. After modification, you need to delete the persistent data before restarting for changes to take effect.
      - POSTGRES_USER=username
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=postgres
    volumes:
      - ./pg/data:/var/lib/postgresql/data
  mongo:
    image: mongo:5.0.18
    container_name: mongo
    restart: always
    ports: # Consider not exposing in production
      - 27017:27017
    environment:
      # These configurations only take effect on the first run. After modification, you need to delete the persistent data before restarting for changes to take effect.
      - MONGO_INITDB_ROOT_USERNAME=username
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - ./mongo/data:/data/db
      - ./mongo/logs:/var/log/mongodb
  fastgpt:
    image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:latest # Alibaba Cloud
    network_mode: host
    restart: always
    container_name: fastgpt
    environment:
      # Root password, username: root
      - DEFAULT_ROOT_PSW=1234
      # Transfer URL, not needed if using official account
      - OPENAI_BASE_URL=https://api.openai.com/v1
      - CHAT_API_KEY=sk-xxxx
      - DB_MAX_LINK=5 # Database max link
      # Token encryption key (fill in anything, used as login credential)
      - TOKEN_KEY=any
      # Root key, highest privilege, can call internal APIs
      - ROOT_KEY=root_key
      # MongoDB configuration, no need to modify
      - MONGODB_URI=mongodb://username:password@0.0.0.0:27017/?authSource=admin
      - MONGODB_NAME=fastgpt
      # pg configuration
      - PG_HOST=0.0.0.0
      - PG_PORT=5432
      - PG_USER=username
      - PG_PASSWORD=password
      - PG_DB_NAME=postgres
```

## Step 4: Run Docker Compose

```bash
# Execute in the same directory as docker-compose.yml
docker-compose up -d
```

## Step 5: Access

If you need to access via a domain name, install Nginx on your own. Currently, you can directly access it through `ip:3000` (make sure to configure firewall rules). The login username is "root," and the password is the one you set for the `DEFAULT_ROOT_PSW` environment variable.

## Some Questions

### 1. How to Update?

Running `docker-compose up -d` will automatically pull the latest image. In general cases, you don't need to perform any additional actions.

### 2. Mounting Configuration Files

Create a `config.json` file in the same directory as `docker-compose.yml` with the following content:

```json
{
  "FeConfig": {
    "show_emptyChat": true,
    "show_register": false,
    "show_appStore": false,
    "show_userDetail": false,
    "show_git": true,
    "systemTitle": "FastGPT",
    "authorText": "Made by FastGPT Team.",
    "gitLoginKey": "",
    "scripts": []
  },
  "SystemParams": {
    "gitLoginSecret": "",
    "vectorMaxProcess": 15,
    "qaMaxProcess": 15,
    "pgIvfflatProbe": 20
  },
  "plugins": {},
  "ChatModels": [
    {
      "model": "gpt-3.5-turbo",
      "name": "GPT35-4k",
      "contextMaxToken": 4000,
      "quoteMaxToken": 2000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
    },
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "contextMaxToken": 16000,
      "quoteMaxToken": 8000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
    },
    {
      "model": "gpt-4",
      "name": "GPT4-8k",
      "contextMaxToken": 8000,
      "quoteMaxToken": 4000,
      "maxTemperature": 1.2,
      "price": 0,
      "defaultSystem": ""
    }
  ],
  "QAModels": [
    {
      "model": "gpt-3.5-turbo-16k",
      "name": "GPT35-16k",
      "maxToken": 16000,
      "price": 0
    }
  ],
  "VectorModels": [
    {
      "model": "text-embedding-ada-002",
      "name": "Embedding-2",
      "price": 0
    }
  ]
}
```

Modify the content of the `fastgpt` container in `docker-compose.yml` to include the mounting. You can refer to the [config configuration documentation](/docs/category/data-config) for more details.

```yaml
fastgpt:
  container_name: fastgpt
  image: registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:latest # Alibaba Cloud
  ports:
    - 3000:3000
  networks:
    - fastgpt
  depends_on:
    - mongo
    - pg
  restart: always
  environment:
    # Root password, username: root
    - DEFAULT_ROOT_PSW=1234
  volumes:
    - ./config.json:/app/data/config.json
```

