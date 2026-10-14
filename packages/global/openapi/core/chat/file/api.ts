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

export const PresignChatFileGetUrlRawSchema = createOutLinkChatTargetInputSchema({
  key: z.string().min(1).describe('文件key'),
  chatId: z.string().min(1).describe('对话ID'),
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

/* ============================================================================
 * API: 准备输入草稿附件
 * Route: POST /api/core/chat/file/prepareDraftFiles
 * Method: POST
 * Description: 校验已上传附件、续期未过期临时对象并刷新预览链接。
 * Tags: ['ChatFile']
 * ============================================================================ */
const PrepareDraftFilesShape = {
  chatId: z.string().min(1).meta({ description: '草稿所属会话 ID', example: 'chat-id' }),
  keys: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .meta({
      description: '已上传附件 key，每次最多准备 100 个',
      example: ['chat/app/app-id/user-id/chat-id/file.pdf']
    }),
  remainingMs: IntSchema.min(1)
    .max(60 * 60 * 1000)
    .meta({
      description: '距离草稿最后修改后过期的剩余毫秒数，最多一小时',
      example: 3599700
    })
};
export const PrepareDraftFilesRawSchema =
  createOutLinkChatTargetInputSchema(PrepareDraftFilesShape);
export const PrepareDraftFilesSchema = withChatFileTarget(PrepareDraftFilesShape);
export type PrepareDraftFilesParams = z.input<typeof PrepareDraftFilesSchema>;

export const PrepareDraftFilesResponseSchema = z.array(
  z.discriminatedUnion('status', [
    z.object({
      key: z.string().meta({ description: '附件 key' }),
      status: z.literal('ready').meta({ description: '文件已上传且仍可访问' }),
      url: z.string().meta({ description: '新签发的预览链接' }),
      expiresAt: IntSchema.nullable().meta({
        description: '临时对象到期时间戳，持久化对象为 null',
        example: 1791957600000
      })
    }),
    z.object({
      key: z.string().meta({ description: '附件 key' }),
      status: z.literal('unavailable').meta({ description: '文件无法恢复' }),
      reason: z.enum(['expired', 'missing']).meta({ description: '临时引用已到期或对象不存在' })
    })
  ])
);
export type PrepareDraftFilesResponse = z.infer<typeof PrepareDraftFilesResponseSchema>;
