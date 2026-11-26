import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { expect, it, vi } from 'vitest';
import Header from '@/pageComponents/app/detail/Edit/FormComponent/Header';
import type { SimpleAppSnapshotType } from '@/pageComponents/app/detail/Edit/FormComponent/useSnapshots';
import { publishStatusStyle } from '@/pageComponents/app/detail/constants';
import type { PostPublishAppProps } from '@/global/core/app/api';

const mocks = vi.hoisted(() => ({
  save: vi.fn<(data: PostPublishAppProps) => Promise<boolean>>(),
  clickSave: undefined as ((data: { isPublish: boolean }) => Promise<unknown>) | undefined,
  leave: undefined as (() => Promise<unknown>) | undefined
}));

vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    AppContext: createContext({ appId: 'app', currentTab: 'appEdit', onSaveApp: mocks.save }),
    TabEnum: { appEdit: 'appEdit' }
  };
});
vi.mock('@/pageComponents/app/detail/Workflow/components/SaveButton', () => ({
  default: ({ onClickSave }: { onClickSave: typeof mocks.clickSave }) => {
    mocks.clickSave = onClickSave;
    return null;
  }
}));
vi.mock('@fastgpt/web/hooks/useBeforeunload', () => ({
  useBeforeunload: ({ callback }: { callback: typeof mocks.leave }) => {
    mocks.leave = callback;
  }
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/router', () => ({ useRouter: () => ({}) }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/web/core/app/api/app', () => ({ getAppFolderPath: async () => [] }));
vi.mock('@chakra-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chakra-ui/react')>()),
  IconButton: () => null
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tag/index', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', { role: 'status' }, children)
}));
vi.mock('@/components/common/folder/Path', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/RouteTab', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/PublishHistoriesSlider', () => ({ default: () => null }));

it('retries newer form changes when only the earlier save succeeded', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const initial = getDefaultAppForm();
  const earlier = { ...initial, chatConfig: { ...initial.chatConfig, welcomeText: 'Earlier' } };
  const newer = { ...earlier, chatConfig: { ...earlier.chatConfig, welcomeText: 'Newer' } };
  const publish = Promise.withResolvers<boolean>();
  const draft = Promise.withResolvers<boolean>();
  mocks.save
    .mockImplementationOnce(() => publish.promise)
    .mockImplementationOnce(() => draft.promise)
    .mockResolvedValue(true);

  const container = document.createElement('div');
  const root = createRoot(container);
  const TestHeader = ({ appForm }: { appForm: typeof initial }) => {
    const [past, setPast] = useState<SimpleAppSnapshotType[]>([
      { title: 'Initial', appForm: initial, isSaved: true }
    ]);
    useEffect(() => {
      setPast((prev) =>
        prev[0].appForm === appForm ? prev : [{ title: 'Edit', appForm }, ...prev]
      );
    }, [appForm]);

    return React.createElement(Header, {
      appForm,
      past,
      setAppForm: vi.fn(),
      forbiddenSaveSnapshot: { current: false },
      saveSnapshot: async () => true,
      form2WorkflowFn: () => ({ nodes: [], edges: [] }),
      form2AppWorkflowFn: () => initial
    });
  };
  const render = (appForm: typeof initial) =>
    root.render(
      React.createElement(ChakraProvider, null, React.createElement(TestHeader, { appForm }))
    );
  const status = () => container.querySelector('[role="status"]')?.textContent;

  try {
    await act(async () => render(initial));
    await act(async () => render(earlier));
    await act(async () => {
      void mocks.clickSave?.({ isPublish: true });
    });
    await act(async () => render(newer));
    await act(async () => {
      void mocks.leave?.();
    });
    const newerDraft = expect.objectContaining({
      autoSave: true,
      chatConfig: expect.objectContaining({ welcomeText: 'Newer' })
    });
    expect(mocks.save).toHaveBeenNthCalledWith(2, newerDraft);

    await act(async () => {
      publish.resolve(true);
      draft.resolve(false);
    });
    expect(status()).toBe(publishStatusStyle.unPublish.text);

    await act(async () => render(earlier));
    expect(status()).toBe(publishStatusStyle.published.text);
    await act(async () => {
      await mocks.leave?.();
    });
    expect(mocks.save).toHaveBeenCalledTimes(2);
    await act(async () => render(newer));

    await act(async () => {
      await mocks.leave?.();
    });
    expect(mocks.save).toHaveBeenNthCalledWith(3, newerDraft);
    expect(status()).toBe(publishStatusStyle.published.text);
    await act(async () => {
      await mocks.leave?.();
    });
    expect(mocks.save).toHaveBeenCalledTimes(3);
  } finally {
    publish.resolve(true);
    draft.resolve(false);
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  }
});
