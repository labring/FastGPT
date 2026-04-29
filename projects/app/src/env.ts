import z from 'zod';

const truthyBoolStrs = ['true', '1', 'yes', 'y'];
const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

const boolSchema = (defaultValue = false) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? String(defaultValue) : value),
    z
      .string()
      .transform((val) => truthyBoolStrs.includes(val.toLowerCase()))
      .pipe(z.boolean())
  );
const intSchema = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? defaultValue : value),
    z.coerce.number<number>().int()
  );
const OptionalIntSchema = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number<number>().int().nonnegative().optional()
);
const OptionalStringSchema = z.preprocess(emptyStringToUndefined, z.string().optional());

const OptionalUrlSchema = z.preprocess(emptyStringToUndefined, z.string().url().optional());

const appEnvSchema = z.object({
  DEFAULT_ROOT_PSW: z.preprocess(emptyStringToUndefined, z.string().default('123456')),
  SYSTEM_NAME: z.preprocess(emptyStringToUndefined, z.string().default('AI')),
  SYSTEM_DESCRIPTION: OptionalStringSchema,
  SYSTEM_FAVICON: OptionalStringSchema,

  CONFIG_JSON_PATH: OptionalStringSchema,
  CHINESE_IP_REDIRECT_URL: z.string().default(''),
  PAY_FORM_URL: z.string().default(''),

  SHOW_COUPON: boolSchema(false),
  SHOW_DISCOUNT_COUPON: boolSchema(false),
  HIDE_CHAT_COPYRIGHT_SETTING: boolSchema(false),
  AGENT_SANDBOX_FREE_TIP: boolSchema(false),

  AIPROXY_API_ENDPOINT: OptionalUrlSchema,
  AIPROXY_API_TOKEN: OptionalStringSchema,
  MARKETPLACE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default('https://marketplace.fastgpt.cn')
  ),

  PASSWORD_LOGIN_LOCK_SECONDS: intSchema(120).pipe(z.number().nonnegative()),
  PASSWORD_EXPIRED_MONTH: OptionalIntSchema,

  UPLOAD_FILE_MAX_SIZE: intSchema(1000).pipe(z.number().nonnegative()),
  UPLOAD_FILE_MAX_AMOUNT: intSchema(1000).pipe(z.number().nonnegative())
});

export const getAppEnv = () => {
  const parsed = appEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid app environment variables. Please check: ${paths}\n`);
  }

  return parsed.data;
};

export const appEnv = getAppEnv();
