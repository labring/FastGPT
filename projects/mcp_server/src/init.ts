import { configureLogger } from '@fastgpt/service/common/logger';
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

export async function init() {
  await configureLogger();
}
