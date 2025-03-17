# webcrawler
## docker版快速部署

## 代码版部署
0. 按照 https://github.com/searxng/searxng-docker 的方式处理docker
1. 参考SPIDER文件夹下的.env.example，添加.env文件
2. 进入SPIDER文件夹进行pnpm install
3. 回到根目录，运行docker compose up -d

## 代码版开发
1. 将docker-compose.yml中与SPIDER相关的部分注释掉（nodeapp）
2. .env文件中的URL参照注释修改
3. 注释掉启动puppteer部分里面指定浏览器地址的代码
4. pnpm run dev


## 测试样例：
Auth的Bear Token记得填,也就是.env里的ACCESS_TOKEN

### 读取单页面(content以HTML形式返回)
```
http://localhost:3000/api/read?queryUrl=<url>
```

返回结构
```json

{
    "status": 200,
    "data": {
        "title": "something here",
        "content": "something here"
    }
}
{
    "status": 400,
    "error": {
        "code": "MISSING_PARAM",
        "message": "缺少必要参数: query"
    }
}
```

### 搜索(content以HTML形式返回)
```
http://localhost:3000/api/search?query=<something>&pageCount=5&needDetails=true&engine=baidu
```

```json
{
    "status": 200,
    "data": {
        "results": [
            {
                "title": "string",
                "url": "string",
                "snippet": "string",
                "source": "string",
                "crawlStatus": "string",
                "score": 0,
                "content": "string"
            }
        ]
    }
}
{
    "status": 400,
    "error": {
        "code": "MISSING_PARAM",
        "message": "缺少必要参数: query"
    }
}
```