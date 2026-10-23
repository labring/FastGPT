import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configurePgIndexMemory } from '@fastgpt/service/common/vectorDB/pg/indexMemory';

const MiB = 1024 ** 2;
const query = vi.fn();

beforeEach(() => {
  query.mockReset();
});

describe('configurePgIndexMemory', () => {
  it.each([
    { rows: 250000, configuredMB: 64, estimatedMB: 1472, budgetMB: 1472, source: 'estimate' },
    { rows: 250000, configuredMB: 4096, estimatedMB: 1472, budgetMB: 1472, source: 'estimate' },
    { rows: 349525, configuredMB: 64, estimatedMB: 2048, budgetMB: 2048, source: 'estimate' },
    { rows: 349525, configuredMB: 4096, estimatedMB: 2048, budgetMB: 2048, source: 'estimate' },
    { rows: 349526, configuredMB: 2064, estimatedMB: 2064, budgetMB: 2064, source: 'postgres' },
    { rows: 500000, configuredMB: 4096, estimatedMB: 2944, budgetMB: 4096, source: 'postgres' },
    { rows: 524288, configuredMB: 3072, estimatedMB: 3072, budgetMB: 3072, source: 'postgres' },
    { rows: 1000000, configuredMB: 8192, estimatedMB: 5872, budgetMB: 8192, source: 'postgres' },
    { rows: 349526, configuredMB: 2048, estimatedMB: 2064, budgetMB: 2048, source: 'capped' },
    { rows: 500000, configuredMB: 64, estimatedMB: 2944, budgetMB: 2048, source: 'capped' },
    { rows: 1000000, configuredMB: 4096, estimatedMB: 5872, budgetMB: 2048, source: 'capped' }
  ])(
    'selects the requested budget for $rows rows and configured $configuredMB MiB ($source)',
    async (props) => {
      query.mockResolvedValue({ rows: [{ memory_bytes: String(props.configuredMB * MiB) }] });
      const memory = await configurePgIndexMemory({
        client: { query },
        rows: props.rows,
        dimensions: 1536
      });
      expect(memory).toEqual({
        estimatedMB: props.estimatedMB,
        configuredMB: props.configuredMB,
        budgetMB: props.budgetMB,
        source: props.source
      });
      if (props.source === 'postgres') {
        expect(query).toHaveBeenCalledOnce();
      } else {
        expect(query).toHaveBeenCalledTimes(2);
        expect(query).toHaveBeenLastCalledWith(
          `SELECT set_config('maintenance_work_mem', $1, false)`,
          [`${props.budgetMB}MB`]
        );
      }
    }
  );

  it('uses the actual dimensions and rounds small graphs to a usable budget', async () => {
    query.mockResolvedValue({ rows: [{ memory_bytes: String(64 * MiB) }] });
    expect(
      await configurePgIndexMemory({ client: { query }, rows: 30001, dimensions: 16 })
    ).toMatchObject({ estimatedMB: 80, budgetMB: 80 });
    expect(
      await configurePgIndexMemory({ client: { query }, rows: 1, dimensions: 16 })
    ).toMatchObject({ estimatedMB: 64, budgetMB: 64 });
  });

  it.each(['read', 'set'])(
    'propagates a failed %s so the queue can retry without starting DDL',
    async (phase) => {
      query.mockImplementation(async (sql) => {
        if (
          (phase === 'read' && sql.includes('current_setting')) ||
          (phase === 'set' && sql.includes('set_config'))
        )
          throw new Error('PG connection lost');
        return { rows: [{ memory_bytes: String(64 * MiB) }] };
      });
      await expect(
        configurePgIndexMemory({ client: { query }, rows: 250000, dimensions: 1536 })
      ).rejects.toThrow('PG connection lost');
    }
  );
});
