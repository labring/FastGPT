import Papa from 'papaparse';
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
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';

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
      error: (error) => {
        reject(new Error(DatasetErrEnum.synonymFileParseFailed));
      }
    });
  });
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

  const buffer = await gridFsStream2Buffer(fileStream);

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
  datasetId,
  uploaderId,
  filePath,
  fileName,
  fileSize
}: {
  teamId: string;
  datasetId: string;
  uploaderId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
}): Promise<DatasetSynonymSchemaType> {
  let uploadedFileId: string | undefined;

  try {
    // 1. 检查该知识库是否已有同义词文件
    const existingSynonym = await MongoDatasetSynonym.findOne({
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId)
    });

    // 2. 上传文件到GridFS
    const fileId = await uploadFile({
      teamId,
      uid: uploaderId,
      bucketName: BucketNameEnum.dataset,
      path: filePath,
      filename: fileName,
      contentType: 'text/csv',
      metadata: {
        datasetId,
        type: 'synonym'
      }
    });
    uploadedFileId = fileId;

    // 3. 读取并解析CSV文件（验证格式）
    const fileContent = await readSynonymFileFromGridFS(fileId);
    const parsedData = await parseSynonymCSV(fileContent);

    // 4. 如果存在旧文件，删除旧文件及其映射
    if (existingSynonym) {
      await deleteSynonymFile({
        synonymId: String(existingSynonym._id),
        teamId,
        datasetId
      });
    }

    // 5-7. 使用事务创建同义词记录、映射和更新知识库（保证原子性）
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
  datasetId
}: {
  synonymId: string;
  teamId: string;
  datasetId: string;
}): Promise<void> {
  // 1. 查找同义词文件记录
  const synonymFile = await MongoDatasetSynonym.findOne({
    _id: new Types.ObjectId(synonymId),
    teamId: new Types.ObjectId(teamId),
    datasetId: new Types.ObjectId(datasetId)
  });

  if (!synonymFile) {
    throw new Error(DatasetErrEnum.synonymFileNotExist);
  }

  // 2. 删除GridFS中的文件
  await delFileByFileIdList({
    bucketName: BucketNameEnum.dataset,
    fileIdList: [String(synonymFile.fileId)]
  });

  // 3. 删除所有相关的同义词映射
  await MongoDatasetSynonymMapping.deleteMany({
    synonymFileId: synonymFile._id
  });

  // 4. 删除同义词文件元数据记录
  await MongoDatasetSynonym.deleteOne({
    _id: synonymFile._id
  });

  // 5. 更新知识库的synonymFiles字段
  await MongoDataset.findByIdAndUpdate(datasetId, {
    $pull: { synonymFiles: synonymFile._id }
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
  const mappings = await MongoDatasetSynonymMapping.find(
    {
      teamId: new Types.ObjectId(teamId),
      datasetId: new Types.ObjectId(datasetId),
      $text: { $search: query }
    },
    {
      score: { $meta: 'textScore' }
    }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();

  return mappings.map((mapping) => ({
    ...mapping,
    _id: String(mapping._id),
    teamId: String(mapping.teamId),
    datasetId: String(mapping.datasetId),
    synonymFileId: String(mapping.synonymFileId)
  }));
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
