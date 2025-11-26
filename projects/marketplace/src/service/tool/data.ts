import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { getDownloadCounts } from '../downloadCount';
import axios from 'axios';

declare global {
  // eslint-disable-next-line no-var
  var toolListData: Array<ToolDetailType & { downloadCount: number }>;
  var expire: Date;
}

const dataFileURL = process.env.S3_PREFIX + '/data.json';
const localDataFilePath = join(tmpdir(), 'data.json');

export const getToolList = async () => {
  if (!global.toolListData || global.toolListData.length === 0 || global.expire < new Date()) {
    global.expire = new Date(Date.now() + 1000 * 10 * 60); // 10 minutes
    // download the file to local
    const res = await axios.get(dataFileURL, {
      responseType: 'arraybuffer',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    await writeFile(localDataFilePath, Buffer.from(res.data));

    const [data, downloadCount] = await Promise.all([
      readFile(localDataFilePath, 'utf-8'),
      getDownloadCounts()
    ]);

    global.toolListData = JSON.parse(data).map((item: ToolDetailType) => ({
      ...item,
      downloadCount: downloadCount.get(item.toolId)?.downloadCount ?? 0
    }));
  }
  return global.toolListData;
};

export const refreshToolList = async () => {
  global.toolListData = [];
  global.expire = new Date(0);
};
