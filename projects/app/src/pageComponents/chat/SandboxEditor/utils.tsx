import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';

// Get icon by filename
export const getIconByFilename = (filename: string): IconNameType => {
  const ext = filename.split('.').pop()?.toLowerCase();

  // 编程语言
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext || '')) return 'core/app/sandbox/js';
  if (['py', 'pyc', 'pyw', 'pyo'].includes(ext || '')) return 'core/app/sandbox/py';
  if (['java', 'class', 'jar'].includes(ext || '')) return 'core/app/sandbox/java';
  if (ext === 'go') return 'core/app/sandbox/go';

  // 文档类型
  if (['doc', 'docx'].includes(ext || '')) return 'core/app/sandbox/docx';
  if (['ppt', 'pptx'].includes(ext || '')) return 'core/app/sandbox/pptx';
  if (['xls', 'xlsx'].includes(ext || '')) return 'core/app/sandbox/xlsx';
  if (ext === 'pdf') return 'core/app/sandbox/pdf';

  // 标记和文本类型
  if (['md', 'markdown'].includes(ext || '')) return 'core/app/sandbox/md';
  if (['html', 'htm'].includes(ext || '')) return 'core/app/sandbox/html';
  if (['txt', 'log', 'text'].includes(ext || '')) return 'core/app/sandbox/txt';

  // 配置文件
  if (['yaml', 'yml'].includes(ext || '')) return 'core/app/sandbox/yml';

  // 样式文件
  if (ext === 'css') return 'core/app/sandbox/css';
  if (['scss', 'sass'].includes(ext || '')) return 'core/app/sandbox/scss';

  // 图片类型
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico'].includes(ext || ''))
    return 'core/app/sandbox/image';
  if (ext === 'svg') return 'core/app/sandbox/svg';

  // 视频类型
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext || ''))
    return 'core/app/sandbox/video';

  // 压缩文件
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext || ''))
    return 'core/app/sandbox/zip';

  // 默认文件图标
  return 'core/app/sandbox/default';
};

// 获取文件语言
export const getLanguageByExtension = (ext?: string): string => {
  const langMap: Record<string, string> = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    json: 'json',
    jsonc: 'json',
    json5: 'json',
    md: 'markdown',
    markdown: 'markdown',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    hxx: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    lua: 'lua',
    r: 'r',
    toml: 'toml',
    ini: 'ini',
    conf: 'plaintext',
    config: 'plaintext'
  };
  return langMap[ext?.toLowerCase() || ''] || 'plaintext';
};
