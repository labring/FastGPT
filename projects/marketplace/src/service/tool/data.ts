import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

declare global {
  var toolListData: Array<ToolDetailType>;
}

const dataFileURL = process.env.S3_PREFIX + '/data.json';
const localDataFilePath = join(tmpdir(), 'data.json');

export const getToolList = async () => {
  if (!global.toolListData) {
    // download the file to local
    const res = await fetch(dataFileURL);
    await writeFile(localDataFilePath, Buffer.from(await res.arrayBuffer()));
    const data = await readFile(localDataFilePath, 'utf-8');
    global.toolListData = JSON.parse(data);
  }
  return global.toolListData;
};
