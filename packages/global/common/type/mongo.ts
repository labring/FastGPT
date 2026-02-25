import { z } from 'zod';

export const ObjectIdSchema = z.preprocess(
  (value) => (typeof value === 'object' ? String(value) : value),
  z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .meta({ example: '68ee0bd23d17260b7829b137', description: 'ObjectId' })
);
