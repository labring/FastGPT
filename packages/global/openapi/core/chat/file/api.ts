import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { AppFileSelectConfigTypeSchema } from '../../../../core/app/type/config.schema';
import z from 'zod';
import { createOutLinkChatTargetInputSchema, transformChatAuthTargetInput } from '../api';
import { IntSchema } from '../../../../common/zod';

/* ============ chat file ============ */
const withChatFileTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOutLinkChatTargetInputSchema(shape).transform(transformChatAuthTargetInput);
const ChatFileDownloadModeSchema = z
  .enum(['short-proxy', 'short-redirect', 'presigned'])
  .optional()
  .describe('下载链接模式');

export const PresignChatFileGetUrlRawSchema = createOutLinkChatTargetInputSchema({
  key: z.string().min(1).describe('文件key'),
  chatId: z.string().min(1).describe('对话ID'),
  mode: ChatFileDownloadModeSchema,
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
}).meta({
  example: {
    key: '1234567890',
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
  mode: ChatFileDownloadModeSchema,
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});
export type PresignChatFileGetUrlParams = z.input<typeof PresignChatFileGetUrlSchema>;
export type PresignChatFileGetUrlRuntimeParams = z.output<typeof PresignChatFileGetUrlSchema>;

export const PresignChatFilePostUrlRawSchema = createOutLinkChatTargetInputSchema({
  filename: z.string().min(1).describe('文件名'),
  contentType: z.string().min(1).optional().describe('浏览器或上游提供的文件 MIME hint'),
  declaredExtension: z.string().min(1).optional().describe('无后缀来源显式声明的文件扩展名'),
  declaredFilename: z.string().min(1).optional().describe('无稳定文件名来源显式声明的文件名'),
  size: IntSchema.optional().describe('文件大小 hint，单位 byte'),
  chatId: z.string().min(1).describe('对话ID'),
  fileSelectConfig: AppFileSelectConfigTypeSchema.describe('本次上传控件的文件选择配置'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
}).meta({
  example: {
    filename: '1234567890',
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
  contentType: z.string().min(1).optional().describe('浏览器或上游提供的文件 MIME hint'),
  declaredExtension: z.string().min(1).optional().describe('无后缀来源显式声明的文件扩展名'),
  declaredFilename: z.string().min(1).optional().describe('无稳定文件名来源显式声明的文件名'),
  size: IntSchema.optional().describe('文件大小 hint，单位 byte'),
  chatId: z.string().min(1).describe('对话ID'),
  fileSelectConfig: AppFileSelectConfigTypeSchema.describe('本次上传控件的文件选择配置'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});
export type PresignChatFilePostUrlParams = z.input<typeof PresignChatFilePostUrlSchema>;
export type PresignChatFilePostUrlRuntimeParams = z.output<typeof PresignChatFilePostUrlSchema>;
