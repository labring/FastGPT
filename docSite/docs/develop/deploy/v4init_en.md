# V4 Version Initialization

The new version of the Mongo tables has undergone significant changes, and several initialization scripts need to be executed.

## Renaming Table Names

You'll need to connect to the Mongo database and execute two commands:

1. `db.models.renameCollection("apps")`
2. `db.sharechats.renameCollection("outlinks")`

If you've already updated and deployed, Mongo will automatically create empty tables. You'll need to manually delete these two empty tables.

## Initializing Fields in Several Tables

Execute the following 3 commands in sequence. These commands may take some time to execute, and if they are not successful, you can repeat them (the commands will skip already initialized data) until all data updates are completed.

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

## Executing Initialization APIs

Deploy the new version of the project and initiate 3 HTTP requests (remember to include `headers.rootkey`, which is a value from your environment variables):

1. https://xxxxx/api/admin/initv4
2. https://xxxxx/api/admin/initChat
3. https://xxxxx/api/admin/initOutlink

For steps 1 and 2, if they fail due to insufficient memory, you can retry them.