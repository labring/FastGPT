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

// make sure the cwd
const basePath = process.cwd();
if (!basePath.endsWith('deploy')) {
  process.chdir('deploy');
}

/**
 * 扫描 `deploy/version/*` 获取所有可发布版本。
 *
 * 每个版本目录必须包含 `args.json` 和 `docker-compose.template.yml`。`main`
 * 固定作为迭代版展示，其余目录名都作为稳定版展示；这里仅负责发现和排序。
 *
 * @returns {Promise<string[]>}
 */
const loadDeployVersions = async () => {
  const versionRoot = path.join(process.cwd(), 'version');
  const entries = await fs.promises.readdir(versionRoot, { withFileTypes: true });
  const versions = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const version = entry.name;
    const versionPath = path.join(versionRoot, version);
    const requiredFiles = ['args.json', 'docker-compose.template.yml'];
    const exists = await Promise.all(
      requiredFiles.map((file) =>
        fs.promises
          .access(path.join(versionPath, file))
          .then(() => true)
          .catch(() => false)
      )
    );

    if (exists.every(Boolean)) {
      versions.push(version);
    }
  }

  if (versions.length === 0) {
    throw new Error('No deploy versions found in deploy/version');
  }

  return versions.sort((a, b) => {
    if (a === 'main') return 1;
    if (b === 'main') return -1;
    return b.localeCompare(a, undefined, { numeric: true });
  });
};

/**
 * 将扫描到的版本列表写入安装脚本。
 *
 * `install.sh` 会被用户单独下载执行，版本列表不能依赖另一个运行时请求。
 * 这里用固定标记替换生成片段，保持脚本入口和 deploy/version 目录一致。
 *
 * @param {string[]} deployVersions
 */
const syncInstallScriptVersions = async (deployVersions) => {
  const installScriptPath = path.join(
    process.cwd(),
    '..',
    'document',
    'public',
    'deploy',
    'install.sh'
  );
  const begin = '# BEGIN GENERATED DEPLOY VERSIONS';
  const end = '# END GENERATED DEPLOY VERSIONS';
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shellQuote = (value) =>
    `"${String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')}"`;
  const versionsBlock = [
    begin,
    'DEPLOY_VERSIONS=(',
    ...deployVersions.map((version) => `    ${shellQuote(version)}`),
    ')',
    end
  ].join('\n');

  const source = await fs.promises.readFile(installScriptPath, 'utf8');
  const blockPattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);

  if (!blockPattern.test(source)) {
    throw new Error('Can not find generated deploy versions block in install.sh');
  }

  await fs.promises.writeFile(installScriptPath, source.replace(blockPattern, versionsBlock));
};

/**
 * 读取共享向量库模板配置。
 *
 * `deploy/templates/vector/config.json` 维护向量库输出文件名、服务片段、连接配置
 * 和额外 configs。版本模板只通过 `${{vec.*}}` 引用这些共享片段。
 *
 * @returns {Promise<Record<string, { filename: string, db: string, config: string, extra: string }>>}
 */
const loadVectorConfigs = async () => {
  const vectorRoot = path.join(process.cwd(), 'templates', 'vector');
  const vectorConfig = JSON.parse(
    await fs.promises.readFile(path.join(vectorRoot, 'config.json'), 'utf8')
  );
  const vectors = {};

  for (const [name, config] of Object.entries(vectorConfig)) {
    const readOptionalFile = async (file) => {
      if (!file) {
        return '';
      }

      return (await fs.promises.readFile(path.join(vectorRoot, file), 'utf8')).replace(/\n$/, '');
    };

    vectors[name] = {
      filename: config.filename,
      db: await readOptionalFile(config.dbFile),
      config: await readOptionalFile(config.configFile),
      extra: await readOptionalFile(config.extraFile)
    };
    vectors[name].extraBlock = vectors[name].extra ? `configs:\n  ${vectors[name].extra}` : '';
  }

  return vectors;
};

/**
 * @typedef {{ tag: String, image: {cn: String, global: String} }} ArgItemType
 */
/**
 * 读取指定部署版本的镜像参数。
 *
 * dev 默认使用 main 的参数；prod 按版本目录分别读取，避免稳定版 tag 被 main
 * 分支的迭代镜像意外覆盖。
 *
 * @param {string} version
 * @returns {Record<Services, ArgItemType>}
 */
const loadArgs = (version) => {
  /**
   * @type {{tags: Record<Services, string>, images: Record<Services, Record<string, string>>}}
   */
  const obj = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'version', version, 'args.json'))
  );
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
};

/**
 * replace all ${{}}
 * @param {string} source
 * @param {RegionEnum} region
 * @param {string | undefined} vec
 * @param {Record<Services, ArgItemType>} args
 * @param {Record<string, { filename: string, db: string, config: string, extra: string }>} vectors
 * @returns {string}
 */
const replace = (source, region, vec, args, vectors) => {
  // Match ${{expr}}, capture "expr" inside {{}}
  return source.replace(/\$\{\{([^}]*)\}\}/g, (_, expr) => {
    // expr: a.b
    /**
     * @type {String}
     */
    const [a, b] = expr.split('.');
    if (a === 'vec') {
      if (!vectors[vec]) {
        throw new Error(`Unknown vector config: ${vec}`);
      }

      if (b === 'db') {
        return replace(vectors[vec].db, region, vec, args, vectors);
      } else {
        return vectors[vec][b];
      }
    }

    if (b === 'tag') {
      return args[a].tag;
    } else if (b === 'image') {
      return args[a].image[region];
    }
  });
};

const formatYamlOutput = (source) => `${source.trimEnd()}\n`;

const generateDevFile = async (deployVersions, vectors) => {
  console.log('generating dev/docker-compose.yml');
  // 1. read template
  const template = await fs.promises.readFile(
    path.join(process.cwd(), 'templates', 'docker-compose.dev.yml'),
    'utf8'
  );
  const defaultDevVersion = deployVersions.includes('main') ? 'main' : deployVersions[0];
  const args = loadArgs(defaultDevVersion);

  await Promise.all([
    fs.promises.writeFile(
      path.join(process.cwd(), 'dev', 'docker-compose.cn.yml'),
      formatYamlOutput(replace(template, 'cn', undefined, args, vectors))
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'dev', 'docker-compose.yml'),
      formatYamlOutput(replace(template, 'global', undefined, args, vectors))
    )
  ]);

  console.log('success generated dev files');
};

/**
 * 生成公开下载的 Docker Compose 部署文件。
 *
 * 每个版本使用自己的模板和镜像参数；向量库片段保持共享。
 */
const generateProdFile = async (deployVersions, vectors) => {
  console.log('generating public prod docker-compose.yml files');
  const outputRoot = path.join(process.cwd(), '..', 'document', 'public', 'deploy', 'docker');
  const regions = Object.values(RegionEnum);
  const versionArgs = Object.fromEntries(
    deployVersions.map((version) => [version, loadArgs(version)])
  );
  const versionTemplates = Object.fromEntries(
    await Promise.all(
      deployVersions.map(async (version) => [
        version,
        await fs.promises.readFile(
          path.join(process.cwd(), 'version', version, 'docker-compose.template.yml'),
          'utf8'
        )
      ])
    )
  );

  await fs.promises.rm(outputRoot, { recursive: true, force: true });
  await fs.promises.mkdir(outputRoot, { recursive: true });

  for (const version of deployVersions) {
    for (const region of regions) {
      await fs.promises.mkdir(path.join(outputRoot, version, region), { recursive: true });
    }
  }

  await Promise.all(
    deployVersions.flatMap((version) =>
      regions.flatMap((region) =>
        Object.entries(vectors).map(([vector, { filename }]) =>
          fs.promises.writeFile(
            path.join(outputRoot, version, region, `docker-compose.${filename}.yml`),
            formatYamlOutput(
              replace(versionTemplates[version], region, vector, versionArgs[version], vectors)
            )
          )
        )
      )
    )
  );

  console.log('success generated prod files');
};

const deployVersions = await loadDeployVersions();
await syncInstallScriptVersions(deployVersions);
const vectors = await loadVectorConfigs();
await Promise.all([
  generateDevFile(deployVersions, vectors),
  generateProdFile(deployVersions, vectors)
]);
