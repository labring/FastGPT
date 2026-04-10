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

const extensionToLang: Record<string, string[]> = {
  python: ['py'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  typescript: ['ts', 'tsx'],
  json: ['json', 'jsonc', 'json5'],
  markdown: ['md', 'markdown'],
  html: ['html', 'htm'],
  css: ['css'],
  scss: ['scss'],
  sass: ['sass'],
  less: ['less'],
  shell: ['sh', 'bash', 'zsh', 'fish'],
  yaml: ['yml', 'yaml'],
  xml: ['xml'],
  sql: ['sql'],
  go: ['go'],
  rust: ['rs'],
  java: ['java'],
  c: ['c', 'h'],
  cpp: ['cpp', 'cc', 'cxx', 'hpp', 'hxx'],
  csharp: ['cs'],
  php: ['php'],
  ruby: ['rb'],
  swift: ['swift'],
  kotlin: ['kt'],
  scala: ['scala'],
  lua: ['lua'],
  r: ['r'],
  toml: ['toml'],
  ini: ['ini'],
  plaintext: ['conf', 'config', 'txt', 'log'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'],
  svg: ['svg'],
  pdf: ['pdf'],
  audio: ['mp3', 'wav', 'm4a', 'flac', 'ogg'],
  video: ['avi', 'mp4', 'webm', 'mov', 'm4v']
};

const langMap = Object.entries(extensionToLang).reduce(
  (acc, [lang, extensions]) => {
    extensions.forEach((ext) => {
      acc[ext] = lang;
    });
    return acc;
  },
  {} as Record<string, string>
);

// 获取文件语言
export const getLanguageByFileName = (fileName: string): string => {
  const ext = fileName.split('.').at(-1)?.toLowerCase();
  return langMap[ext || ''] ?? 'plaintext';
};

/**
 * 判断语言是否属于二进制
 */
export const getIsBinaryByLanguage = (language: string) => {
  return ['image', 'audio', 'video'].includes(language);
};

/**
 * 支持源码/预览切换的语言列表
 */
const previewableLanguages = ['markdown', 'svg'];

export const getSupportsPreviewToggle = (language?: string) => {
  return !!language && previewableLanguages.includes(language);
};

// Update tree node
export const updateTreeNode = <
  T extends {
    type: 'file' | 'directory';
    name: string;
    path: string;
    children?: T[];
    loaded?: boolean;
  }
>(
  tree: T[],
  targetPath: string,
  children: T[],
  loaded: boolean = false
): T[] => {
  return tree.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children, loaded } as T;
    }
    if (node.children) {
      return { ...node, children: updateTreeNode(node.children, targetPath, children, loaded) };
    }
    return node;
  });
};

// Filter tree
export const filterTree = <
  T extends { type: 'file' | 'directory'; name: string; path: string; children?: T[] }
>(
  nodes: T[],
  query: string
): T[] => {
  if (!query) return nodes;

  return nodes
    .map((node) => {
      if (node.type === 'file' && node.name.toLowerCase().includes(query.toLowerCase())) {
        return node;
      }
      if (node.children) {
        const filteredChildren = filterTree(node.children, query);
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren } as T;
        }
      }
      return null;
    })
    .filter((node): node is T => node !== null);
};
