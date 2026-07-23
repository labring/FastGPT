import { describe, expect, it, vi } from 'vitest';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  getWorkflowFileVariableInputs,
  WorkflowVariableState
} from '../../../../core/workflow/dispatch/utils/variables';
import { encryptSecret } from '../../../../common/secret/aes256gcm';
import { anyValueDecrypt } from '../../../../common/secret/utils';

const mockGetChatFilePreviewUrl = vi.fn(async (key: string) => `http://preview.local/${key}`);
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  createChatFilePreviewUrlGetter: () => mockGetChatFilePreviewUrl
}));

const createState = (props: Partial<Parameters<typeof WorkflowVariableState.create>[0]> = {}) =>
  WorkflowVariableState.create({
    timezone: 'Asia/Shanghai',
    runningAppInfo: {
      id: 'appId',
      teamId: 'teamId',
      tmbId: 'tmbId',
      name: 'app'
    },
    uid: 'uid',
    chatId: 'chatId',
    variablesConfig: [],
    inputVariables: {},
    ...props
  });

describe('WorkflowVariableState', () => {
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
    expect(state.get('userId')).toBe('uid');
    expect(state.get('externalOnly')).toBe('external');
    expect(state.toStoreRecord()).toEqual({ name: '123' });
  });

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
    expect(state.toStoreRecord().pwd).toMatchObject({ value: '' });
    expect((state.toStoreRecord().pwd as any).secret).toEqual(expect.any(String));
    expect((state.toStoreRecord().pwd as any).secret).not.toBe('new-secret');
  });

  it('should keep encrypted password object readable and storable after initialization', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'pwd',
          type: VariableInputEnum.password,
          valueType: WorkflowIOValueTypeEnum.string
        } as any
      ],
      inputVariables: {
        pwd: {
          value: '',
          secret: encryptSecret('old-secret')
        }
      }
    });

    expect(state.get('pwd')).toBe('old-secret');
    expect(anyValueDecrypt(state.toStoreRecord().pwd)).toBe('old-secret');
  });

  it('should not double encrypt password when initialized from stored JSON string', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'pwd',
          type: VariableInputEnum.password,
          valueType: WorkflowIOValueTypeEnum.string
        } as any
      ],
      inputVariables: {
        pwd: JSON.stringify({
          value: '',
          secret: encryptSecret('old-secret')
        })
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

  it('should silently slice configured file inputs by maxFiles', async () => {
    const resolveInputFile = vi.fn(async (file) =>
      'url' in file ? file.url : `https://workflow.example.com/${file.key}`
    );
    const variablesConfig = [
      {
        key: 'files',
        type: VariableInputEnum.file,
        maxFiles: 2
      } as any
    ];
    const inputVariables = {
      files: [
        'https://external.example.com/1.pdf',
        'https://external.example.com/2.pdf',
        'https://external.example.com/3.pdf'
      ]
    };

    const state = await createState({
      variablesConfig,
      inputVariables,
      resolveInputFile
    });

    expect(state.get('files')).toEqual(inputVariables.files.slice(0, 2));
    expect(
      getWorkflowFileVariableInputs({ variablesConfig, inputVariables, maxFileAmount: 1 })
    ).toEqual(inputVariables.files.slice(0, 1));
    expect(resolveInputFile).toHaveBeenCalledTimes(2);
  });

  it('should cap the variable file limit by the workflow user quota', async () => {
    const state = await createState({
      maxFileAmount: 1,
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file,
          maxFiles: 2
        } as any
      ]
    });
    const files = [
      'https://external.example.com/1.pdf',
      'https://external.example.com/2.pdf',
      'https://external.example.com/3.pdf'
    ];

    const result = await state.set('files', files);

    expect(result).toEqual(files.slice(0, 1));
    expect(state.get('files')).toEqual(files.slice(0, 1));
  });

  it('should fall back to the workflow file limit for runtime file updates', async () => {
    const state = await createState({
      maxFileAmount: 2,
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ]
    });
    const files = [
      'https://external.example.com/1.pdf',
      'https://external.example.com/2.pdf',
      'https://external.example.com/3.pdf'
    ];

    const result = await state.set('files', files);

    expect(result).toEqual(files.slice(0, 2));
    expect(state.get('files')).toEqual(files.slice(0, 2));
    expect(
      getWorkflowFileVariableInputs({
        variablesConfig: [{ key: 'files', type: VariableInputEnum.file } as any],
        inputVariables: { files },
        maxFileAmount: 2
      })
    ).toEqual(files.slice(0, 2));
  });

  it('should default runtime file updates to five files', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ]
    });
    const files = Array.from(
      { length: 6 },
      (_, index) => `https://external.example.com/${index + 1}.pdf`
    );

    const result = await state.set('files', files);

    expect(result).toEqual(files.slice(0, 5));
    expect(state.get('files')).toEqual(files.slice(0, 5));
    expect(
      getWorkflowFileVariableInputs({
        variablesConfig: [{ key: 'files', type: VariableInputEnum.file } as any],
        inputVariables: { files }
      })
    ).toEqual(files.slice(0, 5));
  });

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
        type: ChatFileTypeEnum.file,
        name: 'file.jpg',
        url: 'https://example.com/files/file.jpg'
      },
      {
        type: ChatFileTypeEnum.file,
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
        type: ChatFileTypeEnum.file
      }
    ]);
  });

  it('should preserve parent file metadata when updating child state with its runtime url', async () => {
    const parent = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ],
      inputVariables: {
        files: [
          {
            key: 'chat/app/parent.pdf',
            name: 'parent.pdf',
            type: ChatFileTypeEnum.file
          }
        ]
      }
    });
    const [runtimeUrl] = parent.get('files') as string[];
    const child = await createState({
      variablesConfig: [
        {
          key: 'childFiles',
          type: VariableInputEnum.file
        } as any
      ],
      sourceVariableState: parent
    });

    await child.set('childFiles', [runtimeUrl]);

    expect(child.toStoreRecord().childFiles).toEqual([
      {
        key: 'chat/app/parent.pdf',
        name: 'parent.pdf',
        type: ChatFileTypeEnum.file
      }
    ]);
  });

  it('should restore parent file metadata from runtime url when initializing child state', async () => {
    const parent = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ],
      inputVariables: {
        files: [
          {
            key: 'chat/app/parent-init.png',
            name: 'parent-init.png',
            type: ChatFileTypeEnum.image
          }
        ]
      }
    });
    const [runtimeUrl] = parent.get('files') as string[];
    const child = await createState({
      variablesConfig: [
        {
          key: 'childFiles',
          type: VariableInputEnum.file
        } as any
      ],
      inputVariables: {
        childFiles: [runtimeUrl]
      },
      sourceVariableState: parent
    });

    expect(child.get('childFiles')).toEqual(['http://preview.local/chat/app/parent-init.png']);
    expect(child.toStoreRecord().childFiles).toEqual([
      {
        key: 'chat/app/parent-init.png',
        name: 'parent-init.png',
        type: ChatFileTypeEnum.image
      }
    ]);
  });

  it('should infer unknown external runtime urls and reject non-array file updates', async () => {
    const state = await createState({
      variablesConfig: [
        {
          key: 'files',
          type: VariableInputEnum.file
        } as any
      ]
    });

    await state.set('files', ['https://example.com/report.unknown']);

    expect(state.toStoreRecord().files).toEqual([
      {
        url: 'https://example.com/report.unknown',
        name: 'report.unknown',
        type: ChatFileTypeEnum.file
      }
    ]);
    await expect(state.set('files', 'https://example.com/report.pdf')).rejects.toThrow(
      'File variable value must be an array'
    );
  });
});
