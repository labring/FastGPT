import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Center, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SkillDetailContext } from '../../dashboard/skill/detail/context';
import { useContextSelector } from 'use-context-selector';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type Editor from '@monaco-editor/react';
import {
  listSandboxFiles,
  writeSandboxFile,
  downloadSandbox,
  getSandboxFile,
  fileOpSandbox
} from './api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useMount, useLatest } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

import FileTree, { type TreeNode } from './components/FileTree';
import FileTabs, { type OpenedFile } from './components/FileTabs';
import EditorContent from './components/EditorContent';
import {
  getLanguageByFileName,
  updateTreeNode,
  filterTree,
  getIsBinaryByLanguage,
  deleteTreeNode,
  addTreeNode,
  moveTreeNodeInTree,
  renameTreeNodeInTree,
  findNodeByPath,
  sortTreeNodes
} from './utils';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

export type Props = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  showFileOps?: boolean;
  showDownload?: boolean;
};

const SandboxEditor = ({
  appId,
  chatId,
  outLinkAuthData,
  showFileOps = true,
  showDownload = true
}: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const saveAllRef = useContextSelector(SkillDetailContext, (v) => v.saveAllRef);
  const editorRef = useRef<EditorInstance>();
  const isUpdatingRef = useRef(false); // 防止循环更新

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // 多标签页状态与选中节点路径状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string>('');

  // 激活文件变更时，自动同步选中态
  useEffect(() => {
    if (activeFilePath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPath(activeFilePath);
    }
  }, [activeFilePath]);

  const activeFile = useMemoEnhance(() => {
    return openedFiles.find((f) => f.path === activeFilePath);
  }, [openedFiles, activeFilePath]);

  const openedFilesRef = useLatest(openedFiles);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    const filesRef = openedFilesRef;
    return () => {
      filesRef.current?.forEach((file) => {
        if (file.isBinary && file.content.startsWith('blob:')) {
          URL.revokeObjectURL(file.content);
        }
      });
    };
  }, [openedFilesRef]);

  const EXCLUDE_NAMES = ['node_modules', '.git', '.next', 'dist', 'build', '.bun'];

  // 加载目录 - 改为普通异步函数,避免 useRequest 的并发问题
  const { runAsync: loadDirectory } = useRequest(
    async (path: string, level: number) => {
      const data = await listSandboxFiles({ appId, chatId, outLinkAuthData, path });
      const filteredFiles = (data.files || []).filter((file) => !EXCLUDE_NAMES.includes(file.name));
      const nodes: TreeNode[] = filteredFiles.map((file) => ({
        ...file,
        level,
        children: file.type === 'directory' ? [] : undefined,
        loaded: false // 子目录初始未加载
      }));

      const sortedNodes = sortTreeNodes(nodes);

      setFileTree((prevTree) => {
        if (level === 0) {
          return sortedNodes;
        }
        // 更新目标节点,标记为已加载
        return updateTreeNode(prevTree, path, sortedNodes, true);
      });

      return sortedNodes;
    },
    { manual: true }
  );

  // 递归并发加载全部目录和文件，排除依赖并收集需要展开的路径
  const loadDirectoryRecursive = async (
    path: string,
    level: number,
    expandedPaths: string[]
  ): Promise<TreeNode[]> => {
    try {
      const data = await listSandboxFiles({ appId, chatId, outLinkAuthData, path });
      const filteredFiles = (data.files || []).filter((file) => !EXCLUDE_NAMES.includes(file.name));

      const nodes: TreeNode[] = await Promise.all(
        filteredFiles.map(async (file) => {
          if (file.type === 'directory') {
            expandedPaths.push(file.path);
            try {
              const children = await loadDirectoryRecursive(file.path, level + 1, expandedPaths);
              return {
                ...file,
                level,
                children: sortTreeNodes(children),
                loaded: true
              };
            } catch (err) {
              console.error(`Failed to load subdirectory ${file.path}:`, err);
              return {
                ...file,
                level,
                children: [],
                loaded: true
              };
            }
          } else {
            return {
              ...file,
              level
            };
          }
        })
      );

      return sortTreeNodes(nodes);
    } catch (error) {
      console.error(`Failed to load directory ${path}:`, error);
      return [];
    }
  };

  // 初始加载根目录的 loading 状态
  const [loadingRoot, setLoadingRoot] = useState(false);

  // 读取文件内容 - 根据 language 决定解码策略
  // - 媒体（image/audio/video）→ blob URL
  // - 其他 → 严格 UTF-8 解码；解不出来视为不可预览（如 xlsx/zip 等真二进制）
  const { runAsync: loadFile, loading: loadingFile } = useRequest(
    async (
      filePath: string,
      language: string
    ): Promise<{ content: string; isUnknown: boolean }> => {
      const response = await getSandboxFile({ appId, chatId, outLinkAuthData, path: filePath });

      const isBinary = getIsBinaryByLanguage(language);

      if (isBinary) {
        const blob = await response.blob();
        return { content: URL.createObjectURL(blob), isUnknown: false };
      }

      const buffer = await response.arrayBuffer();
      try {
        const content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        return { content, isUnknown: false };
      } catch {
        return { content: '', isUnknown: true };
      }
    },
    { manual: true }
  );

  // 保存文件
  const { run: saveFile, loading: saving } = useRequest(
    async (filePath?: string) => {
      const targetPath = filePath || activeFilePath;
      if (!targetPath) return;

      const targetFile = openedFiles.find((f) => f.path === targetPath);
      if (!targetFile || targetFile.isBinary || targetFile.isUnknown) return;

      await writeSandboxFile({
        appId,
        chatId,
        outLinkAuthData,
        path: targetPath,
        content: targetFile.content
      });

      // 标记为已保存
      setOpenedFiles((prev) =>
        prev.map((f) => (f.path === targetPath ? { ...f, isDirty: false } : f))
      );
    },
    { manual: true }
  );

  // 批量全部保存方法
  const saveAllFiles = useCallback(async () => {
    const dirtyFiles =
      openedFilesRef.current?.filter((f) => f.isDirty && !f.isBinary && !f.isUnknown) || [];
    if (dirtyFiles.length === 0) return;

    await Promise.all(
      dirtyFiles.map(async (f) => {
        await writeSandboxFile({
          appId,
          chatId,
          outLinkAuthData,
          path: f.path,
          content: f.content
        });
      })
    );

    setOpenedFiles((prev) =>
      prev.map((f) => (dirtyFiles.some((df) => df.path === f.path) ? { ...f, isDirty: false } : f))
    );
  }, [appId, chatId, outLinkAuthData, openedFilesRef]);

  // 绑定全部保存方法到 Context 引用上
  useEffect(() => {
    const currentSaveAllRef = saveAllRef;
    if (currentSaveAllRef) {
      currentSaveAllRef.current = saveAllFiles;
    }
    return () => {
      if (currentSaveAllRef) {
        currentSaveAllRef.current = undefined;
      }
    };
  }, [saveAllFiles, saveAllRef]);

  // 1.5 秒防抖自动保存脏文件
  useEffect(() => {
    const dirtyFiles = openedFiles.filter((f) => f.isDirty && !f.isBinary && !f.isUnknown);
    if (dirtyFiles.length === 0) return;

    const timer = setTimeout(() => {
      dirtyFiles.forEach((f) => {
        saveFile(f.path);
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [openedFiles, saveFile]);

  // 切换活动文件时，若前一文件为 dirty 状态则立刻保存
  const prevActiveFilePathRef = useRef<string>(activeFilePath);
  useEffect(() => {
    const prevPath = prevActiveFilePathRef.current;
    prevActiveFilePathRef.current = activeFilePath;

    if (prevPath && prevPath !== activeFilePath) {
      const prevFile = openedFilesRef.current?.find((f) => f.path === prevPath);
      if (prevFile?.isDirty) {
        saveFile(prevPath);
      }
    }
  }, [activeFilePath, saveFile, openedFilesRef]);

  // 下载当前文件
  const { run: downloadCurrentFile, loading: downloadingFile } = useRequest(
    async () => {
      if (!activeFile) return;

      // 通过服务端下载接口获取原始文件,支持二进制文件(图片等)
      await downloadSandbox({ appId, chatId, outLinkAuthData, path: activeFile.path });
    },
    { manual: true }
  );

  // 打开文件
  const openFile = async (filePath: string) => {
    // 检查是否已打开
    const existingFile = openedFiles.find((f) => f.path === filePath);

    if (existingFile) {
      // 已打开,直接切换
      setActiveFilePath(filePath);
      setSelectedPath(filePath);
      return;
    }

    // 新打开文件
    try {
      const fileName = filePath.split('/').pop() || '';
      const language = getLanguageByFileName(fileName);
      const isBinary = getIsBinaryByLanguage(language);

      const { content, isUnknown } = await loadFile(filePath, language);

      const newFile: OpenedFile = {
        path: filePath,
        name: fileName,
        content,
        language,
        isBinary,
        isDirty: false,
        isUnknown
      };

      setOpenedFiles((prev) => [...prev, newFile]);
      setActiveFilePath(filePath);
      setSelectedPath(filePath);
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  // 关闭文件
  const closeFile = (filePath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // 如果关闭的是当前文件,切换到其他文件
    setOpenedFiles((prev) => {
      const target = prev.find((f) => f.path === filePath);
      if (target?.isBinary && target.content.startsWith('blob:')) {
        URL.revokeObjectURL(target.content);
      }

      const newOpenedFiles = prev.filter((f) => f.path !== filePath);

      if (activeFilePath === filePath) {
        if (newOpenedFiles.length > 0) {
          setActiveFilePath(newOpenedFiles[newOpenedFiles.length - 1].path);
        } else {
          setActiveFilePath('');
        }
      }

      return newOpenedFiles;
    });
  };

  // 新建文件/目录
  const handleCreateNode = async (parentPath: string, name: string, type: 'file' | 'directory') => {
    const fullPath = parentPath === '.' ? name : `${parentPath}/${name}`;

    const conflictNode = findNodeByPath(fileTree, fullPath);
    if (conflictNode) {
      toast({
        title: t('chat:sandbox_create_failed'),
        description: t('chat:sandbox_file_already_exists'),
        status: 'warning'
      });
      return;
    }
    if (type === 'file') {
      await writeSandboxFile({
        appId,
        chatId,
        outLinkAuthData,
        path: fullPath,
        content: ''
      });
      await openFile(fullPath);
    } else {
      await fileOpSandbox({
        appId,
        chatId,
        outLinkAuthData,
        type: 'mkdir',
        path: fullPath
      });
    }

    let targetLevel = 0;
    if (parentPath !== '.') {
      const parentNode = findNodeByPath(fileTree, parentPath);
      if (parentNode) {
        targetLevel = parentNode.level + 1;
      } else {
        targetLevel = parentPath.split('/').length;
      }
    }

    const newNode: TreeNode = {
      name,
      path: fullPath,
      type,
      level: targetLevel,
      children: type === 'directory' ? [] : undefined,
      loaded: type === 'directory' ? true : undefined
    };
    setFileTree((prevTree) => addTreeNode(prevTree, parentPath, newNode));
  };

  // 重命名完成
  const handleRenameComplete = async (oldPath: string, newName: string) => {
    const parts = oldPath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    if (oldPath === newPath) return;

    const conflictNode = findNodeByPath(fileTree, newPath);
    if (conflictNode) {
      toast({
        title: t('chat:sandbox_rename_failed'),
        description: t('chat:sandbox_file_already_exists'),
        status: 'warning'
      });
      return;
    }

    await fileOpSandbox({
      appId,
      chatId,
      outLinkAuthData,
      type: 'move',
      path: oldPath,
      destPath: newPath
    });

    setOpenedFiles((prev) =>
      prev.map((f) => {
        if (f.path === oldPath) {
          return { ...f, path: newPath, name: newName };
        }
        if (f.path.startsWith(oldPath + '/')) {
          return { ...f, path: f.path.replace(oldPath, newPath) };
        }
        return f;
      })
    );

    if (activeFilePath === oldPath) {
      setActiveFilePath(newPath);
    } else if (activeFilePath.startsWith(oldPath + '/')) {
      setActiveFilePath(activeFilePath.replace(oldPath, newPath));
    }

    if (selectedPath === oldPath) {
      setSelectedPath(newPath);
    } else if (selectedPath.startsWith(oldPath + '/')) {
      setSelectedPath(selectedPath.replace(oldPath, newPath));
    }

    setFileTree((prevTree) => renameTreeNodeInTree(prevTree, oldPath, newPath, newName));
  };

  // 移动文件/目录（拖拽移动）
  const handleMoveFile = async (srcPath: string, targetDirPath: string) => {
    const parts = srcPath.split('/');
    const fileName = parts.pop() || '';
    const destPath = targetDirPath === '.' ? fileName : `${targetDirPath}/${fileName}`;

    if (srcPath === destPath) return;

    await fileOpSandbox({
      appId,
      chatId,
      outLinkAuthData,
      type: 'move',
      path: srcPath,
      destPath
    });

    setOpenedFiles((prev) =>
      prev.map((f) => {
        if (f.path === srcPath) {
          return { ...f, path: destPath, name: fileName };
        }
        if (f.path.startsWith(srcPath + '/')) {
          return { ...f, path: f.path.replace(srcPath, destPath) };
        }
        return f;
      })
    );

    if (activeFilePath === srcPath) {
      setActiveFilePath(destPath);
    } else if (activeFilePath.startsWith(srcPath + '/')) {
      setActiveFilePath(activeFilePath.replace(srcPath, destPath));
    }

    if (selectedPath === srcPath) {
      setSelectedPath(destPath);
    } else if (selectedPath.startsWith(srcPath + '/')) {
      setSelectedPath(selectedPath.replace(srcPath, destPath));
    }

    setFileTree((prevTree) => moveTreeNodeInTree(prevTree, srcPath, targetDirPath));
  };

  // 删除文件/目录
  const handleDeleteFile = async (filePath: string) => {
    await fileOpSandbox({
      appId,
      chatId,
      outLinkAuthData,
      type: 'delete',
      path: filePath
    });

    setOpenedFiles((prev) =>
      prev.filter((f) => f.path !== filePath && !f.path.startsWith(filePath + '/'))
    );

    if (activeFilePath === filePath || activeFilePath.startsWith(filePath + '/')) {
      setActiveFilePath('');
    }

    setFileTree((prevTree) => deleteTreeNode(prevTree, filePath));
  };

  // 上传文件
  const handleUploadFiles = async (files: FileList, targetDirPath: string) => {
    let targetLevel = 0;
    if (targetDirPath !== '.') {
      const parentNode = findNodeByPath(fileTree, targetDirPath);
      if (parentNode) {
        targetLevel = parentNode.level + 1;
      } else {
        targetLevel = targetDirPath.split('/').length;
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });
      const path = targetDirPath === '.' ? file.name : `${targetDirPath}/${file.name}`;
      await writeSandboxFile({
        appId,
        chatId,
        outLinkAuthData,
        path,
        content: text
      });

      const newNode: TreeNode = {
        name: file.name,
        path,
        type: 'file',
        level: targetLevel
      };
      setFileTree((prevTree) => addTreeNode(prevTree, targetDirPath, newNode));
    }
  };

  const refreshWorkspace = async () => {
    setLoadingRoot(true);
    try {
      const expandedPaths: string[] = [];
      const rootNodes = await loadDirectoryRecursive('.', 0, expandedPaths);
      setFileTree(rootNodes);
      setExpandedDirs(new Set(expandedPaths));
    } catch (error) {
      console.error('Failed to refresh workspace:', error);
    } finally {
      setLoadingRoot(false);
    }
  };

  // 初始化加载根目录
  useMount(() => {
    refreshWorkspace();
  });

  // 当切换 tab 时,更新编辑器内容
  useEffect(() => {
    if (!editorRef.current || !activeFilePath || !activeFile) return;
    if (activeFile.isBinary || activeFile.isUnknown) return;

    // 使用 ref 标记防止循环更新
    isUpdatingRef.current = true;
    editorRef.current.setValue(activeFile.content);

    // 延迟重置标记,确保 setValue 完成
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  }, [activeFilePath, activeFile]);

  // 切换目录展开/折叠
  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;

    setSelectedPath(node.path);

    const isExpanded = expandedDirs.has(node.path);

    if (isExpanded) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(node.path);
        return next;
      });
    } else {
      // 如果未加载过,则加载
      if (!node.loaded) {
        // 添加 loading 状态
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);

          return next;
        });

        // 使用 Promise 确保 finally 一定执行
        loadDirectory(node.path, node.level + 1)
          .then(() => {
            // 加载成功,展开目录
            setExpandedDirs((prev) => {
              const next = new Set(prev);
              next.add(node.path);
              return next;
            });
          })
          .catch((error) => {
            console.error('Failed to load directory:', error);
          })
          .finally(() => {
            // 无论成功失败,都要移除 loading 状态
            setLoadingDirs((prev) => {
              const next = new Set(prev);
              next.delete(node.path);

              return next;
            });
          });
      } else {
        // 已加载,直接展开
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          next.add(node.path);
          return next;
        });
      }
    }
  };

  const filteredTree = filterTree(fileTree, searchQuery);

  const renderContent = () => {
    if (fileTree.length === 0) {
      if (loadingRoot) return null;

      return (
        <Center h="full" w={'full'}>
          <VStack spacing={3}>
            <EmptyTip text={t('chat:sandbox_no_file')} mt={0} />
          </VStack>
        </Center>
      );
    }

    return (
      <>
        <FileTree
          filteredTree={filteredTree}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          expandedDirs={expandedDirs}
          loadingDirs={loadingDirs}
          activeFilePath={activeFilePath}
          selectedPath={selectedPath}
          setSelectedPath={setSelectedPath}
          openFile={openFile}
          toggleDirectory={toggleDirectory}
          onCreateNode={handleCreateNode}
          onRenameComplete={handleRenameComplete}
          onMoveFile={handleMoveFile}
          onDeleteFile={handleDeleteFile}
          onUploadFiles={handleUploadFiles}
          setExpandedDirs={setExpandedDirs}
          appId={appId}
          chatId={chatId}
          outLinkAuthData={outLinkAuthData}
          showFileOps={showFileOps}
        />

        {/* 右侧: 编辑器区域 */}
        <MyBox
          isLoading={loadingFile}
          loadingVariant="particle"
          display={'flex'}
          flex={1}
          w={0}
          minH={0}
          flexDirection="column"
          bg="myGray.25"
        >
          {openedFiles.length > 0 ? (
            <>
              <FileTabs
                openedFiles={openedFiles}
                activeFilePath={activeFilePath}
                setActiveFilePath={setActiveFilePath}
                closeFile={closeFile}
              />
              <EditorContent
                activeFile={activeFile}
                activeFilePath={activeFilePath}
                saving={saving}
                downloadingFile={downloadingFile}
                downloadCurrentFile={downloadCurrentFile}
                saveFile={saveFile}
                setOpenedFiles={setOpenedFiles}
                openedFiles={openedFiles}
                editorRef={editorRef}
                isUpdatingRef={isUpdatingRef}
                appId={appId}
                chatId={chatId}
                outLinkAuthData={outLinkAuthData}
                showDownload={showDownload}
              />
            </>
          ) : (
            filteredTree.length > 0 && (
              <Center h="full">
                <VStack spacing={3}>
                  <EmptyTip text={t('chat:sandbox_select_file_edit')} mt={0} />
                </VStack>
              </Center>
            )
          )}
        </MyBox>
      </>
    );
  };

  return (
    <MyBox
      isLoading={loadingRoot && fileTree.length === 0}
      loadingVariant="particle"
      display={'flex'}
      h="full"
      w="full"
      bg="myGray.25"
    >
      {renderContent()}
    </MyBox>
  );
};

export default SandboxEditor;
