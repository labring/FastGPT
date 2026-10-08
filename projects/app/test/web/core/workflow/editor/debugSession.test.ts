import { describe, expect, it } from 'vitest';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  failDebugStep,
  openDebugSession,
  resolveDebugStep,
  startDebugStep,
  stopDebugSession,
  type DebugStepNodeResponse
} from '@/web/core/workflow/editor/debug/workflowDebugOverlay';

const runningStatus = { status: 'running', message: '', showResult: false };

/** 交互续跑响应：结构只取判定用到的字段，其余按类型断言补齐。 */
const userSelectResponse = {
  type: 'userSelect',
  params: { description: 'pick one', userSelectOptions: ['a'] }
} as unknown as InteractiveNodeResponseType;

describe('debugSession open/stop', () => {
  it('open 只清 session 写过的节点，且不动选中态', () => {
    const transition = openDebugSession({ writtenNodeIds: ['a', 'b'], selectedNodeIds: ['a'] });

    expect(transition.overlayPatches).toEqual([
      { nodeId: 'a', values: { debugResult: undefined } },
      { nodeId: 'b', values: { debugResult: undefined } }
    ]);
    expect(transition.selectionPatches).toEqual([]);
    expect(transition.nextWrittenNodeIds).toEqual([]);
    expect(transition.nextSelectedNodeIds).toEqual(['a']);
  });

  it('stop 只清 session 集合，调试期间删掉的节点不残留也不报错', () => {
    // 'deleted' 在停止前已从画布删除：patch 仍按 session 足迹下发，画布侧按 id 找不到即忽略。
    const transition = stopDebugSession({
      writtenNodeIds: ['a', 'deleted'],
      selectedNodeIds: ['a']
    });

    expect(transition.overlayPatches).toEqual([
      { nodeId: 'a', values: { debugResult: undefined } },
      { nodeId: 'deleted', values: { debugResult: undefined } }
    ]);
    expect(transition.selectionPatches).toEqual([{ id: 'a', type: 'select', selected: false }]);
    expect(transition.nextWrittenNodeIds).toEqual([]);
    expect(transition.nextSelectedNodeIds).toEqual([]);
  });

  it('空 session 的 open/stop 不产生任何写入', () => {
    const empty = { writtenNodeIds: [], selectedNodeIds: [] };

    expect(openDebugSession(empty).overlayPatches).toEqual([]);
    expect(stopDebugSession(empty).selectionPatches).toEqual([]);
  });
});

describe('debugSession step', () => {
  it('step 开始只清上一轮写过的节点，并把本步 entry 标成运行中', () => {
    const transition = startDebugStep({
      writtenNodeIds: ['a'],
      selectedNodeIds: ['a'],
      entryNodeIds: ['b']
    });

    expect(transition.overlayPatches).toEqual([
      { nodeId: 'a', values: { debugResult: undefined } },
      { nodeId: 'b', values: { debugResult: runningStatus } }
    ]);
    expect(transition.selectionPatches).toEqual([{ id: 'a', type: 'select', selected: false }]);
    expect(transition.nextWrittenNodeIds).toEqual(['b']);
    expect(transition.nextSelectedNodeIds).toEqual([]);
  });

  it('entry 节点带着上一步结果时合并成一条 patch', () => {
    const transition = startDebugStep({
      writtenNodeIds: ['a'],
      selectedNodeIds: [],
      entryNodeIds: ['a']
    });

    expect(transition.overlayPatches).toEqual([
      { nodeId: 'a', values: { debugResult: runningStatus } }
    ]);
  });

  it('step 成功只写有响应的节点，只选中跑过的 entry', () => {
    const nodeResponses: Record<string, DebugStepNodeResponse> = {
      b: { type: 'run' },
      c: { type: 'skip' }
    };
    const transition = resolveDebugStep({
      writtenNodeIds: ['b'],
      selectedNodeIds: [],
      entryNodeIds: ['b'],
      nodeResponses
    });

    expect(transition.overlayPatches).toEqual([
      {
        nodeId: 'b',
        values: {
          debugResult: {
            status: 'success',
            response: undefined,
            showResult: true,
            isExpired: false,
            interactiveResponse: undefined
          }
        }
      },
      {
        nodeId: 'c',
        values: {
          debugResult: {
            status: 'skipped',
            response: undefined,
            showResult: true,
            isExpired: false,
            interactiveResponse: undefined
          }
        }
      }
    ]);
    // c 是 skip，不进选中集合
    expect(transition.selectionPatches).toEqual([{ id: 'b', type: 'select', selected: true }]);
    expect(transition.nextWrittenNodeIds).toEqual(['b', 'c']);
    expect(transition.nextSelectedNodeIds).toEqual(['b']);
  });

  it('选中只 patch 旧选中与新选中的差集', () => {
    const transition = resolveDebugStep({
      writtenNodeIds: [],
      selectedNodeIds: ['b'],
      entryNodeIds: ['b', 'c'],
      nodeResponses: { b: { type: 'run' }, c: { type: 'run' } }
    });

    expect(transition.selectionPatches).toEqual([{ id: 'c', type: 'select', selected: true }]);
    expect(transition.nextSelectedNodeIds).toEqual(['b', 'c']);
  });

  it('交互续跑：interactiveResponse 落 overlay，下一轮 step 按足迹清掉', () => {
    const resolved = resolveDebugStep({
      writtenNodeIds: ['b'],
      selectedNodeIds: [],
      entryNodeIds: ['b'],
      nodeResponses: { b: { type: 'run', interactiveResponse: userSelectResponse } }
    });

    expect(resolved.overlayPatches[0].values.debugResult).toMatchObject({
      status: 'success',
      interactiveResponse: userSelectResponse
    });
    expect(resolved.nextWrittenNodeIds).toEqual(['b']);

    // 用户提交交互后继续跑：entry 仍是同一个节点，上一轮结果被清成运行中
    const next = startDebugStep({
      writtenNodeIds: resolved.nextWrittenNodeIds,
      selectedNodeIds: resolved.nextSelectedNodeIds,
      entryNodeIds: ['b']
    });

    expect(next.overlayPatches).toEqual([{ nodeId: 'b', values: { debugResult: runningStatus } }]);
    expect(next.selectionPatches).toEqual([{ id: 'b', type: 'select', selected: false }]);
  });

  it('无响应时不写 overlay，也不改选中', () => {
    const transition = resolveDebugStep({
      writtenNodeIds: ['b'],
      selectedNodeIds: ['b'],
      entryNodeIds: ['b'],
      nodeResponses: {}
    });

    expect(transition.overlayPatches).toEqual([]);
    expect(transition.selectionPatches).toEqual([{ id: 'b', type: 'select', selected: false }]);
    expect(transition.nextWrittenNodeIds).toEqual(['b']);
    expect(transition.nextSelectedNodeIds).toEqual([]);
  });
});

describe('debugSession fail', () => {
  it('失败只写本次 entry 节点，其余足迹保持不变', () => {
    const transition = failDebugStep({
      writtenNodeIds: ['b'],
      selectedNodeIds: [],
      entryNodeIds: ['b'],
      message: 'Debug failed'
    });

    expect(transition.overlayPatches).toEqual([
      {
        nodeId: 'b',
        values: { debugResult: { status: 'failed', message: 'Debug failed', showResult: true } }
      }
    ]);
    expect(transition.selectionPatches).toEqual([]);
    expect(transition.nextWrittenNodeIds).toEqual(['b']);
    expect(transition.nextSelectedNodeIds).toEqual([]);
  });

  it('entry 为空时失败态不产生写入', () => {
    const transition = failDebugStep({
      writtenNodeIds: ['b'],
      selectedNodeIds: [],
      entryNodeIds: [],
      message: 'Debug failed'
    });

    expect(transition.overlayPatches).toEqual([]);
    expect(transition.nextWrittenNodeIds).toEqual(['b']);
  });
});
