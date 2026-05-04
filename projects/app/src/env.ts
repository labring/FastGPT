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
const OptionalIntSchema = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number<number>().int().nonnegative().optional()
);
const OptionalStringSchema = z.preprocess(emptyStringToUndefined, z.string().optional());

const appEnvSchema = z.object({
  DEFAULT_ROOT_PSW: z.preprocess(emptyStringToUndefined, z.string().default('123456')),
  CONFIG_JSON_PATH: OptionalStringSchema,
  SYSTEM_NAME: z.preprocess(emptyStringToUndefined, z.string().default('AI')),
  SYSTEM_DESCRIPTION: z.preprocess(emptyStringToUndefined, z.string().default('')),
  SYSTEM_FAVICON: z.preprocess(emptyStringToUndefined, z.string().default('')),
  CHINESE_IP_REDIRECT_URL: z.string().default(''),
  PAY_FORM_URL: z.string().default(''),

  SHOW_COUPON: boolSchema(false),
  SHOW_DISCOUNT_COUPON: boolSchema(false),
  HIDE_CHAT_COPYRIGHT_SETTING: boolSchema(false),
  AGENT_SANDBOX_FREE_TIP: boolSchema(false),

  MARKETPLACE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().default('https://marketplace.fastgpt.cn')
  ),
  PASSWORD_EXPIRED_MONTH: OptionalIntSchema
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
