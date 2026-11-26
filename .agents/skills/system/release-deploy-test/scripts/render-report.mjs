#!/usr/bin/env node
/**
 * FastGPT release-deploy-test 报告初始化、状态更新与单文件 HTML 渲染脚本。
 *
 * 子命令：
 *   init   --out <report.json> [--title ...] [--template ...] [--version ...] [--region ...]
 *          [--vector-db ...] [--host ...] [--project ...] [--workdir ...] [--base-url ...]
 *          [--model-source ...] [--browser ...]
 *   update --input <report.json> --id <D01|U01|...> --status <passed|failed|blocked|skipped|pending>
 *          [--actual "..."] [--screenshot "<path>::<caption?>"] [--replace-screenshots]
 *   meta   --input <report.json> --set "<key>=<value>" [--image "<service=image:tag>"]
 *   render --input <report.json> --out <report.html> [--no-inline-images]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../assets/report-template.html');
const VALID_STATUSES = new Set(['passed', 'failed', 'blocked', 'skipped', 'pending']);
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bfastgpt-[A-Za-z0-9_-]{16,}\b/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/i
];

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

/** 返回标准 16 项发布部署验收检查清单。 */
function createDefaultChecklist() {
  return [
    {
      id: 'D01',
      phase: '阶段一：部署与基础设施',
      title: '宿主机前置检查与模板准备',
      steps: [
        '检查目标宿主机运行中的容器、数据卷与端口占用，确保与现有服务隔离',
        '复制指定版本的 Docker Compose 模板至独立临时目录，配置 x-fe-domain 及按需镜像 tag',
        '执行 docker compose config -q 校验模板语法'
      ],
      expected: '宿主机无端口/容器冲突，模板副本校验通过且未改动仓库源文件',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'D02',
      phase: '阶段一：部署与基础设施',
      title: '容器拉起与服务健康检查',
      steps: [
        '使用独立项目名执行 docker compose -p <project> up -d --wait',
        '检查 docker compose ps 全部容器处于 running / healthy 状态',
        '检查 fastgpt 与 fastgpt-aiproxy 启动日志及自动迁移无异常'
      ],
      expected: '所有依赖服务与主应用正常启动就绪，无启动报错或迁移失败',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'D03',
      phase: '阶段一：部署与基础设施',
      title: '数据库版本与持久化目录核验',
      steps: [
        '检查 MongoDB 版本及副本集主节点（PRIMARY）状态',
        '检查向量库（如 PG / Milvus / OceanBase / SeekDB / openGauss）版本、扩展与数据目录挂载',
        '确认 AIProxy 数据库表已初始化，Redis 与对象存储服务可达'
      ],
      expected: '各数据库版本与目标模板一致，持久化目录正确挂载且表/集合初始化完整',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U01',
      phase: '阶段二：登录激活与模型配置',
      title: '切换简体中文与 Root 首次登录',
      steps: [
        '打开部署入口 /login，先将界面语言切换为「简体中文」',
        '输入默认管理员账号 root 及初始密码（v4.17+ 默认为 123456）并提交登录'
      ],
      expected: '界面切换为简体中文，默认账号登录成功并触发激活流程或进入工作台',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U02',
      phase: '阶段二：登录激活与模型配置',
      title: '管理员首次激活改密',
      steps: [
        '在首次登录弹出的激活窗口中填写符合复杂度要求的新密码并确认',
        '验证激活完成后正常跳转至 FastGPT 主界面'
      ],
      expected: 'root 账号激活成功，新密码生效，工作台界面正常渲染',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U03',
      phase: '阶段二：登录激活与模型配置',
      title: '系统模型与内置 AIProxy 渠道配置',
      steps: [
        '保持模板内置 fastgpt-aiproxy 链路不变，进入「模型配置」',
        '添加至少 LLM 与 Embedding 模型（可用时一并添加 Rerank / TTS / STT）',
        '在「模型渠道」新增渠道接入上游模型服务（如 dev AIProxy），并在模型列表开启各模型「启用」开关'
      ],
      expected: '模型与渠道保存成功，目标模型均处于已启用状态，且报告与截图无密钥泄露',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U04',
      phase: '阶段二：登录激活与模型配置',
      title: '模型连通性测试、默认模型与调用日志验证',
      steps: [
        '在模型列表中逐一点击「测试」验证 LLM / Embedding / 其他已配模型连通性',
        '在「默认模型」配置默认 LLM、索引模型与重排模型（如有）',
        '进入 AIProxy「调用日志」查看测试调用记录'
      ],
      expected: '所有已启用模型测试通过，默认模型生效，AIProxy 调用日志记录 HTTP 200',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U05',
      phase: '阶段三：知识库与检索',
      title: '创建通用知识库',
      steps: [
        '进入「知识库」页面，点击新建「通用知识库」',
        '填写名称并绑定已配置的索引模型与文本理解模型后确认创建'
      ],
      expected: '通用知识库创建成功并进入知识库详情页',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U06',
      phase: '阶段三：知识库与检索',
      title: '文件上传、分段解析与索引就绪',
      steps: [
        '点击导入本地文件，上传含唯一测试标记的文本/Markdown 文件',
        '完成分段预览并提交导入，等待异步向量化完成'
      ],
      expected: '文件解析无报错，集合状态变为「已就绪」且存在有效分块数',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U07',
      phase: '阶段三：知识库与检索',
      title: '知识库搜索测试',
      steps: ['进入知识库「搜索测试」页签', '输入与测试文件唯一标记相关的查询词并发起检索'],
      expected: '成功召回包含唯一测试标记的目标分段，相关度分数正常展示',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U08',
      phase: '阶段四：应用编排与多渠道对话',
      title: '创建应用并关联知识库',
      steps: [
        '进入「工作台」，新建「对话 Agent」应用',
        '选择已验证的 LLM 模型并关联上述已就绪的知识库'
      ],
      expected: '应用创建成功，知识库与模型绑定显示正常',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U09',
      phase: '阶段四：应用编排与多渠道对话',
      title: '调试预览对话与引用校验',
      steps: [
        '在应用编排页右侧「调试预览」输入针对唯一标记的测试问题',
        '等待流式输出结束并检查回答内容与知识库引用条数'
      ],
      expected: '回复完整准确命中测试标记，并正常展示知识库引用来源',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U10',
      phase: '阶段四：应用编排与多渠道对话',
      title: '保存并发布应用',
      steps: ['点击应用编排页右上角「保存」按钮', '在弹出菜单中选择「保存并发布」完成版本发布'],
      expected: '应用发布成功且无报错提示，线上版本已更新',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U11',
      phase: '阶段四：应用编排与多渠道对话',
      title: '独立对话验证',
      steps: [
        '通过「立即对话 / 门户」打开独立对话页（/chat?appId=...）',
        '发送测试问题并等待回复完成'
      ],
      expected: '独立对话窗口收发正常，回复准确命中测试标记并带引用信息',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U12',
      phase: '阶段四：应用编排与多渠道对话',
      title: '发布渠道创建免登录分享链接',
      steps: [
        '进入应用「发布渠道 -> 免登录窗口」',
        '点击「创建新链接」，填写名称并保存生成公开分享链接'
      ],
      expected: '成功创建分享链接，链接域名与部署配置的 x-fe-domain 一致',
      actual: '',
      status: 'pending',
      screenshots: []
    },
    {
      id: 'U13',
      phase: '阶段四：应用编排与多渠道对话',
      title: '免登录分享链接匿名对话验证',
      steps: [
        '打开生成的公开分享链接（/chat/share?shareId=...），确认无需管理员登录即可进入对话页',
        '发送测试问题并校验匿名回复内容与知识库召回准确度'
      ],
      expected: '匿名访客可正常打开并完成对话，回答准确命中测试标记',
      actual: '',
      status: 'pending',
      screenshots: []
    }
  ];
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    const isFlagOnly = !next || next.startsWith('--');
    const value = isFlagOnly ? true : next;
    if (!isFlagOnly) i += 1;
    if (key in opts) {
      opts[key] = Array.isArray(opts[key]) ? [...opts[key], value] : [opts[key], value];
    } else {
      opts[key] = value;
    }
  }
  return { command, opts };
}

function toArray(val) {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function requireOpt(opts, key) {
  if (!opts[key] || opts[key] === true) {
    throw new Error(`缺少必填参数 --${key}`);
  }
  return String(opts[key]);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** 扫描文本字段防止误将上游 API Key 写入可分享报告。 */
function assertNoLeakedSecrets(node, trail = 'root') {
  if (typeof node === 'string') {
    if (node.startsWith('data:image/')) return;
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(node)) {
        throw new Error(`检测到疑似明文密钥位于 ${trail}，请脱敏后再渲染报告。`);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, idx) => assertNoLeakedSecrets(item, `${trail}[${idx}]`));
    return;
  }
  if (node && typeof node === 'object') {
    Object.entries(node).forEach(([k, v]) => assertNoLeakedSecrets(v, `${trail}.${k}`));
  }
}

function resolveScreenshot({ shot, baseDir, inlineImages }) {
  const srcRaw = String(shot.path ?? shot.src ?? '').trim();
  if (!srcRaw) {
    throw new Error('截图配置缺少 path / src 字段');
  }
  if (srcRaw.startsWith('data:image/')) {
    return { src: srcRaw, caption: shot.caption ?? shot.label ?? '' };
  }
  const absPath = path.isAbsolute(srcRaw) ? srcRaw : path.resolve(baseDir, srcRaw);
  if (!fs.existsSync(absPath)) {
    throw new Error(`截图文件不存在: ${absPath}`);
  }
  if (!inlineImages) {
    return {
      src: srcRaw,
      caption: shot.caption ?? shot.label ?? path.basename(absPath)
    };
  }
  const ext = path.extname(absPath).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? 'image/png';
  const b64 = fs.readFileSync(absPath).toString('base64');
  return {
    src: `data:${mime};base64,${b64}`,
    caption: shot.caption ?? shot.label ?? path.basename(absPath)
  };
}

function handleInit(opts) {
  const outPath = requireOpt(opts, 'out');
  const now = new Date().toISOString();
  const project = opts.project && opts.project !== true ? String(opts.project) : '';
  const workdir = opts.workdir && opts.workdir !== true ? String(opts.workdir) : '';
  const baseUrl = opts['base-url'] && opts['base-url'] !== true ? String(opts['base-url']) : '';

  const report = {
    schemaVersion: 1,
    title: opts.title && opts.title !== true ? String(opts.title) : 'FastGPT 发布部署验收报告',
    createdAt: now,
    updatedAt: now,
    meta: {
      template: opts.template && opts.template !== true ? String(opts.template) : '',
      version: opts.version && opts.version !== true ? String(opts.version) : '',
      region: opts.region && opts.region !== true ? String(opts.region) : '',
      vectorDb: opts['vector-db'] && opts['vector-db'] !== true ? String(opts['vector-db']) : '',
      host: opts.host && opts.host !== true ? String(opts.host) : '',
      project,
      workdir,
      baseUrl,
      modelSource:
        opts['model-source'] && opts['model-source'] !== true ? String(opts['model-source']) : '',
      browser: opts.browser && opts.browser !== true ? String(opts.browser) : 'EGO Lite · 简体中文',
      images: []
    },
    environment: {
      retentionStatus: 'running',
      baseUrl,
      rootAccount: 'root',
      rootPassword: '',
      shareUrl: '',
      cleanupCommand:
        project && workdir
          ? `docker compose -p ${project} -f ${workdir}/docker-compose.yml down -v --remove-orphans && rm -rf ${workdir}`
          : '',
      cleanupNote: '测试完成后保持环境运行，待用户验证确认后再执行清理。'
    },
    items: createDefaultChecklist()
  };

  writeJson(outPath, report);
  console.log(`已初始化验收清单: ${path.resolve(outPath)}（共 ${report.items.length} 项）`);
}

function handleUpdate(opts) {
  const inputPath = requireOpt(opts, 'input');
  const id = requireOpt(opts, 'id');
  const data = readJson(inputPath);
  const item = (data.items || []).find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`未找到验收项 ID: ${id}`);
  }

  if (opts.status && opts.status !== true) {
    const status = String(opts.status);
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`无效状态 "${status}"，允许值：${[...VALID_STATUSES].join(', ')}`);
    }
    item.status = status;
  }
  if (opts.actual !== undefined && opts.actual !== true) {
    item.actual = String(opts.actual);
  }
  if (opts.expected !== undefined && opts.expected !== true) {
    item.expected = String(opts.expected);
  }

  const shots = toArray(opts.screenshot);
  if (opts['replace-screenshots']) {
    item.screenshots = [];
  }
  if (shots.length) {
    item.screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];
    shots.forEach((raw) => {
      const [filePart, captionPart] = String(raw).split('::');
      item.screenshots.push({
        path: filePart.trim(),
        caption: captionPart ? captionPart.trim() : path.basename(filePart.trim())
      });
    });
  }

  data.updatedAt = new Date().toISOString();
  writeJson(inputPath, data);
  console.log(`已更新 ${id} -> status=${item.status}（截图 ${item.screenshots?.length || 0} 张）`);
}

function handleMeta(opts) {
  const inputPath = requireOpt(opts, 'input');
  const data = readJson(inputPath);
  data.meta = data.meta || {};
  data.environment = data.environment || {};

  const envKeys = new Set([
    'retentionStatus',
    'baseUrl',
    'rootAccount',
    'rootPassword',
    'shareUrl',
    'cleanupCommand',
    'cleanupNote'
  ]);

  toArray(opts.set).forEach((entry) => {
    const idx = String(entry).indexOf('=');
    if (idx <= 0) throw new Error(`--set 格式应为 key=value，收到: ${entry}`);
    const key = String(entry).slice(0, idx).trim();
    const val = String(entry)
      .slice(idx + 1)
      .trim();
    if (key === 'title') {
      data.title = val;
    } else if (envKeys.has(key)) {
      data.environment[key] = val;
      if (key === 'baseUrl') data.meta.baseUrl = val;
    } else {
      data.meta[key] = val;
    }
  });

  const images = toArray(opts.image);
  if (images.length) {
    data.meta.images = Array.isArray(data.meta.images) ? data.meta.images : [];
    images.forEach((img) => {
      const value = String(img).trim();
      if (value && !data.meta.images.includes(value)) data.meta.images.push(value);
    });
  }

  data.updatedAt = new Date().toISOString();
  writeJson(inputPath, data);
  console.log(`已更新报告元信息: ${path.resolve(inputPath)}`);
}

function handleRender(opts) {
  const inputPath = requireOpt(opts, 'input');
  const outPath = requireOpt(opts, 'out');
  const inlineImages = !opts['no-inline-images'];
  const baseDir = path.dirname(path.resolve(inputPath));
  const data = readJson(inputPath);

  assertNoLeakedSecrets(data);

  const rendered = structuredClone(data);
  rendered.updatedAt = new Date().toISOString();
  rendered.items = (rendered.items ?? []).map((item) => ({
    ...item,
    screenshots: (item.screenshots ?? []).map((shot) =>
      resolveScreenshot({ shot, baseDir, inlineImages })
    )
  }));

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const marker = '/*__REPORT_DATA__*/';
  if (!template.includes(marker)) {
    throw new Error(`模板缺少数据占位符 ${marker}: ${TEMPLATE_PATH}`);
  }
  // 防止 JSON 内出现 </script> 打断内联脚本标签
  const safeJson = JSON.stringify(rendered).replace(/<\/script/gi, '<\\/script');
  const html = template.replace(marker, () => safeJson);

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  const counts = rendered.items.reduce(
    (acc, it) => {
      acc[it.status] = (acc[it.status] || 0) + 1;
      return acc;
    },
    { passed: 0, failed: 0, blocked: 0, pending: 0, skipped: 0 }
  );
  console.log(
    `已渲染 HTML 报告: ${path.resolve(outPath)}（通过 ${counts.passed}/${rendered.items.length}，内联截图=${inlineImages}）`
  );
}

try {
  const { command, opts } = parseArgs(process.argv.slice(2));
  if (command === 'init') handleInit(opts);
  else if (command === 'update') handleUpdate(opts);
  else if (command === 'meta') handleMeta(opts);
  else if (command === 'render') handleRender(opts);
  else {
    console.error(
      '用法: node render-report.mjs <init|update|meta|render> [options]\n' +
        '示例:\n' +
        '  node render-report.mjs init --out /tmp/report.json --template ... --version ...\n' +
        '  node render-report.mjs update --input /tmp/report.json --id U04 --status passed --actual "..." --screenshot "/path/a.png::说明"\n' +
        '  node render-report.mjs meta --input /tmp/report.json --set "shareUrl=http://..."\n' +
        '  node render-report.mjs render --input /tmp/report.json --out /tmp/report.html'
    );
    process.exit(1);
  }
} catch (error) {
  console.error(`[release-deploy-test] ${error.message}`);
  process.exit(1);
}
