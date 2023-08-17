# V4.1 版本初始化

新版重新设置了对话存储结构，需要初始化原来的存储内容

## 更新环境变量

优化了 PG 和 Mongo 的连接变量，只需要 1 个 url 即可。

```
MONGODB_URI=mongodb://username:password@0.0.0.0:27017/fastgpt
PG_URL=postgresql://username:password@0.0.0.0:5432/postgres
```

## 执行初始化 API

部署新版项目，并发起 3 个 HTTP 请求（记得携带 headers.rootkey，这个值是环境变量里的）

https://xxxxx/api/admin/initChatItem
