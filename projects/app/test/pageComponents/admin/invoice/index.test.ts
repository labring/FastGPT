import React, { act, type ReactNode } from 'react';
import { JSDOM } from 'jsdom';
import type { Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceSchemaType } from '@fastgpt/global/support/wallet/bill/type';

const mocks = vi.hoisted(() => ({
  invoices: [] as InvoiceSchemaType[],
  getData: vi.fn(),
  finishInvoice: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@/web/admin/wallet/bill/invoice/api', () => ({
  getInvoiceList: vi.fn(),
  finishInvoice: mocks.finishInvoice,
  getInvoiceDownloadUrl: vi.fn()
}));
vi.mock('@fastgpt/web/hooks/usePagination', () => ({
  usePagination: () => ({
    data: mocks.invoices,
    isLoading: false,
    total: mocks.invoices.length,
    pageSize: 20,
    getData: mocks.getData
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/components/admin/BoxContainer/PageRoot', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableContainer: React.forwardRef<HTMLDivElement, { children: ReactNode }>(
    function MockFixedTableContainer({ children }, ref) {
      return React.createElement('div', { ref }, children);
    }
  )
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@/pageComponents/account/styles', () => ({ accountTitleTextStyles: {} }));
vi.mock('@/web/common/system/utils', () => ({ downloadFetch: vi.fn() }));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    React.createElement('section', { 'data-testid': 'invoice-modal' }, children, footer)
}));
vi.mock('@chakra-ui/react', () => {
  const element = (tag: string) => {
    return function MockElement({
      children,
      onClick,
      onChange,
      isDisabled
    }: {
      children?: ReactNode;
      onClick?: React.MouseEventHandler;
      onChange?: React.ChangeEventHandler;
      isDisabled?: boolean;
    }) {
      return React.createElement(tag, { onClick, onChange, disabled: isDisabled }, children);
    };
  };
  return {
    Table: element('table'),
    Thead: element('thead'),
    Tbody: element('tbody'),
    Tr: element('tr'),
    Th: element('th'),
    Td: element('td'),
    Flex: element('div'),
    Box: element('div'),
    HStack: element('div'),
    InputGroup: element('div'),
    Input: element('input'),
    InputLeftElement: element('div'),
    Button: element('button'),
    FormLabel: element('label')
  };
});

describe('InvoiceManageTable', () => {
  let dom: JSDOM;
  let createRoot: typeof import('react-dom/client').createRoot;
  let InvoiceManageTable: typeof import('@/pageComponents/admin/invoice').default;
  let root: Root;
  let container: HTMLDivElement;
  const invoice: InvoiceSchemaType = {
    _id: 'invoice-1',
    teamId: 'team-1',
    teamName: '原始开票抬头',
    unifiedCreditCode: 'TEST00000000000001',
    contactPhone: '00000000000',
    emailAddress: 'invoice@example.com',
    needSpecialInvoice: false,
    amount: 10000000,
    billIdList: ['bill-1'],
    status: 1,
    createTime: new Date('2026-10-29T00:00:00Z')
  };

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    for (const key of ['window', 'document', 'Event', 'File', 'FormData'] as const) {
      vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
    }
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    ({ createRoot } = await import('react-dom/client'));
    ({ default: InvoiceManageTable } = await import('@/pageComponents/admin/invoice'));
  });
  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoices = [invoice];
    mocks.finishInvoice.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const render = () => act(async () => root.render(React.createElement(InvoiceManageTable)));
  const button = (text: string) => {
    const target = Array.from(container.querySelectorAll('button')).find(
      (element) => element.textContent === text
    );
    if (!target) throw new Error(`Missing button: ${text}`);
    return target;
  };
  const selectFile = async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('Missing file input');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['test invoice'], 'invoice.pdf', { type: 'application/pdf' })]
    });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  };

  it('keeps the selected invoice when it leaves the list and submits its original ID', async () => {
    await render();
    await act(async () => button('确认开票').click());
    expect(button('确认提交').disabled).toBe(true);

    mocks.invoices = [];
    await render();
    expect(container.querySelector('[data-testid="invoice-modal"]')?.textContent).toContain(
      invoice.teamName
    );

    await selectFile();
    await act(async () => button('确认提交').click());

    expect(mocks.finishInvoice).toHaveBeenCalledOnce();
    const formData: FormData = mocks.finishInvoice.mock.calls[0][0];
    expect(JSON.parse(String(formData.get('data')))).toEqual({ invoiceId: invoice._id });
    expect(formData.get('file')).toBeInstanceOf(File);
    expect(mocks.getData).toHaveBeenCalledWith(1);
    expect(container.querySelector('[data-testid="invoice-modal"]')).toBeNull();
  });

  it('keeps the dialog and file available for retry after submission fails', async () => {
    mocks.finishInvoice.mockRejectedValueOnce(new Error('提交失败'));
    await render();
    await act(async () => button('确认开票').click());
    await selectFile();
    await act(async () => button('确认提交').click());

    expect(container.querySelector('[data-testid="invoice-modal"]')).not.toBeNull();
    expect(button('确认提交').disabled).toBe(false);
    expect(mocks.getData).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));

    await act(async () => button('确认提交').click());
    expect(mocks.finishInvoice).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="invoice-modal"]')).toBeNull();
  });
});
