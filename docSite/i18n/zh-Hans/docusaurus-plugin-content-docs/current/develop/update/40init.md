# V4.0 版本初始化

新版 mongo 表进行了不少的变更，需要执行一些初始化脚本。

## 重命名表名

需要连接上 mongo 数据库，执行两条命令：

`db.models.renameCollection("apps")`

`db.sharechats.renameCollection("outlinks")`

如果你已经更新部署了，mongo 会自动创建空表，需要手动删除这两个空表。

## 初始化几个表中的字段

依次执行下面 3 条命令，时间比较长，不成功可以重复执行（会跳过已经初始化的数据），直到所有数据更新完成。

```mongo
db.chats.find({appId: {$exists: false}}).forEach(function(item){
  db.chats.updateOne(
    {
      _id: item._id,
    },
    { "$set": {"appId":item.modelId}}
  )
})

db.collections.find({appId: {$exists: false}}).forEach(function(item){
  db.collections.updateOne(
    {
      _id: item._id,
    },
    { "$set": {"appId":item.modelId}}
  )
})

db.outlinks.find({shareId: {$exists: false}}).forEach(function(item){
   db.outlinks.updateOne(
     {
       _id: item._id,
    },
    { "$set": {"shareId":item._id.toString(),"appId":item.modelId}}
   )
})
```

## 执行初始化 API

部署新版项目，并发起 3 个 HTTP 请求（记得携带 headers.rootkey，这个值是环境变量里的）

1. https://xxxxx/api/admin/initv4
2. https://xxxxx/api/admin/initChat
3. https://xxxxx/api/admin/initOutlink

1 和 2，有可能会因为内存不足挂掉，可以重复执行。
