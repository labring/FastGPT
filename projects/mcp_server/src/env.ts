import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: '.env.local' });

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z.object({
  FASTGPT_ENDPOINT: z.preprocess(emptyStringToUndefined, z.string().url()),
  PORT: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number<number>().int().positive().default(3000)
  )
});

export const getMcpServerEnv = () => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid mcp_server environment variables. Please check: ${paths}\n`);
  }

  return parsed.data;
};

export const mcpServerEnv = getMcpServerEnv();
