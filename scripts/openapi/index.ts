import { parseAPI } from './utils';
import * as fs from 'fs';
import * as path from 'path';

const rootPath = 'projects/app/src/pages/api';

function getAllFiles(dir: string) {
  let files: string[] = [];
  const stat = fs.statSync(dir);
  if (stat.isDirectory()) {
    const list = fs.readdirSync(dir);
    list.forEach((item) => {
      const fullPath = path.join(dir, item);
      files = files.concat(getAllFiles(fullPath));
    });
  } else {
    files.push(dir);
  }
  return files;
}

const searchPath = process.env.SEARCH_PATH || '';

const files = getAllFiles(path.join(rootPath, searchPath));
// console.log(files)

for (const file of files) {
  // const api = await parseode({ path: file, rootPath });
  const api = parseAPI({ path: file, rootPath });
  console.log(api);
}

console.log('Total APIs:', files.length);
