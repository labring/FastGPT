import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  CreateDatasetDataProps,
  PatchIndexesProps,
  UpdateDatasetDataProps
} from '@fastgpt/global/core/dataset/controller';
import { insertDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorStore/controller';
import { DatasetDataIndexItemType, DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import { getEmbeddingModel, getLLMModel } from '@fastgpt/service/core/ai/model';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { ClientSession } from '@fastgpt/service/common/mongo';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { countPromptTokens } from '@fastgpt/service/common/string/tiktoken';

const formatIndexes = async ({
  indexes = [],
  q,
  a = '',
  indexSize,
  maxIndexSize
}: {
  indexes?: (Omit<DatasetDataIndexItemType, 'dataId'> & { dataId?: string })[];
  q: string;
  a?: string;
  indexSize: number;
  maxIndexSize: number;
}): Promise<
  {
    type: `${DatasetDataIndexTypeEnum}`;
    text: string;
    dataId?: string;
  }[]
> => {
  /* get dataset data default index */
  const getDefaultIndex = ({
    q = '',
    a,
    indexSize
  }: {
    q?: string;
    a?: string;
    indexSize: number;
  }) => {
    const qChunks = splitText2Chunks({
      text: q,
      chunkSize: indexSize,
      maxSize: maxIndexSize
    }).chunks;
    const aChunks = a
      ? splitText2Chunks({ text: a, chunkSize: indexSize, maxSize: maxIndexSize }).chunks
      : [];

    return [
      ...qChunks.map((text) => ({
        text,
        type: DatasetDataIndexTypeEnum.default
      })),
      ...aChunks.map((text) => ({
        text,
        type: DatasetDataIndexTypeEnum.default
      }))
    ];
  };

  // If index not type, set it to custom
  indexes = indexes
    .map((item) => ({
      text: typeof item.text === 'string' ? item.text : String(item.text),
      type: item.type || DatasetDataIndexTypeEnum.custom,
      dataId: item.dataId
    }))
    .filter((item) => !!item.text.trim());

  // Recompute default indexes, Merge ids of the same index, reduce the number of rebuilds
  const defaultIndexes = getDefaultIndex({ q, a, indexSize });

  const concatDefaultIndexes = defaultIndexes.map((item) => {
    const oldIndex = indexes!.find((index) => index.text === item.text);
    if (oldIndex) {
      return {
        type: DatasetDataIndexTypeEnum.default,
        text: item.text,
        dataId: oldIndex.dataId
      };
    } else {
      return item;
    }
  });
  indexes = indexes.filter((item) => item.type !== DatasetDataIndexTypeEnum.default);
  indexes.push(...concatDefaultIndexes);

  // Remove same text
  indexes = indexes.filter(
    (item, index, self) => index === self.findIndex((t) => t.text === item.text)
  );

  const chekcIndexes = (
    await Promise.all(
      indexes.map(async (item) => {
        if (item.type === DatasetDataIndexTypeEnum.default) {
          return item;
        }

        // If oversize tokens, split it
        const tokens = await countPromptTokens(item.text);
        if (tokens > maxIndexSize) {
          const splitText = splitText2Chunks({
            text: item.text,
            chunkSize: indexSize,
            maxSize: maxIndexSize
          }).chunks;
          return splitText.map((text) => ({
            text,
            type: item.type
          }));
        }

        return item;
      })
    )
  ).flat();

  return chekcIndexes;
};
/* insert data.
 * 1. create data id
 * 2. insert pg
 * 3. create mongo data
 */
export async function insertData2Dataset({
  teamId,
  tmbId,
  datasetId,
  collectionId,
  q,
  a = '',
  chunkIndex = 0,
  indexSize = 512,
  indexes,
  embeddingModel,
  session,
  imageFileId
}: CreateDatasetDataProps & {
  embeddingModel: string;
  indexSize?: number;
  session?: ClientSession;
}) {
  console.log('[数据库] insertData2Dataset 开始执行:', {
    teamId: teamId?.toString(),
    datasetId: datasetId?.toString(),
    collectionId: collectionId?.toString(),
    chunkIndex,
    imageFileId: imageFileId ? '已提供' : '未提供'
  });

  if (!q || !datasetId || !collectionId || !embeddingModel) {
    console.error('[数据库] 参数验证失败:', {
      q: !!q,
      datasetId: !!datasetId,
      collectionId: !!collectionId,
      embeddingModel: !!embeddingModel
    });
    return Promise.reject('q, datasetId, collectionId, embeddingModel is required');
  }
  if (String(teamId) === String(tmbId)) {
    console.error('[数据库] teamId和tmbId相同');
    return Promise.reject("teamId and tmbId can't be the same");
  }

  try {
    // === 临时测试图片上传功能，注释掉向量化相关代码 ===
    const embModel = getEmbeddingModel(embeddingModel);
    indexSize = Math.min(embModel.maxToken, indexSize);
    console.log('[数据库] 获取向量模型:', embModel.model, '索引大小:', indexSize);

    /* 原始向量化代码已注释，用于测试图片上传功能
    // 1. Get vector indexes and insert
    // Empty indexes check, if empty, create default index
    console.log('[数据库] 开始格式化索引');
    const newIndexes = await formatIndexes({
      indexes,
      q,
      a,
      indexSize,
      maxIndexSize: embModel.maxToken
    });
    console.log('[数据库] 索引格式化完成, 索引数量:', newIndexes.length);

    // insert to vector store
    const results: {
      tokens: number;
      index: {
        dataId: string;
        type: `${DatasetDataIndexTypeEnum}`;
        text: string;
      };
    }[] = [];
    console.log('[数据库] 开始插入向量索引');
    for await (const item of newIndexes) {
      const result = await insertDatasetDataVector({
        query: item.text,
        model: embModel,
        teamId,
        datasetId,
        collectionId
      });
      results.push({
        tokens: result.tokens,
        index: {
          ...item,
          dataId: result.insertId
        }
      });
    }
    console.log('[数据库] 向量索引插入完成, 结果数量:', results.length);
    */

    // 临时创建一个空索引数组以避免schema验证错误
    const tempIndexes = [];
    if (indexes && indexes.length > 0) {
      console.log('[数据库] 使用提供的索引，但跳过向量化');
      // 如果用户提供了索引，我们保留它们，但不进行向量化
      tempIndexes.push(
        ...indexes.map((item, index) => ({
          type: item.type || DatasetDataIndexTypeEnum.custom,
          dataId: `temp_id_${index}`, // 临时ID
          text: item.text || ''
        }))
      );
    } else {
      // 创建一个基本索引
      console.log('[数据库] 创建临时基本索引');
      tempIndexes.push({
        type: DatasetDataIndexTypeEnum.default,
        dataId: `temp_id_${Date.now()}`,
        text: '这是一个图片，图片的imageFileId是' + imageFileId // 使用问题前500字符作为索引文本
      });
    }

    console.log('[数据库] 临时索引:', tempIndexes);

    // 2. Create mongo data
    console.log('[数据库] 准备MongoDB数据 (跳过向量化)');
    const mongoData: any = {
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q,
      a,
      chunkIndex,
      indexes: tempIndexes
    };

    // 如果有图片文件ID，添加到MongoDB文档中
    if (imageFileId) {
      console.log('[数据库] 添加图片文件ID到MongoDB文档:', imageFileId);
      mongoData.imageFileId = imageFileId;
    } else {
      console.log('[数据库] 未提供图片文件ID');
    }

    console.log('[数据库] 开始创建MongoDB文档');
    const [{ _id }] = await MongoDatasetData.create([mongoData], { session, ordered: true });
    console.log('[数据库] MongoDB文档创建成功, _id:', _id.toString());

    // 3. Create mongo data text
    console.log('[数据库] 创建文本索引');
    await MongoDatasetDataText.create(
      [
        {
          teamId,
          datasetId,
          collectionId,
          dataId: _id,
          fullTextToken: await jiebaSplit({ text: `${q}\n${a}`.trim() })
        }
      ],
      { session, ordered: true }
    );
    console.log('[数据库] 文本索引创建成功');

    return {
      insertId: _id,
      tokens: 0 // 由于跳过了向量化，将tokens设为0
    };
  } catch (error) {
    console.error('[数据库] insertData2Dataset 执行错误:', error);
    if (error instanceof Error) {
      console.error('[数据库] 错误详情:', error.message, error.stack);
    }
    throw error;
  }
}

/**
 * Update data(indexes overwrite)
 * 1. compare indexes
 * 2. insert new pg data
 * session run:
 *  3. update mongo data(session run)
 *  4. delete old pg data
 */
export async function updateData2Dataset({
  dataId,
  q = '',
  a,
  indexes,
  model,
  indexSize = 512
}: UpdateDatasetDataProps & { model: string; indexSize?: number }) {
  if (!Array.isArray(indexes)) {
    return Promise.reject('indexes is required');
  }

  // 1. Get mongo data
  const mongoData = await MongoDatasetData.findById(dataId);
  if (!mongoData) return Promise.reject('core.dataset.error.Data not found');

  // 2. Compute indexes
  const formatIndexesResult = await formatIndexes({
    indexes,
    q,
    a,
    indexSize,
    maxIndexSize: getEmbeddingModel(model).maxToken
  });

  // 3. Patch indexes, create, update, delete
  const patchResult: PatchIndexesProps[] = [];
  // find database indexes in new Indexes, if have not,  delete it
  for (const item of mongoData.indexes) {
    const index = formatIndexesResult.find((index) => index.dataId === item.dataId);
    if (!index) {
      patchResult.push({
        type: 'delete',
        index: item
      });
    }
  }
  for (const item of formatIndexesResult) {
    if (!item.dataId) {
      patchResult.push({
        type: 'create',
        index: item
      });
    } else {
      const index = mongoData.indexes.find((index) => index.dataId === item.dataId);
      if (!index) continue;

      // Not change
      if (index.text === item.text) {
        patchResult.push({
          type: 'unChange',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      } else {
        // index Update
        patchResult.push({
          type: 'update',
          index: {
            ...item,
            dataId: index.dataId
          }
        });
      }
    }
  }

  // 4. Update mongo updateTime(便于脏数据检查器识别)
  const updateTime = mongoData.updateTime;
  mongoData.updateTime = new Date();
  await mongoData.save();

  // 5. insert vector
  const insertResults: {
    tokens: number;
  }[] = [];
  for await (const item of patchResult) {
    if (item.type === 'delete' || item.type === 'unChange') continue;

    // insert new vector and update dateId
    const result = await insertDatasetDataVector({
      query: item.index.text,
      model: getEmbeddingModel(model),
      teamId: mongoData.teamId,
      datasetId: mongoData.datasetId,
      collectionId: mongoData.collectionId
    });
    item.index.dataId = result.insertId;
    insertResults.push({
      tokens: result.tokens
    });
  }

  const tokens = insertResults.reduce((acc, cur) => acc + cur.tokens, 0);

  const newIndexes = patchResult
    .filter((item) => item.type !== 'delete')
    .map((item) => item.index) as DatasetDataIndexItemType[];

  // 6. update mongo data
  await mongoSessionRun(async (session) => {
    // Update history
    mongoData.history =
      q !== mongoData.q || a !== mongoData.a
        ? [
            {
              q: mongoData.q,
              a: mongoData.a,
              updateTime: updateTime
            },
            ...(mongoData.history?.slice(0, 9) || [])
          ]
        : mongoData.history;
    mongoData.q = q || mongoData.q;
    mongoData.a = a ?? mongoData.a;
    mongoData.indexes = newIndexes;
    await mongoData.save({ session });

    // update mongo data text
    await MongoDatasetDataText.updateOne(
      { dataId: mongoData._id },
      { fullTextToken: await jiebaSplit({ text: `${mongoData.q}\n${mongoData.a}`.trim() }) },
      { session }
    );

    // Delete vector
    const deleteIdList = patchResult
      .filter((item) => item.type === 'delete' || item.type === 'update')
      .map((item) => item.index.dataId)
      .filter(Boolean) as string[];
    if (deleteIdList.length > 0) {
      await deleteDatasetDataVector({
        teamId: mongoData.teamId,
        idList: deleteIdList
      });
    }
  });

  return {
    tokens
  };
}

export const deleteDatasetData = async (data: DatasetDataItemType) => {
  await mongoSessionRun(async (session) => {
    await MongoDatasetData.deleteOne({ _id: data.id }, { session });
    await MongoDatasetDataText.deleteMany({ dataId: data.id }, { session });
    await deleteDatasetDataVector({
      teamId: data.teamId,
      idList: data.indexes.map((item) => item.dataId)
    });
  });
};
