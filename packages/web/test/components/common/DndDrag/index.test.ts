import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DndDrag, { type DraggableChildrenFn } from '../../../../components/common/DndDrag';
import type { DragStart, DropResult } from 'react-beautiful-dnd';

const mocks = vi.hoisted(() => ({
  context: {} as {
    onBeforeCapture?: (capture: { draggableId: string }) => void;
    onDragStart: (start: DragStart) => void;
    onDragEnd: (result: DropResult) => void;
  },
  droppableProps: {} as Record<string, unknown>,
  droppableSnapshot: { isDraggingOver: false } as { isDraggingOver: boolean }
}));
vi.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children, ...props }: typeof mocks.context & { children: ReactNode }) => {
    mocks.context = props;
    return children;
  },
  Droppable: ({
    children,
    ...props
  }: {
    children: (provided: unknown, snapshot: unknown) => ReactNode;
    [key: string]: unknown;
  }) => {
    mocks.droppableProps = props;
    return children({}, mocks.droppableSnapshot);
  },
  Draggable: () => null
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children, height }: { children?: ReactNode; height?: string }) =>
    height ? createElement('div', { 'data-dnd-inner-placeholder': height }, children) : children
}));

const sorted = vi.fn();
const finished = vi.fn();
const captured = vi.fn();

const renderDndDrag = (
  props: {
    dataList?: string[];
    mode?: 'standard' | 'virtual';
    getContainerForClone?: () => HTMLElement;
    renderClone?: DraggableChildrenFn;
    renderInnerPlaceholder?: boolean;
  } = {}
) => {
  const { dataList = ['a', 'b'], ...dndProps } = props;

  /* eslint-disable react/no-children-prop -- render-props children 为必填属性。 */
  const markup = renderToStaticMarkup(
    createElement(DndDrag<string>, {
      dataList,
      onDragEndCb: sorted,
      onDragEnd: finished,
      onBeforeCapture: captured,
      children: () => createElement('div'),
      ...dndProps
    })
  );
  /* eslint-enable react/no-children-prop */
  return markup;
};

describe('DndDrag lifecycle', () => {
  const result: DropResult = {
    draggableId: 'a',
    type: 'DEFAULT',
    mode: 'FLUID',
    reason: 'DROP',
    source: { droppableId: 'droppable', index: 0 },
    destination: { droppableId: 'droppable', index: 1 },
    combine: null
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.droppableProps = {};
    mocks.droppableSnapshot.isDraggingOver = false;
    renderDndDrag();
  });

  it('forwards capture before cloning and cleans up on a successful reorder', () => {
    mocks.context.onBeforeCapture?.({ draggableId: 'a' });
    expect(captured).toHaveBeenCalledExactlyOnceWith({ draggableId: 'a' });
    mocks.context.onDragEnd(result);
    expect(finished).toHaveBeenCalledOnce();
    expect(sorted).toHaveBeenCalledExactlyOnceWith(['b', 'a']);
  });

  it('passes virtual droppable options and suppresses the standard placeholder', () => {
    const cloneContainer = {} as HTMLElement;
    const getContainerForClone = vi.fn(() => cloneContainer);
    const dataList = Array.from({ length: 100 }, (_, index) => `item-${index}`);
    mocks.droppableSnapshot.isDraggingOver = true;

    const markup = renderDndDrag({
      dataList,
      mode: 'virtual',
      getContainerForClone,
      renderClone: () => createElement('div')
    });

    expect(mocks.droppableProps).toMatchObject({ mode: 'virtual', getContainerForClone });
    expect(markup).not.toContain('data-dnd-inner-placeholder');
    expect(() => mocks.context.onDragStart(result)).not.toThrow();

    mocks.context.onDragEnd({
      ...result,
      source: { droppableId: 'droppable', index: 10 },
      destination: { droppableId: 'droppable', index: 80 }
    });
    const expectedOrder = [...dataList];
    const [movedItem] = expectedOrder.splice(10, 1);
    expectedOrder.splice(80, 0, movedItem);
    expect(sorted).toHaveBeenCalledExactlyOnceWith(expectedOrder);
  });

  it('requires a clone renderer for virtual mode', () => {
    expect(() => renderDndDrag({ mode: 'virtual' })).toThrow(
      'DndDrag virtual mode requires a renderClone callback'
    );
  });

  it('keeps the legacy inner placeholder in standard mode', () => {
    mocks.droppableSnapshot.isDraggingOver = true;

    expect(renderDndDrag()).toContain('data-dnd-inner-placeholder="0px"');
    expect(mocks.droppableProps).toMatchObject({ mode: 'standard' });
  });

  it.each(['CANCEL', 'DROP'] as const)(
    'cleans up when %s has no destination, without changing the list',
    (reason) => {
      mocks.context.onDragEnd({ ...result, reason, destination: null });
      expect(finished).toHaveBeenCalledOnce();
      expect(sorted).not.toHaveBeenCalled();
    }
  );
});
