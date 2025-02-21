import { parseAPI } from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { convertOpenApi } from './openapi';

const rootPath = 'projects/app/src/pages/api';
const exclude = ['/admin', '/proApi', 'test.ts'];

function getAllFiles(dir: string) {
  let files: string[] = [];
  const stat = fs.statSync(dir);
  if (stat.isDirectory()) {
    const list = fs.readdirSync(dir);
    list.forEach((item) => {
      const fullPath = path.join(dir, item);
      if (!exclude.some((excluded) => fullPath.includes(excluded))) {
        files = files.concat(getAllFiles(fullPath));
      }
    });
  } else {
    files.push(dir);
  }
  return files;
}

const searchPath = process.env.SEARCH_PATH || '';

const files = getAllFiles(path.join(rootPath, searchPath));
// console.log(files)
const apis = files.map((file) => {
  return parseAPI({ path: file, rootPath });
});

const openapi = convertOpenApi({
  apis,
  openapi: '3.0.0',
  info: {
    title: 'FastGPT OpenAPI',
    version: '1.0.0',
    author: 'FastGPT'
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        scheme: 'bearer'
      },
      token: {
        type: 'apiKey',
        in: 'token',
        name: 'token',
        scheme: 'basic'
      }
    }
  },
  servers: [
    {
      url: 'http://localhost:4000'
    }
  ]
});

const json = JSON.stringify(openapi, null, 2);

fs.writeFileSync('./scripts/openapi/openapi.json', json);
fs.writeFileSync('./scripts/openapi/openapi.out', JSON.stringify(apis, null, 2));

console.log('Total APIs:', files.length);
