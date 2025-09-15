#!/usr/bin/env node

import { generateOpenApi } from '@ts-rest/open-api';
import { contract } from '../contract';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  const openApiDocument = generateOpenApi(
    contract,
    {
      info: {
        title: 'FastGPT OpenAPI',
        version: '1.0.0',
        description: 'FastGPT OpenAPI'
      }
    },
    {
      setOperationId: true
    }
  );
  const dir = path.resolve(__dirname, '../../../../../document/public/docs');
  try {
    await fs.stat(dir);
  } catch (error) {
    fs.mkdir(dir, { recursive: true });
  }
  const filepath = path.join(dir, 'openapi.json');
  await fs.writeFile(filepath, JSON.stringify(openApiDocument));
}

main();
