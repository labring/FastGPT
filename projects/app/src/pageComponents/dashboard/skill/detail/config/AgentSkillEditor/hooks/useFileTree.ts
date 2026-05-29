import { useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useMount } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { listSkillPackageFiles } from '../api';
import { updateTreeNode, filterTree } from '../utils';
import type { TreeNode } from '../components/FileTree';
import type { PackageFileItem } from '@fastgpt/global/openapi/core/agentSkills/package/api';

type UseFileTreeParams = {
  skillId: string;
};

function itemsToTreeNodes(items: PackageFileItem[], level: number): TreeNode[] {
  return items.map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    size: item.size,
    level,
    // 只有后端实际返回了 children 字段才标记为已加载，否则保留懒加载能力
    loaded: item.type === 'directory' && item.children !== undefined,
    children: item.children
      ? itemsToTreeNodes(item.children, level + 1)
      : item.type === 'directory'
        ? []
        : undefined
  }));
}

export const useFileTree = ({ skillId }: UseFileTreeParams) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const { runAsync: loadDirectory } = useRequest(
    async (path: string, level: number) => {
      const data = await listSkillPackageFiles({ skillId, path });
      const nodes = itemsToTreeNodes(data.files || [], level);

      setFileTree((prevTree) => {
        if (level === 0) return nodes;
        return updateTreeNode(prevTree, path, nodes, true);
      });
      return nodes;
    },
    { manual: true }
  );

  const [loadingRoot, setLoadingRoot] = useState(false);

  const reloadRoot = useCallback(async () => {
    setLoadingRoot(true);
    try {
      setExpandedDirs(new Set());
      const data = await listSkillPackageFiles({ skillId, path: '.', recursive: true });
      setFileTree(itemsToTreeNodes(data.files || [], 0));
    } finally {
      setLoadingRoot(false);
    }
  }, [skillId]);

  useMount(() => {
    reloadRoot();
  });

  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;
    const isExpanded = expandedDirs.has(node.path);
    if (isExpanded) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
      return;
    }
    if (!node.loaded) {
      setLoadingDirs((prev) => new Set(prev).add(node.path));
      loadDirectory(node.path, node.level + 1)
        .then(() => {
          setExpandedDirs((prev) => new Set(prev).add(node.path));
        })
        .catch((err) =>
          toast({
            status: 'error',
            title: t('skill:editor_load_dir_failed'),
            description: getErrText(err)
          })
        )
        .finally(() => {
          setLoadingDirs((prev) => {
            const next = new Set(prev);
            next.delete(node.path);
            return next;
          });
        });
    } else {
      setExpandedDirs((prev) => new Set(prev).add(node.path));
    }
  };

  const refreshDir = useCallback(
    async (dirPath: string) => {
      if (!dirPath) {
        await reloadRoot();
        return;
      }
      try {
        await loadDirectory(dirPath, dirPath.split('/').length);
      } catch (err) {
        toast({
          status: 'error',
          title: t('skill:editor_load_dir_failed'),
          description: getErrText(err)
        });
      }
    },
    [loadDirectory, reloadRoot, t, toast]
  );

  const filteredTree = useMemoEnhance(
    () => filterTree(fileTree, searchQuery),
    [fileTree, searchQuery]
  );

  return {
    fileTree,
    expandedDirs,
    loadingDirs,
    searchQuery,
    setSearchQuery,
    loadDirectory,
    reloadRoot,
    toggleDirectory,
    refreshDir,
    filteredTree,
    loadingRoot
  };
};
