import { describe, expect, it, vi } from 'vitest';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WorkflowVariableState } from '../../../../core/workflow/dispatch/utils/variables';
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

  it('should restore parent file metadata from runtime url in child state', async () => {
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
