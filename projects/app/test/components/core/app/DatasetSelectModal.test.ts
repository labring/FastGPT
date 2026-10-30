import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({
  datasets: [] as Array<{
    _id: string;
    type: string;
    name: string;
    avatar?: string;
    vectorModel?: { isActive?: boolean; modelId?: string; name?: string };
  }>,
  datasetRowClicks: [] as Array<() => void>,
  disabledCheckboxes: [] as boolean[],
  confirm: undefined as (() => void) | undefined,
  onChange: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@chakra-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chakra-ui/react')>();
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  return {
    ...actual,
    Flex: ({
      children,
      cursor,
      onClick
    }: {
      children?: React.ReactNode;
      cursor?: string;
      onClick?: () => void;
    }) => {
      if (cursor === 'pointer' && onClick) mocks.datasetRowClicks.push(onClick);
      return React.createElement(React.Fragment, null, children);
    },
    Box: ({ children, color }: { children?: React.ReactNode; color?: string }) =>
      React.createElement('div', { 'data-color': color }, children),
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => {
      if (children === 'common:Confirm') mocks.confirm = onClick;
      return React.createElement(React.Fragment, null, children);
    },
    Checkbox: ({ children, isDisabled }: { children?: React.ReactNode; isDisabled?: boolean }) => {
      if (isDisabled === true) mocks.disabledCheckboxes.push(isDisabled);
      return React.createElement(React.Fragment, null, children);
    },
    ModalBody: passthrough,
    ModalFooter: passthrough,
    Grid: passthrough,
    VStack: passthrough,
    HStack: passthrough,
    Spacer: () => null,
    IconButton: () => null,
    useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
  };
});

vi.mock('@chakra-ui/icons', () => ({ ChevronRightIcon: () => null, CloseIcon: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({ default: passthrough }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({ default: passthrough }));
vi.mock('@fastgpt/web/components/common/Input/SearchInput', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@/components/common/folder/Path', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/components/QuickCreateDatasetModal', () => ({
  default: () => null
}));
vi.mock('@/web/support/user/useUserStore', () => ({ useUserStore: () => ({}) }));
vi.mock('@/web/core/dataset/api', () => ({ getAllDatasets: vi.fn(), getDatasetPaths: vi.fn() }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({
    data: { datasets: mocks.datasets, paths: [] },
    loading: false,
    runAsync: vi.fn()
  })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { DatasetSelectModal } from '@/components/core/app/DatasetSelectModal';

describe('DatasetSelectModal', () => {
  beforeEach(() => {
    mocks.datasets = [];
    mocks.datasetRowClicks = [];
    mocks.disabledCheckboxes = [];
    mocks.confirm = undefined;
    mocks.onChange.mockClear();
    mocks.toast.mockClear();
  });

  it('marks a dataset without an active index model and blocks selecting it', () => {
    mocks.datasets = [
      {
        _id: 'dataset-missing-index-model',
        type: DatasetTypeEnum.dataset,
        name: 'Missing index model',
        avatar: ''
      }
    ];
    const markup = renderToStaticMarkup(
      React.createElement(DatasetSelectModal, {
        defaultSelectedDatasets: [],
        onChange: mocks.onChange,
        onClose: vi.fn()
      })
    );

    expect(markup).toContain('data-color="red.500"');
    expect(markup).toContain('app:dataset.Missing_index_model');
    expect(mocks.disabledCheckboxes).toEqual([true]);
    expect(mocks.datasetRowClicks).toHaveLength(1);

    mocks.datasetRowClicks[0]();

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'app:dataset.Missing_index_model_select_tip'
    });
    mocks.confirm?.();
    expect(mocks.onChange).toHaveBeenCalledWith([]);
  });
});

function passthrough({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}
