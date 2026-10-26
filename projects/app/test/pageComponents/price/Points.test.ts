import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { AiPointsTable } from '@/pageComponents/price/Points';

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({
    data: [ModelTypeEnum.embedding, ModelTypeEnum.tts, ModelTypeEnum.stt].map((type) => ({
      type,
      name: type,
      provider: 'openai',
      charsPointsPrice: type !== ModelTypeEnum.stt ? 125 : 0.125
    }))
  })
}));
vi.mock('@/components/core/ai/ModelTable', () => ({ default: () => null }));

describe('public model prices', () => {
  it('uses M Tokens and 1M characters with unchanged STT units', () => {
    const dom = new JSDOM(
      renderToStaticMarkup(
        React.createElement(ChakraProvider, null, React.createElement(AiPointsTable))
      )
    );
    dom.window.document.querySelectorAll('style').forEach((style) => style.remove());
    const text = dom.window.document.body.textContent ?? '';
    expect(text).toContain('125common:support.wallet.subscription.point / M Tokens');
    expect(text).toContain(
      '125common:support.wallet.subscription.point / 1M common:unit.character'
    );
    expect(text).toContain('0.13common:support.wallet.subscription.point / 60common:unit.seconds');
    expect(text).not.toContain('1000');
    dom.window.close();
  });
});
