import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { ObClass } from '@fastgpt/service/common/vectorDB/oceanbase/controller';

vi.unmock('@fastgpt/service/common/vectorDB/oceanbase/controller');
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  OCEANBASE_ADDRESS: 'mysql://local-test',
  SEEKDB_ADDRESS: 'mysql://local-test'
}));
const connection = {
  query: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn()
};
const getConnection = vi.fn(async () => connection);
let previous: typeof global.obClient;
beforeEach(() => {
  previous = global.obClient;
  global.obClient = { getConnection } as unknown as Pool;
  for (const fn of Object.values(connection)) fn.mockReset();
  getConnection.mockClear();
  let index = 0;
  connection.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('SELECT CAST'))
      return [[{ id: ['9007199254740993', '9007199254740998'][index++] }]];
    return [{ affectedRows: 1 }];
  });
});
afterEach(() => {
  global.obClient = previous;
});

describe.each(['oceanbase', 'seekdb'] as const)(
  '%s precise parameterized native writes',
  (type) => {
    const ctrl = new ObClass({ type });
    const values = [
      [
        { key: 'vector', value: '[1,0]' },
        { key: 'text', value: "O'Reilly 中文" }
      ],
      [
        { key: 'vector', value: '[0,1]' },
        { key: 'text', value: '' }
      ]
    ];
    it('preserves non-consecutive bigint IDs, exact text and input order in one transaction', async () => {
      expect(await ctrl.insertBoundRows('modeldata', { values })).toEqual({
        rowCount: 2,
        insertIds: ['9007199254740993', '9007199254740998']
      });
      expect(connection.query.mock.calls[0]).toEqual([
        'INSERT INTO modeldata (vector,text) VALUES (?,?)',
        ['[1,0]', "O'Reilly 中文"]
      ]);
      expect(connection.query.mock.calls[2]).toEqual([
        'INSERT INTO modeldata (vector,text) VALUES (?,?)',
        ['[0,1]', '']
      ]);
      expect(connection.commit).toHaveBeenCalledOnce();
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalledOnce();
    });
    it('rolls back partial failures rather than returning a partial ID mapping', async () => {
      connection.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: '1' }]])
        .mockRejectedValueOnce(new Error('write failed'));
      await expect(ctrl.insertBoundRows('modeldata', { values })).rejects.toThrow('write failed');
      expect(connection.rollback).toHaveBeenCalledOnce();
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalledOnce();
    });
    it('rejects missing IDs and skipped inserts, and skips empty input without connecting', async () => {
      expect(await ctrl.insertBoundRows('modeldata', { values: [] })).toEqual({
        rowCount: 0,
        insertIds: []
      });
      expect(getConnection).not.toHaveBeenCalled();
      connection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
      await expect(ctrl.insertBoundRows('modeldata', { values })).rejects.toThrow('not inserted');
      connection.query
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ id: '0' }]]);
      await expect(ctrl.insertBoundRows('modeldata', { values })).rejects.toThrow('not returned');
    });
  }
);
