import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';

const mocks = vi.hoisted(() => ({
  getPreview: vi.fn(),
  toast: vi.fn(),
  configToolProps: undefined as SelectedToolItemType | undefined,
  selectedTools: [] as SelectedToolItemType[],
  onUpdateOrAddTool: vi.fn(),
  onDeleteTool: vi.fn()
}));

vi.mock('@/web/core/app/api/tool', () => ({
  getClientToolPreviewNode: mocks.getPreview,
  getNewToolPreviewNode: vi.fn(),
  getAppToolTemplates: vi.fn(),
  getTeamAppTemplatesV2: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ data: [] })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('next/dynamic', () => ({
  default: () => (props: { configTool?: SelectedToolItemType }) => {
    mocks.configToolProps = props.configTool;
    return null;
  }
}));

import { useSkillManager } from '@/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager';

const createFullTool = (): SelectedToolItemType =>
  ({
    id: 'full-tool',
    pluginId: 'full-tool',
    name: 'Full tool',
    avatar: '',
    flowNodeType: FlowNodeTypeEnum.tool,
    inputs: [
      {
        key: 'query',
        label: 'Query',
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        selectedType: FlowNodeInputTypeEnum.input,
        value: 'full value'
      }
    ],
    outputs: [],
    configStatus: 'configured'
  }) as unknown as SelectedToolItemType;

const createCompactTool = (): SelectedToolItemType =>
  ({
    id: 'review-tool',
    name: 'Review tool',
    inputs: [{ key: 'query', mode: AgentToolInputModeEnum.manual }],
    config: { query: 'saved query' }
  }) as unknown as SelectedToolItemType;

const createZeroInputFullTool = (): SelectedToolItemType =>
  ({
    id: 'zero-tool',
    pluginId: 'zero-tool',
    name: 'Zero input tool',
    avatar: '',
    flowNodeType: FlowNodeTypeEnum.tool,
    inputs: [],
    outputs: [],
    configStatus: 'configured'
  }) as unknown as SelectedToolItemType;

const createPreview = () =>
  ({
    id: 'preview-id',
    pluginId: 'review-tool',
    name: 'Live tool',
    avatar: '',
    flowNodeType: FlowNodeTypeEnum.tool,
    inputs: [
      {
        key: 'query',
        label: 'Query',
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        value: 'default query'
      }
    ],
    outputs: []
  }) as any;

describe('useSkillManager tool config', () => {
  let dom: JSDOM;
  let root: Root;
  let manager: ReturnType<typeof useSkillManager>;

  const Harness = () => {
    manager = useSkillManager({
      selectedTools: mocks.selectedTools,
      onUpdateOrAddTool: mocks.onUpdateOrAddTool,
      onDeleteTool: mocks.onDeleteTool,
      canUploadFile: false,
      hasSelectedDataset: false,
      useAgentSandbox: false
    });
    return React.createElement(manager.SkillModal);
  };

  beforeEach(async () => {
    mocks.getPreview.mockReset();
    mocks.toast.mockReset();
    mocks.configToolProps = undefined;
    mocks.selectedTools = [];
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('opens the config modal immediately for a full editor tool', async () => {
    mocks.selectedTools = [createFullTool()];
    await act(async () => root.render(React.createElement(Harness)));

    let result: SelectedToolItemType | undefined;
    await act(async () => {
      result = await manager.onClickSkill('full-tool');
    });

    expect(mocks.getPreview).not.toHaveBeenCalled();
    expect(result?.flowNodeType).toBe(FlowNodeTypeEnum.tool);
    expect(mocks.configToolProps?.flowNodeType).toBe(FlowNodeTypeEnum.tool);
  });

  it('opens zero-input full tools directly instead of treating them as compact', async () => {
    mocks.selectedTools = [createZeroInputFullTool()];
    await act(async () => root.render(React.createElement(Harness)));

    let result: SelectedToolItemType | undefined;
    await act(async () => {
      result = await manager.onClickSkill('zero-tool');
    });

    expect(mocks.getPreview).not.toHaveBeenCalled();
    expect(result?.id).toBe('zero-tool');
    expect(mocks.configToolProps?.id).toBe('zero-tool');
  });

  it('hydrates a compact imported tool and opens the config modal with saved config', async () => {
    mocks.selectedTools = [createCompactTool()];
    mocks.getPreview.mockResolvedValue(createPreview());
    await act(async () => root.render(React.createElement(Harness)));

    let result: SelectedToolItemType | undefined;
    await act(async () => {
      result = await manager.onClickSkill('review-tool');
    });

    expect(mocks.getPreview).toHaveBeenCalledWith({
      appId: 'review-tool',
      versionId: '',
      source: undefined,
      lang: 'en'
    });
    expect(result).toMatchObject({
      id: 'review-tool',
      pluginId: 'review-tool',
      flowNodeType: FlowNodeTypeEnum.tool
    });
    const queryInput = result?.inputs.find((input) => input.key === 'query');
    expect(queryInput).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.input,
      value: 'saved query'
    });
    expect(mocks.configToolProps?.flowNodeType).toBe(FlowNodeTypeEnum.tool);
    expect(mocks.configToolProps?.inputs.find((input) => input.key === 'query')).toMatchObject({
      value: 'saved query'
    });
  });

  it('shows a warning and keeps the modal closed when hydration fails', async () => {
    mocks.selectedTools = [createCompactTool()];
    mocks.getPreview.mockRejectedValueOnce(new Error('tool missing'));
    await act(async () => root.render(React.createElement(Harness)));

    await act(async () => {
      await manager.onClickSkill('review-tool');
    });

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning' }));
    expect(mocks.configToolProps).toBeUndefined();
  });
});
