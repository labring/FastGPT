import { z } from 'zod';
import { InformLevelEnum } from '../../../../../support/user/inform/constants';

// Send system inform
export const SendSystemInformBodySchema = z.object({
  title: z.string().meta({ description: '通知标题' }),
  content: z.string().meta({ description: '通知内容' }),
  level: z.enum(InformLevelEnum).meta({ description: '通知等级' })
});
export type SendSystemInformBodyType = z.infer<typeof SendSystemInformBodySchema>;

// Update system modal
export const UpdateSystemModalBodySchema = z.object({
  content: z.string().meta({ description: '系统弹窗内容' })
});
export type UpdateSystemModalBodyType = z.infer<typeof UpdateSystemModalBodySchema>;

// Update operational ad
export const UpdateOperationalAdBodySchema = z.object({
  operationalAdImage: z.string().meta({ description: '活动图片URL' }),
  operationalAdLink: z.string().meta({ description: '活动链接' })
});
export type UpdateOperationalAdBodyType = z.infer<typeof UpdateOperationalAdBodySchema>;

// Update activity ad
export const UpdateActivityAdBodySchema = z.object({
  activityAdImage: z.string().meta({ description: '底部广告图片URL' }),
  activityAdLink: z.string().meta({ description: '底部广告链接' })
});
export type UpdateActivityAdBodyType = z.infer<typeof UpdateActivityAdBodySchema>;

// Response schemas
export const SystemMsgModalResponseSchema = z
  .object({
    id: z.string().meta({ description: '弹窗ID' }),
    content: z.string().meta({ description: '弹窗内容' })
  })
  .optional();
export type SystemMsgModalValueType = z.infer<typeof SystemMsgModalResponseSchema>;

export const OperationalAdResponseSchema = z
  .object({
    id: z.string().meta({ description: '广告ID' }),
    operationalAdImage: z.string().meta({ description: '广告图片URL' }),
    operationalAdLink: z.string().meta({ description: '广告链接' })
  })
  .optional();
export type OperationalAdResponseType = z.infer<typeof OperationalAdResponseSchema>;

export const ActivityAdResponseSchema = z
  .object({
    id: z.string().meta({ description: '广告ID' }),
    activityAdImage: z.string().meta({ description: '广告图片URL' }),
    activityAdLink: z.string().meta({ description: '广告链接' })
  })
  .optional();
export type ActivityAdResponseType = z.infer<typeof ActivityAdResponseSchema>;
