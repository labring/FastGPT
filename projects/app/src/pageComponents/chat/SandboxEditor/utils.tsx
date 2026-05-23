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
  if (['md', 'markdown'].includes(ext || '')) return 'core/app/sandbox/markdownLine';
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
  return 'core/app/sandbox/fileGenericLine';
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
  // 仅保留浏览器 <video> 原生可解码的容器；avi/mkv/wmv/flv/mov/m4v 等走兜底
  video: ['mp4', 'webm']
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

/**
 * 递归在树中查找指定路径的节点
 */
export const findNodeByPath = <T extends { path: string; children?: T[] }>(
  tree: T[],
  path: string
): T | null => {
  for (const node of tree) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
};

/**
 * 递归删除树中的节点
 */
export const deleteTreeNode = <T extends { path: string; children?: T[] }>(
  tree: T[],
  targetPath: string
): T[] => {
  return tree
    .filter((node) => node.path !== targetPath)
    .map((node) => {
      if (node.children) {
        return { ...node, children: deleteTreeNode(node.children, targetPath) };
      }
      return node;
    });
};

/**
 * 递归向树中指定 parentPath 添加节点，并维持文件夹优先+字母序自然排序
 */
export const sortTreeNodes = <T extends { type: 'file' | 'directory'; name: string }>(
  nodes: T[]
): T[] => {
  return [...nodes].sort((a, b) => {
    // 文件夹排在文件前面
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    // 相同类型，按自然字典序排列
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
};

export const addTreeNode = <
  T extends {
    type: 'file' | 'directory';
    name: string;
    path: string;
    level: number;
    children?: T[];
    loaded?: boolean;
  }
>(
  tree: T[],
  parentPath: string,
  newNode: T
): T[] => {
  if (parentPath === '.') {
    // 检查是否已存在同名节点，若存在则不重复添加，只覆盖
    const exists = tree.some((node) => node.path === newNode.path);
    const newTree = exists
      ? tree.map((node) => (node.path === newNode.path ? newNode : node))
      : [...tree, newNode];
    return sortTreeNodes(newTree);
  }

  return tree.map((node) => {
    if (node.path === parentPath) {
      // 只有在已加载的情况下，才往 children 里塞节点，否则让它保持空，等用户展开时自动加载
      if (node.loaded) {
        const children = node.children || [];
        const exists = children.some((c) => c.path === newNode.path);
        const newChildren = exists
          ? children.map((c) => (c.path === newNode.path ? newNode : c))
          : [...children, newNode];
        return { ...node, children: sortTreeNodes(newChildren) } as T;
      }
      return node;
    }
    if (node.children) {
      return { ...node, children: addTreeNode(node.children, parentPath, newNode) };
    }
    return node;
  });
};

/**
 * 递归更新树节点路径（重命名、移动等）
 * 它需要处理被修改节点本身，以及该节点下所有子孙节点的 path 属性递归更新
 */
export const updateDescendantsPath = <T extends { path: string; children?: T[]; level: number }>(
  node: T,
  oldPath: string,
  newPath: string,
  levelDiff: number
): T => {
  const nextPath = node.path.startsWith(oldPath + '/')
    ? newPath + node.path.substring(oldPath.length)
    : node.path === oldPath
      ? newPath
      : node.path;

  const nextLevel = node.level + levelDiff;

  if (node.children) {
    return {
      ...node,
      path: nextPath,
      level: nextLevel,
      children: node.children.map((child) =>
        updateDescendantsPath(child, oldPath, newPath, levelDiff)
      )
    };
  }
  return { ...node, path: nextPath, level: nextLevel };
};

/**
 * 移动树节点
 */
export const moveTreeNodeInTree = <
  T extends {
    type: 'file' | 'directory';
    name: string;
    path: string;
    level: number;
    children?: T[];
    loaded?: boolean;
  }
>(
  tree: T[],
  srcPath: string,
  destDirPath: string
): T[] => {
  // 1. 找到源节点
  const srcNode = findNodeByPath(tree, srcPath);
  if (!srcNode) return tree;

  // 2. 动态搜索目标节点以提取绝对准确的真实层级 level，确保缩进完美对齐
  let targetLevel = 0;
  if (destDirPath !== '.') {
    const destNode = findNodeByPath(tree, destDirPath);
    if (destNode) {
      targetLevel = destNode.level + 1;
    } else {
      // 降级兜底方案，如果没展开或找不到，再根据物理路径算真实深度
      targetLevel = destDirPath.split('/').length;
    }
  }

  // 3. 从原位置删除
  const cleanTree = deleteTreeNode(tree, srcPath);

  // 4. 计算新节点的路径和 level
  const lastSlash = srcPath.lastIndexOf('/');
  const srcName = srcPath.substring(lastSlash + 1);
  const newPath = destDirPath === '.' ? srcName : `${destDirPath}/${srcName}`;
  const levelDiff = targetLevel - srcNode.level;

  // 递归更新源节点及所有子孙节点的路径和层级
  const updatedSrcNode = updateDescendantsPath(srcNode, srcPath, newPath, levelDiff);

  // 5. 添加到新位置
  return addTreeNode(cleanTree, destDirPath, updatedSrcNode);
};

/**
 * 重命名树节点
 */
export const renameTreeNodeInTree = <
  T extends {
    type: 'file' | 'directory';
    name: string;
    path: string;
    level: number;
    children?: T[];
    loaded?: boolean;
  }
>(
  tree: T[],
  oldPath: string,
  newPath: string,
  newName: string
): T[] => {
  const newTree = tree.map((node) => {
    if (node.path === oldPath) {
      // 递归更新子孙节点的路径
      return updateDescendantsPath({ ...node, name: newName }, oldPath, newPath, 0) as T;
    }
    if (node.children) {
      return { ...node, children: renameTreeNodeInTree(node.children, oldPath, newPath, newName) };
    }
    return node;
  });

  const containsNewNode = newTree.some((node) => node.path === newPath);
  if (containsNewNode) {
    return sortTreeNodes(newTree);
  }
  return newTree;
};

/**
 * 解析 Markdown 文件头部的 YAML frontmatter
 */
export const parseMarkdownFrontmatter = (
  content: string
): {
  metadata: Record<string, any>;
  bodyContent: string;
  hasMetadata: boolean;
} => {
  const frontmatterRegex = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      metadata: {},
      bodyContent: content,
      hasMetadata: false
    };
  }

  const yamlContent = match[1];
  const bodyContent = match[2] ?? '';

  const result: Record<string, any> = {};
  const lines = yamlContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    let cleanedValue: any = value;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      cleanedValue = value.slice(1, -1);
    } else if (value === 'true') {
      cleanedValue = true;
    } else if (value === 'false') {
      cleanedValue = false;
    } else if (value === 'null') {
      cleanedValue = null;
    } else if (!isNaN(Number(value)) && value !== '') {
      cleanedValue = Number(value);
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1).trim();
      cleanedValue = arrayContent
        ? arrayContent.split(',').map((item) => item.trim().replace(/["']/g, ''))
        : [];
    }

    result[key] = cleanedValue;
  }

  return {
    metadata: result,
    bodyContent,
    hasMetadata: Object.keys(result).length > 0
  };
};
