import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChakraProvider, Table, Tbody, Td, Tr } from '@chakra-ui/react';
import DndDrag from '../../../../components/common/DndDrag';

const mocks = vi.hoisted(() => ({
  provided: {
    innerRef: () => {},
    placeholder: null,
    droppableProps: {}
  },
  snapshot: {
    isDraggingOver: false,
    draggingOverWith: undefined,
    draggingFromThisWith: undefined,
    isUsingPlaceholder: false
  }
}));

vi.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => children,
  Droppable: ({
    children,
    renderClone
  }: {
    children: (provided: unknown, snapshot: unknown) => ReactNode;
    renderClone?: (...args: unknown[]) => ReactNode;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      children(mocks.provided, mocks.snapshot),
      renderClone?.({}, {}, {})
    ),
  Draggable: () => null
}));

const renderRow = (name: string) =>
  React.createElement(Tr, null, React.createElement(Td, null, name));

const TableContextHarness = () => {
  /* eslint-disable react/no-children-prop -- DndDrag children uses a render-props callback. */
  const content = React.createElement(DndDrag<string>, {
    dataList: ['source'],
    mode: 'virtual',
    onDragEndCb: () => {},
    renderClone: () => renderRow('clone'),
    children: () => React.createElement(Tbody, null, renderRow('source'))
  });
  /* eslint-enable react/no-children-prop */

  return React.createElement(ChakraProvider, null, React.createElement(Table, null, content));
};

describe('DndDrag virtual table context', () => {
  it('keeps the Chakra table context available to a render clone', () => {
    expect(() => renderToStaticMarkup(React.createElement(TableContextHarness))).not.toThrow();
  });
});
