import { Schema } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDalLogger, setDalLogger } from '../../mongodb/logger';
import { createSlowQueryMiddleware } from '../../mongodb/middleware';

afterEach(() => {
  setDalLogger(undefined);
});

type SchemaHookApi = {
  execPre: (
    name: string,
    context: Record<string, unknown>,
    callback: (error: unknown) => void
  ) => Promise<void>;
  execPost: (...args: unknown[]) => Promise<void>;
};

const runSaveHooks = async (schema: Schema, startTime: number) => {
  const context: Record<string, unknown> = { name: 'item' };
  const hooks = (schema as unknown as { s: { hooks: SchemaHookApi } }).s.hooks;
  await hooks.execPre('save', context, (error: unknown) => {
    if (error) throw error;
  });
  context._startTime = startTime;
  await hooks.execPost('save', context, [context], (error: unknown) => {
    if (error) throw error;
  });
};

describe('addDalCommonMiddleware', () => {
  it('logs slow queries through the injected DAL logger', async () => {
    const warn = vi.fn();
    setDalLogger({ warn });
    const schema = new Schema({ name: String });
    createSlowQueryMiddleware(schema);

    await runSaveHooks(schema, Date.now() - 3000);

    expect(warn).toHaveBeenCalledWith(
      'MongoDB slow query (>2s)',
      expect.objectContaining({ duration: expect.any(Number), op: expect.any(String) })
    );
  });

  it('does not log fast operations', async () => {
    const warn = vi.fn();
    setDalLogger({ warn });
    const schema = new Schema({ name: String });
    createSlowQueryMiddleware(schema);

    await runSaveHooks(schema, Date.now());

    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the console logger when none is injected', () => {
    expect(getDalLogger()).toBeDefined();
  });
});
