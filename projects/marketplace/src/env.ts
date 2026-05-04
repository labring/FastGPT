import z from 'zod';

const truthyBoolStrs = ['true', '1', 'yes', 'y'];
const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

const BoolSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? String(true) : value),
  z
    .string()
    .transform((val) => truthyBoolStrs.includes(val.toLowerCase()))
    .pipe(z.boolean())
);
const IntSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? 20 : value),
  z.coerce.number<number>().int().nonnegative()
);

const marketplaceEnvSchema = z.object({
  MONGODB_URI: z.preprocess(emptyStringToUndefined, z.string().default('')),
  DB_MAX_LINK: IntSchema,
  SYNC_INDEX: BoolSchema,
  S3_PREFIX: z.preprocess(emptyStringToUndefined, z.string().default('')),
  AUTH_TOKEN: z.preprocess(emptyStringToUndefined, z.string().default(''))
});

export const getMarketplaceEnv = () => {
  const parsed = marketplaceEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid marketplace environment variables. Please check: ${paths}\n`);
  }

  return parsed.data;
};

export const marketplaceEnv = getMarketplaceEnv();
