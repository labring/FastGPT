import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type {
  ChatSiteItemType,
  ChatBoxInputFormType
} from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { PluginRunContext } from '@/components/core/chat/ChatContainer/PluginRunBox/context';
import RenderInput from '@/components/core/chat/ChatContainer/PluginRunBox/components/RenderInput';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@/components/Markdown', () => ({
  default: () => null
}));

vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: () => null
}));

vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('label', null, children)
}));

vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({
  default: () => null
}));

vi.mock('@fastgpt/web/components/common/MyPopover/PopoverConfirm', () => ({
  default: ({
    Trigger,
    onConfirm
  }: {
    Trigger: React.ReactNode;
    onConfirm: () => Promise<any> | any;
  }) =>
    React.createElement(
      'div',
      null,
      Trigger,
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'confirm-clear', onClick: () => void onConfirm() },
        'confirm'
      )
    )
}));

vi.mock('@/components/core/app/formRender', () => ({
  default: ({
    value,
    onChange,
    isDisabled,
    fieldName
  }: {
    value?: string;
    onChange?: (val: string) => void;
    isDisabled?: boolean;
    fieldName?: string;
  }) =>
    React.createElement('input', {
      'data-testid': fieldName,
      disabled: isDisabled,
      value: value ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)
    })
}));

const createPromptInput = (defaultValue?: string): FlowNodeInputItemType => ({
  key: 'prompt',
  label: '绘图提示词',
  valueType: WorkflowIOValueTypeEnum.string,
  required: true,
  renderTypeList: [FlowNodeInputTypeEnum.textarea],
  defaultValue
});

const createHistoryRecord = (input: FlowNodeInputItemType, value: unknown): ChatSiteItemType => ({
  dataId: 'human-1',
  obj: ChatRoleEnum.Human,
  value: [
    {
      text: {
        content: JSON.stringify([{ ...input, value }])
      }
    }
  ]
});

describe('PluginRunBox RenderInput clear input', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('clears an input with undefined defaultValue after Run -> switch back -> Restart', async () => {
    const promptInput = createPromptInput(undefined);
    let latestFormValues: ChatBoxInputFormType | undefined;

    const Harness = () => {
      const variablesForm = useForm<ChatBoxInputFormType>();
      const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([]);
      const [mounted, setMounted] = useState(true);

      latestFormValues = variablesForm.watch();

      return React.createElement(
        ChatItemContext.Provider,
        {
          value: {
            chatBoxData: {
              appId: 'app-1',
              app: {
                name: 'Flux',
                avatar: '',
                type: 'plugin' as any,
                pluginInputs: [promptInput]
              }
            },
            variablesForm
          } as any
        },
        React.createElement(
          ChatRecordContext.Provider,
          {
            value: {
              chatRecords,
              setChatRecords
            } as any
          },
          React.createElement(
            WorkflowRuntimeContext.Provider,
            {
              value: {
                outLinkAuthData: undefined,
                fileUploading: false
              } as any
            },
            React.createElement(
              PluginRunContext.Provider,
              {
                value: {
                  isChatting: false,
                  instruction: '',
                  onStartChat: vi.fn(),
                  onNewChat: () => setChatRecords([]),
                  onSubmit: (formData: ChatBoxInputFormType) => {
                    setChatRecords([createHistoryRecord(promptInput, formData.variables?.prompt)]);
                    setMounted(false);
                  }
                } as any
              },
              React.createElement(
                'button',
                {
                  type: 'button',
                  'data-testid': 'toggle-mount',
                  onClick: () => setMounted((v) => !v)
                },
                'toggle'
              ),
              mounted ? React.createElement(RenderInput) : null
            )
          )
        )
      );
    };

    // 1. 初始打开并输入 SS，点击运行（切到输出 Tab，RenderInput 卸载，variablesForm 仍保留 SS）
    await act(async () => {
      root.render(React.createElement(Harness));
    });

    const inputEl = container.querySelector<HTMLInputElement>('[data-testid="variables.prompt"]');
    expect(inputEl).not.toBeNull();
    await act(async () => {
      inputEl!.value = 'SS';
      Simulate.change(inputEl!);
    });
    expect(latestFormValues?.variables?.prompt).toBe('SS');

    const runBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'common:Run'
    )!;
    await act(async () => {
      Simulate.click(runBtn);
    });

    // 2. 运行一轮后切回输入 Tab：RenderInput 在 histories 存在且 form 含 SS 时重新挂载
    const toggleBtn = container.querySelector<HTMLButtonElement>('[data-testid="toggle-mount"]')!;
    await act(async () => {
      Simulate.click(toggleBtn);
    });

    const mountedWithHistory = container.querySelector<HTMLInputElement>(
      '[data-testid="variables.prompt"]'
    )!;
    expect(mountedWithHistory.value).toBe('SS');
    expect(mountedWithHistory.disabled).toBe(true);

    // 3. 点击重新运行（Restart）：保留 SS 且转为可编辑
    const restartBtn = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'common:Restart'
    )!;
    await act(async () => {
      Simulate.click(restartBtn);
    });

    const afterRestart = container.querySelector<HTMLInputElement>(
      '[data-testid="variables.prompt"]'
    )!;
    expect(afterRestart.disabled).toBe(false);
    expect(afterRestart.value).toBe('SS');

    // 4. 点击清空输入确认：应清空回默认值 undefined，而不是被旧值 SS 卡住
    const confirmClearBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-clear"]'
    )!;
    await act(async () => {
      Simulate.click(confirmClearBtn);
    });

    const afterClear = container.querySelector<HTMLInputElement>(
      '[data-testid="variables.prompt"]'
    )!;
    expect(afterClear.value).toBe('');
    expect(latestFormValues?.variables?.prompt).toBeUndefined();
  });

  it('restores explicit defaultValue on clear and clears stale value when switching histories', async () => {
    const promptInput = createPromptInput('preset');

    const Harness = () => {
      const variablesForm = useForm<ChatBoxInputFormType>();
      const [chatRecords, setChatRecords] = useState<ChatSiteItemType[]>([
        createHistoryRecord(promptInput, 'SS')
      ]);

      return React.createElement(
        ChatItemContext.Provider,
        {
          value: {
            chatBoxData: {
              appId: 'app-1',
              app: {
                name: 'Flux',
                avatar: '',
                type: 'plugin' as any,
                pluginInputs: [promptInput]
              }
            },
            variablesForm
          } as any
        },
        React.createElement(
          ChatRecordContext.Provider,
          {
            value: {
              chatRecords,
              setChatRecords
            } as any
          },
          React.createElement(
            WorkflowRuntimeContext.Provider,
            {
              value: {
                outLinkAuthData: undefined,
                fileUploading: false
              } as any
            },
            React.createElement(
              PluginRunContext.Provider,
              {
                value: {
                  isChatting: false,
                  instruction: '',
                  onStartChat: vi.fn(),
                  onNewChat: () => setChatRecords([]),
                  onSubmit: vi.fn()
                } as any
              },
              React.createElement(
                'button',
                {
                  type: 'button',
                  'data-testid': 'switch-empty-history',
                  onClick: () => setChatRecords([createHistoryRecord(promptInput, undefined)])
                },
                'switch'
              ),
              React.createElement(RenderInput)
            )
          )
        )
      );
    };

    await act(async () => {
      root.render(React.createElement(Harness));
    });
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="variables.prompt"]')?.value
    ).toBe('SS');

    // 切换到该字段为 undefined 的历史记录时，不应残留上一条记录的 SS
    await act(async () => {
      Simulate.click(container.querySelector('[data-testid="switch-empty-history"]')!);
    });
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="variables.prompt"]')?.value
    ).toBe('');

    // 点击清空输入应恢复为配置默认值 'preset'
    await act(async () => {
      Simulate.click(container.querySelector('[data-testid="confirm-clear"]')!);
    });
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="variables.prompt"]')?.value
    ).toBe('preset');
  });
});
