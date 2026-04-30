import { BucketNameEnum } from './constants';
import { ObjectIdSchema } from '../type/mongo';
import z from 'zod';

const FileTokenQuerySchema = z.object({
  bucketName: z.enum(BucketNameEnum),
  teamId: ObjectIdSchema,
  uid: z.string().nonempty(),
  fileId: z.string().nonempty(),
  customExpireMinutes: z.number().optional()
});
export type FileTokenQuery = z.infer<typeof FileTokenQuerySchema>;
