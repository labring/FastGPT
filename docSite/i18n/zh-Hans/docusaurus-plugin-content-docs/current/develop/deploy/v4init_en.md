# V4 Version Initialization

The new version of MongoDB tables has undergone several changes, and you need to perform some initialization scripts.

## Rename Table Names

You need to connect to the MongoDB database and execute two commands:

1. `db.models.renameCollection("apps")`
2. `db.sharechats.renameCollection("outlinks")`

If you have already updated and deployed, MongoDB will automatically create empty tables. You need to manually delete these two empty tables.

## Initialize Fields in Several Tables

Execute the following 3 commands one by one. The process might take some time. If it doesn't succeed, you can repeat the execution (it will skip the already initialized data) until all data updates are completed.

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

## Execute Initialization APIs

Deploy the new version of the project and make 3 HTTP requests (remember to include the `headers.rootkey` value, which is in the environment variables).

1. `https://xxxxx/api/admin/initv4`
2. `https://xxxxx/api/admin/initChat`
3. `https://xxxxx/api/admin/initOutlink`

For steps 1 and 2, if they fail due to insufficient memory, you can repeat the execution.