# Quick Deployment with docker-compose

## Step 1: Preparations

### 1. Set Up Proxy Environment (Optional for Foreign Servers)

Ensure access to OpenAI is possible. You can refer to [sealos nginx proxy](../proxy/sealos) for a solution.

### 2. OneAPI (Optional, Needed for Multi-Model and Key Rotation)

It's recommended to use the [one-api](https://github.com/songquanpeng/one-api) project for managing key pools, compatible with OpenAI, Microsoft, and mainstream domestic models.

For deployment, you can follow the instructions in the project's [README.md](https://github.com/songquanpeng/one-api), or refer to [Deploying one-api in 1 Minute with Sealos](../oneapi).

## Step 2: Install docker and docker-compose

The installation process might differ slightly based on your operating system. Install docker and docker-compose, and make sure the installations are successful before proceeding. Here's an example for CentOS:

```bash
# Install Docker
curl -L https://get.daocloud.io/docker | sh
sudo systemctl start docker

# Install docker-compose
curl -L https://github.com/docker/compose/releases/download/1.23.2/docker-compose-`uname -s`-`uname -m` -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker -v
docker-compose -v
```

## Step 3: Create docker-compose.yml File

Create a `docker-compose.yml` file in any directory of your choice and paste the content below. Modify the three parameters of the `fastgpt` container to start the deployment.

```yml
version: '3.3'
services:
  pg:
    image: ankane/pgvector:v0.4.2 # git
    container_name: pg
    restart: always
    ports:
      - 5432:5432
    networks:
      - fastgpt
    environment:
      - POSTGRES_USER=username
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=postgres
    volumes:
      - ./pg/data:/var/lib/postgresql/data
  mongo:
    image: mongo:5.0.18
    container_name: mongo
    restart: always
    ports:
      - 27017:27017
    networks:
      - fastgpt
    environment:
      - MONGO_INITDB_ROOT_USERNAME=username
      - MONGO_INITDB_ROOT_PASSWORD=password
    volumes:
      - ./mongo/data:/data/db
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
      - DEFAULT_ROOT_PSW=1234
      - OPENAI_BASE_URL=https://api.openai.com/v1
      - CHAT_API_KEY=sk-xxxx
      - DB_MAX_LINK=5
      - TOKEN_KEY=any
      - ROOT_KEY=root_key
      - MONGODB_URI=mongodb://username:password@mongo:27017/?authSource=admin
      - MONGODB_NAME=fastgpt
      - PG_HOST=pg
      - PG_PORT=5432
      - PG_USER=username
      - PG_PASSWORD=password
      - PG_DB_NAME=postgres
networks:
  fastgpt:
```

## Step 4: Run docker-compose

Run the following command in the same directory as the `docker-compose.yml` file:

```bash
docker-compose up -d
```

## Step 5: Access

If you need domain-based access, install Nginx. For now, you can access the application via `ip:3000` (make sure to check your firewall settings). The login username is "root," and the password is the one you set in the environment variables.

## Common Questions

### 1. How to update?

Executing `docker-compose up -d` will automatically pull the latest image. In most cases, no additional steps are needed.

### 2. Mounting configuration files

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

Modify the content of the `fastgpt` container in `docker-compose.yml` to include the mounting. For specific configuration details, refer to [Config Configuration Explanation](/docs/category/data-config).

```yml
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
    - DEFAULT_ROOT_PSW=1234
  volumes:
    - ./config.json:/app/data/config.json
```

By following these steps, you should be able to quickly deploy FastGPT using docker-compose. Keep in mind that these instructions provide a simplified guide and might need adjustments based on your specific environment and requirements.