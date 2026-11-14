import { JSDOM } from 'jsdom';
import React, { act, type InputHTMLAttributes } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminCompositeSearch, { useAdminCompositeSearch } from '@/components/admin/CompositeSearch';
import {
  evaluateAdminSearchInput,
  isSameAdminSearchParams,
  type AdminSearchOption
} from '@/components/admin/CompositeSearch/utils';

vi.mock('@chakra-ui/react', async () => {
  const React = await import('react');
  const Div = React.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
    ({ children }, ref) => React.createElement('div', { ref }, children)
  );
  Div.displayName = 'MockDiv';

  const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, ...rest }, ref) =>
      React.createElement(
        'button',
        {
          ref,
          type: 'button',
          'data-testid': 'search-field-trigger',
          onClick: rest.onClick
        },
        children
      )
  );
  Button.displayName = 'MockButton';

  const Input = React.forwardRef<
    HTMLInputElement,
    InputHTMLAttributes<HTMLInputElement> & { isInvalid?: boolean }
  >(({ isInvalid, value, onChange, onFocus, onBlur, placeholder }, ref) =>
    React.createElement('input', {
      ref,
      value,
      placeholder,
      'data-invalid': isInvalid ? 'true' : 'false',
      onChange,
      onFocus,
      onBlur
    })
  );
  Input.displayName = 'MockInput';

  const Menu = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'menu' }, children);
  const MenuButton = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(
      'button',
      { type: 'button', 'data-testid': 'search-field-trigger' },
      children
    );
  const MenuList = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'search-field-menu' }, children);
  const MenuItem = ({
    children,
    onClick
  }: {
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) =>
    React.createElement(
      'button',
      { type: 'button', 'data-testid': 'search-field-option', onClick },
      children
    );

  return {
    Box: ({
      children,
      as,
      onClick,
      'aria-label': ariaLabel
    }: {
      children?: React.ReactNode;
      as?: string;
      onClick?: React.MouseEventHandler;
      'aria-label'?: string;
    }) =>
      as === 'button'
        ? React.createElement(
            'button',
            { type: 'button', onClick, 'aria-label': ariaLabel },
            children
          )
        : React.createElement('div', null, children),
    Button,
    Flex: Div,
    Input,
    InputGroup: Div,
    InputLeftElement: Div,
    InputRightElement: Div,
    Menu,
    MenuButton,
    MenuItem,
    MenuList,
    useDisclosure: () => ({ isOpen: false, onOpen: () => {}, onClose: () => {} })
  };
});

vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({
    children,
    label,
    isDisabled
  }: {
    children?: React.ReactNode;
    label?: string;
    isDisabled?: boolean;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'tooltip-wrapper', 'data-tooltip': isDisabled ? '' : label },
      children
    )
}));

const testOptions: readonly AdminSearchOption<'username' | 'teamId' | 'teamName'>[] = [
  { value: 'username', label: '用户名', placeholder: '搜索用户名' },
  { value: 'teamId', label: '团队 ID', placeholder: '搜索团队 ID', exactObjectId: true },
  { value: 'teamName', label: '团队名', placeholder: '搜索团队名' }
];

const validId = '68ad85a7463006c963799a05';

describe('CompositeSearch utils', () => {
  it('validates exact ObjectId fields while allowing empty reset and fuzzy fields', () => {
    expect(
      evaluateAdminSearchInput({ field: 'teamId', value: '   ', options: testOptions })
    ).toEqual({
      shouldFetch: true,
      isInvalid: false,
      params: {}
    });

    expect(
      evaluateAdminSearchInput({ field: 'teamId', value: '68ad85', options: testOptions })
    ).toEqual({
      shouldFetch: false,
      isInvalid: true,
      params: {}
    });

    expect(
      evaluateAdminSearchInput({ field: 'teamId', value: `  ${validId}  `, options: testOptions })
    ).toEqual({
      shouldFetch: true,
      isInvalid: false,
      params: { teamId: validId }
    });

    expect(
      evaluateAdminSearchInput({ field: 'username', value: '  alice  ', options: testOptions })
    ).toEqual({
      shouldFetch: true,
      isInvalid: false,
      params: { username: 'alice' }
    });
  });

  it('compares search param records by value equality', () => {
    expect(isSameAdminSearchParams({}, {})).toBe(true);
    expect(isSameAdminSearchParams({ username: 'a' }, { username: 'a' })).toBe(true);
    expect(isSameAdminSearchParams({ username: 'a' }, { teamName: 'a' })).toBe(false);
    expect(isSameAdminSearchParams({ username: 'a' }, {})).toBe(false);
  });
});

describe('AdminCompositeSearch and useAdminCompositeSearch', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.example.com'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('debounces typing, does not trigger on Enter, and blocks invalid ObjectId requests', async () => {
    const committedParams: Array<Record<string, string | undefined>> = [];

    const Harness = () => {
      const { searchField, inputValue, isInvalid, searchParams, onFieldChange, onInputChange } =
        useAdminCompositeSearch({ options: testOptions, wait: 400 });

      React.useEffect(() => {
        committedParams.push(searchParams);
      }, [searchParams]);

      return React.createElement(AdminCompositeSearch, {
        options: testOptions,
        field: searchField,
        value: inputValue,
        isInvalid,
        onFieldChange,
        onValueChange: onInputChange
      });
    };

    await act(async () => root.render(React.createElement(Harness)));
    expect(committedParams).toEqual([{}]);

    const getInput = () => container.querySelector('input')!;
    const typeValue = async (val: string) => {
      const input = getInput();
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        val
      );
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    };

    // 1. 连续输入只触发一次防抖后的查询
    await act(async () => {
      await typeValue('a');
      await typeValue('al');
      await typeValue('alice');
    });
    expect(committedParams).toEqual([{}]);

    // 按回车不触发立即搜索
    await act(async () => {
      getInput().dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
    });
    expect(committedParams).toEqual([{}]);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(committedParams).toEqual([{}, { username: 'alice' }]);

    // 2. 切换字段到团队 ID，应立即清空输入并恢复无条件查询
    const optionButtons = container.querySelectorAll('[data-testid="search-field-option"]');
    await act(async () => {
      (optionButtons[1] as HTMLButtonElement).click();
    });
    expect(getInput().value).toBe('');
    expect(getInput().placeholder).toBe('搜索团队 ID');
    expect(committedParams).toEqual([{}, { username: 'alice' }, {}]);

    // 3. 输入非合法 ObjectId 不触发请求并标记 invalid
    await act(async () => {
      await typeValue('not-an-object-id');
      vi.advanceTimersByTime(1000);
    });
    expect(getInput().getAttribute('data-invalid')).toBe('true');
    expect(committedParams).toEqual([{}, { username: 'alice' }, {}]);

    // 4. 输入合法 ObjectId 并在防抖后发出请求
    await act(async () => {
      await typeValue(validId);
      vi.advanceTimersByTime(400);
    });
    expect(getInput().getAttribute('data-invalid')).toBe('false');
    expect(committedParams).toEqual([{}, { username: 'alice' }, {}, { teamId: validId }]);

    // 5. 清空按钮重置搜索条件
    const clearButton = container.querySelector(
      'button[aria-label="清空搜索"]'
    ) as HTMLButtonElement;
    expect(clearButton).not.toBeNull();
    await act(async () => {
      clearButton.click();
      vi.advanceTimersByTime(400);
    });
    expect(committedParams).toEqual([{}, { username: 'alice' }, {}, { teamId: validId }, {}]);
  });
});
