import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

declare global {
  // eslint-disable-next-line no-var
  var toolListData: Array<ToolDetailType>;
  var expire: Date;
}

const dataFileURL = process.env.S3_PREFIX + '/data.json';
const localDataFilePath = join(tmpdir(), 'data.json');

export const getToolList = async () => {
  if (!global.toolListData || global.toolListData.length === 0 || global.expire < new Date()) {
    global.expire = new Date(Date.now() + 1000 * 10 * 60); // 10 minutes

    // download the file to local
    const res = await fetch(dataFileURL);
    await writeFile(localDataFilePath, Buffer.from(await res.arrayBuffer()));
    const data = await readFile(localDataFilePath, 'utf-8');
    global.toolListData = JSON.parse(data);
  }
  return global.toolListData;
};

export const refreshToolList = async () => {
  global.toolListData = [];
  global.expire = new Date(0);
};
