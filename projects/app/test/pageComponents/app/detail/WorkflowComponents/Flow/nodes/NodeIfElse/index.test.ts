import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  onChangeNode: vi.fn(),
  draggableDisabledStates: [] as boolean[]
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useCallback: <T>(callback: T) => callback,
    useMemo: <T>(factory: () => T) => factory()
  };
});
vi.mock('reactflow', () => ({
  Position: { Right: 'right' }
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useNodeHandleDrag',
  () => ({
    useNodeHandleDrag: () => ({
      onBeforeCapture: vi.fn(),
      onDragEnd: vi.fn(),
      draggingHandle: null
    })
  })
);
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', () => {
  const Container = ({ children }: { children?: ReactNode }) => children;
  return { Box: Container, Button: Container, Flex: Container };
});
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: any) => unknown) =>
    selector({ onChangeNode: mocks.onChangeNode })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', () => ({
  default: ({ children }: { children?: ReactNode }) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/components/Container', () => ({
  default: ({ children }: { children?: ReactNode }) => children
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
  MySourceHandle: () => null
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

describe('NodeIfElse branch dragging', () => {
  beforeEach(() => {
    mocks.draggableDisabledStates.length = 0;
  });

  it('should disable dragging until there are multiple branches to reorder', () => {
    renderNode();

    expect(mocks.draggableDisabledStates).toEqual([true]);

    mocks.draggableDisabledStates.length = 0;
    renderNode({ branchIds: ['similar', 'fallback'] });

    expect(mocks.draggableDisabledStates).toEqual([false, false]);
  });
});
