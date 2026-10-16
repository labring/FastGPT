import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  updateNodeInternals: vi.fn(),
  onChangeNode: vi.fn(),
  effectDependencies: [] as unknown[][],
  draggableDisabledStates: [] as boolean[]
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useCallback: <T>(callback: T) => callback,
    useEffect: (effect: () => void, dependencies: unknown[]) => {
      mocks.effectDependencies.push(dependencies);
      effect();
    },
    useMemo: <T>(factory: () => T) => factory()
  };
});
vi.mock('reactflow', () => ({
  Position: { Right: 'right' },
  useUpdateNodeInternals: () => mocks.updateNodeInternals
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', () => ({ Box: 'div', Button: 'button', Flex: 'div' }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: any) => unknown) =>
    selector({ onChangeNode: mocks.onChangeNode })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: 'div'
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/components/Container', () => ({
  default: 'div'
}));
vi.mock('@fastgpt/web/components/common/DndDrag/index', () => ({
  default: ({ children }: { children: (props: any) => ReactNode }) =>
    children({ provided: { droppableProps: {}, innerRef: vi.fn() }, snapshot: {} }),
  Draggable: ({
    children,
    isDragDisabled
  }: {
    children: (provided: unknown, snapshot: unknown) => ReactNode;
    isDragDisabled: boolean;
  }) => {
    mocks.draggableDisabledStates.push(isDragDisabled);
    return children(
      { innerRef: vi.fn(), draggableProps: { style: {} }, dragHandleProps: {} },
      { isDragging: false }
    );
  }
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle', () => ({
  MySourceHandle: 'div'
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeIfElse/ListItem', () => ({
  default: () => null
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: 'span' }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: {}
}));

import NodeIfElse from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeIfElse';

const renderNode = ({
  branchIds = ['similar'],
  condition = 'isNotEmpty'
}: {
  branchIds?: string[];
  condition?: string;
} = {}) => {
  const Component = (NodeIfElse as unknown as { type: (props: any) => ReactElement }).type;

  const result = Component({
    data: {
      nodeId: 'similarity-route',
      inputs: [
        {
          key: NodeInputKeyEnum.ifElseList,
          value: branchIds.map((branchId) => ({
            branchId,
            condition: 'AND',
            list: [{ condition, valueType: 'input' }]
          }))
        }
      ]
    },
    selected: false
  });

  renderToStaticMarkup(result);
};

describe('NodeIfElse dynamic handles', () => {
  beforeEach(() => {
    mocks.updateNodeInternals.mockClear();
    mocks.effectDependencies.length = 0;
    mocks.draggableDisabledStates.length = 0;
  });

  it('should refresh ReactFlow handle measurements after the node renders', () => {
    renderNode();

    expect(mocks.updateNodeInternals).toHaveBeenCalledTimes(1);
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('similarity-route');
  });

  it('should depend on branch handle identities instead of condition values', () => {
    renderNode({ condition: 'isNotEmpty' });
    const initialHandleKeys = mocks.effectDependencies[0][0];

    mocks.effectDependencies.length = 0;
    renderNode({ condition: 'isEmpty' });

    expect(mocks.effectDependencies[0][0]).toBe(initialHandleKeys);
    expect(initialHandleKeys).toBe('["similar"]');
  });

  it('should disable dragging until there are multiple branches to reorder', () => {
    renderNode();

    expect(mocks.draggableDisabledStates).toEqual([true]);

    mocks.draggableDisabledStates.length = 0;
    renderNode({ branchIds: ['similar', 'fallback'] });

    expect(mocks.draggableDisabledStates).toEqual([false, false]);
  });
});
