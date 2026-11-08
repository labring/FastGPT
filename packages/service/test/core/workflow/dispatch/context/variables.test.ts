import { describe, expect, it, vi } from 'vitest';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { EntryPointItemType } from '@fastgpt/global/core/app/type';
import {
  getEntryPointRuntimeVariables,
  getWorkflowFileVariableInputs,
  WorkflowVariableState
} from '@fastgpt/service/core/workflow/dispatch/context/variables';
import { ENTRY_POINT_VARIABLE_KEY } from '@fastgpt/global/core/app/constants';
import { encryptSecret } from '@fastgpt/service/common/secret/aes256gcm';
import { anyValueDecrypt } from '@fastgpt/service/common/secret/utils';

const mockGetChatFilePreviewUrl = vi.fn(async (key: string) => `http://preview.local/${key}`);
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  createChatFilePreviewUrlGetter: () => mockGetChatFilePreviewUrl
}));

const runningAppInfo: Parameters<typeof WorkflowVariableState.create>[0]['runningAppInfo'] = {
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'appId',
  teamId: 'teamId',
  tmbId: 'tmbId',
  name: 'app'
};

const createState = (props: Partial<Parameters<typeof WorkflowVariableState.create>[0]> = {}) =>
  WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo,
    uid: 'uid',
    chatId: 'chatId',
    variablesConfig: [],
    inputVariables: {},
    ...props
  });

describe('WorkflowVariableState', () => {
  describe('create', () => {
    it.each([
      {
        name: 'label takes precedence over key and default',
        inputVariables: { displayName: 'label-value', value: 'key-value' },
        expected: 'label-value'
      },
      {
        name: 'zero is an explicit label value',
        inputVariables: { displayName: 0, value: 'key-value' },
        expected: 0
      },
      {
        name: 'false is an explicit label value',
        inputVariables: { displayName: false, value: 'key-value' },
        expected: false
      },
      {
        name: 'an empty string is an explicit label value',
        inputVariables: { displayName: '', value: 'key-value' },
        expected: ''
      },
      {
        name: 'null is an explicit label value',
        inputVariables: { displayName: null, value: 'key-value' },
        expected: null
      },
      {
        name: 'an undefined label falls back to key without discarding zero',
        inputVariables: { displayName: undefined, value: 0 },
        expected: 0
      },
      {
        name: 'undefined inputs fall back to default',
        inputVariables: { displayName: undefined, value: undefined },
        expected: 'default-value'
      }
    ])('$name', async ({ inputVariables, expected }) => {
      const state = await createState({
        variablesConfig: [
          {
            key: 'value',
            label: 'displayName',
            description: '',
            type: VariableInputEnum.input,
            valueType: WorkflowIOValueTypeEnum.any,
            defaultValue: 'default-value'
          }
        ],
        inputVariables
      });

      expect(state.get('value')).toBe(expected);
      expect(state.getStoreValue('value')).toBe(expected);
      expect(state.toStoreRecord()).toEqual({ value: expected });
      expect(state.toRuntimeRecord()).not.toHaveProperty('displayName');
    });
  });

  describe('set', () => {
    it.each(['chatId', 'externalToken', 'ephemeral'])(
      'updates runtime-only %s without persisting it',
      async (key) => {
        const state = await createState({
          variablesConfig: [
            {
              key: 'persisted',
              label: 'Persisted variable',
              description: '',
              type: VariableInputEnum.input,
              valueType: WorkflowIOValueTypeEnum.string,
              defaultValue: 'stored-value'
            },
            {
              key: 'externalToken',
              label: 'External variable',
              description: '',
              type: VariableInputEnum.custom,
              valueType: WorkflowIOValueTypeEnum.string,
              defaultValue: 'must-not-persist'
            }
          ],
          externalVariables: { externalToken: 'provider-value' },
          runtimeOnlyVariables: { ephemeral: 'runtime-value' }
        });

        for (const value of ['updated-value', 0, false, '', null, undefined]) {
          expect(await state.set(key, value)).toBe(value);
          expect(state.get(key)).toBe(value);
          expect(state.toRuntimeRecord()).toHaveProperty(key, value);
          expect(state.getStoreValue(key)).toBeUndefined();
          expect(state.toStoreRecord()).toEqual({ persisted: 'stored-value' });
        }
      }
    );
  });

  it('deeply isolates runtime values, stored values and file metadata when cloned', async () => {
    const state = await createState({
      variablesConfig: [{ key: 'files', type: VariableInputEnum.file } as any],
      inputVariables: {
        files: [{ key: 'chat/app/a.pdf', name: 'a.pdf', type: ChatFileTypeEnum.document }]
      }
    });
    await state.set('nested', { items: [{ count: 1 }] });
    const child = state.clone();
    (child.get('nested') as { items: { count: number }[] }).items[0].count = 2;
    (child.get('files') as string[]).push('https://example.com/new.pdf');
    (child.getStoreValue('files') as { name: string }[])[0].name = 'child.pdf';
    const url = (state.get('files') as string[])[0];
    child.getFileStoreValueByRuntimeUrl(url)!.name = 'child metadata.pdf';

    expect(state.get('nested')).toEqual({ items: [{ count: 1 }] });
    expect(state.getStoreValue('nested')).toEqual({ items: [{ count: 1 }] });
    expect(state.get('files')).toEqual([url]);
    expect(state.getStoreValue('files')).toEqual([
      { key: 'chat/app/a.pdf', name: 'a.pdf', type: ChatFileTypeEnum.document }
    ]);
    expect(state.getFileStoreValueByRuntimeUrl(url)?.name).toBe('a.pdf');
    expect(child.get('nested')).toEqual({ items: [{ count: 2 }] });
    expect(child.getStoreValue('nested')).toEqual({ items: [{ count: 2 }] });
  });

  it('should expose a configured entry point as a runtime-only variable', async () => {
    const runtimeOnlyVariables = getEntryPointRuntimeVariables({
      entryPoints: [
        { id: 'knowledge', name: 'Knowledge Q&A' },
        { id: 'writing', name: 'Writing' }
      ],
      inputVariables: { [ENTRY_POINT_VARIABLE_KEY]: 'Writing' }
    });
    const state = await createState({ runtimeOnlyVariables });

    expect(state.get(ENTRY_POINT_VARIABLE_KEY)).toBe('Writing');
    expect(state.toRuntimeRecord()).toMatchObject({ [ENTRY_POINT_VARIABLE_KEY]: 'Writing' });
    expect(state.toStoreRecord()).not.toHaveProperty(ENTRY_POINT_VARIABLE_KEY);
  });

  it('should ignore entry point values that are not configured by the app', () => {
    expect(
      getEntryPointRuntimeVariables({
        entryPoints: [{ id: 'knowledge', name: 'Knowledge Q&A' }],
        inputVariables: { [ENTRY_POINT_VARIABLE_KEY]: 'Forged entry point' }
      })
    ).toEqual({});
    expect(
      getEntryPointRuntimeVariables({
        inputVariables: { [ENTRY_POINT_VARIABLE_KEY]: 'Knowledge Q&A' }
      })
    ).toEqual({});
    expect(
      getEntryPointRuntimeVariables({
        entryPoints: null as unknown as EntryPointItemType[],
        inputVariables: { [ENTRY_POINT_VARIABLE_KEY]: 'Knowledge Q&A' }
      })
    ).toEqual({});
    expect(
      getEntryPointRuntimeVariables({
        entryPoints: [
          { id: 'knowledge', name: 'Knowledge Q&A' },
          null
        ] as unknown as EntryPointItemType[],
        inputVariables: { [ENTRY_POINT_VARIABLE_KEY]: 'Knowledge Q&A' }
      })
    ).toEqual({});
    expect(
      getEntryPointRuntimeVariables({
        entryPoints: { id: 'knowledge', name: 'Knowledge Q&A' } as unknown as EntryPointItemType[],
        inputVariables: { [ENTRY_POINT_VARIABLE_KEY]: 'Knowledge Q&A' }
      })
    ).toEqual({});
    expect(
      getEntryPointRuntimeVariables({
        entryPoints: [
          { id: 'first', name: 'Same name' },
          { id: 'second', name: 'Same name' }
        ],
        inputVariables: { [ENTRY_POINT_VARIABLE_KEY]: 'Same name' }
      })
    ).toEqual({});
  });

  it('should initialize normal variables and runtime-only system variables', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'name',
          type: VariableInputEnum.input,
          valueType: WorkflowIOValueTypeEnum.string,
          defaultValue: 'default'
        } as any
      ],
      inputVariables: { name: 123 },
      externalVariables: { externalOnly: 'external' }
    });

    expect(state.get('name')).toBe('123');
    expect(state.get('appId')).toBe('appId');
    expect(state.get('userId')).toBe('uid');
    expect(state.get('externalOnly')).toBe('external');
    expect(state.toStoreRecord()).toEqual({ name: '123' });
  });

  it('非 App 来源不注入 appId 系统变量', async () => {
    const state = await createState({
      runningAppInfo: { ...runningAppInfo, sourceType: ChatSourceTypeEnum.skillEdit }
    });

    expect(state.get('appId')).toBeUndefined();
    expect(state.toRuntimeRecord()).not.toHaveProperty('appId');
    expect(state.toStoreRecord()).not.toHaveProperty('appId');
  });

  it('should allow parent input to override internal variable defaults', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'internalToken',
          type: VariableInputEnum.internal,
          valueType: WorkflowIOValueTypeEnum.string,
          defaultValue: 'internal-default'
        } as any
      ],
      inputVariables: { internalToken: 'parent-value' },
      externalVariables: { internalToken: 'external-value' }
    });

    expect(state.get('internalToken')).toBe('parent-value');
    expect(state.toStoreRecord()).toEqual({ internalToken: 'parent-value' });
  });

  it.each([
    { externalVariables: {}, expected: 'input-value', stored: { externalToken: 'input-value' } },
    {
      externalVariables: { externalToken: 'provider-value' },
      expected: 'provider-value',
      stored: {}
    }
  ])(
    '外部动态变量按 provider 优先级取值并决定是否持久化：$expected',
    async ({ externalVariables, expected, stored }) => {
      const state = await createState({
        variablesConfig: [
          {
            key: 'externalToken',
            type: VariableInputEnum.custom,
            valueType: WorkflowIOValueTypeEnum.string,
            defaultValue: 'external-default'
          } as any
        ],
        inputVariables: { externalToken: 'input-value' },
        externalVariables
      });

      expect(state.get('externalToken')).toBe(expected);
      expect(state.toStoreRecord()).toEqual(stored);
    }
  );

  it('should encrypt password store value while keeping runtime plain text', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'pwd',
          type: VariableInputEnum.password,
          valueType: WorkflowIOValueTypeEnum.string
        } as any
      ]
    });

    await state.set('pwd', 'new-secret');

    expect(state.get('pwd')).toBe('new-secret');
    expect(state.toStoreRecord().pwd).toMatchObject({ secret: expect.any(String) });
    expect((state.toStoreRecord().pwd as any).secret).not.toBe('new-secret');
  });

  it.each(['object', 'json'] as const)('密码以 %s 存储值初始化时不重复加密', async (format) => {
    const encrypted = { secret: encryptSecret('old-secret') };
    const state = await createState({
      variablesConfig: [
        {
          key: 'pwd',
          type: VariableInputEnum.password,
          valueType: WorkflowIOValueTypeEnum.string
        } as any
      ],
      inputVariables: {
        pwd: format === 'object' ? encrypted : JSON.stringify(encrypted)
      }
    });

    expect(state.get('pwd')).toBe('old-secret');
    expect(anyValueDecrypt(state.toStoreRecord().pwd)).toBe('old-secret');
  });

  it('should convert key files to runtime urls and keep store value clean', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ],
      inputVariables: {
        files: [
          {
            key: 'chat/app/a.png',
            name: 'a.png',
            type: ChatFileTypeEnum.image,
            url: 'http://preview.local/should-not-store'
          },
          {
            url: 'data:image/png;base64,abc',
            name: 'base64.png',
            type: ChatFileTypeEnum.image
          }
        ]
      }
    });

    expect(state.get('files')).toEqual(['http://preview.local/chat/app/a.png']);
    expect(state.toStoreRecord().files).toEqual([
      {
        key: 'chat/app/a.png',
        name: 'a.png',
        type: ChatFileTypeEnum.image
      }
    ]);
  });

  it('should resolve only initial file variables through the workflow registrar', async () => {
    const resolveInputFile = vi.fn(async (file) =>
      'key' in file
        ? `https://workflow.example.com/${file.key}`
        : `https://workflow.example.com/external.pdf`
    );
    const state = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ],
      inputVariables: {
        files: [
          {
            key: 'chat/app/a.pdf',
            name: 'a.pdf',
            type: ChatFileTypeEnum.file
          },
          {
            url: 'https://external.example.com/b.pdf',
            name: 'b.pdf',
            type: ChatFileTypeEnum.file
          }
        ]
      },
      resolveInputFile
    });

    expect(state.get('files')).toEqual([
      'https://workflow.example.com/chat/app/a.pdf',
      'https://workflow.example.com/external.pdf'
    ]);
    expect(resolveInputFile).toHaveBeenCalledTimes(2);

    await state.set('files', ['https://node.example.com/generated.pdf']);
    expect(resolveInputFile).toHaveBeenCalledTimes(2);
    expect(state.get('files')).toEqual(['https://node.example.com/generated.pdf']);
  });

  it.each([
    { name: '节点配置限额', maxFiles: 2, maxFileAmount: undefined, expected: 2 },
    { name: '用户额度收紧节点限额', maxFiles: 2, maxFileAmount: 1, expected: 1 },
    { name: '未配置节点限额时使用用户额度', maxFiles: undefined, maxFileAmount: 2, expected: 2 },
    { name: '未配置任何限额时默认五个', maxFiles: undefined, maxFileAmount: undefined, expected: 5 }
  ])(
    '文件变量初始化、更新和 Child 输入收集统一遵循$name',
    async ({ maxFiles, maxFileAmount, expected }) => {
      const resolveInputFile = vi.fn(async (file) =>
        'url' in file ? file.url : `https://workflow.example.com/${file.key}`
      );
      const variablesConfig = [
        {
          key: 'files',
          type: VariableInputEnum.file,
          maxFiles
        } as any
      ];
      const inputVariables = {
        files: Array.from(
          { length: 6 },
          (_, index) => `https://external.example.com/${index + 1}.pdf`
        )
      };

      const state = await createState({
        variablesConfig,
        inputVariables,
        maxFileAmount,
        resolveInputFile
      });

      const selectedFiles = inputVariables.files.slice(0, expected);
      expect(state.get('files')).toEqual(selectedFiles);
      expect(resolveInputFile).toHaveBeenCalledTimes(expected);
      await expect(state.set('files', inputVariables.files)).resolves.toEqual(selectedFiles);
      expect(state.get('files')).toEqual(selectedFiles);
      expect(
        getWorkflowFileVariableInputs({ variablesConfig, inputVariables, maxFileAmount })
      ).toEqual(selectedFiles);
    }
  );

  it('should keep external url files clean and infer string urls on initialization', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any,
        {
          key: 'missingFiles',
          type: VariableInputEnum.file
        } as any
      ],
      inputVariables: {
        files: [
          {
            id: 'file',
            type: ChatFileTypeEnum.file,
            name: 'file.jpg',
            url: 'https://example.com/files/file.jpg'
          },
          'https://preview.example.com/doc.pdf'
        ]
      }
    });

    expect(state.toStoreRecord().files).toEqual([
      {
        type: ChatFileTypeEnum.image,
        name: 'file.jpg',
        url: 'https://example.com/files/file.jpg'
      },
      {
        type: ChatFileTypeEnum.document,
        name: 'doc.pdf',
        url: 'https://preview.example.com/doc.pdf'
      }
    ]);
    expect(state.toStoreRecord().missingFiles).toEqual([]);
  });

  it('should keep legacy file store values without type and infer metadata', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ],
      inputVariables: {
        files: [
          {
            key: 'chat/app/legacy.png',
            name: 'legacy.png'
          },
          {
            url: 'https://example.com/files/report.pdf',
            name: 'report.pdf'
          }
        ]
      }
    });

    expect(state.get('files')).toEqual([
      'http://preview.local/chat/app/legacy.png',
      'https://example.com/files/report.pdf'
    ]);
    expect(state.toStoreRecord().files).toEqual([
      {
        key: 'chat/app/legacy.png',
        name: 'legacy.png',
        type: ChatFileTypeEnum.image
      },
      {
        url: 'https://example.com/files/report.pdf',
        name: 'report.pdf',
        type: ChatFileTypeEnum.document
      }
    ]);
  });

  it('Child 初始化和更新均恢复父级私有元数据，并单独记录新增外链', async () => {
    const parentFiles = [
      { key: 'chat/app/a.png', name: 'a.png', type: ChatFileTypeEnum.image },
      { key: 'chat/app/parent.pdf', name: 'parent.pdf', type: ChatFileTypeEnum.document }
    ];
    const parent = await createState({
      variablesConfig: [{ key: 'files', type: VariableInputEnum.file } as any],
      inputVariables: { files: parentFiles }
    });
    const [initialUrl, addedParentUrl] = parent.get('files') as string[];
    const child = await createState({
      variablesConfig: [{ key: 'childFiles', type: VariableInputEnum.file } as any],
      inputVariables: { childFiles: [initialUrl] },
      sourceVariableState: parent
    });

    expect(child.get('childFiles')).toEqual([initialUrl]);
    expect(child.toStoreRecord().childFiles).toEqual([parentFiles[0]]);

    // 同时命中 Child 自身映射、父级递归映射和未知外链三个分支。
    const externalUrl = 'https://example.com/report.unknown';
    await expect(
      child.set('childFiles', [initialUrl, addedParentUrl, externalUrl])
    ).resolves.toEqual([initialUrl, addedParentUrl, externalUrl]);

    expect(child.toStoreRecord().childFiles).toEqual([
      ...parentFiles,
      {
        url: 'https://example.com/report.unknown',
        name: 'report.unknown',
        type: ChatFileTypeEnum.unknown
      }
    ]);
    expect(parent.get('files')).toEqual([initialUrl, addedParentUrl]);
    expect(parent.toStoreRecord().files).toEqual(parentFiles);
  });

  it.each([
    {
      name: '非数组',
      value: 'https://example.com/report.pdf',
      error: 'File variable value must be an array'
    },
    {
      name: '私有 Key 对象',
      value: [{ key: 'chat/app/new.png', name: 'new.png', type: ChatFileTypeEnum.image }],
      error: 'only accept absolute HTTP(S) URLs'
    },
    {
      name: '相对 URL',
      value: ['/api/system/file/d/local'],
      error: 'only accept absolute HTTP(S) URLs'
    }
  ])('拒绝用 $name 更新文件变量，保留原值', async ({ value, error }) => {
    const existingUrl = 'https://example.com/existing.pdf';
    const state = await createState({
      variablesConfig: [{ key: 'files', type: VariableInputEnum.file } as any],
      inputVariables: { files: [existingUrl] }
    });
    const before = state.toStoreRecord();

    await expect(
      state.set('files', Array.isArray(value) ? [existingUrl, ...value] : value)
    ).rejects.toThrow(error);

    expect(state.get('files')).toEqual([existingUrl]);
    expect(state.toStoreRecord()).toEqual(before);
  });
});
