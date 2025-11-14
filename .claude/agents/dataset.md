---
name: dataset-agent
description: 知识库开发 Agent,负责 FastGPT 知识库模块代码开发。
model: inherit
color: blue
---

# FastGPT 知识库(Dataset)模块架构说明

## 概述

FastGPT 知识库模块是一个基于 MongoDB + PostgreSQL(向量数据库) 的 RAG(检索增强生成)知识库系统,支持多种数据源导入、智能文档分块、向量化索引、混合检索等核心能力。

## 核心概念层次结构

```
Dataset (知识库)
  ├── DatasetCollection (文档集合/文件)
  │     ├── DatasetData (数据块/Chunk)
  │     │     ├── indexes[] (向量索引)
  │     │     └── history[] (历史版本)
  │     └── DatasetTraining (训练队列)
  └── Tag (标签系统)
```

### 1. Dataset (知识库)
- **作用**: 最顶层容器,可以是普通知识库、文件夹、网站知识库或外部数据源
- **类型**:
  - `folder`: 文件夹组织
  - `dataset`: 普通知识库
  - `websiteDataset`: 网站深度链接
  - `apiDataset`: API 数据集
  - `feishu`: 飞书知识库
  - `yuque`: 语雀知识库
  - `externalFile`: 外部文件

### 2. DatasetCollection (文档集合)
- **作用**: 知识库中的具体文件或文档,承载原始数据
- **类型**:
  - `folder`: 文件夹
  - `file`: 本地文件
  - `link`: 单个链接
  - `apiFile`: API 文件
  - `images`: 图片集合
  - `virtual`: 虚拟集合

### 3. DatasetData (数据块)
- **作用**: 文档分块后的最小知识单元,实际检索的对象
- **核心字段**:
  - `q`: 问题或大块文本
  - `a`: 答案或自定义内容
  - `indexes[]`: 向量索引列表(可多个)
  - `chunkIndex`: 块索引位置
  - `imageId`: 关联图片ID
  - `history[]`: 修改历史

### 4. DatasetTraining (训练队列)
- **作用**: 异步训练任务队列,负责向量化和索引生成
- **训练模式**:
  - `chunk`: 文本分块
  - `qa`: 问答对
  - `image`: 图像处理
  - `imageParse`: 图像解析

## 代码目录结构

### Packages 层(共享代码)

#### 1. packages/global/core/dataset/
**类型定义和常量**
```
├── constants.ts              # 所有枚举定义(类型、状态、模式)
├── type.d.ts                 # TypeScript 类型定义
├── api.d.ts                  # API 接口类型
├── controller.d.ts           # 控制器类型定义
├── utils.ts                  # 通用工具函数
├── collection/
│   ├── constants.ts          # 集合相关常量
│   └── utils.ts              # 集合工具函数
├── data/
│   └── constants.ts          # 数据相关常量
├── training/
│   ├── type.d.ts             # 训练相关类型
│   └── utils.ts              # 训练工具函数
├── apiDataset/
│   ├── type.d.ts             # API数据集类型
│   └── utils.ts              # API数据集工具
└── search/
    └── utils.ts              # 搜索工具函数
```

**关键枚举定义**:
- `DatasetTypeEnum`: 知识库类型
- `DatasetCollectionTypeEnum`: 集合类型
- `DatasetSearchModeEnum`: 搜索模式(embedding/fullText/mixed)
- `TrainingModeEnum`: 训练模式
- `DatasetCollectionDataProcessModeEnum`: 数据处理模式

#### 2. packages/service/core/dataset/
**业务逻辑和数据库操作**
```
├── schema.ts                 # Dataset MongoDB Schema
├── controller.ts             # Dataset 核心控制器
├── utils.ts                  # 业务工具函数
├── collection/
│   ├── schema.ts             # Collection Schema
│   ├── controller.ts         # Collection 控制器
│   └── utils.ts              # Collection 工具
├── data/
│   ├── schema.ts             # DatasetData Schema
│   ├── dataTextSchema.ts     # 全文搜索 Schema
│   └── controller.ts         # Data 控制器
├── training/
│   ├── schema.ts             # Training Schema
│   ├── controller.ts         # Training 控制器
│   └── constants.ts          # Training 常量
├── tag/
│   └── schema.ts             # Tag Schema
├── image/
│   ├── schema.ts             # Image Schema
│   └── utils.ts              # Image 工具
├── search/
│   ├── controller.ts         # 🔥 核心检索控制器
│   └── utils.ts              # 检索工具函数
└── apiDataset/
    ├── index.ts              # API数据集入口
    ├── custom/api.ts         # 自定义API
    ├── feishuDataset/api.ts  # 飞书集成
    └── yuqueDataset/api.ts   # 语雀集成
```

### Projects 层(应用实现)

#### 3. projects/app/src/pages/api/core/dataset/
**NextJS API 路由**
```
├── detail.ts                 # 获取知识库详情
├── delete.ts                 # 删除知识库
├── paths.ts                  # 获取路径信息
├── exportAll.ts              # 导出全部数据
├── collection/
│   ├── create.ts             # 创建集合(基础)
│   ├── create/
│   │   ├── localFile.ts      # 本地文件导入
│   │   ├── link.ts           # 链接导入
│   │   ├── text.ts           # 文本导入
│   │   ├── images.ts         # 图片导入
│   │   ├── apiCollection.ts  # API集合
│   │   └── fileId.ts         # 文件ID导入
│   ├── update.ts             # 更新集合
│   ├── list.ts               # 集合列表
│   ├── detail.ts             # 集合详情
│   ├── sync.ts               # 同步集合
│   └── export.ts             # 导出集合
├── data/
│   ├── list.ts               # 数据列表
│   ├── detail.ts             # 数据详情
│   ├── insertData.ts         # 插入数据
│   ├── pushData.ts           # 推送数据
│   ├── update.ts             # 更新数据
│   └── delete.ts             # 删除数据
├── training/
│   ├── getDatasetTrainingQueue.ts        # 获取训练队列
│   ├── getTrainingDataDetail.ts          # 训练数据详情
│   ├── updateTrainingData.ts             # 更新训练数据
│   ├── deleteTrainingData.ts             # 删除训练数据
│   └── getTrainingError.ts               # 获取训练错误
└── apiDataset/
    ├── list.ts               # API数据集列表
    ├── getCatalog.ts         # 获取目录
    └── getPathNames.ts       # 获取路径名
```

#### 4. projects/app/src/components/ 和 pageComponents/
**前端组件**
```
components/core/dataset/      # 通用组件
├── SelectModal.tsx           # 知识库选择器
├── QuoteItem.tsx             # 引用项展示
├── DatasetTypeTag.tsx        # 类型标签
├── RawSourceBox.tsx          # 原始来源展示
└── SearchParamsTip.tsx       # 搜索参数提示

pageComponents/dataset/       # 页面组件
├── list/                     # 列表页
│   └── SideTag.tsx          # 侧边标签
├── detail/                   # 详情页
│   ├── CollectionCard/      # 集合卡片
│   ├── DataCard.tsx         # 数据卡片
│   ├── Test.tsx             # 测试组件
│   ├── Info/                # 信息组件
│   ├── Import/              # 导入组件
│   │   ├── diffSource/      # 不同数据源
│   │   ├── components/      # 公共组件
│   │   └── commonProgress/  # 进度组件
│   └── Form/                # 表单组件
└── ApiDatasetForm.tsx        # API数据集表单
```

## 数据库 Schema 详解

### 1. Dataset Schema (datasets 集合)
```typescript
{
  _id: ObjectId,
  parentId: ObjectId | null,          // 父级ID(支持文件夹)
  teamId: ObjectId,                   // 团队ID
  tmbId: ObjectId,                    // 团队成员ID
  type: DatasetTypeEnum,              // 知识库类型
  avatar: string,                     // 头像
  name: string,                       // 名称
  intro: string,                      // 简介
  updateTime: Date,                   // 更新时间

  vectorModel: string,                // 向量模型
  agentModel: string,                 // AI模型
  vlmModel?: string,                  // 视觉语言模型

  websiteConfig?: {                   // 网站配置
    url: string,
    selector: string
  },

  chunkSettings: {                    // 分块配置
    trainingType: DatasetCollectionDataProcessModeEnum,
    chunkTriggerType: ChunkTriggerConfigTypeEnum,
    chunkTriggerMinSize: number,
    chunkSettingMode: ChunkSettingModeEnum,
    chunkSplitMode: DataChunkSplitModeEnum,
    chunkSize: number,
    chunkSplitter: string,
    indexSize: number,
    qaPrompt: string,
    // ... 更多配置
  },

  inheritPermission: boolean,         // 继承权限
  apiDatasetServer?: object          // API服务器配置
}

// 索引
teamId_1
type_1
```

### 2. DatasetCollection Schema (dataset_collections 集合)
```typescript
{
  _id: ObjectId,
  parentId: ObjectId | null,          // 父级集合
  teamId: ObjectId,
  tmbId: ObjectId,
  datasetId: ObjectId,                // 所属知识库

  type: DatasetCollectionTypeEnum,    // 集合类型
  name: string,                       // 名称
  tags: string[],                     // 标签ID列表

  createTime: Date,
  updateTime: Date,

  // 元数据(根据类型不同)
  fileId?: ObjectId,                  // 本地文件ID
  rawLink?: string,                   // 原始链接
  apiFileId?: string,                 // API文件ID
  externalFileId?: string,            // 外部文件ID
  externalFileUrl?: string,           // 外部导入URL

  rawTextLength?: number,             // 原始文本长度
  hashRawText?: string,               // 文本哈希
  metadata?: object,                  // 其他元数据

  forbid: boolean,                    // 是否禁用

  // 解析配置
  customPdfParse?: boolean,
  apiFileParentId?: string,

  // 分块配置(继承自 ChunkSettings)
  ...chunkSettings
}

// 索引
teamId_1_fileId_1
teamId_1_datasetId_1_parentId_1_updateTime_-1
teamId_1_datasetId_1_tags_1
teamId_1_datasetId_1_createTime_1
datasetId_1_externalFileId_1 (unique)
```

### 3. DatasetData Schema (dataset_datas 集合)
```typescript
{
  _id: ObjectId,
  teamId: ObjectId,
  tmbId: ObjectId,
  datasetId: ObjectId,
  collectionId: ObjectId,

  q: string,                          // 问题/大块文本
  a?: string,                         // 答案/自定义内容
  imageId?: string,                   // 图片ID
  imageDescMap?: object,              // 图片描述映射

  updateTime: Date,
  chunkIndex: number,                 // 块索引

  indexes: [{                         // 向量索引数组
    type: DatasetDataIndexTypeEnum,
    dataId: string,                   // PG向量数据ID
    text: string                      // 索引文本
  }],

  history?: [{                        // 历史版本
    q: string,
    a?: string,
    updateTime: Date
  }],

  rebuilding?: boolean                // 重建中标志
}

// 索引
teamId_1_datasetId_1_collectionId_1_chunkIndex_1_updateTime_-1
teamId_1_datasetId_1_collectionId_1_indexes.dataId_1
rebuilding_1_teamId_1_datasetId_1
```

### 4. DatasetTraining Schema (dataset_trainings 集合)
```typescript
{
  _id: ObjectId,
  teamId: ObjectId,
  tmbId: ObjectId,
  datasetId: ObjectId,
  collectionId: ObjectId,
  billId?: string,                    // 账单ID

  mode: TrainingModeEnum,             // 训练模式

  expireAt: Date,                     // 过期时间(7天自动删除)
  lockTime: Date,                     // 锁定时间
  retryCount: number,                 // 重试次数

  q: string,                          // 待训练问题
  a: string,                          // 待训练答案
  imageId?: string,
  imageDescMap?: object,
  chunkIndex: number,
  indexSize?: number,
  weight: number,                     // 权重

  dataId?: ObjectId,                  // 关联的DatasetData ID

  indexes: [{                         // 待生成的索引
    type: DatasetDataIndexTypeEnum,
    text: string
  }],

  errorMsg?: string                   // 错误信息
}

// 索引
teamId_1_datasetId_1
mode_1_retryCount_1_lockTime_1_weight_-1
expireAt_1 (TTL: 7 days)
```

### 5. 辅助 Schema

#### DatasetCollectionTags (dataset_collection_tags)
```typescript
{
  _id: ObjectId,
  teamId: ObjectId,
  datasetId: ObjectId,
  tag: string                         // 标签名称
}
```

#### DatasetDataText (dataset_data_texts) - 全文搜索
```typescript
{
  _id: ObjectId,
  teamId: ObjectId,
  datasetId: ObjectId,
  collectionId: ObjectId,
  dataId: ObjectId,                   // 关联 DatasetData
  fullTextToken: string               // 全文搜索Token
}

// 全文索引
fullTextToken: text
```

## 核心业务流程

### 1. 数据导入流程

```
用户上传文件/链接
    ↓
创建 DatasetCollection
    ↓
文件解析 & 预处理
    ↓
文本分块(根据 ChunkSettings)
    ↓
创建 DatasetTraining 任务
    ↓
后台队列处理:
  - 向量化(embedding)
  - 创建 PG 向量索引
  - 生成 DatasetData
  - 创建全文搜索索引(DatasetDataText)
    ↓
训练完成,可以检索
```

**关键代码位置**:
- 文件上传: `projects/app/src/pages/api/core/dataset/collection/create/localFile.ts`
- 分块逻辑: `packages/service/core/dataset/collection/utils.ts`
- 训练控制: `packages/service/core/dataset/training/controller.ts`

### 2. 检索流程(核心算法)

**位置**: `packages/service/core/dataset/search/controller.ts`

```typescript
// 三种检索模式
enum DatasetSearchModeEnum {
  embedding = 'embedding',        // 纯向量检索
  fullTextRecall = 'fullTextRecall', // 纯全文检索
  mixedRecall = 'mixedRecall'     // 混合检索
}

// 检索流程
async function searchDatasetData(props) {
  // 1. 参数初始化和权重配置
  const { embeddingWeight, rerankWeight } = props;

  // 2. 集合过滤(标签/时间/禁用)
  const filterCollectionIds = await filterCollectionByMetadata();

  // 3. 多路召回
  const { embeddingRecallResults, fullTextRecallResults } =
    await multiQueryRecall({
      embeddingLimit: 80,  // 向量召回数量
      fullTextLimit: 60    // 全文召回数量
    });

  // 4. RRF(倒数排名融合)合并
  const rrfResults = datasetSearchResultConcat([
    { weight: embeddingWeight, list: embeddingRecallResults },
    { weight: 1 - embeddingWeight, list: fullTextRecallResults }
  ]);

  // 5. ReRank 重排序(可选)
  if (usingReRank) {
    const reRankResults = await datasetDataReRank({
      rerankModel,
      query: reRankQuery,
      data: rrfResults
    });
  }

  // 6. 相似度过滤
  const scoreFiltered = results.filter(item =>
    item.score >= similarity
  );

  // 7. Token 限制过滤
  const finalResults = await filterDatasetDataByMaxTokens(
    scoreFiltered,
    maxTokens
  );

  return finalResults;
}
```

**核心算法详解**:

#### a. 向量召回 (embeddingRecall)
```typescript
// 1. 查询向量化
const { vectors, tokens } = await getVectorsByText({
  model: getEmbeddingModel(model),
  input: queries,
  type: 'query'
});

// 2. PG 向量库召回
const recallResults = await Promise.all(
  vectors.map(vector =>
    recallFromVectorStore({
      teamId,
      datasetIds,
      vector,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList
    })
  )
);

// 3. 关联 MongoDB 数据
const dataMaps = await MongoDatasetData.find({
  teamId,
  datasetId: { $in: datasetIds },
  'indexes.dataId': { $in: indexDataIds }
});
```

#### b. 全文召回 (fullTextRecall)
```typescript
// MongoDB 全文搜索
const results = await MongoDatasetDataText.aggregate([
  {
    $match: {
      teamId: new Types.ObjectId(teamId),
      $text: { $search: await jiebaSplit({ text: query }) },
      datasetId: { $in: datasetIds.map(id => new Types.ObjectId(id)) }
    }
  },
  {
    $sort: {
      score: { $meta: 'textScore' }
    }
  },
  {
    $limit: limit
  }
]);
```

#### c. RRF 合并算法
```typescript
// 倒数排名融合(Reciprocal Rank Fusion)
function datasetSearchResultConcat(weightedLists) {
  const k = 60; // RRF 参数
  const scoreMap = new Map();

  for (const { weight, list } of weightedLists) {
    list.forEach((item, index) => {
      const rrfScore = weight / (k + index + 1);
      scoreMap.set(item.id,
        (scoreMap.get(item.id) || 0) + rrfScore
      );
    });
  }

  return Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => findItemById(id));
}
```

#### d. ReRank 重排序
```typescript
// 使用重排序模型(如 bge-reranker)
const { results } = await reRankRecall({
  model: rerankModel,
  query: reRankQuery,
  documents: data.map(item => ({
    id: item.id,
    text: `${item.q}\n${item.a}`
  }))
});

// 重排序结果融合到 RRF 结果
const finalResults = datasetSearchResultConcat([
  { weight: 1 - rerankWeight, list: rrfResults },
  { weight: rerankWeight, list: reRankResults }
]);
```

### 3. 分块策略

**位置**: `packages/global/core/dataset/constants.ts`

```typescript
// 分块模式
enum DataChunkSplitModeEnum {
  paragraph = 'paragraph',  // 段落分割(智能)
  size = 'size',           // 固定大小分割
  char = 'char'            // 字符分隔符分割
}

// AI 段落模式
enum ParagraphChunkAIModeEnum {
  auto = 'auto',           // 自动判断
  force = 'force',         // 强制使用AI
  forbid = 'forbid'        // 禁用AI
}

// 分块配置示例
const chunkSettings = {
  chunkSplitMode: 'paragraph',
  chunkSize: 512,           // 最大块大小
  chunkSplitter: '\n',      // 分隔符
  paragraphChunkDeep: 2,    // 段落层级
  paragraphChunkMinSize: 100, // 最小段落大小
  indexSize: 256,           // 索引大小
  // 数据增强
  dataEnhanceCollectionName: true,
  autoIndexes: true,        // 自动多索引
  indexPrefixTitle: true    // 索引前缀标题
}
```

### 4. 训练队列机制

**位置**: `packages/service/core/dataset/training/controller.ts`

```typescript
// 训练队列调度
class TrainingQueue {
  // 1. 获取待训练任务(按权重排序)
  async getNextTrainingTask() {
    return MongoDatasetTraining.findOne({
      mode: { $in: supportedModes },
      retryCount: { $gt: 0 },
      lockTime: { $lt: new Date(Date.now() - lockTimeout) }
    })
    .sort({ weight: -1, lockTime: 1 })
    .limit(1);
  }

  // 2. 锁定任务
  async lockTask(taskId) {
    await MongoDatasetTraining.updateOne(
      { _id: taskId },
      { $set: { lockTime: new Date() } }
    );
  }

  // 3. 执行向量化
  async processTask(task) {
    const vectors = await getVectorsByText({
      model: getEmbeddingModel(task.model),
      input: task.indexes.map(i => i.text)
    });

    // 保存到 PG 向量库
    const indexDataIds = await saveToVectorDB(vectors);

    // 创建 DatasetData
    await MongoDatasetData.create({
      ...task,
      indexes: task.indexes.map((idx, i) => ({
        ...idx,
        dataId: indexDataIds[i]
      }))
    });
  }

  // 4. 完成/失败处理
  async completeTask(taskId, success, error) {
    if (success) {
      await MongoDatasetTraining.deleteOne({ _id: taskId });
    } else {
      await MongoDatasetTraining.updateOne(
        { _id: taskId },
        {
          $inc: { retryCount: -1 },
          $set: {
            errorMsg: error,
            lockTime: new Date('2000/1/1')
          }
        }
      );
    }
  }
}
```

## 关键技术点

### 1. 多索引机制

**为什么需要多索引?**
- 大块文本可以拆分为多个小索引,提高召回精度
- 支持不同粒度的检索(粗粒度+细粒度)

```typescript
// DatasetData 中的 indexes 数组
{
  q: "这是一段很长的文本...",
  indexes: [
    {
      type: 'custom',      // 自定义索引
      dataId: 'pg_vector_id_1',
      text: "第一部分索引文本"
    },
    {
      type: 'custom',
      dataId: 'pg_vector_id_2',
      text: "第二部分索引文本"
    }
  ]
}
```

### 2. 混合检索(Hybrid Search)

**结合向量检索和全文检索的优势**:
- 向量检索: 语义相似度,理解意图
- 全文检索: 精确匹配关键词,高召回
- RRF 融合: 互补优势,提升整体效果

**权重配置**:
```typescript
{
  searchMode: 'mixedRecall',
  embeddingWeight: 0.5,      // 向量权重
  // fullTextWeight = 1 - 0.5 = 0.5

  usingReRank: true,
  rerankWeight: 0.7          // 重排序权重
}
```

### 3. 集合过滤(Collection Filter)

**支持灵活的元数据过滤**:
```typescript
// 标签过滤
{
  tags: {
    $and: ["标签1", "标签2"],  // 必须同时包含
    $or: ["标签3", "标签4", null] // 包含任一,null表示无标签
  }
}

// 时间过滤
{
  createTime: {
    $gte: '2024-01-01',
    $lte: '2024-12-31'
  }
}
```

### 4. 向量数据库架构

**双数据库架构**:
```
MongoDB (元数据 + 全文索引)
  - 存储原始文本、配置、关系
  - 全文搜索索引(jieba 分词)

PostgreSQL + pgvector (向量存储)
  - 高维向量存储
  - 高效余弦相似度检索
  - HNSW 索引加速
```

**数据流转**:
```
原始文本 → Embedding API → 向量 → PG 存储
         ↓
         索引ID 存回 MongoDB

检索时:
查询文本 → 向量 → PG 召回 topK →
获取 dataIds → MongoDB 查询完整数据
```

### 5. 图片知识库

**特殊的图片处理流程**:
```typescript
// 1. 图片上传
{
  type: 'images',
  imageId: 'image_storage_id'
}

// 2. 图片向量化(VLM)
const imageVector = await getImageEmbedding({
  model: vlmModel,
  imageId
});

// 3. 图片描述映射
{
  imageDescMap: {
    'image_url_1': '这是一张产品图片',
    'image_url_2': '这是一张流程图'
  }
}

// 4. 检索时返回预签名URL
const previewUrl = getDatasetImagePreviewUrl({
  imageId,
  teamId,
  datasetId,
  expiredMinutes: 60 * 24 * 7  // 7天有效
});
```

## API 路由映射

### Dataset 基础操作
```
GET    /api/core/dataset/detail        # 获取知识库详情
DELETE /api/core/dataset/delete        # 删除知识库
GET    /api/core/dataset/paths         # 获取路径
POST   /api/core/dataset/exportAll     # 导出全部
```

### Collection 操作
```
POST   /api/core/dataset/collection/create              # 创建集合
POST   /api/core/dataset/collection/create/localFile    # 本地文件
POST   /api/core/dataset/collection/create/link         # 链接导入
POST   /api/core/dataset/collection/create/text         # 文本导入
POST   /api/core/dataset/collection/create/images       # 图片导入
PUT    /api/core/dataset/collection/update              # 更新集合
GET    /api/core/dataset/collection/list                # 集合列表
GET    /api/core/dataset/collection/detail              # 集合详情
POST   /api/core/dataset/collection/sync                # 同步集合
GET    /api/core/dataset/collection/export              # 导出集合
```

### Data 操作
```
GET    /api/core/dataset/data/list         # 数据列表
GET    /api/core/dataset/data/detail       # 数据详情
POST   /api/core/dataset/data/insertData   # 插入数据
POST   /api/core/dataset/data/pushData     # 推送数据(批量)
PUT    /api/core/dataset/data/update       # 更新数据
DELETE /api/core/dataset/data/delete       # 删除数据
```

### Training 操作
```
GET    /api/core/dataset/training/getDatasetTrainingQueue   # 训练队列
GET    /api/core/dataset/training/getTrainingDataDetail     # 训练详情
PUT    /api/core/dataset/training/updateTrainingData        # 更新训练
DELETE /api/core/dataset/training/deleteTrainingData        # 删除训练
GET    /api/core/dataset/training/getTrainingError          # 获取错误
```

## 前端状态管理

**位置**: `projects/app/src/web/core/dataset/store/`

```typescript
// dataset.ts - 知识库状态
{
  datasets: DatasetListItemType[],
  currentDataset: DatasetItemType,
  loadDatasets: () => Promise<void>,
  createDataset: (data) => Promise<string>,
  updateDataset: (data) => Promise<void>,
  deleteDataset: (id) => Promise<void>
}

// searchTest.ts - 搜索测试状态
{
  searchQuery: string,
  searchMode: DatasetSearchModeEnum,
  similarity: number,
  limit: number,
  searchResults: SearchDataResponseItemType[],
  performSearch: () => Promise<void>
}
```

## 性能优化要点

### 1. 索引优化
```javascript
// 核心复合索引
DatasetCollection:
  - { teamId: 1, datasetId: 1, parentId: 1, updateTime: -1 }
  - { teamId: 1, datasetId: 1, tags: 1 }

DatasetData:
  - { teamId: 1, datasetId: 1, collectionId: 1, chunkIndex: 1, updateTime: -1 }
  - { teamId: 1, datasetId: 1, collectionId: 1, 'indexes.dataId': 1 }

DatasetTraining:
  - { mode: 1, retryCount: 1, lockTime: 1, weight: -1 }
```

### 2. 查询优化
```typescript
// 使用从库读取(降低主库压力)
const readFromSecondary = {
  readPreference: 'secondaryPreferred'
};

MongoDatasetData.find(query, fields, {
  ...readFromSecondary
}).lean();
```

### 3. 分页优化
```typescript
// 使用 scrollList 而非传统分页
// 避免深度分页性能问题
GET /api/core/dataset/collection/scrollList?lastId=xxx&limit=20
```

### 4. 缓存策略
```typescript
// Redis 缓存热门检索结果
const cacheKey = `dataset:search:${hashQuery(query)}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// 缓存 5 分钟
await redis.setex(cacheKey, 300, JSON.stringify(results));
```

## 测试覆盖

**测试文件位置**: `projects/app/test/api/core/dataset/`

```
├── create.test.ts                    # 知识库创建
├── paths.test.ts                     # 路径测试
├── collection/
│   └── paths.test.ts                 # 集合路径
└── training/
    ├── deleteTrainingData.test.ts    # 训练删除
    ├── getTrainingError.test.ts      # 训练错误
    └── updateTrainingData.test.ts    # 训练更新
```

## 常见开发任务

### 1. 添加新的数据源类型

**步骤**:
1. 在 `packages/global/core/dataset/constants.ts` 添加新类型枚举
2. 在 `packages/service/core/dataset/apiDataset/` 创建新集成
3. 在 `projects/app/src/pages/api/core/dataset/collection/create/` 添加 API 路由
4. 在 `projects/app/src/pageComponents/dataset/detail/Import/diffSource/` 添加前端组件

### 2. 修改检索算法

**核心文件**: `packages/service/core/dataset/search/controller.ts`

关键函数:
- `embeddingRecall`: 向量召回逻辑
- `fullTextRecall`: 全文召回逻辑
- `datasetSearchResultConcat`: RRF 融合算法
- `datasetDataReRank`: 重排序逻辑

### 3. 优化分块策略

**核心文件**: `packages/service/core/dataset/collection/utils.ts`

关键逻辑:
- 段落识别
- 智能合并小块
- 标题提取
- 多索引生成

### 4. 添加新的训练模式

**步骤**:
1. 在 `TrainingModeEnum` 添加新模式
2. 在 `packages/service/core/dataset/training/controller.ts` 添加处理逻辑
3. 更新训练队列调度器

## 依赖关系图

```
Dataset (1:N)
  ├─→ DatasetCollection (1:N)
  │     ├─→ DatasetData (1:N)
  │     │     └─→ PG Vectors (1:N)
  │     └─→ DatasetTraining (1:N)
  │           └─→ Bills (1:1)
  └─→ DatasetCollectionTags (1:N)
        └─→ DatasetCollection.tags[] (N:M)
```

## 权限系统

**位置**: `packages/global/support/permission/dataset/`

```typescript
// 权限级别
enum PermissionTypeEnum {
  owner = 'owner',         // 所有者
  manage = 'manage',       // 管理员
  write = 'write',         // 编辑
  read = 'read'            // 只读
}

// 权限继承
{
  inheritPermission: true  // 从父级继承权限
}

// 协作者管理
DatasetCollaborators: {
  datasetId,
  tmbId,
  permission: PermissionTypeEnum
}
```

## 国际化

**位置**: `packages/web/i18n/`

```typescript
// 知识库相关翻译 key
'dataset:common_dataset'
'dataset:folder_dataset'
'dataset:website_dataset'
'dataset:api_file'
'dataset:sync_collection_failed'
'dataset:training.Image mode'
// ... 更多
```

## 调试技巧

### 1. 查看训练队列状态
```javascript
// MongoDB Shell
db.dataset_trainings.find({
  teamId: ObjectId('xxx')
}).sort({ weight: -1, lockTime: 1 }).limit(10)
```

### 2. 检查向量索引
```javascript
// PG SQL
SELECT datasetid, count(*)
FROM pg_vectors
GROUP BY datasetid;
```

### 3. 全文搜索测试
```javascript
db.dataset_data_texts.find({
  $text: { $search: "测试查询" }
}, {
  score: { $meta: "textScore" }
}).sort({ score: { $meta: "textScore" } })
```

### 4. 查看检索日志
```typescript
// 开启详细日志
searchDatasetData({
  ...props,
  debug: true  // 输出详细召回信息
})
```

## 最佳实践

### 1. 分块大小设置
- **短文档**: `chunkSize: 256-512`
- **长文档**: `chunkSize: 512-1024`
- **FAQ**: `chunkSize: 128-256`

### 2. 检索参数调优
```typescript
// 高精度场景(客服)
{
  searchMode: 'mixedRecall',
  similarity: 0.7,           // 较高阈值
  embeddingWeight: 0.6,      // 偏向语义
  usingReRank: true,
  rerankWeight: 0.8
}

// 高召回场景(搜索)
{
  searchMode: 'mixedRecall',
  similarity: 0.4,           // 较低阈值
  embeddingWeight: 0.4,      // 偏向全文
  usingReRank: false
}
```

### 3. 标签组织
```
按主题: #产品文档 #技术规范 #客服FAQ
按来源: #官网 #手册 #社区
按时效: #2024Q1 #最新版本
```

### 4. 性能监控
```typescript
// 关键指标
- 训练队列长度
- 检索平均耗时
- Token 消耗量
- 向量库大小
- 召回率/准确率
```

## 扩展阅读

### 相关文档
- [RAG 架构设计](https://docs.tryfastgpt.ai/docs/development/upgrading/4819/)
- [向量数据库选择](https://docs.tryfastgpt.ai/docs/development/custom-models/vector/)
- [检索优化指南](https://docs.tryfastgpt.ai/docs/workflow/modules/knowledge_base/)

### 外部依赖
- `pgvector`: PostgreSQL 向量扩展
- `jieba`: 中文分词库
- `tiktoken`: Token 计数
- `pdf-parse`: PDF 解析
- `mammoth`: Word 解析

---

## 总结

FastGPT 知识库模块是一个完整的 RAG 系统实现,核心特点:

1. **分层架构**: Dataset → Collection → Data → Indexes
2. **混合检索**: 向量 + 全文 + 重排序,灵活配置权重
3. **异步训练**: 队列化向量化任务,支持重试和失败处理
4. **双数据库**: MongoDB 存元数据,PG 存向量
5. **多数据源**: 支持文件/链接/API/外部集成
6. **灵活分块**: 段落/大小/字符多种策略
7. **权限控制**: 继承式权限管理

开发时重点关注:
- **检索性能**: `search/controller.ts`
- **分块质量**: `collection/utils.ts`
- **训练队列**: `training/controller.ts`
- **数据流转**: Schema 之间的关联关系
