import * as dotenv from 'dotenv';

export async function init() {
  dotenv.config();
  dotenv.config({ path: '.env.local' });
}
