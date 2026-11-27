import type { CliCommandSpec } from '../pipeline';
import { requireActiveClient, resolveIdArg } from './dataset/shared';

/** 注册 FastGPT 通用文件管理命令（当前支持预签名头像上传）。 */
export function createFileCommandSpecs(): CliCommandSpec[] {
  return [
    {
      path: ['file', 'upload-avatar'],
      summary:
        'Upload a local avatar image (.jpg/.jpeg/.png, <=5MB) via presigned URL and return the FastGPT avatar path',
      risk: 'write',
      authModes: ['token'],
      positionalArgs: [
        {
          name: 'filePath',
          required: false,
          description: 'Local avatar image path (.jpg, .jpeg, .png) (or use --file)'
        }
      ],
      options: [
        {
          name: 'file',
          flags: '--file <path>',
          takesValue: true,
          description: 'Local avatar image path (.jpg, .jpeg, .png, max 5 MB)'
        },
        {
          name: 'dryRun',
          flags: '--dry-run',
          takesValue: false,
          description: 'Validate image locally and preview presign request without uploading'
        }
      ],
      examples: [
        {
          description: 'Upload a local PNG avatar and print only its FastGPT avatar path',
          args: ['file', 'upload-avatar', './bot-avatar.png', '--pick', 'data.avatar', '--raw']
        },
        {
          description: 'Preview avatar upload validation without sending HTTP requests',
          args: ['file', 'upload-avatar', './bot-avatar.png', '--dry-run']
        }
      ],
      execute: async ({ positional, options, client, container }) => {
        const activeClient = requireActiveClient(client, 'file upload-avatar');
        const filePath = resolveIdArg({
          positional: positional[0],
          flagValue: options.file,
          label: 'Avatar image path',
          usage:
            'fastgpt file upload-avatar <image.(png|jpg|jpeg)> or fastgpt file upload-avatar --file <path>'
        });

        const file = await container.fileIo.readBinaryFile(filePath);

        return container.fileService.uploadAvatar({
          client: activeClient,
          file,
          autoExpired: true,
          dryRun: options.dryRun === true
        });
      }
    }
  ];
}
