import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChannelLog from '@/pageComponents/model/Log';

const mocks = vi.hoisted(() => ({
  models: [] as { model: string; provider: string; testMode?: boolean }[],
  modelOptions: [] as { value: string }[]
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/core/ai/model/useModelConfig', () => ({
  useModelConfig: () => ({
    models: mocks.models,
    getModelProvider: (provider: string) => ({ order: provider === 'a' ? 0 : 1, avatar: '' })
  })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ data: [], loading: false })
}));
vi.mock('@fastgpt/web/hooks/usePagination', () => ({
  usePagination: () => ({ data: [], isLoading: false, total: 0, pageSize: 20 })
}));
vi.mock('@fastgpt/web/components/common/DateRangePicker', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Input/SearchInput', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/TagFilter', () => ({
  SingleSelectFilter: ({
    title,
    options
  }: {
    title: string;
    options: typeof mocks.modelOptions;
  }) => {
    if (title === 'config_model:model_name') mocks.modelOptions = options;
    return null;
  }
}));
vi.mock('@/components/core/ai/ModelTabHeader', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableLayout: () => null
}));

describe('ChannelLog model filter order', () => {
  beforeEach(() => {
    mocks.modelOptions = [];
    mocks.models = [
      { model: 'beta-first', provider: 'a', testMode: true },
      { model: 'rank-first', provider: 'b' },
      { model: 'rank-second', provider: 'a' },
      { model: 'beta-second', provider: 'b', testMode: true }
    ];
  });

  it.each(['system', 'team'] as const)(
    'preserves %s catalog order across providers with beta models last',
    (channelType) => {
      const originalModels = [...mocks.models];
      renderToStaticMarkup(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(ChannelLog, { Tab: null, channelType })
        )
      );

      expect(mocks.modelOptions.map(({ value }) => value)).toEqual([
        '',
        'rank-first',
        'rank-second',
        'beta-first',
        'beta-second'
      ]);
      expect(mocks.models).toEqual(originalModels);
    }
  );
});
