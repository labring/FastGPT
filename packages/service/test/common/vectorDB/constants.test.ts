import { afterEach, describe, expect, it, vi } from 'vitest';

// test/mocks/common/vector.ts 全局 mock 了 constants(见 test/mocks/index.ts),
// 此处 unmock 以测试真实实现。
vi.unmock('@fastgpt/service/common/vectorDB/constants');

const originalAddresses = {
  SEEKDB_URL: process.env.SEEKDB_URL,
  OCEANBASE_URL: process.env.OCEANBASE_URL,
  PG_URL: process.env.PG_URL,
  MILVUS_ADDRESS: process.env.MILVUS_ADDRESS,
  OPENGAUSS_URL: process.env.OPENGAUSS_URL,
  DXMT_URL: process.env.DXMT_URL
};

// 先设 process.env 地址,再 resetModules 重载 constants,使 serviceEnv 在模块加载时读到目标 provider。
// 显式清空全部地址(delete 才能真正移除,赋 undefined 会变成字符串 'undefined'),避免全局测试环境残留干扰优先级。
const importConstants = async (address: {
  MILVUS?: string;
  PG?: string;
  SEEKDB?: string;
  DXMT?: string;
}) => {
  vi.resetModules();
  delete process.env.SEEKDB_URL;
  delete process.env.OCEANBASE_URL;
  delete process.env.PG_URL;
  delete process.env.MILVUS_ADDRESS;
  delete process.env.OPENGAUSS_URL;
  delete process.env.DXMT_URL;
  if (address.SEEKDB) process.env.SEEKDB_URL = address.SEEKDB;
  if (address.PG) process.env.PG_URL = address.PG;
  if (address.MILVUS) process.env.MILVUS_ADDRESS = address.MILVUS;
  if (address.DXMT) process.env.DXMT_URL = address.DXMT;
  return await import('@fastgpt/service/common/vectorDB/constants');
};

describe('vectorDB constants table resolution', () => {
  afterEach(() => {
    process.env.SEEKDB_URL = originalAddresses.SEEKDB_URL;
    process.env.OCEANBASE_URL = originalAddresses.OCEANBASE_URL;
    process.env.PG_URL = originalAddresses.PG_URL;
    process.env.MILVUS_ADDRESS = originalAddresses.MILVUS_ADDRESS;
    process.env.OPENGAUSS_URL = originalAddresses.OPENGAUSS_URL;
    process.env.DXMT_URL = originalAddresses.DXMT_URL;
  });

  it('TC-3.1 resolves to modeldata when vector store is pg', async () => {
    const { getDatasetVectorTableName, getVectorType } = await importConstants({ PG: 'mock://pg' });
    expect(getVectorType()).toBe('pg');
    expect(getDatasetVectorTableName()).toBe('modeldata');
  });

  it('TC-3.2 resolves to modeldata_v2 when vector store is milvus', async () => {
    const { getDatasetVectorTableName, getVectorType, DatasetVectorTableNameV2 } =
      await importConstants({ MILVUS: 'http://localhost:19530' });
    expect(getVectorType()).toBe('milvus');
    expect(DatasetVectorTableNameV2).toBe('modeldata_v2');
    expect(getDatasetVectorTableName()).toBe(DatasetVectorTableNameV2);
  });

  it('TC-3.3 defaults to pg when no vector address configured', async () => {
    const { getVectorType } = await importConstants({});
    expect(getVectorType()).toBe('pg');
  });

  it('TC-3.4 resolves to dxmt with modeldata when only DXMT_URL is configured', async () => {
    const { getDatasetVectorTableName, getVectorType } = await importConstants({
      DXMT: 'http://localhost:9999'
    });
    expect(getVectorType()).toBe('dxmt');
    expect(getDatasetVectorTableName()).toBe('modeldata');
  });

  it('TC-3.5 keeps pg ahead of dxmt when both are configured', async () => {
    const { getVectorType } = await importConstants({
      PG: 'mock://pg',
      DXMT: 'http://localhost:9999'
    });
    expect(getVectorType()).toBe('pg');
  });
});
