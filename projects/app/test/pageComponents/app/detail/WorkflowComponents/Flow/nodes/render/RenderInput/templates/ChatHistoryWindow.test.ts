import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import {
  storeNodes2RuntimeNodes,
  getMaxHistoryLimitFromNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { nodeTemplate2FlowNode, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { uiWorkflow2StoreWorkflow } from '@/pageComponents/app/detail/WorkflowComponents/utils';

const mocks = vi.hoisted(() => ({ change: vi.fn() }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_: unknown, select: (value: unknown) => unknown) =>
    select({ onChangeNode: mocks.change })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: {}
}));
import ChatHistoryWindow from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/ChatHistoryWindow';

/** 遍历组件输出，调用真实控件回调，再走实际保存/恢复转换。 */
const elements = (element: unknown): ReactElement<Record<string, any>>[] => {
  if (Array.isArray(element)) return element.flatMap(elements);
  if (!isValidElement<Record<string, any>>(element)) return [];
  return [element, ...elements(element.props.children)];
};

describe('periodic history editor persistence', () => {
  beforeEach(() => vi.clearAllMocks());
  const render = (inputs: FlowNodeInputItemType[]) =>
    elements(
      (ChatHistoryWindow as any).type({
        nodeId: 'chat',
        inputs,
        fixedInput: 'fixed-history-input',
        history: 6
      })
    );
  const apply = (inputs: FlowNodeInputItemType[]) => {
    const change = mocks.change.mock.lastCall![0];
    return change.type === 'addInput'
      ? [...inputs, change.value]
      : inputs.map((input) => (input.key === change.key ? change.value : input));
  };
  const saveAndReload = (inputs: FlowNodeInputItemType[]) => {
    const node = nodeTemplate2FlowNode({
      template: AiChatModule,
      position: { x: 0, y: 0 },
      t: ((key: string) => key) as any
    });
    node.data.nodeId = 'chat';
    node.data.inputs = inputs;
    const stored = JSON.parse(
      JSON.stringify(uiWorkflow2StoreWorkflow({ nodes: [node], edges: [] }))
    );
    const restored = storeNode2FlowNode({
      item: stored.nodes[0],
      t: ((key: string) => key) as any
    });
    return { stored, restored };
  };
  it('does not enable the feature on render and supports old nodes without the hidden input', () => {
    let inputs = AiChatModule.inputs.filter(
      (input) => input.key !== NodeInputKeyEnum.aiChatHistoryWindow
    );
    const controls = render(inputs);
    expect(mocks.change).not.toHaveBeenCalled();
    const toggle = controls.find(
      (element) => element.props['aria-label'] === 'workflow:history_window_enabled'
    )!;
    expect(toggle.props.isChecked).toBe(false);
    toggle.props.onChange({ target: { checked: true } });
    inputs = apply(inputs);
    expect(
      inputs.find((input) => input.key === NodeInputKeyEnum.aiChatHistoryWindow)?.value
    ).toEqual({ min: 6, max: 12 });
    const { restored } = saveAndReload(inputs);
    expect(
      render(restored.data.inputs).find((element) => element.props.isChecked !== undefined)?.props
        .isChecked
    ).toBe(true);
  });
  it('persists edited limits through save, reload and runtime history loading', () => {
    let inputs = AiChatModule.inputs.map((input) =>
      input.key === NodeInputKeyEnum.aiChatHistoryWindow
        ? { ...input, value: { min: 6, max: 12 } }
        : input
    );
    const maximum = render(inputs).find(
      (element) => element.props['aria-label'] === 'workflow:history_window_max'
    )!;
    maximum.props.onBlur({ currentTarget: { value: '40' } });
    inputs = apply(inputs);
    const { stored, restored } = saveAndReload(inputs);
    const runtime = storeNodes2RuntimeNodes(stored.nodes, []);
    expect(
      runtime[0].inputs.find((input) => input.key === NodeInputKeyEnum.aiChatHistoryWindow)?.value
    ).toEqual({ min: 6, max: 40 });
    expect(getMaxHistoryLimitFromNodes(stored.nodes)).toBe(80);
    expect(
      render(restored.data.inputs)
        .filter((element) => element.props.precision === 0)
        .map((element) => element.props.defaultValue)
    ).toEqual([6, 40]);
  });
  it('keeps limits valid when edited across each other and restores the fixed setting on disable', () => {
    let inputs = AiChatModule.inputs.map((input) =>
      input.key === NodeInputKeyEnum.aiChatHistoryWindow
        ? { ...input, value: { min: 6, max: 12 } }
        : input
    );
    render(inputs)
      .find((element) => element.props['aria-label'] === 'workflow:history_window_min')!
      .props.onBlur({ currentTarget: { value: '20' } });
    inputs = apply(inputs);
    expect(
      inputs.find((input) => input.key === NodeInputKeyEnum.aiChatHistoryWindow)?.value
    ).toEqual({ min: 20, max: 20 });
    render(inputs)
      .find((element) => element.props.isChecked !== undefined)!
      .props.onChange({ target: { checked: false } });
    const { restored } = saveAndReload(apply(inputs));
    expect(
      restored.data.inputs.find((input) => input.key === NodeInputKeyEnum.history)?.value
    ).toBe(6);
    expect(
      render(restored.data.inputs).find((element) => element.props.isChecked !== undefined)?.props
        .isChecked
    ).toBe(false);
  });
});
