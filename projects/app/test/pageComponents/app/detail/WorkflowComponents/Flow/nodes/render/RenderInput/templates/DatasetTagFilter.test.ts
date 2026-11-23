import { describe, expect, it, vi } from 'vitest';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { DatasetTagFilterLogic } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/DatasetTagFilter';

const mocks = vi.hoisted(() => ({
  runtime: undefined as WorkflowRuntimePort | undefined,
  onSaveApp: vi.fn(),
  markSaved: vi.fn(),
  toast: vi.fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('use-context-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('use-context-selector')>()),
  useContextSelector: (_context: unknown, selector: (value: unknown) => unknown) =>
    selector({ appId: 'app', onSaveApp: mocks.onSaveApp })
}));
vi.mock('@/components/core/dataset/DatasetTagFilterRows', () => ({
  default: () => null,
  DatasetTagFilterDeprecated: () => null,
  DatasetTagFilterUpgradeButton: () => null
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: (nodeId: string, selector: (node: unknown) => unknown) =>
    selector({ data: mocks.runtime?.getNode(nodeId) }),
  useNodeActions: (nodeId: string) => mocks.runtime?.getNodeActions(nodeId)
}));
vi.mock('@/web/core/workflow/editor/react/useField', () => ({
  useField: (
    query: Parameters<WorkflowRuntimePort['getFieldHandle']>[0],
    selector: (field: unknown) => unknown
  ) => selector(mocks.runtime?.getFieldHandle(query)),
  useFieldActions: () => ({})
}));
vi.mock('@/web/core/workflow/editor/session/workflowSession', () => ({
  useWorkflowPersistence: () => ({
    createSaveRequest: () => ({
      runtime: mocks.runtime!,
      contentRevision: mocks.runtime!.getSavepoint().contentRevision,
      data: mocks.runtime!.getWorkflowData()
    }),
    isCurrentSaveRequest: () => true,
    markSaved: mocks.markSaved
  })
}));

describe('workflow dataset filter upgrade', () => {
  it.each([false, true])(
    'reports a rejected upgrade and preserves a newer edit (%s)',
    async (editDuringSave) => {
      vi.clearAllMocks();
      const item = {
        key: NodeInputKeyEnum.collectionFilterMatch,
        label: 'Filter',
        renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
        value: 'old filter'
      };
      const nodeId = 'dataset';
      const runtime = createWorkflowEditor({
        nodes: [
          {
            nodeId,
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: 'Dataset',
            inputs: [item],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      });
      mocks.runtime = runtime;
      let rejectSave!: (error: Error) => void;
      mocks.onSaveApp.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        })
      );

      const render = DatasetTagFilterLogic.type as (props: {
        item: typeof item;
        nodeId: string;
      }) => {
        props: { onUpgrade: () => Promise<void> };
      };
      const pending = render({ item, nodeId }).props.onUpgrade();
      if (editDuringSave) {
        runtime.dispatch({ type: 'updateNode', nodeId, patch: { name: 'Edited' } });
      }
      rejectSave(new Error('Save failed'));
      await pending;

      expect(mocks.markSaved).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledWith({ title: 'common:save_failed', status: 'error' });
      const savedNode = runtime.getNode(nodeId)!;
      expect(savedNode.name).toBe(editDuringSave ? 'Edited' : 'Dataset');
      expect(savedNode.inputs.find(({ key }) => key === item.key)?.value).toEqual(
        editDuringSave ? expect.objectContaining({ open: true }) : item.value
      );
      runtime.dispose();
    }
  );
});
