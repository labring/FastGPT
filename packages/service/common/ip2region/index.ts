// @ts-expect-error it literally export this function
import { verifyFromFile } from 'ip2region.js';

import { addLog } from '../system/log';
import { IPv4, loadVectorIndexFromFile, newWithVectorIndex } from 'ip2region.js';
import path from 'node:path';
import { getClientIp } from 'request-ip';
import type { NextApiRequest } from 'next';
import process from 'node:process';

const dbPath = path.resolve(process.cwd(), 'data', 'ip2region_v4.xdb');

let hasBeenVerified = false;
/**
 * 校验 XDB 文件的有效性
 */
export const verifyIp2region = async () => {
  if (hasBeenVerified) {
    return;
  }

  try {
    verifyFromFile(dbPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    addLog.error(`binding is not applicable for xdb file '${dbPath}': ${message}`);
    return Promise.reject(message);
  } finally {
    hasBeenVerified = true;
  }
};

let vIndex: Buffer | null = null;
/**
 * 获取向量索引
 */
export const getVectorIndex = async () => {
  if (vIndex) {
    return vIndex;
  }

  try {
    vIndex = loadVectorIndexFromFile(dbPath);
    addLog.info(`load vector index from ${dbPath} success`);
  } catch (error) {
    const messasge = error instanceof Error ? error.message : 'Unknown error';
    addLog.error(`failed to load vector index from ${dbPath}: ${messasge}`);
    return Promise.reject(messasge);
  }

  return vIndex;
};

/**
 * 根据 IP 地址搜索归属地
 */
export const searchIp2region = async (ip: string): Promise<string> => {
  const vIndex = await getVectorIndex();
  const searcher = newWithVectorIndex(IPv4, dbPath, vIndex);

  try {
    return await searcher.search(ip);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    addLog.error(`failed to search ip2region: ${message}`);
    return Promise.reject(message);
  } finally {
    searcher.close();
  }
};

export const getIpAndregionByRequest = async (
  request: NextApiRequest
): Promise<{
  ip?: string;
  region?: string;
}> => {
  const ip = getClientIp(request);
  if (!ip) {
    return {};
  }

  return {
    ip,
    region: (await searchIp2region(ip === '::1' ? '127.0.0.1' : ip))
      .split('|')
      .slice(0, 3)
      .filter((item) => item && item !== '0')
      .join(', ')
  };
};
