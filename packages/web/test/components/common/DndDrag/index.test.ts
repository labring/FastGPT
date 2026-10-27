import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DndDrag from '../../../../components/common/DndDrag';
import type { DragStart, DropResult } from 'react-beautiful-dnd';

const mocks = vi.hoisted(() => ({
  context: {} as {
    onBeforeCapture?: (capture: { draggableId: string }) => void;
    onDragStart: (start: DragStart) => void;
    onDragEnd: (result: DropResult) => void;
  }
}));
vi.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children, ...props }: typeof mocks.context & { children: ReactNode }) => {
    mocks.context = props;
    return children;
  },
  Droppable: ({ children }: { children: (provided: unknown, snapshot: unknown) => ReactNode }) =>
    children({}, { isDraggingOver: false }),
  Draggable: () => null
}));
vi.mock('@chakra-ui/react', () => ({ Box: ({ children }: { children?: ReactNode }) => children }));

describe('DndDrag lifecycle', () => {
  const sorted = vi.fn();
  const finished = vi.fn();
  const captured = vi.fn();
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
    /* eslint-disable react/no-children-prop -- render-props children 为必填属性。 */
    renderToStaticMarkup(
      createElement(DndDrag<string>, {
        dataList: ['a', 'b'],
        onDragEndCb: sorted,
        onDragEnd: finished,
        onBeforeCapture: captured,
        children: () => createElement('div')
      })
    );
    /* eslint-enable react/no-children-prop */
  });

  it('forwards capture before cloning and cleans up on a successful reorder', () => {
    mocks.context.onBeforeCapture?.({ draggableId: 'a' });
    expect(captured).toHaveBeenCalledExactlyOnceWith({ draggableId: 'a' });
    mocks.context.onDragEnd(result);
    expect(finished).toHaveBeenCalledOnce();
    expect(sorted).toHaveBeenCalledExactlyOnceWith(['b', 'a']);
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
