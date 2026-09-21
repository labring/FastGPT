// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SingleSelectFilter from '../../../../components/common/TagFilter/SingleSelectFilter';
import {
  readFilterSelection,
  writeFilterSelection
} from '../../../../components/common/TagFilter/storage';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => {
  const Box = React.forwardRef<HTMLDivElement, React.PropsWithChildren<{ onClick?: () => void }>>(
    function MockBox({ children, onClick }, ref) {
      return React.createElement('div', { ref, onClick }, children);
    }
  );
  return { Box, Flex: Box };
});
vi.mock('../../../../components/common/MyPopover', () => ({
  default: ({ children }: { children: (props: { onClose: () => void }) => React.ReactNode }) =>
    children({ onClose: () => {} })
}));
vi.mock('../../../../components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('../../../../components/common/Icon', () => ({ default: () => null }));
vi.mock('../../../../components/common/Avatar', () => ({ default: () => null }));
vi.mock('../../../../components/common/TagFilter/FilterButton', () => ({
  default: () => null,
  useFilterTriggerWidth: () => ({ triggerWidth: 0 })
}));
vi.mock('../../../../components/common/TagFilter/FilterSearchInput', () => ({
  default: () => null,
  FILTER_SEARCH_THRESHOLD: 10,
  filterSelectOptionsBySearch: (options: unknown[]) => options
}));

describe('SingleSelectFilter persistence', () => {
  let root: Root;
  let container: HTMLDivElement;
  const onChange = vi.fn();
  const options = [
    { value: 7, label: 'Seven' },
    { value: 90, label: 'Ninety' }
  ];
  const render = async (
    props: Partial<React.ComponentProps<typeof SingleSelectFilter<number>>> = {}
  ) => {
    await act(async () =>
      root.render(
        React.createElement(SingleSelectFilter<number>, {
          title: 'Range',
          value: 7,
          options,
          onChange,
          storageKey: 'range',
          ...props
        })
      )
    );
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    onChange.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores once after options load and does not override subsequent controlled changes', async () => {
    writeFilterSelection('range', 90);
    await render({ options: [] });
    expect(onChange).not.toHaveBeenCalled();
    await render({ options: [options[0]] });
    expect(onChange).not.toHaveBeenCalled();
    await render();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(90);
    await render({ value: 90 });
    await render({ value: 7 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(readFilterSelection('range')).toBe(90);
  });

  it('ignores stale values, matching values and controls without a storage key', async () => {
    writeFilterSelection('range', 360);
    await render();
    writeFilterSelection('other', 7);
    await render({ storageKey: 'other' });
    writeFilterSelection('range', 90);
    await render({ storageKey: undefined });
    expect(onChange).not.toHaveBeenCalled();
    await render();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(90);
  });

  it('persists user selection without overwriting another filter', async () => {
    writeFilterSelection('other', 'month');
    await render();
    const option = Array.from(container.querySelectorAll('div')).find(
      (element) => element.textContent === 'Ninety' && element.childElementCount === 0
    );
    expect(option).toBeDefined();
    await act(async () => option!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(90);
    expect(readFilterSelection('range')).toBe(90);
    expect(readFilterSelection('other')).toBe('month');
  });
});
