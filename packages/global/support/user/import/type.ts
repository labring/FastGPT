import { z } from 'zod';

export const UserImportLocaleSchema = z.enum(['zh-CN', 'zh-Hant', 'en']);
export type UserImportLocale = z.infer<typeof UserImportLocaleSchema>;
