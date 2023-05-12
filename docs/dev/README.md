# FastGpt 本地开发

第一次开发，请先[部署教程](../deploy/docker.md)，需要部署数据库.

## 环境变量配置

复制.env.template 文件，生成一个.env.local 环境变量文件夹，修改.env.local 里内容。

```bash
# proxy（可选）
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT=7890
# openai 中转连接（可选）
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_BASE_URL_AUTH=可选的安全凭证
# 是否开启队列任务。 1-开启，0-关闭（请求 parentUrl 去执行任务,单机时直接填1）
queueTask=1
parentUrl=https://hostname/api/openapi/startEvents
# 发送邮箱验证码配置。用的是 QQ 邮箱。参考 nodeMail 获取MAILE_CODE，自行百度。
MY_MAIL=xxxx@qq.com
MAILE_CODE=xxxx
# 阿里短信服务（邮箱和短信至少二选一）
aliAccessKeyId=xxxx
aliAccessKeySecret=xxxx
aliSignName=xxxxx
aliTemplateCode=SMS_xxxx
# token加密凭证（随便填，作为登录凭证）
TOKEN_KEY=xxxx
queueTask=1
parentUrl=https://hostname/api/openapi/startEvents
# 和mongo镜像的username,password对应
MONGODB_URI=mongodb://username:passsword@0.0.0.0:27017/?authSource=admin
MONGODB_NAME=xxx
PG_HOST=0.0.0.0
PG_PORT=8100
# 和PG镜像对应.
PG_USER=fastgpt # POSTGRES_USER
PG_PASSWORD=1234 # POSTGRES_PASSWORD
PG_DB_NAME=fastgpt # POSTGRES_DB
OPENAIKEY=sk-xxxxx
```

## 运行

```
pnpm dev
```
