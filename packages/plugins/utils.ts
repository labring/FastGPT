import path from 'path';
import * as fs from 'fs';

const isProduction = process.env.NODE_ENV === 'production';

export const getFileSavePath = (name: string) => {
  if (isProduction) {
    return `/app/plugin_file/${name}`;
  }
  const filePath = path.join(process.cwd(), 'local', 'plugin_file', name);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  return filePath;
};
