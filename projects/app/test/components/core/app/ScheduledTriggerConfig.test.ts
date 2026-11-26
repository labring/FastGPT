import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { expect, it, vi } from 'vitest';
import ScheduledTriggerConfig from '@/components/core/app/ScheduledTriggerConfig';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chakra-ui/react')>()),
  ModalBody: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? children : null
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@/components/core/app/AppConfigItem', () => ({
  default: ({ action }: { action: React.ReactNode }) => action,
  AppConfigItemAction: ({
    children,
    onClick
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => React.createElement('button', { onClick }, children)
}));

it.each([
  { timezone: undefined, expectedTimezone: 'Asia/Tokyo' },
  { timezone: 'Asia/Calcutta', expectedTimezone: 'Asia/Calcutta' }
])(
  'displays and writes the effective timezone for "$timezone" only after editing',
  async ({ timezone, expectedTimezone }) => {
    const dom = new JSDOM('<div id="root"></div>', {
      pretendToBeVisual: true,
      url: 'http://localhost'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('localStorage', dom.window.localStorage);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const localOptions = Intl.DateTimeFormat().resolvedOptions();
    const localTimezone = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...localOptions, timeZone: 'Asia/Tokyo' });
    const onChange = vi.fn();
    const container = document.getElementById('root')!;
    const root = createRoot(container);

    try {
      await act(async () =>
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(ScheduledTriggerConfig, {
              value:
                timezone === undefined
                  ? undefined
                  : { timezone, cronString: '0 8 * * *', defaultPrompt: 'Reminder' },
              onChange
            })
          )
        )
      );
      await act(async () => container.querySelector('button')!.click());
      expect(onChange).not.toHaveBeenCalled();
      if (timezone === undefined) {
        await act(async () =>
          container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
        );
        expect(onChange).toHaveBeenCalledExactlyOnceWith({
          cronString: '0 0 * * *',
          defaultPrompt: '',
          timezone: expectedTimezone
        });
        return;
      }
      expect(container.querySelector('select')?.value).toBe(expectedTimezone);

      await act(async () => {
        const prompt = container.querySelector('textarea')!;
        prompt.value = 'Edited reminder';
        Simulate.change(prompt);
      });
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        cronString: '0 8 * * *',
        defaultPrompt: 'Edited reminder',
        timezone: expectedTimezone
      });
    } finally {
      await act(async () => root.unmount());
      localTimezone.mockRestore();
      dom.window.close();
      vi.unstubAllGlobals();
    }
  }
);
