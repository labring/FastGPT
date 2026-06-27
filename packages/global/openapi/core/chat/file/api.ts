import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { AppFileSelectConfigTypeSchema } from '../../../../core/app/type/config.schema';
import z from 'zod';
import { createChatTargetInputSchema, transformChatTargetInput } from '../api';

/* ============ chat file ============ */
const withChatFileTarget = <T extends z.ZodRawShape>(shape: T) =>
  createChatTargetInputSchema(shape).transform(transformChatTargetInput);

export const PresignChatFileGetUrlRawSchema = createChatTargetInputSchema({
  key: z.string().min(1).describe('文件key'),
  chatId: z.string().min(1).describe('对话ID'),
  mode: z.enum(['proxy', 'presigned']).optional().describe('下载方式'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
}).meta({
  example: {
    key: '1234567890',
    appId: '1234567890',
    chatId: '1234567890',
    outLinkAuthData: {
      shareId: '1234567890',
      outLinkUid: '1234567890'
    }
  }
});
export const PresignChatFileGetUrlSchema = withChatFileTarget({
  key: z.string().min(1).describe('文件key'),
  chatId: z.string().min(1).describe('对话ID'),
  mode: z.enum(['proxy', 'presigned']).optional().describe('下载方式'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});
export type PresignChatFileGetUrlParams = z.input<typeof PresignChatFileGetUrlSchema>;
export type PresignChatFileGetUrlRuntimeParams = z.output<typeof PresignChatFileGetUrlSchema>;

export const PresignChatFilePostUrlRawSchema = createChatTargetInputSchema({
  filename: z.string().min(1).describe('文件名'),
  chatId: z.string().min(1).describe('对话ID'),
  fileSelectConfig: AppFileSelectConfigTypeSchema.describe('本次上传控件的文件选择配置'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
}).meta({
  example: {
    filename: '1234567890',
    appId: '1234567890',
    chatId: '1234567890',
    fileSelectConfig: {
      canSelectFile: true,
      customFileExtensionList: ['.txt']
    },
    outLinkAuthData: {
      shareId: '1234567890',
      outLinkUid: '1234567890'
    }
  }
});
export const PresignChatFilePostUrlSchema = withChatFileTarget({
  filename: z.string().min(1).describe('文件名'),
  chatId: z.string().min(1).describe('对话ID'),
  fileSelectConfig: AppFileSelectConfigTypeSchema.describe('本次上传控件的文件选择配置'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});
export type PresignChatFilePostUrlParams = z.input<typeof PresignChatFilePostUrlSchema>;
export type PresignChatFilePostUrlRuntimeParams = z.output<typeof PresignChatFilePostUrlSchema>;
