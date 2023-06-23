# FastGpt Admin

## 项目原理

使用 [Tushan](https://tushan.msgbyte.com/) 项目做前端，然后构造了一个与 mongodb 做沟通的 API 做后端，可以做到创建、修改和删除用户

## 开发

1. `cp .env.template .env.local`: 复制 .env.template 文件，添加环境变量
2. `pnpm i`
3. `pnpm dev`
4. 打开 `http://localhost:5173/` 访问前端页面

## 部署

1. 本地打包

`docker build -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin:latest . --network host  --build-arg HTTP_PROXY=http://127.0.0.1:7890 --build-arg HTTPS_PROXY=http://127.0.0.1:7890`

2. 直接拉镜像: `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin:latest`
3. 部署时候填写环境变量: 数据库同 FastGpt 一致

```
MONGODB_URI=mongodb://username:psw@0.0.0.0:27017/?authSource=admin
MONGODB_NAME=fastgpt
ADMIN_USER=username
ADMIN_PASS=password
ADMIN_SECRET=any
PARENT_URL=http://localhost:3000
PARENT_ROOT_KEY=rootkey
```

## sealos 部署

1. 进入 sealos 官网: https://cloud.sealos.io/
2. 打开 App Launchpad(应用管理) 工具
3. 新建应用
   1. 镜像名: `registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt-admin:latest`
   2. 容器端口: 3001
   3. 环境变量: 参考上面
   4. 打开外网访问开关
4. 点击部署。 完成后大约等待 1 分钟，
5. 点击 sealos 提供的外网访问地址，可以直接访问。
