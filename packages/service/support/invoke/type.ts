import z from 'zod';
import { UploadFileByBodySchema } from '../../common/s3/contracts/type';
import { PluginPermissionListSchema } from '@fastgpt/global/sdk/fastgpt-plugin';

export const InvokeSessionSchema = z.object({
  appId: z.string().nonempty(),
  chatId: z.string().nonempty(),
  uId: z.string().nonempty(),
  teamId: z.string().nonempty(),
  tmbId: z.string().nonempty(),
  permissions: PluginPermissionListSchema.default([])
});

export type InvokeSessionType = z.infer<typeof InvokeSessionSchema>;

export const InvokeFileUploadSchema = z.object({
  filename: UploadFileByBodySchema.shape.filename,
  body: UploadFileByBodySchema.shape.body,
  contentType: UploadFileByBodySchema.shape.contentType,
  expiredTime: UploadFileByBodySchema.shape.expiredTime
});

export type InvokeFileUploadType = z.infer<typeof InvokeFileUploadSchema>;
