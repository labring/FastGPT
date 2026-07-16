import { OutLinkChatAuthSchema } from '../../../../support/permission/chat';
import { AppFileSelectConfigTypeSchema } from '../../../../core/app/type/config.schema';
import z from 'zod';
import {
  createChatTargetInputSchema,
  createOutLinkChatTargetInputSchema,
  transformChatAuthTargetInput,
  transformChatTargetInput
} from '../api';
import { IntSchema } from '../../../../common/zod';

/* ============ chat file ============ */
const withChatFileTarget = <T extends z.ZodRawShape>(shape: T) =>
  createOutLinkChatTargetInputSchema(shape).transform(transformChatAuthTargetInput);
const withInternalChatFileTarget = <T extends z.ZodRawShape>(shape: T) =>
  createChatTargetInputSchema(shape).transform(transformChatTargetInput);
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

const ChatFileUploadHintShape = {
  filename: z.string().min(1).describe('文件名'),
  contentType: z.string().min(1).optional().describe('浏览器或上游提供的文件 MIME hint'),
  declaredExtension: z.string().min(1).optional().describe('无后缀来源显式声明的文件扩展名'),
  declaredFilename: z.string().min(1).optional().describe('无稳定文件名来源显式声明的文件名'),
  size: IntSchema.optional().describe('文件大小 hint，单位 byte')
};

export const PresignChatFilePostUrlRawSchema = createOutLinkChatTargetInputSchema({
  ...ChatFileUploadHintShape,
  chatId: z.string().min(1).describe('对话ID'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
}).meta({
  example: {
    filename: 'report.pdf',
    chatId: '1234567890',
    outLinkAuthData: {
      shareId: '1234567890',
      outLinkUid: '1234567890'
    }
  }
});
export const PresignChatFilePostUrlSchema = withChatFileTarget({
  ...ChatFileUploadHintShape,
  chatId: z.string().min(1).describe('对话ID'),
  outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
});
export type PresignChatFilePostUrlParams = z.input<typeof PresignChatFilePostUrlSchema>;
export type PresignChatFilePostUrlRuntimeParams = z.output<typeof PresignChatFilePostUrlSchema>;

export const PresignDraftChatFilePostUrlRawSchema = createChatTargetInputSchema({
  ...ChatFileUploadHintShape,
  chatId: z.string().min(1).describe('对话ID'),
  fileSelectConfig: AppFileSelectConfigTypeSchema.describe('未保存草稿使用的文件选择配置')
}).meta({
  example: {
    filename: 'draft.dat',
    appId: '68ad85a7463006c963799a05',
    chatId: '1234567890',
    fileSelectConfig: {
      canSelectCustomFileExtension: true,
      customFileExtensionList: ['.dat']
    }
  }
});
export const PresignDraftChatFilePostUrlSchema = withInternalChatFileTarget({
  ...ChatFileUploadHintShape,
  chatId: z.string().min(1).describe('对话ID'),
  fileSelectConfig: AppFileSelectConfigTypeSchema.describe('未保存草稿使用的文件选择配置')
});
export type PresignDraftChatFilePostUrlParams = z.input<typeof PresignDraftChatFilePostUrlSchema>;
export type PresignDraftChatFilePostUrlRuntimeParams = z.output<
  typeof PresignDraftChatFilePostUrlSchema
>;
