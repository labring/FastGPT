import { NextAPI } from '@/service/middleware/entry';
import { listChangedFiles } from './utils';
import { NextApiRequest } from 'next';

const supportFileTypes = [
  'txt',
  'csv',
  'json',
  'md',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx'
];

type PutifileResp<T> = {
  /** 状态码 */
  code: number;
  /** 消息 */
  msg: string;
  /** 数据 */
  data: T;
};
type PutifileFileItemResp = {
  /** 文件ID */
  id: string;
  /** 文件名 */
  fileName: string;
  /** 文件大小 */
  fileSize?: number;
  /** 文件标签列表 */
  tags?: string[];
  /** 文件创建时间 */
  createdTime?: number;
  /** 文件更新时间 */
  updatedTime?: number;
};

/**
 * 获取指定文件夹下的文件列表
 */
async function handler(req: NextApiRequest): Promise<PutifileFileItemResp[]> {
  const { folder } = req.body as {
    folder: string;
  };

  if (!folder) {
    return Promise.reject('folder is required');
  }

  // 获取文件列表
  const files = await listChangedFiles({ folder, lastSyncTime: 0 });
  console.log('====> filesResponse:', files);
  if (!files || files.length === 0) {
    return [];
  }

  // 过滤掉不支持的文件类型
  const supportFiles = files.filter((file) => {
    const ext = file.fileName.split('.').pop()?.toLowerCase() || 'nothisext';
    return supportFileTypes.includes(ext);
  });
  return supportFiles;
}

export default NextAPI(handler);
