import path from 'node:path';
import { vi } from 'vitest';

vi.mock('@fastgpt/service/common/geo/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    dbPath: path.join(process.cwd(), 'projects/app/data/GeoLite2-City.mmdb')
  };
});
