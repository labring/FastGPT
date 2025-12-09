import Papa from 'papaparse';
import xlsx from 'node-xlsx';
import { MongoDatasetSynonym } from './schema';
import { MongoDatasetSynonymMapping } from './mappingSchema';
import { MongoDataset } from '../schema';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import {
  uploadFile,
  getDownloadStream,
  delFileByFileIdList
} from '../../../common/file/gridfs/controller';
import { gridFsStream2Buffer } from '../../../common/file/gridfs/utils';
import type {
  DatasetSynonymSchemaType,
  DatasetSynonymMappingSchemaType
} from '@fastgpt/global/core/dataset/type';
import { Types } from '../../../common/mongo';
import * as iconv from 'iconv-lite';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDatasetTraining } from '../training/schema';
import { MongoDatasetData } from '../data/schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createTrainingUsage } from '../../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getEmbeddingModel } from '../../ai/model';
import { jiebaSplitWithCustomDict } from '../../../common/string/jieba/index';

// 同义词词汇缓存，key 为 datasetId，value 为词汇列表和过期时间
interface SynonymWordsCache {
  words: string[];
  expireAt: number;
}
const synonymWordsCache = new Map<string, SynonymWordsCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟过期

/**
 * CSV同义词文件解析结果
 */
export type ParsedSynonymData = {
  standardizedTerm: string;
  synonymTerms: string[];
  allTerms: string;
};

/**
 * 解析CSV同义词文件
 * CSV格式说明：
 * - 第一行表头：standardizedTerm,synonymTerms,,,,
 * - 第一列：标准词（standardizedTerm）
 * - 第二列及之后：所有列都是同义词（synonymTerms），无论表头是否有名称
 *
 * 示例：
 * standardizedTerm,synonymTerms,,,,
 * 退款,退费,返还,退回,钱款返回
 * 订单,订单号,单据,单号,购买单据
 *
 * @param fileContent - CSV文件内容（字符串）
 * @returns 解析后的同义词数据数组
 */
export async function parseSynonymCSV(fileContent: string): Promise<ParsedSynonymData[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(fileContent, {
      skipEmptyLines: true,
      transform: (value) => value?.trim() || '',
      complete: (results) => {
        try {
          const rows = results.data;

          // 验证至少有两行（表头+至少一行数据）
          if (rows.length < 2) {
            return reject(new Error(DatasetErrEnum.synonymFileEmpty));
          }

          // 第一行是表头，从第二行开始是数据
          const parsedData: ParsedSynonymData[] = [];

          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];

            // 跳过完全空的行
            if (!row || row.length === 0 || !row[0]) {
              continue;
            }

            // 第一列（索引0）为标准词
            const standardizedTerm = row[0]?.trim() || '';
            if (!standardizedTerm) {
              continue;
            }

            // 第二列及之后的所有列（索引1开始）都是同义词，过滤空值
            const synonymTerms = row
              .slice(1)
              .map((term) => term?.trim())
              .filter((term) => term && term.length > 0);

            // 如果没有同义词，跳过该行
            if (synonymTerms.length === 0) {
              continue;
            }

            // 组合所有词用于全文检索
            const allTerms = [standardizedTerm, ...synonymTerms].join(' ');

            parsedData.push({
              standardizedTerm,
              synonymTerms,
              allTerms
            });
          }

          // 验证至少有一条有效数据
          if (parsedData.length === 0) {
            return reject(new Error(DatasetErrEnum.synonymFileNoValidData));
          }

          resolve(parsedData);
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => {
        reject(new Error(DatasetErrEnum.synonymFileParseFailed));
      }
    });
  });
}

/**
 * 将Excel buffer转换为CSV字符串
 * 只读取第一个sheet
 * @param buffer - Excel文件buffer
 * @returns CSV字符串
 */
export function parseExcelToCSV(buffer: Buffer): string {
  // 解析Excel文件，只读取第一个sheet
  const sheets = xlsx.parse(buffer, {
    defval: ''
  });

  if (sheets.length === 0) {
    throw new Error(DatasetErrEnum.synonymFileEmpty);
  }

  // 只读取第一个sheet
  const firstSheet = sheets[0];
  const rows = firstSheet.data;

  if (!rows || rows.length === 0) {
    throw new Error(DatasetErrEnum.synonymFileEmpty);
  }

  // 将rows转换为CSV字符串
  // 使用Papa.unparse来保证CSV格式正确（处理特殊字符、引号等）
  const csvString = Papa.unparse(rows, {
    quotes: false,
    delimiter: ',',
    newline: '\n'
  });

  return csvString;
}

/**
 * 从GridFS读取同义词文件内容
 * @param fileId - GridFS文件ID
 * @returns 文件内容字符串
 */
export async function readSynonymFileFromGridFS(fileId: string): Promise<string> {
  const fileStream = await getDownloadStream({
    bucketName: BucketNameEnum.dataset,
    fileId
  });

  const buffer = await gridFsStream2Buffer(fileStream as unknown as NodeJS.ReadableStream);

  // 检测并处理BOM (Byte Order Mark)
  let offset = 0;
  let encoding: string = 'utf-8';

  // UTF-8 BOM: EF BB BF
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    offset = 3;
    encoding = 'utf-8';
  }
  // UTF-16 LE BOM: FF FE
  else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    offset = 2;
    encoding = 'utf-16le';
  }
  // UTF-16 BE BOM: FE FF
  else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    offset = 2;
    encoding = 'utf-16be';
  }
  // 无BOM，尝试检测编码
  else {
    // 使用启发式方法检测编码
    const sample = buffer.slice(0, Math.min(buffer.length, 1024));

    // 尝试UTF-8解码，检查是否有效
    const utf8Decoded = iconv.decode(sample, 'utf-8');
    const utf8Valid = !utf8Decoded.includes('�') && !utf8Decoded.includes('\uFFFD');

    if (utf8Valid) {
      encoding = 'utf-8';
    } else {
      // 检测是否为GBK编码（常见中文编码）
      // GBK的第一个字节范围: 0x81-0xFE，第二个字节范围: 0x40-0xFE
      let gbkLikeCount = 0;
      for (let i = 0; i < sample.length - 1; i++) {
        if (
          sample[i] >= 0x81 &&
          sample[i] <= 0xfe &&
          sample[i + 1] >= 0x40 &&
          sample[i + 1] <= 0xfe
        ) {
          gbkLikeCount++;
          i++; // 跳过第二个字节
        }
      }

      // 如果GBK特征明显（超过30%的字节符合GBK编码规则），使用GBK
      if (gbkLikeCount > sample.length * 0.15) {
        encoding = 'gbk';
      }
    }
  }

  // 跳过BOM并解码
  const contentBuffer = offset > 0 ? buffer.slice(offset) : buffer;
  return iconv.decode(contentBuffer, encoding);
}

/**
 * 上传同义词文件并创建映射
 * @param params - 上传参数
 * @returns 创建的同义词文件记录
 */
export async function uploadSynonymFile({
  teamId,
  tmbId,
  datasetId,
  uploaderId,
  filePath,
  fileName,
  fileSize
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  uploaderId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
}): Promise<DatasetSynonymSchemaType> {
  let uploadedFileId: string | undefined;

  try {
    // ✅ 双向互斥检查 (2/2): 同义词上传入口检查是否有任何训练任务
    // 说明: 此检查阻止同义词上传与任何训练任务(chunk/qa/auto/synonymStandardize/synonymRestore)并发
    // 注意: 这里不过滤 mode，因为需要阻止所有类型的训练任务，包括同义词自身的任务
    // 配合 pushDataListToTrainingQueue 中的检查，保证双向互斥
    const hasTrainingTask = await MongoDatasetTraining.exists({
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId)
    });

    if (hasTrainingTask) {
      throw new Error('知识库正在训练中,请等待训练完成后再上传同义词文件');
    }

    // 1. 检查该知识库是否已有同义词文件
    const existingSynonym = await MongoDatasetSynonym.findOne({
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId)
    });

    // 2. 检测文件类型并确定contentType
    const fileExtension = fileName.toLowerCase().split('.').pop();
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls';
    const contentType = isExcel
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

    // 3. 上传文件到GridFS
    const fileId = await uploadFile({
      teamId,
      uid: uploaderId,
      bucketName: BucketNameEnum.dataset,
      path: filePath,
      filename: fileName,
      contentType,
      metadata: {
        datasetId,
        type: 'synonym'
      }
    });
    uploadedFileId = fileId;

    // 4. 读取并解析文件（验证格式）
    let fileContent: string;
    if (isExcel) {
      // 如果是Excel文件，先读取buffer再转换为CSV
      const fileStream = await getDownloadStream({
        bucketName: BucketNameEnum.dataset,
        fileId
      });
      const buffer = await gridFsStream2Buffer(fileStream as any);
      fileContent = parseExcelToCSV(buffer);
    } else {
      // 如果是CSV文件，直接读取文本内容
      fileContent = await readSynonymFileFromGridFS(fileId);
    }

    const parsedData = await parseSynonymCSV(fileContent);

    // 5. 如果存在旧文件，删除旧文件及其映射
    if (existingSynonym) {
      await deleteSynonymFile({
        synonymId: String(existingSynonym._id),
        teamId,
        tmbId,
        datasetId
      });
    }

    // 5. 获取知识库信息（用于创建billId）
    const dataset = await MongoDataset.findById(datasetId).select('vectorModel').lean();
    if (!dataset) {
      throw new Error('知识库不存在');
    }

    // 6. 创建 billId (用于费用追踪)
    const { billId } = await createTrainingUsage({
      teamId,
      tmbId,
      appName: '同义词标准化',
      billSource: UsageSourceEnum.training,
      vectorModel: getEmbeddingModel(dataset.vectorModel)?.name
    });

    // 7-9. 使用事务创建同义词记录、映射和更新知识库（保证原子性）
    const result = await mongoSessionRun(async (session) => {
      // 5. 创建新的同义词文件记录
      const [synonymFile] = await MongoDatasetSynonym.create(
        [
          {
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            fileName,
            fileId: new Types.ObjectId(fileId),
            size: fileSize,
            uploadTime: new Date(),
            uploaderId: new Types.ObjectId(uploaderId)
          }
        ],
        { session }
      );

      // 6. 批量创建同义词映射
      const mappings = parsedData.map((data) => ({
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        synonymFileId: synonymFile._id,
        standardizedTerm: data.standardizedTerm,
        synonymTerms: data.synonymTerms,
        allTerms: data.allTerms,
        createdTime: new Date(),
        updatedTime: new Date()
      }));

      await MongoDatasetSynonymMapping.insertMany(mappings, { session });

      // 7. 更新知识库的synonymFiles字段
      await MongoDataset.findByIdAndUpdate(
        datasetId,
        {
          $set: { synonymFiles: [synonymFile._id] }
        },
        { session }
      );

      return synonymFile;
    });

    // 10. 标记所有需要标准化的数据
    await MongoDatasetData.updateMany(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId)
        // 所有数据都要走增强流程
      },
      {
        $set: {
          synonymProcessing: 'standardize',
          synonymFileIds: [String(result._id)]
        }
      }
    );

    // 11. 创建初始批次的训练任务
    const max = global.systemEnv?.vectorMaxProcess || 10;
    const initialBatch = new Array(max * 2).fill(0);

    for await (const _ of initialBatch) {
      try {
        const hasNext = await mongoSessionRun(async (session) => {
          // 获取下一条需要处理的数据
          const data = await MongoDatasetData.findOneAndUpdate(
            {
              synonymProcessing: 'standardize',
              teamId: new Types.ObjectId(teamId),
              datasetId: new Types.ObjectId(datasetId)
            },
            {
              $unset: { synonymProcessing: null } // 清除标记,避免重复处理
            },
            { session }
          ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

          if (data) {
            // 创建训练任务
            await MongoDatasetTraining.create(
              [
                {
                  teamId: new Types.ObjectId(teamId),
                  tmbId: new Types.ObjectId(tmbId),
                  datasetId: new Types.ObjectId(datasetId),
                  collectionId: data.collectionId,
                  mode: TrainingModeEnum.synonymStandardize,
                  dataId: data._id,
                  dataMetadata: {
                    synonymFileIds: data.synonymFileIds
                  },
                  retryCount: 3,
                  billId
                }
              ],
              { session, ordered: true }
            );
          }

          return !!data;
        });

        if (!hasNext) break;
      } catch (error) {
        console.error('创建同义词训练任务失败:', error);
      }
    }

    // 12. 清除同义词词汇缓存
    synonymWordsCache.delete(datasetId);
    console.log(`uploadSynonymFile: 已清除缓存 datasetId=${datasetId}`);

    return result.toObject();
  } catch (error) {
    // 如果过程中出错且已上传文件，清理GridFS中的孤儿文件
    if (uploadedFileId) {
      try {
        await delFileByFileIdList({
          bucketName: BucketNameEnum.dataset,
          fileIdList: [uploadedFileId]
        });
      } catch (cleanupError) {
        // 清理失败只记录，不影响原始错误的抛出
        console.error('Failed to cleanup uploaded file:', cleanupError);
      }
    }
    throw error;
  }
}

/**
 * 删除同义词文件及其所有映射
 * @param params - 删除参数
 */
export async function deleteSynonymFile({
  synonymId,
  teamId,
  tmbId,
  datasetId
}: {
  synonymId: string;
  teamId: string;
  tmbId: string;
  datasetId: string;
}): Promise<void> {
  // ✅ 双向互斥检查: 同义词删除入口检查是否有任何训练任务
  // 说明: 同 uploadSynonymFile，阻止删除操作与任何训练任务并发
  const hasTrainingTask = await MongoDatasetTraining.exists({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });

  if (hasTrainingTask) {
    throw new Error('知识库正在训练中,请等待训练完成后再删除同义词文件');
  }

  // 1. 查找同义词文件记录
  const synonymFile = await MongoDatasetSynonym.findOne({
    _id: new Types.ObjectId(synonymId),
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });

  if (!synonymFile) {
    throw new Error(DatasetErrEnum.synonymFileNotExist);
  }

  // 2. 获取知识库信息（用于创建billId）
  const dataset = await MongoDataset.findById(datasetId).select('vectorModel').lean();
  if (!dataset) {
    throw new Error('知识库不存在');
  }

  // 3. 创建 billId (用于费用追踪)
  const { billId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '同义词恢复',
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(dataset.vectorModel)?.name
  });

  // 4. 标记所有需要恢复的数据
  // 注意：synonymFileIds 存储在 indexes.synonymMetadata.synonymFileIds
  await MongoDatasetData.updateMany(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId),
      // ✅ 查询 indexes 数组中，synonymMetadata.synonymFileIds 包含该同义词文件ID的数据
      'indexes.synonymMetadata.synonymFileIds': synonymId
    },
    {
      $set: {
        synonymProcessing: 'restore',
        synonymFileIds: [synonymId]
      }
    }
  );

  // 5. 创建初始批次的恢复任务
  const max = global.systemEnv?.vectorMaxProcess || 10;
  const initialBatch = new Array(max * 2).fill(0);

  for await (const _ of initialBatch) {
    try {
      const hasNext = await mongoSessionRun(async (session) => {
        const data = await MongoDatasetData.findOneAndUpdate(
          {
            synonymProcessing: 'restore',
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId)
          },
          {
            $unset: { synonymProcessing: null }
          },
          { session }
        ).select({ _id: 1, collectionId: 1, synonymFileIds: 1 });

        if (data) {
          await MongoDatasetTraining.create(
            [
              {
                teamId: new Types.ObjectId(teamId),
                tmbId: new Types.ObjectId(tmbId),
                datasetId: new Types.ObjectId(datasetId),
                collectionId: data.collectionId,
                mode: TrainingModeEnum.synonymRestore,
                dataId: data._id,
                dataMetadata: {
                  synonymFileIds: data.synonymFileIds
                },
                retryCount: 3,
                billId
              }
            ],
            { session, ordered: true }
          );
        }

        return !!data;
      });

      if (!hasNext) break;
    } catch (error) {
      console.error('创建同义词恢复任务失败:', error);
    }
  }

  // 6. 删除GridFS中的文件
  await delFileByFileIdList({
    bucketName: BucketNameEnum.dataset,
    fileIdList: [String(synonymFile.fileId)]
  });

  // 7. 删除所有相关的同义词映射
  await MongoDatasetSynonymMapping.deleteMany({
    synonymFileId: synonymFile._id
  });

  // 8. 删除同义词文件元数据记录
  await MongoDatasetSynonym.deleteOne({
    _id: synonymFile._id
  });

  // 9. 更新知识库的synonymFiles字段
  await MongoDataset.findByIdAndUpdate(datasetId, {
    $pull: { synonymFiles: synonymFile._id }
  });

  // 10. 清除同义词词汇缓存
  synonymWordsCache.delete(datasetId);
  console.log(`deleteSynonymFile: 已清除缓存 datasetId=${datasetId}`);
}

/**
 * 更新同义词文件 - 先删除后上传 (简化方案)
 * @param params - 更新参数
 * @returns 创建的同义词文件记录
 */
export async function updateSynonymFile({
  teamId,
  tmbId,
  datasetId,
  oldSynonymId,
  uploaderId,
  filePath,
  fileName,
  fileSize
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  oldSynonymId: string;
  uploaderId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
}): Promise<DatasetSynonymSchemaType> {
  // ✅ 双向互斥检查: 同义词更新入口检查是否有任何训练任务
  // 说明: 同 uploadSynonymFile，阻止更新操作与任何训练任务并发
  const hasTrainingTask = await MongoDatasetTraining.exists({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });

  if (hasTrainingTask) {
    throw new Error('知识库正在训练中,请等待训练完成后再更新同义词文件');
  }

  // 1. 先调用删除流程,恢复所有数据
  await deleteSynonymFile({
    synonymId: oldSynonymId,
    teamId,
    tmbId,
    datasetId
  });

  // 2. 等待恢复任务全部完成 (通过轮询检查)
  while (true) {
    const hasRestoreTask = await MongoDatasetTraining.exists({
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId),
      mode: TrainingModeEnum.synonymRestore
    });

    if (!hasRestoreTask) break;

    await new Promise((resolve) => setTimeout(resolve, 1000)); // 等待1秒后重试
  }

  // 3. 再调用上传流程,应用新同义词
  return await uploadSynonymFile({
    teamId,
    tmbId,
    datasetId,
    uploaderId,
    filePath,
    fileName,
    fileSize
  });
}

/**
 * 获取知识库的同义词文件列表
 * @param params - 查询参数
 * @returns 同义词文件列表
 */
export async function listSynonymFiles({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}): Promise<DatasetSynonymSchemaType[]> {
  const files = await MongoDatasetSynonym.find({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  })
    .sort({ uploadTime: -1 })
    .lean();

  return files.map((file) => ({
    ...file,
    _id: String(file._id),
    teamId: String(file.teamId),
    datasetId: String(file.datasetId),
    fileId: String(file.fileId),
    uploaderId: String(file.uploaderId)
  }));
}

/**
 * 搜索同义词映射（全文检索）
 * @param params - 搜索参数
 * @returns 匹配的同义词映射列表
 */
export async function searchSynonymMappings({
  teamId,
  datasetId,
  query,
  limit = 10
}: {
  teamId: string;
  datasetId: string;
  query: string;
  limit?: number;
}): Promise<DatasetSynonymMappingSchemaType[]> {
  try {
    // 尝试从缓存获取同义词词汇
    const now = Date.now();
    const cached = synonymWordsCache.get(datasetId);
    let customWords: string[] = [];

    if (cached && cached.expireAt > now) {
      // 缓存命中
      customWords = cached.words;
      console.log(
        `searchSynonymMappings 缓存命中: datasetId=${datasetId}, 词汇数=${customWords.length}`
      );
    } else {
      // 缓存未命中或已过期，查询数据库
      const allMappings = await MongoDatasetSynonymMapping.find(
        {
          teamId: new Types.ObjectId(teamId),
          datasetId: new Types.ObjectId(datasetId)
        },
        'standardizedTerm synonymTerms'
      ).lean();

      // 提取所有标准词和同义词
      allMappings.forEach((mapping) => {
        if (mapping.standardizedTerm) {
          customWords.push(mapping.standardizedTerm);
        }
        if (mapping.synonymTerms && Array.isArray(mapping.synonymTerms)) {
          customWords.push(...mapping.synonymTerms.filter((t) => t));
        }
      });

      // 更新缓存
      synonymWordsCache.set(datasetId, {
        words: customWords,
        expireAt: now + CACHE_TTL
      });

      console.log(
        `searchSynonymMappings 缓存更新: datasetId=${datasetId}, 词汇数=${customWords.length}`
      );
    }

    // 如果没有同义词数据，直接返回空数组
    if (customWords.length === 0) {
      console.log(`searchSynonymMappings: 知识库无同义词数据 datasetId=${datasetId}`);
      return [];
    }

    // 使用自定义词典进行分词，确保同义词不会被错误切分
    const searchQuery = await jiebaSplitWithCustomDict({
      text: query,
      customWords
    });

    // 如果分词结果为空，返回空数组
    if (!searchQuery || searchQuery.trim().length === 0) {
      console.log(`searchSynonymMappings: 分词结果为空 query=${query}`);
      return [];
    }

    // 打印函数入参
    console.log('searchSynonymMappings 函数入参:', {
      teamId,
      datasetId,
      原始query: query,
      自定义词汇数量: customWords.length,
      分词后query: searchQuery,
      limit
    });

    const mappings = await MongoDatasetSynonymMapping.find(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: new Types.ObjectId(datasetId),
        $text: { $search: searchQuery }
      },
      {
        score: { $meta: 'textScore' }
      }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean();

    const result = mappings.map((mapping) => ({
      ...mapping,
      _id: String(mapping._id),
      teamId: String(mapping.teamId),
      datasetId: String(mapping.datasetId),
      synonymFileId: String(mapping.synonymFileId)
    }));

    // 打印返回内容
    console.log('searchSynonymMappings 函数返回结果:', {
      查询到的映射数量: mappings.length,
      返回结果数量: result.length,
      返回数据: result
    });

    return result;
  } catch (error) {
    console.error('searchSynonymMappings 错误:', {
      datasetId,
      query,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    // 出错时返回空数组，不影响上层调用
    return [];
  }
}

/**
 * 批量查询标准词的同义词映射
 * @param params - 查询参数
 * @returns 标准词到同义词的映射字典
 */
export async function batchGetSynonymMappings({
  teamId,
  datasetId,
  standardizedTerms
}: {
  teamId: string;
  datasetId: string;
  standardizedTerms: string[];
}): Promise<Record<string, { standardizedTerm: string; synonymTerms: string[] } | null>> {
  const mappings = await MongoDatasetSynonymMapping.find({
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId),
    standardizedTerm: { $in: standardizedTerms }
  }).lean();

  // 构建结果字典
  const result: Record<string, { standardizedTerm: string; synonymTerms: string[] } | null> = {};

  // 初始化所有查询词为null
  standardizedTerms.forEach((term) => {
    result[term] = null;
  });

  // 填充找到的映射
  mappings.forEach((mapping) => {
    result[mapping.standardizedTerm] = {
      standardizedTerm: mapping.standardizedTerm,
      synonymTerms: mapping.synonymTerms
    };
  });

  return result;
}
