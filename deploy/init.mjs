#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

/**
 * @enum {String} RegionEnum
 */
const RegionEnum = {
  cn: 'cn',
  global: 'global'
};

/**
 * @enum {String} VectorEnum
 */
const VectorEnum = {
  pg: 'pg',
  milvus: 'milvus',
  zilliz: 'zilliz',
  ob: 'ob'
};

/**
 * @enum {string} Services
 */
const Services = {
  fastgpt: 'fastgpt',
  fastgptPlugin: 'fastgpt-plugin',
  fastgptSandbox: 'fastgpt-sandbox',
  fastgptMcpServer: 'fastgpt-mcp_server',
  minio: 'minio',
  mongo: 'mongo',
  redis: 'redis',
  aiproxy: 'aiproxy',
  aiproxyPg: 'aiproxy-pg',
  // vectors
  pg: 'pg',
  milvusMinio: 'milvus-minio',
  milvusEtcd: 'milvus-etcd',
  milvusStandalone: 'milvus-standalone',
  oceanbase: 'oceanbase'
};

// make sure the cwd
const basePath = process.cwd();
if (!basePath.endsWith('deploy')) {
  process.chdir('deploy');
}

/**
 * @typedef {{ tag: String, image: {cn: String, global: String} }} ArgItemType
 */
/** format the args
 * @type {Record<Services, ArgItemType>}
 */
const args = (() => {
  /**
   * @type {{tags: Record<Services, string>, images: Record<Services, Record<string, string>>}}
   */
  const obj = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'args.json')));
  const args = {};
  for (const key of Object.keys(obj.tags)) {
    args[key] = {
      tag: obj.tags[key],
      image: {
        cn: obj.images.cn[key],
        global: obj.images.global[key]
      }
    };
  }
  return args;
})();

const vector = {
  pg: {
    db: '',
    config: `\
  PG_URL: postgresql://username:password@pg:5432/postgres`,
    extra: ''
  },
  milvus: {
    db: '',
    config: `\
  MILVUS_ADDRESS: http://milvusStandalone:19530
  MILVUS_TOKEN: none
    `,
    extra: ''
  },
  zilliz: {
    db: '',
    config: `\
  MILVUS_ADDRESS: zilliz_cloud_address
  MILVUS_TOKEN: zilliz_cloud_token`,
    extra: ''
  },
  ob: {
    db: '',
    config: `\
  OCEANBASE_URL: mysql://root%40tenantname:tenantpassword@ob:2881/test
`,
    extra: `\
configs:
  init_sql:
    name: init_sql
    content: |
      ALTER SYSTEM SET ob_vector_memory_limit_percentage = 30;
    `
  }
};

/**
 * replace all ${{}}
 * @param {string} source
 * @param {RegionEnum} region
 * @param {VectorEnum} vec
 * @returns {string}
 */
const replace = (source, region, vec) => {
  // Match ${{expr}}, capture "expr" inside {{}}
  return source.replace(/\$\{\{([^}]*)\}\}/g, (_, expr) => {
    // expr: a.b
    /**
     * @type {String}
     */
    const [a, b] = expr.split('.');
    if (a === 'vec') {
      if (b === 'db') {
        return replace(vector[vec].db, region, vec);
      } else {
        return vector[vec][b];
      }
    }

    if (b === 'tag') {
      return args[a].tag;
    } else if (b === 'image') {
      return args[a].image[region];
    }
  });
};
{
  // read in Vectors
  const pg = fs.readFileSync(path.join(process.cwd(), 'templates', 'vector', 'pg.txt'));
  vector.pg.db = String(pg);

  const milvus = fs.readFileSync(path.join(process.cwd(), 'templates', 'vector', 'milvus.txt'));
  vector.milvus.db = String(milvus);

  const ob = fs.readFileSync(path.join(process.cwd(), 'templates', 'vector', 'ob.txt'));
  vector.ob.db = String(ob);
}

const generateDevFile = async () => {
  console.log('generating dev/docker-compose.yml');
  // 1. read template
  const template = await fs.promises.readFile(
    path.join(process.cwd(), 'templates', 'docker-compose.dev.yml'),
    'utf8'
  );

  await Promise.all([
    fs.promises.writeFile(
      path.join(process.cwd(), 'dev', 'docker-compose.cn.yml'),
      replace(template, 'cn')
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'dev', 'docker-compose.yml'),
      replace(template, 'global')
    )
  ]);

  console.log('success geenrate dev files');
};

const generateProdFile = async () => {
  console.log('generating prod/docker-compose.yml');
  const template = await fs.promises.readFile(
    path.join(process.cwd(), 'templates', 'docker-compose.prod.yml'),
    'utf8'
  );

  await Promise.all([
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'cn', 'docker-compose.pg.yml'),
      replace(template, 'cn', VectorEnum.pg)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'global', 'docker-compose.pg.yml'),
      replace(template, 'global', VectorEnum.pg)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'cn', 'docker-compose.milvus.yml'),
      replace(template, 'cn', VectorEnum.milvus)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'global', 'docker-compose.milvus.yml'),
      replace(template, 'global', VectorEnum.milvus)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'cn', 'docker-compose.zilliz.yml'),
      replace(template, 'cn', VectorEnum.zilliz)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'global', 'docker-compose.ziliiz.yml'),
      replace(template, 'global', VectorEnum.zilliz)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'cn', 'docker-compose.oceanbase.yml'),
      replace(template, 'cn', VectorEnum.ob)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'global', 'docker-compose.oceanbase.yml'),
      replace(template, 'global', VectorEnum.ob)
    )
  ]);

  console.log('success geenrate prod files');
};

await Promise.all([generateDevFile(), generateProdFile()]);

console.log('copy the docker dir to ../document/public');

await fs.promises.cp(
  path.join(process.cwd(), 'docker'),
  path.join(process.cwd(), '..', 'document', 'public', 'deploy', 'docker'),
  { recursive: true }
);
