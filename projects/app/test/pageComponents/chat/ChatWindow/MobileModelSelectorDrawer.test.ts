import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import MobileModelSelectorDrawer from '@/pageComponents/chat/ChatWindow/MobileModelSelectorDrawer';

const mocks = vi.hoisted(() => ({
  activeProviderId: '',
  models: [] as MyLLMModelItemType[]
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: () => [mocks.activeProviderId, vi.fn()]
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/core/ai/model/useModelList', () => ({
  useModelList: () => ({ modelList: mocks.models, loading: false, error: false })
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: () => ({
    getModelProviders: () => [
      { id: 'p-b', name: 'Provider B' },
      { id: 'p-a', name: 'Provider A' }
    ],
    getModelProvider: () => ({ id: 'other', name: 'Other' })
  })
}));
vi.mock('@chakra-ui/react', () => {
  const Element = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return { Box: Element, Flex: Element, Button: Element, IconButton: Element };
});
vi.mock('vaul', () => {
  const Element = ({ children }: { children?: React.ReactNode }) => children;
  return {
    Drawer: {
      Root: Element,
      Portal: Element,
      Content: Element,
      Overlay: () => null,
      Handle: () => null
    }
  };
});
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyLoading', () => ({ default: () => null }));

describe('MobileModelSelectorDrawer model order', () => {
  const kinds = ['owned-1', 'owned-2', 'shared', 'beta-1', 'system-1', 'system-2', 'beta-2'];
  beforeEach(() => {
    mocks.activeProviderId = '';
    mocks.models = kinds.flatMap((kind) =>
      ['p-a', 'p-b'].map((provider) => ({
        modelId: `${provider}-${kind}`,
        model: `${provider}-${kind}`,
        name: `${provider}-${kind}`,
        provider,
        type: ModelTypeEnum.llm,
        scope: kind.startsWith('owned') || kind === 'shared' ? 'team' : 'system',
        tmbId: kind.startsWith('owned') ? 'member' : 'other-member',
        testMode: kind.startsWith('beta'),
        config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
      }))
    );
  });

  const render = () =>
    renderToStaticMarkup(
      React.createElement(MobileModelSelectorDrawer, {
        isOpen: true,
        value: 'p-a-owned-1',
        onChange: vi.fn(),
        onClose: vi.fn()
      })
    );

  it('keeps provider navigation in plugin catalog order', () => {
    const html = render();
    expect(html).toContain('Provider B');
    expect(html.indexOf('Provider B')).toBeLessThan(html.indexOf('Provider A'));
    expect(html).not.toContain('p-a-owned-1');
  });

  it.each(['p-a', 'p-b'])(
    'preserves ownership and custom order inside %s with beta models last',
    (provider) => {
      mocks.activeProviderId = provider;
      const originalIds = mocks.models.map(({ modelId }) => modelId);
      const html = render();
      const expectedKinds = [
        'owned-1',
        'owned-2',
        'shared',
        'system-1',
        'system-2',
        'beta-1',
        'beta-2'
      ];
      const positions = expectedKinds.map((kind) => html.indexOf(`${provider}-${kind}`));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(html).not.toContain(`${provider === 'p-a' ? 'p-b' : 'p-a'}-owned-1`);
      expect(mocks.models.map(({ modelId }) => modelId)).toEqual(originalIds);
    }
  );
});
