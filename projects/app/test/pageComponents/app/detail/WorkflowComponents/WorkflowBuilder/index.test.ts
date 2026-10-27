import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowBuilder from '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder';
import type { WorkflowBuilderVersionActions } from '@/web/core/chat/context/chatItemContext';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import { parseCompatibleWorkflowDocument } from '@fastgpt/workflow-core/domain/document';
import workflowFixture from '@fastgpt/workflow-core/test/fixtures/basic-ai/workflow.json';
import workflowTranslations from '@fastgpt/web/i18n/zh-CN/workflow.json';

const mocks = vi.hoisted(() => ({
  actions: undefined as WorkflowBuilderVersionActions | undefined,
  latestVersion: undefined as WorkflowBuilderVersion | undefined,
  appDetail: {} as AppDetailType,
  load: vi.fn(),
  commit: vi.fn(),
  getModels: vi.fn(),
  getToolPreview: vi.fn(),
  parseImport: vi.fn(),
  initData: vi.fn(),
  flowData2StoreData: vi.fn(),
  getNodes: vi.fn(),
  getEdges: vi.fn(),
  setAppDetail: vi.fn(),
  pushPastSnapshot: vi.fn(),
  requestAutoLayout: vi.fn(),
  setActivity: vi.fn(),
  dismissBanner: vi.fn(),
  toast: vi.fn()
}));

vi.mock('next-i18next', async () => {
  const { Trans } = await import('react-i18next');
  return { Trans, useTranslation: () => ({ t: (key: string) => key }) };
});
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext', () => ({
  WorkflowUtilsContext: {}
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', () => ({
  WorkflowBufferDataContext: {}
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowSnapshotContext', () => ({
  WorkflowSnapshotContext: {}
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, select: (value: unknown) => unknown) =>
    select({ appId: 'app-1', ...mocks })
}));
vi.mock('@/pageComponents/dashboard/agent/utils/appTemplateParse', () => ({
  parseWorkflowImportConfig: mocks.parseImport
}));
vi.mock('@/web/core/ai/model/modelData', () => ({ getModelList: mocks.getModels }));
vi.mock('@/web/core/app/api/tool', () => ({ getClientToolPreviewNode: mocks.getToolPreview }));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: { getState: () => ({ defaultModelIds: {} }) }
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api', () => ({
  loadWorkflowBuilderVersion: mocks.load,
  commitWorkflowBuilderVersion: mocks.commit
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflowAutoLayout', () => ({
  useWorkflowAutoLayout: () => ({ requestAutoLayout: mocks.requestAutoLayout })
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/hooks/useWorkflowBuilderUI',
  () => ({
    useWorkflowBuilderUI: () => ({
      entryAccess: 'enabled',
      isOpen: true,
      showLatestBanner: true,
      latestTarget: { version: mocks.latestVersion, responseChatItemId: 'response-2' },
      setActivity: mocks.setActivity,
      dismissBanner: mocks.dismissBanner
    })
  })
);
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/presentation/CommercialInput',
  () => ({
    default: () => null
  })
);
vi.mock('@/pageComponents/app/detail/components/AppDetailPanelModal', async () => {
  const { createElement } = await import('react');
  return { default: ({ children }: any) => createElement('div', null, children) };
});
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Container = ({ children }: any) => createElement('div', null, children);
  return {
    Box: Container,
    Flex: Container,
    Portal: Container,
    Text: ({ children, as = 'span', fontWeight }: any) =>
      createElement(as, { style: { fontWeight } }, children),
    Button: ({ children, onClick, isDisabled }: any) =>
      createElement('button', { onClick, disabled: isDisabled }, children),
    IconButton: Container
  };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel', async () => {
  const { forwardRef, useEffect } = await import('react');
  return {
    default: forwardRef(({ workflowBuilderVersionActions, onChatIdChange }: any, _ref) => {
      mocks.actions = workflowBuilderVersionActions;
      useEffect(() => onChatIdChange('chat-1'), [onChatIdChange]);
      return null;
    })
  };
});

/** 控制请求完成顺序，覆盖两次应用及失败恢复之间的竞争。 */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

describe('WorkflowBuilder applyVersion', () => {
  let dom: JSDOM;
  let root: Root;
  let canvas: ReturnType<typeof compileStoreWorkflow>;
  const document = parseCompatibleWorkflowDocument(workflowFixture);
  const version: WorkflowBuilderVersion = {
    versionNo: 1,
    name: 'AI 生成版本 1',
    filename: 'version-1.json',
    checksum: `sha256:${'1'.repeat(64)}`,
    generatedAt: '2026-10-19T00:00:00.000Z',
    expiresAt: '2099-10-20T00:00:00.000Z'
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    canvas = { nodes: [], edges: [], chatConfig: { welcomeText: 'original' } };
    mocks.appDetail = {
      type: AppTypeEnum.workflow,
      chatConfig: canvas.chatConfig
    } as AppDetailType;
    mocks.flowData2StoreData.mockImplementation(() => structuredClone(canvas));
    mocks.getNodes.mockImplementation(() => canvas.nodes);
    mocks.getEdges.mockImplementation(() => canvas.edges);
    mocks.setAppDetail.mockImplementation((update) => {
      mocks.appDetail = update(mocks.appDetail);
    });
    mocks.load.mockResolvedValue({ document, checksum: version.checksum });
    mocks.commit.mockResolvedValue({ ...version, appliedAt: '2026-10-19T01:00:00.000Z' });
    mocks.getModels.mockResolvedValue([]);
    mocks.parseImport.mockImplementation(async ({ config }) => config);
    mocks.initData.mockImplementation(async (config) => {
      canvas = structuredClone(config);
      return 1;
    });
    mocks.requestAutoLayout.mockResolvedValue('applied');
    mocks.latestVersion = version;
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => root.render(React.createElement(WorkflowBuilder)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects overlapping calls before a render, restores a failed application, then allows retry', async () => {
    const commit = deferred<WorkflowBuilderVersion>();
    mocks.commit.mockReturnValueOnce(commit.promise);
    let first!: Promise<WorkflowBuilderVersion>;
    await act(async () => {
      first = mocks.actions!.applyVersion(version, 'response-1');
      // 两个入口可以在同一次 React 渲染前触发，不能只依赖 loading state。
      await expect(mocks.actions!.applyVersion(version, 'response-2')).rejects.toThrow(
        'being applied'
      );
    });
    expect(mocks.actions!.isApplying).toBe(true);
    expect(dom.window.document.querySelector('button')!.disabled).toBe(true);
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.initData).toHaveBeenCalledOnce();
    expect(canvas.nodes).toHaveLength(document.nodes.length);

    await act(async () => {
      const rejected = expect(first).rejects.toThrow('commit failed');
      commit.reject(new Error('commit failed'));
      await rejected;
    });
    expect(canvas).toEqual({ nodes: [], edges: [], chatConfig: { welcomeText: 'original' } });
    expect(mocks.actions!.isApplying).toBe(false);
    expect(mocks.pushPastSnapshot).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'error',
      title: 'workflow_builder_apply_failed',
      description: 'commit failed'
    });

    // 失败后可从横幅重新应用，与卡片共用同一把锁。
    await act(async () => dom.window.document.querySelector('button')!.click());
    expect(canvas.nodes).toHaveLength(document.nodes.length);
    expect(mocks.pushPastSnapshot).toHaveBeenCalledOnce();
    expect(mocks.actions!.isApplying).toBe(false);
    expect(dom.window.document.querySelector('button')!.disabled).toBe(false);
    expect(mocks.toast).toHaveBeenLastCalledWith({
      status: 'success',
      title: expect.anything()
    });
    const i18n = createInstance();
    await i18n.init({
      lng: 'zh-CN',
      resources: { 'zh-CN': { workflow: workflowTranslations } }
    });
    const successTitle = dom.window.document.createElement('div');
    successTitle.innerHTML = renderToStaticMarkup(
      React.createElement(I18nextProvider, { i18n }, mocks.toast.mock.lastCall![0].title)
    );
    expect(successTitle.textContent).toBe('「AI 生成版本 1」 应用成功');
    expect(successTitle.querySelector('strong')?.textContent).toBe('「AI 生成版本 1」');
    expect(successTitle.querySelector('span')?.style.fontWeight).toBe('normal');
    const updateActivity = mocks.setActivity.mock.lastCall![0];
    const activity = { latestVersion: { version, responseChatItemId: 'response-2' } };
    expect(updateActivity(activity).latestVersion.version).toHaveProperty('appliedAt');
    const newerActivity = {
      latestVersion: {
        version: { ...version, checksum: 'newer-checksum' },
        responseChatItemId: 'response-3'
      }
    };
    expect(updateActivity(newerActivity)).toBe(newerActivity);
  });

  it('keeps the lock until rollback finishes', async () => {
    const rollback = deferred<number>();
    mocks.commit.mockRejectedValueOnce(new Error('commit failed'));
    mocks.initData
      .mockImplementationOnce(async (config) => {
        canvas = structuredClone(config);
        return 1;
      })
      .mockReturnValueOnce(rollback.promise);
    let pending!: Promise<WorkflowBuilderVersion>;
    let rejection!: Promise<void>;
    await act(async () => {
      pending = mocks.actions!.applyVersion(version, 'response-1');
      rejection = expect(pending).rejects.toThrow('commit failed');
    });
    expect(mocks.initData).toHaveBeenCalledTimes(2);
    expect(mocks.actions!.isApplying).toBe(true);
    await expect(mocks.actions!.applyVersion(version, 'response-2')).rejects.toThrow(
      'being applied'
    );
    expect(mocks.load).toHaveBeenCalledOnce();

    await act(async () => {
      rollback.resolve(2);
      await rejection;
    });
    expect(mocks.actions!.isApplying).toBe(false);
  });

  it('keeps normalized chat models on the canvas while committing the original archive', async () => {
    const archivedDocument = structuredClone(document);
    archivedDocument.chatConfig.questionGuide = { open: true, modelId: 'removed-model' };
    const workflowConfig = compileStoreWorkflow(archivedDocument);
    workflowConfig.chatConfig = {
      ...workflowConfig.chatConfig,
      questionGuide: { open: true, modelId: 'available-model' }
    };
    mocks.load.mockResolvedValueOnce({ document: archivedDocument, checksum: version.checksum });
    mocks.parseImport.mockResolvedValueOnce(workflowConfig);
    mocks.appDetail = { ...mocks.appDetail, name: 'My app', intro: 'User description' };

    await act(async () => {
      await mocks.actions!.applyVersion(version, 'response-1');
    });

    expect(canvas.chatConfig).toEqual(workflowConfig.chatConfig);
    expect(mocks.appDetail).toMatchObject({
      name: 'My app',
      intro: 'User description',
      chatConfig: workflowConfig.chatConfig
    });
    expect(mocks.pushPastSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ chatConfig: workflowConfig.chatConfig })
    );
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({ document: archivedDocument, checksum: version.checksum })
    );
  });

  it('selects an available system secret only on the imported canvas and commits the unchanged archive', async () => {
    const archivedDocument = structuredClone(document);
    archivedDocument.nodes.push({
      nodeId: 'search',
      name: 'Search',
      flowNodeType: FlowNodeTypeEnum.tool,
      pluginId: 'search-tool',
      version: '1.0.0',
      inputs: [
        {
          key: NodeInputKeyEnum.systemInputConfig,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      outputs: []
    });
    mocks.load.mockResolvedValueOnce({ document: archivedDocument, checksum: version.checksum });
    mocks.getToolPreview.mockResolvedValue({ hasSystemSecret: true });

    await act(async () => {
      await mocks.actions!.applyVersion(version, 'response-1');
    });

    expect(canvas.nodes.find((node) => node.nodeId === 'search')?.inputs[0].value).toEqual({
      type: SystemToolSecretInputTypeEnum.system
    });
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        document: archivedDocument,
        checksum: version.checksum
      })
    );
    expect(mocks.commit.mock.lastCall![0].document.nodes.at(-1).inputs[0].value).toBeUndefined();
  });

  it('does not restore a snapshot when preparation fails before any canvas write', async () => {
    const prepare = deferred<ReturnType<typeof compileStoreWorkflow>>();
    mocks.parseImport.mockReturnValueOnce(prepare.promise);
    let pending!: Promise<WorkflowBuilderVersion>;
    await act(async () => {
      pending = mocks.actions!.applyVersion(version, 'response-1');
    });
    canvas.nodes = compileStoreWorkflow(document).nodes;
    const edited = structuredClone(canvas);
    await act(async () => {
      const rejected = expect(pending).rejects.toThrow('prepare failed');
      prepare.reject(new Error('prepare failed'));
      await rejected;
    });

    expect(canvas).toEqual(edited);
    expect(mocks.initData).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.actions!.isApplying).toBe(false);
  });

  it('captures edits made during preparation immediately before replacing the canvas', async () => {
    const prepare = deferred<ReturnType<typeof compileStoreWorkflow>>();
    mocks.parseImport.mockReturnValueOnce(prepare.promise);
    mocks.commit.mockRejectedValueOnce(new Error('commit failed'));
    let pending!: Promise<WorkflowBuilderVersion>;
    await act(async () => {
      pending = mocks.actions!.applyVersion(version, 'response-1');
    });
    canvas.nodes = compileStoreWorkflow(document).nodes.slice(0, 1);
    const edited = structuredClone(canvas);
    await act(async () => {
      const rejected = expect(pending).rejects.toThrow('commit failed');
      prepare.resolve(compileStoreWorkflow(document));
      await rejected;
    });

    expect(canvas).toEqual(edited);
    expect(mocks.initData).toHaveBeenLastCalledWith(edited);
    expect(mocks.actions!.isApplying).toBe(false);
  });

  it('preserves the application error and unlocks even when rollback fails', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('commit failed'));
    mocks.initData
      .mockImplementationOnce(async (config) => {
        canvas = structuredClone(config);
        return 1;
      })
      .mockRejectedValueOnce(new Error('rollback failed'));
    await act(async () => {
      await expect(mocks.actions!.applyVersion(version, 'response-1')).rejects.toThrow(
        'commit failed'
      );
    });

    expect(mocks.actions!.isApplying).toBe(false);
    expect(mocks.pushPastSnapshot).not.toHaveBeenCalled();
    await act(async () => {
      await expect(mocks.actions!.applyVersion(version, 'response-2')).resolves.toHaveProperty(
        'appliedAt'
      );
    });
  });

  it('rejects an unavailable canvas before writing and releases the lock', async () => {
    mocks.flowData2StoreData.mockReturnValue(undefined);
    await act(async () => {
      await expect(mocks.actions!.applyVersion(version, 'response-1')).rejects.toThrow(
        'canvas is unavailable'
      );
    });

    expect(mocks.initData).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.actions!.isApplying).toBe(false);
  });

  it('reports archive expiration without modifying the canvas', async () => {
    mocks.load.mockRejectedValue({
      code: ERROR_RESPONSE[AppErrEnum.workflowBuilderVersionExpired].code
    });
    await act(async () => {
      await expect(mocks.actions!.applyVersion(version, 'response-1')).rejects.toBeDefined();
    });

    expect(mocks.initData).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'error',
      title: 'workflow_builder_version_expired_toast'
    });
    expect(mocks.actions!.isApplying).toBe(false);
  });

  it('shows the API message below the apply failure title when loading a version fails', async () => {
    const error = {
      code: 500,
      statusText: 'error',
      message: 'Workflow Builder version not found',
      data: null,
      errorType: 'UserError'
    };
    mocks.load.mockRejectedValueOnce(error);
    await act(async () => {
      await expect(mocks.actions!.applyVersion(version, 'response-1')).rejects.toBe(error);
    });

    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      status: 'error',
      title: 'workflow_builder_apply_failed',
      description: error.message
    });
    expect(mocks.initData).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.actions!.isApplying).toBe(false);
  });
});
