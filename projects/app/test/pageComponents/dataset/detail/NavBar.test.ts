import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getDatasetPaths: vi.fn(),
  getDatasetById: vi.fn(),
  getDatasetTrainingQueue: vi.fn(),
  folderPathProps: undefined as Record<string, any> | undefined
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: { datasetId: 'ds-1' },
    push: mocks.routerPush,
    replace: vi.fn(),
    back: vi.fn()
  })
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({
  useSystem: () => ({ isPc: true })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: false } })
}));
vi.mock('@/web/core/dataset/api', () => ({
  getDatasetById: mocks.getDatasetById,
  getDatasetPaths: mocks.getDatasetPaths,
  putDatasetById: vi.fn()
}));
vi.mock('@/web/core/dataset/api/collection', () => ({
  getAllTags: vi.fn().mockResolvedValue({ list: [] }),
  getDatasetCollectionPathById: vi.fn().mockResolvedValue([])
}));
vi.mock('@/web/core/dataset/api/training', () => ({
  getDatasetTrainingQueue: mocks.getDatasetTrainingQueue
}));
vi.mock('@/web/core/dataset/hooks/useDatasetStatusPolling', () => ({
  useDatasetStatusPolling: () => ({ data: {}, run: vi.fn() })
}));
vi.mock('@chakra-ui/react', () => ({
  useTheme: () => ({ borders: { base: '1px solid' } }),
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Flex: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  IconButton: () => null
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
}));
vi.mock('@fastgpt/web/components/common/Tabs/LightRowTabs', () => ({ default: () => null }));
vi.mock('@/components/common/folder/Path', () => ({
  default: (props: Record<string, any>) => {
    mocks.folderPathProps = props;
    return null;
  }
}));

import {
  DatasetPageContext,
  DatasetPageContextProvider
} from '@/web/core/dataset/context/datasetPageContext';
import NavBar, { TabEnum } from '@/pageComponents/dataset/detail/NavBar';
import { useContextSelector } from 'use-context-selector';
import { defaultDatasetDetail } from '@/web/core/dataset/constants';

describe('Dataset detail NavBar breadcrumb', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    mocks.routerPush.mockReset();
    mocks.getDatasetPaths.mockReset();
    mocks.getDatasetById.mockReset();
    mocks.folderPathProps = undefined;
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('passes parent folder paths separately from current dataset name instead of pushing a fake root item', async () => {
    mocks.getDatasetPaths.mockResolvedValue([
      { parentId: 'folder-1', parentName: 'Coze迁移知识库' }
    ]);
    mocks.getDatasetById.mockResolvedValue({
      ...defaultDatasetDetail,
      _id: 'ds-1',
      parentId: 'folder-1',
      name: '测试测'
    });

    const Loader = () => {
      const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);
      const loadedRef = React.useRef(false);
      React.useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;
        void loadDatasetDetail('ds-1');
      }, [loadDatasetDetail]);
      return React.createElement(NavBar, { currentTab: TabEnum.collectionCard });
    };

    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(
            DatasetPageContextProvider,
            { datasetId: 'ds-1' },
            React.createElement(Loader)
          )
        );
      });

      expect(mocks.getDatasetPaths).toHaveBeenCalledWith({
        sourceId: 'ds-1',
        type: 'parent'
      });
      expect(mocks.folderPathProps).toMatchObject({
        rootName: 'common:navbar.Datasets',
        paths: [{ parentId: 'folder-1', parentName: 'Coze迁移知识库' }],
        currentName: '测试测'
      });

      mocks.folderPathProps?.onClick('folder-1');
      expect(mocks.routerPush).toHaveBeenCalledWith('/dataset/list?parentId=folder-1');
    } finally {
      await act(async () => root.unmount());
    }
  });
});
