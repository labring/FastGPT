import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorStore/constants';

async function setHalfvec() {
  const maxIdResult = await PgClient.query(
    `SELECT MAX(id) as max_id FROM ${DatasetVectorTableName}`
  );
  const maxId: number = maxIdResult.rows[0].max_id;

  if (!maxId) {
    throw new Error('No data found');
  }

  const batchSize = 32;
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
    };

    tasks.push(asyncUpdate);
  }

  let currentIdx = 0;
  const executor = async () => {
    console.log(`Executing tasks from: ${currentIdx}`);
    let idx: number;
    while ((idx = currentIdx++) < tasks.length) {
      while (true) {
        try {
          await tasks[idx]();
          break;
        } catch (error) {
          console.error(`Error updating halfvector in task ${idx}: `, error);
        }
      }
    }
  };

  const maxConcurrency = 32;
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
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });

    // pg add column halfvector
    const columnExists = await PgClient.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name='${DatasetVectorTableName}';
        `);

    if (columnExists.rows.findIndex((item) => item.column_name === 'halfvector') === -1) {
      await PgClient.query(`
            BEGIN;
              ALTER TABLE ${DatasetVectorTableName} ADD COLUMN halfvector halfvec(1536);
            COMMIT;
          `);
      console.log('halfvector column added');
    }

    if (columnExists.rows.findIndex((item) => item.column_name === 'vector') !== -1) {
      await setHalfvec();
    }

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

    // 后台释放空间，避免使用 VACUUM FULL 导致锁表。
    PgClient.query(`VACUUM ${DatasetVectorTableName};`);

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
