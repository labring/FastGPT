import { describe, expect, it, vi } from 'vitest';
import { WorkflowRunStateSnapshot } from '@fastgpt/service/core/workflow/dispatch/utils/containerRunState';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/context/variables';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { createNode } from '../../utils';

/** 使用真实变量实例验证深拷贝与 set 转换，不 mock 快照内部实现。 */
const createVariables = async (values: Record<string, unknown> = {}) => {
  const parent = await WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'snapshot-app',
      teamId: 'snapshot-team',
      tmbId: 'snapshot-member',
      name: 'Snapshot'
    },
    uid: 'snapshot-user',
    chatId: 'snapshot-chat',
    variablesConfig: []
  });
  for (const [key, value] of Object.entries(values)) await parent.set(key, value);
  return parent;
};

/** 构造最小合法运行节点，output 对象身份用于验证提交只改值而不替换父图。 */
const createOutputNode = (nodeId: string, values: Record<string, unknown> = {}) => ({
  ...createNode(nodeId, FlowNodeTypeEnum.code),
  outputs: Object.entries(values).map(([id, value]) => ({
    id,
    key: id,
    label: id,
    type: FlowNodeOutputTypeEnum.static,
    valueType: WorkflowIOValueTypeEnum.any,
    value
  }))
});

describe('WorkflowRunStateSnapshot', () => {
  it('requires at least one state source', () => {
    expect(() => new WorkflowRunStateSnapshot({})).toThrow('requires variables or node outputs');
  });

  it('owns an isolated variable copy and commits only net changes from its baseline', async () => {
    const parent = await createVariables({
      count: 1,
      enabled: true,
      text: 'before',
      nested: { items: [1] },
      unchanged: 'before',
      restored: 1
    });
    const snapshot = new WorkflowRunStateSnapshot({ variableContext: parent });
    const child = snapshot.variableContext;
    expect(child).not.toBe(parent);
    expect(snapshot.variableContext).toBe(child);
    await child.set('count', 0);
    await child.set('enabled', false);
    await child.set('text', '');
    await child.set('added', undefined);
    await child.set('restored', 2);
    await child.set('restored', 1);
    const nested = child.get('nested');
    if (!nested || typeof nested !== 'object' || !('items' in nested)) {
      throw new Error('Invalid nested test value');
    }
    if (!Array.isArray(nested.items)) throw new Error('Invalid nested items');
    nested.items.push(2);
    expect(parent.get('nested')).toEqual({ items: [1] });
    expect(parent.get('count')).toBe(1);

    await parent.set('unchanged', 'concurrent update');
    await parent.set('restored', 3);
    const parentSet = vi.spyOn(parent, 'set');
    await snapshot.commit();

    expect(parent.get('count')).toBe(0);
    expect(parent.get('enabled')).toBe(false);
    expect(parent.get('text')).toBe('');
    expect(parent.get('nested')).toEqual({ items: [1, 2] });
    expect(parent.toRuntimeRecord()).toHaveProperty('added', undefined);
    expect(parent.get('unchanged')).toBe('concurrent update');
    expect(parent.get('restored')).toBe(3);
    expect(parentSet.mock.calls.map(([key]) => key)).toEqual([
      'count',
      'enabled',
      'text',
      'nested',
      'added'
    ]);
    nested.items.push(3);
    expect(parent.get('nested')).toEqual({ items: [1, 2] });
  });

  it('commits independent snapshots immediately in completion order', async () => {
    const parent = await createVariables({ shared: 0, firstOnly: 0, secondOnly: 0 });
    const first = new WorkflowRunStateSnapshot({ variableContext: parent });
    const second = new WorkflowRunStateSnapshot({ variableContext: parent });
    await first.variableContext.set('shared', 1);
    await first.variableContext.set('firstOnly', 1);
    await second.variableContext.set('shared', 2);
    await second.variableContext.set('secondOnly', 2);

    await second.commit();
    expect(parent.get('shared')).toBe(2);
    await first.commit();
    expect(parent.get('shared')).toBe(1);
    expect(parent.get('firstOnly')).toBe(1);
    expect(parent.get('secondOnly')).toBe(2);
  });

  it('discards both variable and output changes without modifying the parent', async () => {
    const parent = await createVariables({ value: 1 });
    const target = createOutputNode('outside', { value: 1 });
    const source = createOutputNode('outside', { value: 1 });
    const snapshot = new WorkflowRunStateSnapshot({
      variableContext: parent,
      nodeOutputs: { sourceNodes: [source], targetNodes: [target] }
    });
    await snapshot.variableContext.set('value', 2);
    source.outputs[0].value = 2;
    snapshot.discard();
    expect(parent.get('value')).toBe(1);
    expect(target.outputs[0].value).toBe(1);
    await expect(snapshot.commit()).rejects.toThrow('already settled');
    expect(() => snapshot.discard()).toThrow('already settled');
  });

  it('updates only changed external outputs and preserves parent node/output identity', async () => {
    const source = createOutputNode('outside', { changed: { items: [1] }, untouched: 1 });
    const target = createOutputNode('outside', { changed: { items: [1] }, untouched: 1 });
    const childSource = createOutputNode('inside', { value: 1 });
    const childTarget = createOutputNode('inside', { value: 1 });
    const originalOutput = target.outputs[0];
    const snapshot = new WorkflowRunStateSnapshot({
      nodeOutputs: {
        sourceNodes: [source, childSource],
        targetNodes: [target, childTarget],
        childrenNodeIdList: ['inside']
      }
    });
    source.outputs[0].value = { items: [1, 2] };
    source.isEntry = true;
    childSource.outputs[0].value = 2;
    target.outputs[1].value = 3;
    await snapshot.commit();

    expect(target.outputs[0]).toBe(originalOutput);
    expect(originalOutput.value).toEqual({ items: [1, 2] });
    expect(originalOutput.value).not.toBe(source.outputs[0].value);
    expect(target.outputs[1].value).toBe(3);
    expect(target.isEntry).toBe(false);
    expect(childTarget.outputs[0].value).toBe(1);
    expect(() => snapshot.variableContext).toThrow('has no variable context');
    await expect(snapshot.commit()).rejects.toThrow('already settled');
    expect(() => snapshot.discard()).toThrow('already settled');
  });

  it('tolerates nodes and outputs missing from either graph at commit time', async () => {
    const source = createOutputNode('outside', { changed: 1, sourceOnly: 1 });
    const target = createOutputNode('outside', { changed: 1, targetOnly: 1 });
    const noSourceOutputs = createOutputNode('no-source-outputs');
    const noTargetOutputs = createOutputNode('no-target-outputs');
    Reflect.deleteProperty(noSourceOutputs, 'outputs');
    Reflect.deleteProperty(noTargetOutputs, 'outputs');
    const sourceNodes = [
      source,
      noSourceOutputs,
      createOutputNode('no-target-outputs'),
      createOutputNode('removed', { value: 1 })
    ];
    const targetNodes = [
      target,
      createOutputNode('no-source-outputs', { value: 1 }),
      noTargetOutputs,
      createOutputNode('removed', { value: 1 }),
      createOutputNode('target-only')
    ];
    const snapshot = new WorkflowRunStateSnapshot({ nodeOutputs: { sourceNodes, targetNodes } });
    sourceNodes.pop();
    source.outputs[0].value = 2;
    source.outputs.push({ ...source.outputs[0], id: 'new', key: 'new', value: 3 });
    await snapshot.commit();
    expect(target.outputs.map(({ value }) => value)).toEqual([2, 1]);
    expect(targetNodes[1].outputs[0].value).toBe(1);
    expect(targetNodes[3].outputs[0].value).toBe(1);
  });

  it('keeps the existing shared-variable adapter behavior when clone returns the parent', async () => {
    const parent = await createVariables({ value: 1 });
    vi.spyOn(parent, 'clone').mockReturnValue(parent);
    const parentSet = vi.spyOn(parent, 'set');
    const snapshot = new WorkflowRunStateSnapshot({ variableContext: parent });
    await snapshot.commit();
    expect(parentSet).not.toHaveBeenCalled();
  });

  it('rejects a second commit while the first commit is still pending', async () => {
    const parent = await createVariables({ value: 1 });
    const snapshot = new WorkflowRunStateSnapshot({ variableContext: parent });
    await snapshot.variableContext.set('value', 2);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const set = parent.set.bind(parent);
    vi.spyOn(parent, 'set').mockImplementation(async (key, value) => {
      await gate;
      return set(key, value);
    });
    const committing = snapshot.commit();
    try {
      await expect(snapshot.commit()).rejects.toThrow('already settled');
      expect(() => snapshot.discard()).toThrow('already settled');
    } finally {
      release();
    }
    await committing;
    expect(parent.get('value')).toBe(2);
  });

  it('does not promise rollback after a partial commit and does not allow retrying the same snapshot', async () => {
    const parent = await createVariables({ first: 0, second: 0 });
    const source = createOutputNode('outside', { value: 0 });
    const target = createOutputNode('outside', { value: 0 });
    const snapshot = new WorkflowRunStateSnapshot({
      variableContext: parent,
      nodeOutputs: { sourceNodes: [source], targetNodes: [target] }
    });
    await snapshot.variableContext.set('first', 1);
    await snapshot.variableContext.set('second', 2);
    source.outputs[0].value = 1;
    const set = parent.set.bind(parent);
    const parentSet = vi.spyOn(parent, 'set').mockImplementation(async (key, value) => {
      if (key === 'second') throw new Error('commit failed');
      return set(key, value);
    });
    await expect(snapshot.commit()).rejects.toThrow('commit failed');
    expect(target.outputs[0].value).toBe(1);
    expect(parent.get('first')).toBe(1);
    expect(parent.get('second')).toBe(0);
    await expect(snapshot.commit()).rejects.toThrow('already settled');
    expect(() => snapshot.discard()).toThrow('already settled');

    parentSet.mockRestore();
    const next = new WorkflowRunStateSnapshot({ variableContext: parent });
    await next.variableContext.set('second', 3);
    await next.commit();
    expect(parent.get('second')).toBe(3);
  });

  it('preserves configured file metadata and password storage through the parent setter', async () => {
    const parent = await WorkflowVariableState.create({
      timezone: 'Asia/Shanghai',
      runningAppInfo: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'snapshot-app',
        teamId: 'snapshot-team',
        tmbId: 'snapshot-member',
        name: 'Snapshot'
      },
      uid: 'snapshot-user',
      chatId: 'snapshot-chat',
      variablesConfig: [
        { key: 'files', label: 'Files', description: '', type: VariableInputEnum.file },
        { key: 'password', label: 'Password', description: '', type: VariableInputEnum.password }
      ],
      inputVariables: {
        files: [{ key: 'private-file', name: 'private.pdf', type: 'file' }],
        password: 'before'
      },
      maxFileAmount: 5,
      resolveInputFile: async () => 'https://example.com/private.pdf'
    });
    const snapshot = new WorkflowRunStateSnapshot({ variableContext: parent });
    await snapshot.variableContext.set('files', [
      'https://example.com/private.pdf',
      'https://example.com/external.pdf'
    ]);
    await snapshot.variableContext.set('password', 'after');
    await snapshot.commit();

    expect(parent.get('password')).toBe('after');
    expect(parent.getStoreValue('password')).toEqual({ value: '', secret: expect.any(String) });
    expect(parent.getStoreValue('files')).toEqual([
      { key: 'private-file', name: 'private.pdf', type: 'file' },
      expect.objectContaining({ url: 'https://example.com/external.pdf' })
    ]);
  });
});
