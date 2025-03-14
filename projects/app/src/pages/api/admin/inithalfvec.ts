import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { PgClient } from '@fastgpt/service/common/vectorStore/pg';
import { DatasetVectorTableName } from '@fastgpt/service/common/vectorStore/constants';

async function setHalfvec() {
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

  const asyncUpdate = async () => {
    while (true) {
      const rowsUpdated = await PgClient.query(
        `BEGIN;
        SET LOCAL synchronous_commit = off;
        UPDATE ${DatasetVectorTableName}
        SET halfvector = vector
        WHERE ctid = ANY(ARRAY(
          SELECT ctid FROM ${DatasetVectorTableName} WHERE halfvector IS NULL LIMIT 200
          FOR NO KEY UPDATE SKIP LOCKED
        ))`,
        false
      );
      if (rowsUpdated?.rowCount) {
        totalRowsUpdated += rowsUpdated.rowCount;
        console.log(`Rows updated: ${rowsUpdated.rowCount}`);
      } else {
        console.log('No more rows to update');
        break;
      }
    }
  };

  const worker = async () => {
    let retry = 0;
    while (retry < 3) {
      try {
        await asyncUpdate();
        break;
      } catch (error: any) {
        console.error('Error updating halfvector:', error?.message);
        retry++;
      }
    }
  };

  const maxConcurrency = Number(process.env.DB_MAX_LINK || 20);
  const telemetryInterval = setInterval(logUpdateSpeed, 10000);

  try {
    await Promise.all(Array.from({ length: maxConcurrency }, () => worker()));
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
      await PgClient.query(
        `ALTER TABLE ${DatasetVectorTableName} ADD COLUMN halfvector halfvec(1536);`
      );
      console.log('halfvector column added');
    }

    if (columnExists.rows.findIndex((item) => item.column_name === 'vector') !== -1) {
      await setHalfvec();
    }

    // set halfvector NOT NULL
    await PgClient.query(
      `BEGIN;
      ALTER TABLE ${DatasetVectorTableName} ALTER COLUMN halfvector SET NOT NULL;
      DROP INDEX IF EXISTS vector_index;
      ALTER TABLE ${DatasetVectorTableName} DROP COLUMN IF EXISTS vector;
      COMMIT;
      `
    );
    console.log('halfvector column set not null');

    // VACUUM
    PgClient.query(`VACUUM ${DatasetVectorTableName};`, true);

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
