import React, { useEffect, useState, useRef } from 'react';
import { Center, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type Editor from '@monaco-editor/react';
import { listSandboxFiles, writeSandboxFile, downloadSandbox, getSandboxFile } from './api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useMount } from 'ahooks';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

import FileTree, { type TreeNode } from './components/FileTree';
import FileTabs, { type OpenedFile } from './components/FileTabs';
import EditorContent from './components/EditorContent';
import { getLanguageByFileName, updateTreeNode, filterTree, getIsBinaryByLanguage } from './utils';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

export type Props = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
};

const SandboxEditor = ({ appId, chatId, outLinkAuthData }: Props) => {
  const { t } = useTranslation();
  const editorRef = useRef<EditorInstance>();
  const isUpdatingRef = useRef(false); // 防止循环更新

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([]));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // 多标签页状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');

  const activeFile = useMemoEnhance(() => {
    return openedFiles.find((f) => f.path === activeFilePath);
  }, [openedFiles, activeFilePath]);

  // Clean up blob URLs when component unmounts
  useEffect(() => {
    return () => {
      setOpenedFiles((prev) => {
        prev.forEach((file) => {
          if (file.isBinary && file.content.startsWith('blob:')) {
            URL.revokeObjectURL(file.content);
          }
        });
        return prev;
      });
    };
  }, []);

  // 加载目录 - 改为普通异步函数,避免 useRequest 的并发问题
  const { runAsync: loadDirectory } = useRequest(
    async (path: string, level: number) => {
      const data = await listSandboxFiles({ appId, chatId, outLinkAuthData, path });
      const nodes: TreeNode[] = (data.files || []).map((file) => ({
        ...file,
        level,
        children: file.type === 'directory' ? [] : undefined,
        loaded: false // 子目录初始未加载
      }));

      setFileTree((prevTree) => {
        if (level === 0) {
          return nodes;
        }
        // 更新目标节点,标记为已加载
        return updateTreeNode(prevTree, path, nodes, true);
      });

      return nodes;
    },
    { manual: true }
  );

  // 初始加载根目录的 loading 状态
  const [loadingRoot, setLoadingRoot] = useState(false);

  // 读取文件内容 - 根据 language 来决定解码策略
  const { runAsync: loadFile, loading: loadingFile } = useRequest(
    async (filePath: string, language: string): Promise<string> => {
      const response = await getSandboxFile({ appId, chatId, outLinkAuthData, path: filePath });

      const isBinary = getIsBinaryByLanguage(language);

      if (isBinary) {
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } else {
        const content = await response.text();
        return content;
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
      if (!targetFile || targetFile.isBinary) return;

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

  // 下载工作区
  const { run: downloadWorkspace, loading: downloadingWorkspace } = useRequest(
    async () => {
      await downloadSandbox({ appId, chatId, outLinkAuthData });
    },
    { manual: true }
  );

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
      return;
    }

    // 新打开文件
    try {
      const fileName = filePath.split('/').pop() || '';
      const language = getLanguageByFileName(fileName);
      const isBinary = getIsBinaryByLanguage(language);

      const content = await loadFile(filePath, language);

      const newFile: OpenedFile = {
        path: filePath,
        name: fileName,
        content,
        language,
        isBinary,
        isDirty: false
      };

      setOpenedFiles((prev) => [...prev, newFile]);
      setActiveFilePath(filePath);
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

  // 初始化加载根目录
  useMount(() => {
    setLoadingRoot(true);
    loadDirectory('.', 0).finally(() => {
      setLoadingRoot(false);
    });
  });

  // 当切换 tab 时,更新编辑器内容
  useEffect(() => {
    if (!editorRef.current || !activeFilePath || !activeFile) return;
    if (activeFile.isBinary) return;

    // 使用 ref 标记防止循环更新
    isUpdatingRef.current = true;
    editorRef.current.setValue(activeFile.content);

    // 延迟重置标记,确保 setValue 完成
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  }, [activeFilePath]);

  // 切换目录展开/折叠
  const toggleDirectory = async (node: TreeNode) => {
    if (node.type !== 'directory') return;

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
          console.log('Add loading:', node.path, next);
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
              console.log('Remove loading:', node.path, next);
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
        {/* 左侧: 文件浏览器 */}
        <FileTree
          filteredTree={filteredTree}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          expandedDirs={expandedDirs}
          loadingDirs={loadingDirs}
          activeFilePath={activeFilePath}
          openFile={openFile}
          toggleDirectory={toggleDirectory}
          downloadingWorkspace={downloadingWorkspace}
          downloadWorkspace={downloadWorkspace}
        />

        {/* 右侧: 编辑器区域 */}
        <MyBox
          isLoading={loadingFile}
          display={'flex'}
          flex={1}
          w={0}
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
                key={activeFilePath}
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
      display={'flex'}
      h="full"
      w="full"
      bg="myGray.25"
      borderRadius="12px"
      overflow="hidden"
      border="1px solid"
      borderColor="myGray.200"
    >
      {renderContent()}
    </MyBox>
  );
};

export default SandboxEditor;
