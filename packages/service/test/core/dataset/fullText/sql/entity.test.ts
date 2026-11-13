import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  activateSqlFullTextTarget,
  clearSqlFullTextTargetReady,
  findSqlFullTextTargetById
} from '@fastgpt/service/core/dataset/fullText/sql/entity';

describe('SQL full-text target entity session propagation', () => {
  it('commits and rolls back target readiness mutations with ClientSession', async () => {
    const targetId = randomUUID();
    const analyzerVersion = 'pg-search-0.26.6-whitespace-fastgpt-jieba-search-v1';

    await expect(
      mongoSessionRun(async (session) => {
        await activateSqlFullTextTarget(
          {
            provider: 'pg',
            targetId,
            schemaVersion: 1,
            analyzerVersion
          },
          session
        );
        expect(await findSqlFullTextTargetById('pg', session)).toMatchObject({
          _id: 'pg',
          targetId,
          schemaVersion: 1,
          analyzerVersion
        });
        throw new Error('abort readiness transaction');
      })
    ).rejects.toThrow('abort readiness transaction');

    expect(await findSqlFullTextTargetById('pg')).toBeNull();

    await mongoSessionRun(async (session) => {
      await activateSqlFullTextTarget(
        {
          provider: 'pg',
          targetId,
          schemaVersion: 1,
          analyzerVersion
        },
        session
      );
    });
    expect(await findSqlFullTextTargetById('pg')).toMatchObject({
      _id: 'pg',
      targetId,
      schemaVersion: 1,
      analyzerVersion
    });

    await expect(
      mongoSessionRun(async (session) => {
        await clearSqlFullTextTargetReady('pg', session);
        expect(await findSqlFullTextTargetById('pg', session)).toBeNull();
        throw new Error('abort clear transaction');
      })
    ).rejects.toThrow('abort clear transaction');

    expect(await findSqlFullTextTargetById('pg')).toMatchObject({ _id: 'pg', targetId });

    await mongoSessionRun(async (session) => {
      await clearSqlFullTextTargetReady('pg', session);
    });
    expect(await findSqlFullTextTargetById('pg')).toBeNull();
  });
});
