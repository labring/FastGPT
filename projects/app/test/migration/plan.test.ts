import { describe, expect, it } from 'vitest';
import { createSystemMigrationPlan } from '@/migration/plan';
import type { SystemMigration } from '@/migration/registry';

const migration = (name: string, options: Partial<SystemMigration> = {}): SystemMigration => ({
  id: `20261026_${name}`,
  version: '4.17.4',
  nameKey: 'system_migration:name',
  descriptionKey: 'system_migration:description',
  resultKey: 'system_migration:result',
  progressSteps: [],
  run: async () => undefined,
  ...options
});

describe('createSystemMigrationPlan', () => {
  it('prioritizes the complete shared dependency closure in stable topological order', () => {
    const unrelated = migration('unrelated');
    const base = migration('base', { independent: true });
    const other = migration('other', { independent: true });
    const middle = migration('middle', { dependsOn: [base.id] });
    const root = migration('root', { blockStartup: true, dependsOn: [middle.id, base.id] });
    const second = migration('second', { blockStartup: true, dependsOn: [base.id] });
    const registry = [unrelated, base, other, middle, root, second];
    expect(createSystemMigrationPlan(registry)).toEqual({
      startupMigrations: [base, middle, root, second],
      backgroundMigrations: [unrelated, other]
    });
    // 提升只影响计划，不改写发布元数据，也不把共享依赖重复放入队列。
    expect(base).not.toHaveProperty('blockStartup');
    expect(base.independent).toBe(true);
  });

  it.each([{ registry: [] }, { registry: [migration('ordinary')] }])(
    'keeps a registry without blockers in the background: %j',
    ({ registry }) => {
      expect(createSystemMigrationPlan(registry)).toEqual({
        startupMigrations: [],
        backgroundMigrations: registry
      });
    }
  );

  it.each([
    { manual: true, asDependency: false },
    { delay: true, asDependency: false },
    { manual: true, asDependency: true },
    { delay: true, asDependency: true }
  ])(
    'rejects non-automatic work anywhere in the startup chain: %o',
    ({ asDependency, ...mode }) => {
      const prerequisite = migration('prerequisite', mode);
      const registry = asDependency
        ? [prerequisite, migration('root', { blockStartup: true, dependsOn: [prerequisite.id] })]
        : [{ ...prerequisite, blockStartup: true }];
      expect(() => createSystemMigrationPlan(registry)).toThrow(
        'Startup migration chain cannot include manual or delayed task'
      );
    }
  );

  it('rejects conflicting root execution modes and invalid dependency references', () => {
    expect(() =>
      createSystemMigrationPlan([migration('root', { blockStartup: true, independent: true })])
    ).toThrow('cannot run independently');
    expect(() =>
      createSystemMigrationPlan([
        migration('root', { blockStartup: true, dependsOn: ['20261026_missing'] })
      ])
    ).toThrow('must depend on an earlier registered task');
  });
});
