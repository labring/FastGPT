import { GET } from '@fastgpt/service/common/api/httpRequest';

const PUTI_URL: string = process.env.PUTI_URL || '';
const PUTI_KEY: string = process.env.PUTI_KEY || '';
const PUTI_TENANT: string = process.env.PUTI_TENANT || '';

type PutifileResp<T> = {
  code: number;
  msg: string;
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
 * 标签响应
 */
type PutifileSTagItemResp = {
  tagId: string;
  tagName: string;
  tagValue: string;
};

type ListPutifileReq = {
  folder: string;
  lastSyncTime: number;
};

/**
 * 获取文件的临时访问地址
 */
async function getFileUrl(fileId: string): Promise<string> {
  const fileResp = await GET<PutifileResp<string>>(
    `${PUTI_URL}/klg/file/${fileId}/temp-access-url`,
    {},
    { headers: { 'x-api-key': PUTI_KEY } }
  );
  return fileResp.data;
}

/**
 * 获取文件列表
 * @param params 请求参数
 * @returns 文件列表
 */
async function listChangedFiles(params: ListPutifileReq): Promise<PutifileFileItemResp[]> {
  const fileResp = await GET<PutifileResp<PutifileFileItemResp[]>>(
    `${PUTI_URL}/klg/file/changed`,
    {
      tenantId: PUTI_TENANT,
      ...params
    },
    { headers: { 'x-api-key': PUTI_KEY } }
  );
  return fileResp.data;
}

async function listTags(): Promise<PutifileSTagItemResp[]> {
  const re = await GET<PutifileResp<PutifileSTagItemResp[]>>(
    `${PUTI_URL}/klg/tag/list`,
    {
      tenantId: PUTI_TENANT
    },
    {
      headers: {
        'x-api-key': PUTI_KEY
      }
    }
  );
  return re.data;
}

// 导出上述变量
export { listChangedFiles, getFileUrl, listTags };
export type { PutifileResp, PutifileFileItemResp, PutifileSTagItemResp, ListPutifileReq };
