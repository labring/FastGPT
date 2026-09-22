import z from 'zod';
import { LicensePayloadSchema } from '../../../common/system/license/schema';

/*
 * API: 管理员 License 管理
 * Route: /api/proApi/admin/license/*
 * Method: GET / POST
 * Description: 查询、激活商业版 License，并获取当前部署实例 ID
 * Tags: ['Admin', 'License']
 */

export const ActiveLicenseBodySchema = z.object({
  license: z.string().meta({ description: '许可证密钥字符串' })
});
export type ActiveLicenseBodyType = z.infer<typeof ActiveLicenseBodySchema>;

export const LicenseAuthResponseSchema = LicensePayloadSchema.optional();
export type LicenseAuthResponseType = z.infer<typeof LicenseAuthResponseSchema>;

export const InstanceIdResponseSchema = z.object({
  instanceId: z.string().meta({ description: '当前部署实例 ID' })
});
export type InstanceIdResponseType = z.infer<typeof InstanceIdResponseSchema>;
