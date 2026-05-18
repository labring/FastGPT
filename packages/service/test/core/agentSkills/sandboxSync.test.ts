import { describe, expect, it } from 'vitest';
import {
  validatePackagePath,
  withSkillEditLock
} from '@fastgpt/service/core/agentSkills/packageEditor';

// sandboxSync shares withSkillEditLock with packageEditor — verify lock behavior.
// Full syncEditDebugSandbox tests require MongoDB and sandbox infrastructure;
// these are covered by integration tests.

describe('sandboxSync lock integration', () => {
  it('shares the same lock per skillId as packageEditor', async () => {
    const order: string[] = [];

    // Simulate packageEditor holding the lock
    const editorTask = withSkillEditLock('s1', async () => {
      order.push('editor-start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('editor-end');
      return 'editor';
    });

    await Promise.resolve();
    // A concurrent "sync" would wait for the same lock
    const syncTask = withSkillEditLock('s1', async () => {
      order.push('sync-start');
      order.push('sync-end');
      return 'sync';
    });

    await Promise.all([editorTask, syncTask]);
    // sync must wait for editor
    expect(order).toEqual(['editor-start', 'editor-end', 'sync-start', 'sync-end']);
  });

  it('allows concurrent sync for different skillIds', async () => {
    const order: string[] = [];
    const a = withSkillEditLock('s1', async () => {
      order.push('s1-start');
      await new Promise((r) => setTimeout(r, 20));
      order.push('s1-end');
    });
    const b = withSkillEditLock('s2', async () => {
      order.push('s2-start');
      await new Promise((r) => setTimeout(r, 5));
      order.push('s2-end');
    });
    await Promise.all([a, b]);
    expect(order.indexOf('s2-end')).toBeLessThan(order.indexOf('s1-end'));
  });
});

describe('sandboxSync path validation', () => {
  it('rejects absolute paths (defense-in-depth for sandbox sync)', () => {
    expect(() => validatePackagePath('/etc/passwd')).toThrow();
  });

  it('rejects parent traversal (prevents sandbox escape)', () => {
    expect(() => validatePackagePath('skill-a/../../../root')).toThrow();
  });
});
