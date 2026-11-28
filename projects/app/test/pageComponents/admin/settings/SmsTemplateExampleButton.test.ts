import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  copyData: vi.fn(),
  lastTooltipLabel: undefined as React.ReactNode,
  lastButtonProps: undefined as
    | {
        type?: string;
        variant?: string;
        onClick?: () => void;
      }
    | undefined
}));

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Button: ({
    children,
    type,
    variant,
    onClick
  }: {
    children?: React.ReactNode;
    type?: string;
    variant?: string;
    onClick?: () => void;
  }) => {
    mocks.lastButtonProps = { type, variant, onClick };
    return React.createElement('button', { type, 'data-variant': variant }, children);
  }
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useCopyData', () => ({
  useCopyData: () => ({ copyData: mocks.copyData })
}));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children, label }: { children: React.ReactNode; label?: React.ReactNode }) => {
    mocks.lastTooltipLabel = label;
    return React.createElement('div', { 'data-testid': 'sms-example-tooltip' }, children);
  }
}));

import SmsTemplateExampleButton, {
  SMS_TEMPLATE_EXAMPLES
} from '@/pageComponents/admin/settings/SmsTemplateExampleButton';

describe('SmsTemplateExampleButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastTooltipLabel = undefined;
    mocks.lastButtonProps = undefined;
  });

  it('renders ghost button with tooltip preview and copies exact Aliyun SMS template on click', () => {
    const html = renderToStaticMarkup(
      React.createElement(SmsTemplateExampleButton, { templateKey: 'login' })
    );

    expect(html).toContain('admin:sms_template_example');
    expect(mocks.lastButtonProps?.type).toBe('button');
    expect(mocks.lastButtonProps?.variant).toBe('ghost');

    const tooltipHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, mocks.lastTooltipLabel)
    );
    expect(tooltipHtml).toContain(SMS_TEMPLATE_EXAMPLES.login);
    expect(tooltipHtml).toContain('admin:click_to_copy_sms_example');

    mocks.lastButtonProps?.onClick?.();
    expect(mocks.copyData).toHaveBeenCalledTimes(1);
    expect(mocks.copyData).toHaveBeenCalledWith(SMS_TEMPLATE_EXAMPLES.login);
  });

  it('defines non-empty example copy for every admin SMS template', () => {
    expect(Object.keys(SMS_TEMPLATE_EXAMPLES)).toHaveLength(14);
    for (const template of Object.values(SMS_TEMPLATE_EXAMPLES)) {
      expect(template.trim().length).toBeGreaterThan(0);
    }
  });
});
