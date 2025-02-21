import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorStore/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });

    // pg 新建字段：halfvector
    const columnExists = await PgClient.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name='${DatasetVectorTableName}' AND column_name='halfvector';
        `);

    if (columnExists.rows.length === 0) {
      await PgClient.query(`
            BEGIN;
              ALTER TABLE ${DatasetVectorTableName} ADD COLUMN halfvector halfvec(1536);
            COMMIT;
          `);
      console.log('halfvector column added');
    }

    const maxIdResult = await PgClient.query(
      `SELECT MAX(id) as max_id FROM ${DatasetVectorTableName}`
    );
    const maxId: number = maxIdResult.rows[0].max_id;

    if (!maxId) {
      console.warn('No data in the table: empty max_id');
      jsonRes(res, { code: 500, error: 'No data in the table: empty max_id' });
      return;
    }

    const batchSize = 25;
    const numBatches = Math.ceil(maxId / batchSize);

    const tasks: (() => Promise<void>)[] = [];
    let totalRowsUpdated = 0;
    let lastLoggedTime = Date.now();
    let lastLoggedRows = 0;

    const logUpdateSpeed = () => {
      const currentTime = Date.now();
      const timeElapsed = (currentTime - lastLoggedTime) / 1000; // seconds
      const rowsUpdated = totalRowsUpdated - lastLoggedRows;
      const speed = rowsUpdated / timeElapsed; // rows per second
      console.log(`Update speed: ${speed.toFixed(2)} rows/s`);
      lastLoggedTime = currentTime;
      lastLoggedRows = totalRowsUpdated;
    };

    for (let i = 0; i < numBatches; i++) {
      const startId = i * batchSize;
      const endId = startId + batchSize;

      const asyncUpdate = async () => {
        let retryCount = 0;
        do {
          try {
            const rowsUpdated = await PgClient.query(
              `
                UPDATE ${DatasetVectorTableName}
                SET halfvector = vector::halfvec(1536)
                WHERE id >= ${startId} AND id < ${endId} AND halfvector IS NULL;
            `,
              false
            );
            if (rowsUpdated?.rowCount) {
              totalRowsUpdated += rowsUpdated.rowCount;
              console.log(`Batch ${i + 1} - rowsUpdated: ${rowsUpdated.rowCount}`);
            }
            break;
          } catch (error) {
            console.error(`Error updating halfvector in batch ${i + 1}:`, error);
            retryCount++;
          }
        } while (retryCount < 3);

        if (retryCount >= 3) {
          console.error(`Failed to update halfvector in batch ${i + 1} after 3 retries`);
          Promise.reject(new Error('Failed to update halfvector in batch'));
        }
      };

      tasks.push(asyncUpdate);
    }

    // randomize task list
    tasks.sort(() => Math.random() - 0.5);

    let currentIdx = 0;
    const executor = async () => {
      console.log(`Executing tasks from: ${currentIdx}`);
      let idx: number;
      while ((idx = currentIdx++) < tasks.length) {
        try {
          await tasks[idx]();
        } catch (error) {
          console.error(`Error updating halfvector in task ${idx}`, error);
        }
      }
    };

    const maxConcurrency = 20;
    const promises = [];
    for (let i = 0; i < maxConcurrency; ++i) {
      promises.push(executor());
    }

    const telemetryInterval = setInterval(logUpdateSpeed, 5000);

    try {
      await Promise.all(promises);
    } finally {
      clearInterval(telemetryInterval);
    }

    console.log('halfvector column updated');

    // 设置halfvector字段为非空
    await PgClient.query(
      `BEGIN;
      ALTER TABLE ${DatasetVectorTableName} ALTER COLUMN halfvector SET NOT NULL;
      DROP INDEX IF EXISTS vector_index;
      ALTER TABLE ${DatasetVectorTableName} DROP COLUMN IF EXISTS vector;
      COMMIT;
      `
    );
    console.log('halfvector column set not null');

    // 创建索引以提升查询性能
    await PgClient.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS halfvector_index ON ${DatasetVectorTableName} USING hnsw (halfvector halfvec_ip_ops) WITH (m = 32, ef_construction = 128);
    `);
    console.log('halfvector index created');

    // 后台释放空间，避免使用 VACUUM FULL 导致锁表。
    await PgClient.query(`VACUUM ${DatasetVectorTableName};`);

    jsonRes(res, {
      message: 'success'
    });
  } catch (error) {
    console.log(error);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}
