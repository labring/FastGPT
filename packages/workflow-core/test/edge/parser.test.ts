import {
  WorkflowCommandError,
  parseExecutionSourcePortRef,
  parseExecutionTargetPortRef,
  parseVariableRef
} from '../../src';
import { describe, expect, it } from 'vitest';

describe('parseExecutionSourcePortRef', () => {
  it.each([
    ['start@next', { kind: 'next', nodeId: 'start' }],
    ['route@branch:yes', { kind: 'branch', nodeId: 'route', branchKey: 'yes' }],
    ['source@output:done', { kind: 'sourceOutput', nodeId: 'source', outputKey: 'done' }],
    ['node@catch', { kind: 'catch', nodeId: 'node' }],
    ['caller@tools', { kind: 'selectedTools', nodeId: 'caller' }]
  ])('parses %s', (value, expected) => {
    expect(parseExecutionSourcePortRef(value)).toEqual(expected);
  });

  it.each(['start', '@next', 'start@unknown', 'start@branch:', 'start@output:'])(
    'rejects %s',
    (value) => {
      expect(() => parseExecutionSourcePortRef(value)).toThrow(WorkflowCommandError);
    }
  );
});

describe('parseExecutionTargetPortRef', () => {
  it('parses normal and tool targets', () => {
    expect(parseExecutionTargetPortRef('ai@target')).toEqual({ kind: 'target', nodeId: 'ai' });
    expect(parseExecutionTargetPortRef('tool@tools')).toEqual({
      kind: 'selectedTools',
      nodeId: 'tool'
    });
  });

  it.each(['ai', '@target', 'ai@next'])('rejects %s', (value) => {
    expect(() => parseExecutionTargetPortRef(value)).toThrow(WorkflowCommandError);
  });
});

describe('parseVariableRef', () => {
  it('uses the last dot as separator', () => {
    expect(parseVariableRef('group.node.output')).toEqual({
      nodeId: 'group.node',
      outputKey: 'output'
    });
  });

  it.each(['node', '.output', 'node.'])('rejects %s', (value) => {
    expect(() => parseVariableRef(value)).toThrow(WorkflowCommandError);
  });
});
