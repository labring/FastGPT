import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import { WorkflowIssueCode } from '@fastgpt/global/core/workflow/editor/issueCode';
import { createWorkflowEditor } from '@fastgpt/global/common/workflow/editor/runtime/runtime';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { WorkflowCheckIssue } from '@fastgpt/global/core/workflow/type/node';
import {
  getWorkflowIssueUIStatus,
  renderWorkflowIssueMessage
} from '@/web/core/workflow/issueView';
import { getToolErrorMessage } from '@/web/core/workflow/check/message';

const i18nRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../packages/web/i18n'
);
const languages = ['zh-CN', 'en', 'zh-Hant', 'ko-KR'] as const;

const namespaceCache = new Map<string, Record<string, string>>();
const readNamespace = (language: string, namespace: string) => {
  const cacheKey = `${language}/${namespace}`;
  const cached = namespaceCache.get(cacheKey);
  if (cached) return cached;
  const parsed = JSON.parse(
    readFileSync(resolve(i18nRoot, language, `${namespace}.json`), 'utf8')
  ) as Record<string, string>;
  namespaceCache.set(cacheKey, parsed);
  return parsed;
};

/** 假 t：把 key 与插值参数原样拼出来，便于断言 inputName 是否被解析。 */
const t = ((key: string, params?: Record<string, string>) => {
  if (key === 'common:core.ai.Model') return '模型';
  return params
    ? `${key}|${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')}`
    : key;
}) as never;

const createIssue = (issue: Omit<WorkflowCheckIssue, 'nodeId' | 'level'>): WorkflowCheckIssue => ({
  nodeId: 'node',
  level: 'error',
  ...issue
});

describe('getToolErrorMessage', () => {
  it('translates known errors and falls back for whitespace', () => {
    const translate = ((key: string) => `translated:${key}`) as never;
    expect(getToolErrorMessage({ error: 'invalidAppType', t: translate })).toBe(
      'translated:common:code_error.app_error.invalid_app_type'
    );
    expect(getToolErrorMessage({ error: '   ', t: translate })).toBe(
      'translated:common:core.workflow.check.tool_load_failed'
    );
  });
});

describe('renderWorkflowIssueMessage', () => {
  it.each([
    { label: 'Billing:Region', inputKey: 'custom', expected: 'Billing:Region' },
    { label: 'common:Confirm', inputKey: 'custom', expected: 'common:Confirm' },
    {
      label: 'workflow:concatenation_text',
      inputKey: NodeInputKeyEnum.textareaInput,
      expected: readNamespace('en', 'workflow').concatenation_text
    }
  ])('renders $label in a reference issue', async ({ label, inputKey, expected }) => {
    const i18n = createInstance();
    await i18n.init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: {
        en: { common: readNamespace('en', 'common'), workflow: readNamespace('en', 'workflow') }
      }
    });

    const editor = createWorkflowEditor({
      nodes: [
        {
          nodeId: 'target',
          name: 'Target',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          outputs: [],
          inputs: [
            {
              key: inputKey,
              label,
              canEdit: inputKey === 'custom',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.number,
              value: [VARIABLE_NODE_ID, 'text']
            }
          ]
        }
      ],
      edges: [],
      chatConfig: {
        variables: [
          {
            key: 'text',
            label: 'Text',
            description: '',
            type: VariableInputEnum.input,
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    });
    try {
      const issue = editor
        .getWorkflowIssues()
        .issues.find(({ code }) => code === WorkflowIssueCode.invalidReferenceType);
      expect(issue?.params).toEqual(
        inputKey === 'custom' ? { inputName: label } : { inputNameKey: label }
      );
      expect(renderWorkflowIssueMessage(issue!, i18n.getFixedT('en'))).toContain(expected);
    } finally {
      editor.dispose();
    }
  });

  it('uses agent-specific resource messages for dataset and skill failures', () => {
    expect(
      renderWorkflowIssueMessage(
        createIssue({
          code: WorkflowIssueCode.resourceMissing,
          params: { resourceKind: 'dataset' }
        }),
        t
      )
    ).toBe('common:core.workflow.check.agent_dataset_abnormal');
    expect(
      renderWorkflowIssueMessage(
        createIssue({
          code: WorkflowIssueCode.resourceNoPermission,
          params: { resourceKind: 'skill' }
        }),
        t
      )
    ).toBe('common:core.workflow.check.agent_skill_abnormal');
  });
  it('renders the runtime reference type mismatch without missing placeholders', () => {
    expect(
      renderWorkflowIssueMessage(
        createIssue({
          code: WorkflowIssueCode.invalidReferenceType,
          message: 'stale translated message',
          params: { inputNameKey: 'common:core.ai.Model' }
        }),
        t
      )
    ).toBe('common:core.workflow.check.invalid_reference_type|inputName=模型');
  });

  it('renders a diagnostic reference type mismatch with expected and actual types', () => {
    expect(
      renderWorkflowIssueMessage(
        createIssue({
          code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch,
          params: {
            inputName: '模型',
            expected: 'string',
            actual: 'number'
          }
        }),
        t
      )
    ).toBe(
      'common:core.workflow.check.reference_type_mismatch|inputName=模型,expected=string,actual=number'
    );
  });

  it('keeps non-translatable params as raw data', () => {
    const message = renderWorkflowIssueMessage(
      createIssue({
        code: WorkflowIssueCode.modelUnavailable,
        params: { model: 'gpt-4o', nodeName: 'AI 对话', inputNameKey: 'common:core.ai.Model' }
      }),
      t
    );

    expect(message).toContain('model=gpt-4o');
    // nodeName 是文档里已翻译的节点名，不再过 t。
    expect(message).toContain('nodeName=AI 对话');
  });

  it('renders codes without params as the bare key', () => {
    expect(renderWorkflowIssueMessage(createIssue({ code: WorkflowIssueCode.noUpstream }), t)).toBe(
      'common:core.workflow.check.no_upstream'
    );
  });

  it.each([
    WorkflowDiagnosticCodeEnum.cliArgumentInvalid,
    WorkflowDiagnosticCodeEnum.nodeNotReachable
  ])('keeps the original diagnostic message for %s', (code) => {
    expect(
      renderWorkflowIssueMessage(
        createIssue({
          code,
          message: 'Original diagnostic'
        }),
        t
      )
    ).toBe('Original diagnostic');
  });
});

describe('getWorkflowIssueUIStatus', () => {
  it('marks external dependency failures as pending_handle', () => {
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.invalidReference)).toBe('pending_handle');
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.resourceMissing)).toBe('pending_handle');
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.resourceNoPermission)).toBe('pending_handle');
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.toolOffline)).toBe('pending_handle');
    expect(getWorkflowIssueUIStatus(WorkflowDiagnosticCodeEnum.referenceTypeMismatch)).toBe(
      'pending_handle'
    );
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.sandboxNotConfigured)).toBe('pending_handle');
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.sandboxSkillUnavailable)).toBe(
      'pending_handle'
    );
  });

  it('marks everything else as pending_improve', () => {
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.requiredInputEmpty)).toBe('pending_improve');
    expect(getWorkflowIssueUIStatus(WorkflowIssueCode.ifElseIncomplete)).toBe('pending_improve');
  });
});

describe('workflow issue translations', () => {
  it.each(languages)('has a translation for every issue code in %s', (language) => {
    const translate = ((key: string) => key) as never;
    const missing = Object.values(WorkflowIssueCode).filter((code) => {
      const [namespace, ...rest] = renderWorkflowIssueMessage(
        createIssue({ code }),
        translate
      ).split(':');
      return rest.length === 0 || !(rest.join(':') in readNamespace(language, namespace));
    });

    expect(missing).toEqual([]);
  });
});
