import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Flex: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('button', { type: 'button', onClick }, children),
  Input: ({
    value,
    placeholder,
    onChange
  }: {
    value?: string;
    placeholder?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  }) => React.createElement('input', { value, placeholder, onChange })
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: ({ src }: { src?: string }) => React.createElement('img', { src })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: () => React.createElement('svg')
}));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({
  MyDeleteIconButton: ({
    onClick,
    'aria-label': ariaLabel
  }: {
    onClick?: () => void;
    'aria-label'?: string;
  }) =>
    React.createElement('button', { type: 'button', 'aria-label': ariaLabel, onClick }, 'delete')
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: ({
    value,
    valueLabel,
    isSearch,
    list,
    placeholder,
    onChange
  }: {
    value?: string;
    valueLabel?: React.ReactNode;
    isSearch?: boolean;
    list: { label: string; value: string }[];
    placeholder?: string;
    onChange?: (val: string) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'model-select-wrapper' },
      valueLabel
        ? React.createElement('span', { 'data-testid': 'unlisted-label' }, valueLabel)
        : null,
      React.createElement(
        'select',
        {
          'data-testid': 'model-select',
          'data-has-unlisted-label': String(Boolean(valueLabel)),
          'data-searchable': String(Boolean(isSearch)),
          value: value ?? '',
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value)
        },
        [
          React.createElement('option', { key: '__placeholder__', value: '' }, placeholder ?? ''),
          ...list.map((item) =>
            React.createElement('option', { key: item.value, value: item.value }, item.label)
          )
        ]
      )
    )
}));

import ModelMappingInput, {
  areMappingRecordsEqual,
  getDuplicateMappingKeys,
  mappingRowsToRecord,
  recordToMappingRows
} from '@/pageComponents/model/Channel/ModelMappingInput';

describe('ModelMappingInput utils', () => {
  it('converts between Record<string, string> and editable rows', () => {
    let seq = 0;
    const rows = recordToMappingRows({ 'gpt-4o': 'gpt-4o-test', claude: 'claude-3' }, () =>
      String(++seq)
    );
    expect(rows).toEqual([
      { id: '1', key: 'gpt-4o', value: 'gpt-4o-test' },
      { id: '2', key: 'claude', value: 'claude-3' }
    ]);
    expect(recordToMappingRows(undefined)).toEqual([]);
    expect(
      mappingRowsToRecord([
        { key: '  gpt-4o ', value: ' upstream-4o ' },
        { key: '   ', value: 'ignored' },
        { key: 'qwen', value: '' }
      ])
    ).toEqual({
      'gpt-4o': 'upstream-4o',
      qwen: ''
    });
  });

  it('detects duplicate non-empty trimmed keys and compares string records', () => {
    const duplicates = getDuplicateMappingKeys([
      { key: '' },
      { key: '   ' },
      { key: 'gpt-4o' },
      { key: ' gpt-4o ' },
      { key: 'qwen' }
    ]);
    expect(Array.from(duplicates)).toEqual(['gpt-4o']);

    expect(areMappingRecordsEqual(undefined, {})).toBe(true);
    expect(areMappingRecordsEqual({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
    expect(areMappingRecordsEqual({ a: '1' }, { a: '2' })).toBe(false);
    expect(areMappingRecordsEqual({ a: '1' }, { a: '1', b: '2' })).toBe(false);
  });
});

describe('ModelMappingInput component', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('HTMLSelectElement', dom.window.HTMLSelectElement);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const renderInput = async (props: React.ComponentProps<typeof ModelMappingInput>) => {
    await act(async () => {
      root.render(React.createElement(ModelMappingInput, props));
    });
  };

  const getOptionValues = (select: Element) =>
    [...select.querySelectorAll('option')]
      .map((option) => option.getAttribute('value') ?? '')
      .filter(Boolean);

  it('excludes models selected by other rows, preserves unlisted historical keys with avatar, and emits object updates', async () => {
    const onChange = vi.fn();
    const onValidationChange = vi.fn();
    const modelOptions = [
      { label: 'gpt-4o', value: 'gpt-4o' },
      { label: 'qwen-plus', value: 'qwen-plus' },
      { label: 'deepseek-v4', value: 'deepseek-v4' }
    ];

    await renderInput({
      value: { 'legacy-model': 'legacy-upstream', 'gpt-4o': 'up-4o' },
      modelOptions,
      getModelAvatar: () => 'model/custom-avatar',
      onChange,
      onValidationChange
    });

    const selects = container.querySelectorAll('select[data-testid="model-select"]');
    expect(selects).toHaveLength(2);
    // 历史模型不在候选列表中时保留展示与头像，且下拉不开启内置搜索框。
    expect(selects[0].getAttribute('data-has-unlisted-label')).toBe('true');
    expect(selects[0].getAttribute('data-searchable')).toBe('false');
    expect(container.querySelector('[data-testid="unlisted-label"] img')?.getAttribute('src')).toBe(
      'model/custom-avatar'
    );
    expect(selects[1].getAttribute('data-has-unlisted-label')).toBe('false');

    // 第 2 行已选 gpt-4o，第 1 行下拉不可再选 gpt-4o；第 2 行保留自身已选值。
    expect(getOptionValues(selects[0])).toEqual(['qwen-plus', 'deepseek-v4']);
    expect(getOptionValues(selects[1])).toEqual(['gpt-4o', 'qwen-plus', 'deepseek-v4']);

    // 第 1 行改选 qwen-plus 后，第 2 行同步排除 qwen-plus，并输出更新后的映射对象。
    await act(async () => {
      const select = selects[0] as HTMLSelectElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLSelectElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(select, 'qwen-plus');
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    expect(onValidationChange).toHaveBeenLastCalledWith({
      hasDuplicateKey: false,
      duplicateKeys: []
    });
    expect(onChange).toHaveBeenLastCalledWith({
      'qwen-plus': 'legacy-upstream',
      'gpt-4o': 'up-4o'
    });
    expect(getOptionValues(selects[1])).toEqual(['gpt-4o', 'deepseek-v4']);

    // 新增第 3 行不触发空键写入，仅剩未选中的 deepseek-v4 可选。
    const addButton = [...container.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'config_model:mapping_add_row'
    );
    await act(async () => {
      addButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSelects = container.querySelectorAll('select[data-testid="model-select"]');
    expect(updatedSelects).toHaveLength(3);
    expect(getOptionValues(updatedSelects[2])).toEqual(['deepseek-v4']);

    // 删除第 1 行后同步输出剩余映射。
    const deleteButtons = container.querySelectorAll('button[aria-label="common:Delete"]');
    await act(async () => {
      deleteButtons[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith({ 'gpt-4o': 'up-4o' });
  });
});
