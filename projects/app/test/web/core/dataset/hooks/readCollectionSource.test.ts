import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setLoading: vi.fn(),
  toast: vi.fn(),
  getCollectionSource: vi.fn()
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ setLoading: mocks.setLoading })
}));

vi.mock('@/web/core/dataset/api/collection', () => ({
  getCollectionSource: mocks.getCollectionSource
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

const { getCollectionSourceAndOpen } =
  await import('@/web/core/dataset/hooks/readCollectionSource');

describe('getCollectionSourceAndOpen', () => {
  const mockWindow = { location: { href: '' }, close: vi.fn(), closed: false };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWindow.location.href = '';
    vi.stubGlobal('location', {
      origin: 'https://fastgpt.test',
      href: 'https://fastgpt.test/chat'
    });
    vi.stubGlobal('window', {
      open: vi.fn(() => mockWindow)
    });
  });

  it('opens a blank window synchronously before awaiting the source URL', async () => {
    const openOrder: string[] = [];
    const windowOpen = vi.fn((url?: string) => {
      openOrder.push(url === '' ? 'sync-blank' : `open:${url}`);
      return mockWindow;
    });
    vi.stubGlobal('window', { open: windowOpen });

    mocks.getCollectionSource.mockImplementation(async () => {
      openOrder.push('after-await');
      return { value: '/api/file.pdf' };
    });

    const read = getCollectionSourceAndOpen({ collectionId: 'col-1' });
    await read();

    expect(openOrder[0]).toBe('sync-blank');
    expect(openOrder.indexOf('after-await')).toBeGreaterThan(0);
    expect(mockWindow.location.href).toBe('https://fastgpt.test/api/file.pdf');
    expect(openOrder.filter((step) => step.startsWith('open:')).length).toBe(0);
  });

  it('falls back to same-tab navigation when the popup is blocked', async () => {
    vi.stubGlobal('window', { open: vi.fn(() => null) });
    mocks.getCollectionSource.mockResolvedValue({ value: 'https://cdn.example/doc.pdf' });

    const read = getCollectionSourceAndOpen({ collectionId: 'col-2' });
    await read();

    expect(location.href).toBe('https://cdn.example/doc.pdf');
  });
});
