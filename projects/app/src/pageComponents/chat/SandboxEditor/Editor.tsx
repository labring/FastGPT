import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Center,
  Text,
  VStack,
  IconButton,
  Flex,
  Spinner,
  Input,
  InputGroup,
  InputLeftElement,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag';
import Editor, { type Monaco } from '@monaco-editor/react';
import { listSandboxFiles, readSandboxFile, writeSandboxFile, downloadSandbox } from './api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useMount } from 'ahooks';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

type EditorInstance = Parameters<NonNullable<Parameters<typeof Editor>[0]['onMount']>>[0];

type Props = {
  appId: string;
  chatId: string;
};

type FileItem = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

type TreeNode = FileItem & {
  children?: TreeNode[];
  level: number;
  loaded?: boolean; // 标记目录是否已加载
};

type OpenedFile = {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
};

const SandboxEditor = ({ appId, chatId }: Props) => {
  const { t } = useTranslation();
  const editorRef = useRef<EditorInstance>();
  const isUpdatingRef = useRef(false); // 防止循环更新

  const [fileTree, setFileTree] = useState<TreeNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/workspace']));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // 多标签页状态
  const [openedFiles, setOpenedFiles] = useState<OpenedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('');

  // 加载目录 - 改为普通异步函数,避免 useRequest 的并发问题
  const loadDirectory = async (path: string, level: number) => {
    try {
      const data = await listSandboxFiles({ appId, chatId, path });
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
    } catch (error) {
      console.error('Load directory failed:', path, error);
      throw error;
    }
  };

  // 初始加载根目录的 loading 状态
  const [loadingRoot, setLoadingRoot] = useState(false);

  // 读取文件
  const { runAsync: loadFile, loading: loadingFile } = useRequest(
    async (filePath: string) => {
      const data = await readSandboxFile({ appId, chatId, path: filePath });
      return data.content;
    },
    { manual: true }
  );

  // 保存文件
  const { run: saveFile, loading: saving } = useRequest(
    async (filePath?: string) => {
      const targetPath = filePath || activeFilePath;
      if (!targetPath) return;

      const targetFile = openedFiles.find((f) => f.path === targetPath);
      if (!targetFile) return;

      await writeSandboxFile({ appId, chatId, path: targetPath, content: targetFile.content });

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
      await downloadSandbox({ appId, chatId, path: '/workspace' });
    },
    { manual: true }
  );

  // 下载当前文件
  const { run: downloadCurrentFile, loading: downloadingFile } = useRequest(
    async () => {
      if (!activeFilePath) return;

      const activeFile = openedFiles.find((f) => f.path === activeFilePath);
      if (!activeFile) return;

      // 直接下载文件内容,不压缩
      const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    { manual: true }
  );

  // 获取文件语言
  const getLanguageByExtension = (ext?: string): string => {
    const langMap: Record<string, string> = {
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      sh: 'shell',
      bash: 'shell',
      yml: 'yaml',
      yaml: 'yaml',
      xml: 'xml',
      sql: 'sql',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp'
    };
    return langMap[ext?.toLowerCase() || ''] || 'plaintext';
  };

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
      const content = await loadFile(filePath);
      const fileName = filePath.split('/').pop() || '';
      const ext = fileName.split('.').pop();
      const language = getLanguageByExtension(ext);

      const newFile: OpenedFile = {
        path: filePath,
        name: fileName,
        content,
        language,
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

    const file = openedFiles.find((f) => f.path === filePath);

    // TODO: 如果有未保存的修改,提示用户
    // if (file?.isDirty) {
    //   // 显示确认对话框
    // }

    setOpenedFiles((prev) => prev.filter((f) => f.path !== filePath));

    // 如果关闭的是当前文件,切换到其他文件
    if (activeFilePath === filePath) {
      const remainingFiles = openedFiles.filter((f) => f.path !== filePath);
      if (remainingFiles.length > 0) {
        setActiveFilePath(remainingFiles[remainingFiles.length - 1].path);
      } else {
        setActiveFilePath('');
      }
    }
  };

  // 初始化加载根目录
  useMount(() => {
    setLoadingRoot(true);
    loadDirectory('/workspace', 0).finally(() => {
      setLoadingRoot(false);
    });
  });

  // 当切换 tab 时,更新编辑器内容
  useEffect(() => {
    if (!editorRef.current || !activeFilePath) return;

    const activeFile = openedFiles.find((f) => f.path === activeFilePath);
    if (!activeFile) return;

    // 使用 ref 标记防止循环更新
    isUpdatingRef.current = true;
    editorRef.current.setValue(activeFile.content);

    // 延迟重置标记,确保 setValue 完成
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  }, [activeFilePath]);

  // 更新树节点
  const updateTreeNode = (
    tree: TreeNode[],
    targetPath: string,
    children: TreeNode[],
    loaded: boolean = false
  ): TreeNode[] => {
    return tree.map((node) => {
      if (node.path === targetPath) {
        return { ...node, children, loaded };
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, targetPath, children, loaded) };
      }
      return node;
    });
  };

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

  // 过滤文件树
  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;

    return nodes
      .map((node) => {
        if (node.type === 'file' && node.name.toLowerCase().includes(query.toLowerCase())) {
          return node;
        }
        if (node.children) {
          const filteredChildren = filterTree(node.children, query);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          }
        }
        return null;
      })
      .filter((node): node is TreeNode => node !== null);
  };

  // 渲染树节点
  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isLoading = loadingDirs.has(node.path);
    const isActive = activeFilePath === node.path;
    console.log(node.path, isLoading);
    // 判断是否显示箭头:
    // 1. 必须是目录
    // 2. 未加载过 OR 已加载且有子节点
    const shouldShowArrow =
      node.type === 'directory' && (!node.loaded || (node.children && node.children.length > 0));

    return (
      <React.Fragment key={node.path}>
        <Flex
          pl={`${node.level * 12 + 8}px`}
          pr={2}
          py="6px"
          cursor="pointer"
          _hover={{ bg: 'myGray.100' }}
          bg={isActive ? 'primary.50' : 'transparent'}
          onClick={() => {
            if (node.type === 'file') {
              openFile(node.path);
            } else {
              toggleDirectory(node);
            }
          }}
          align="center"
          gap={1}
          fontSize="13px"
          color={isActive ? 'primary.600' : 'myGray.900'}
        >
          {shouldShowArrow ? (
            isLoading ? (
              <HStack justify="center" align="center" w="14px" h="14px">
                <Spinner size="xs" color="primary.400" w="12px" h="12px" />
              </HStack>
            ) : (
              <MyIcon
                name={isExpanded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
                w="14px"
                color="myGray.500"
              />
            )
          ) : (
            <Box w="14px" />
          )}
          <MyIcon
            name={node.type === 'directory' ? 'common/folderFill' : 'file/fill/txt'}
            w="14px"
            color={node.type === 'directory' ? 'blue.500' : 'myGray.500'}
          />
          <Text flex={1} noOfLines={1} fontWeight={isActive ? '500' : '400'}>
            {node.name}
          </Text>
          {node.type === 'file' && node.size !== undefined && (
            <Text color="myGray.400" fontSize="11px">
              {formatFileSize(node.size)}
            </Text>
          )}
        </Flex>
        {shouldShowArrow && isExpanded && node.children && node.children.map(renderTreeNode)}
      </React.Fragment>
    );
  };

  const filteredTree = filterTree(fileTree, searchQuery);

  return (
    <MyBox
      isLoading={loadingRoot && fileTree.length === 0}
      display={'flex'}
      h="full"
      w="full"
      bg="white"
    >
      {/* 左侧: 文件浏览器 */}
      <Box
        flex="0 0 260px"
        borderRight="1px solid"
        borderColor="myGray.200"
        bg="myGray.25"
        display="flex"
        flexDirection="column"
      >
        {/* 标题栏 */}
        <Flex
          px={3}
          py={2}
          borderBottom="1px solid"
          borderColor="myGray.200"
          align="center"
          gap={2}
          bg="white"
        >
          <Text fontSize="13px" fontWeight="600" flex={1} color="myGray.900">
            {t('app:sandbox.files')}
          </Text>
          <MyIconButton
            size="16px"
            icon="common/folderImport"
            aria-label="Download"
            isLoading={downloadingWorkspace}
            onClick={downloadWorkspace}
          />
        </Flex>

        {/* 搜索框 */}
        <Box px={2} py={2}>
          <InputGroup size="sm">
            <InputLeftElement>
              <MyIcon name="common/searchLight" w="14px" color="myGray.500" />
            </InputLeftElement>
            <Input
              placeholder={t('app:sandbox.search_files')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              bg="white"
              fontSize="13px"
            />
          </InputGroup>
        </Box>

        {/* 文件树 */}
        <Box flex={1} overflowY="auto" overflowX="hidden">
          <VStack align="stretch" spacing={0} py={1}>
            {filteredTree.map(renderTreeNode)}
          </VStack>
        </Box>
      </Box>

      {/* 右侧: 编辑器区域 */}
      <MyBox
        isLoading={loadingFile}
        display={'flex'}
        flex={1}
        w={0}
        flexDirection="column"
        bg="white"
      >
        {openedFiles.length > 0 ? (
          <>
            {/* Tab 栏 */}
            <Flex borderBottom="1px solid" borderColor="myGray.200" bg="myGray.50">
              <Flex
                flex={'1 0 0'}
                w={0}
                mr={2}
                overflowX="auto"
                overflowY="hidden"
                flexWrap="nowrap"
                css={{
                  '&::-webkit-scrollbar': {
                    height: '6px'
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: '#E2E8F0',
                    borderRadius: '3px'
                  },
                  '&::-webkit-scrollbar-track': {
                    background: 'transparent'
                  }
                }}
              >
                <Flex flexShrink={0} gap={0}>
                  {openedFiles.map((file) => (
                    <Flex
                      key={file.path}
                      px={3}
                      py={2}
                      bg={activeFilePath === file.path ? 'white' : 'transparent'}
                      borderTop={'2px solid'}
                      borderTopColor={activeFilePath === file.path ? 'primary.500' : 'transparent'}
                      borderRight="1px solid"
                      borderRightColor="myGray.200"
                      align="center"
                      gap={2}
                      fontSize="13px"
                      cursor="pointer"
                      onClick={() => setActiveFilePath(file.path)}
                      minW="120px"
                      maxW="200px"
                      flexShrink={0}
                      position="relative"
                      _hover={{
                        bg: activeFilePath === file.path ? 'white' : 'myGray.100'
                      }}
                    >
                      <MyIcon name="file/fill/txt" w="14px" color="myGray.600" />
                      <Text
                        flex={1}
                        noOfLines={1}
                        fontWeight={activeFilePath === file.path ? '500' : '400'}
                        color={activeFilePath === file.path ? 'myGray.900' : 'myGray.600'}
                      >
                        {file.name}
                      </Text>
                      {file.isDirty && <Box w="6px" h="6px" borderRadius="50%" bg="yellow.600" />}
                      <IconButton
                        size="xs"
                        icon={<MyIcon name="common/closeLight" w="10px" />}
                        aria-label="Close"
                        variant="ghost"
                        onClick={(e) => closeFile(file.path, e)}
                        opacity={0.6}
                        _hover={{ opacity: 1 }}
                        minW="auto"
                        h="auto"
                        p={0}
                      />
                    </Flex>
                  ))}
                </Flex>
              </Flex>
              {/* 下载和保存按钮 */}
              <Flex align="center" gap={3} pr={3}>
                {/* 下载当前文件按钮 */}
                {activeFilePath && (
                  <MyIconButton
                    size="16px"
                    icon="common/download"
                    aria-label="Download"
                    onClick={downloadCurrentFile}
                    isLoading={downloadingFile}
                  />
                )}
                {/* 未保存标签和保存按钮 */}
                {openedFiles.some((f) => f.isDirty) && (
                  <>
                    <MyIconButton
                      size="16px"
                      icon="save"
                      aria-label="Save"
                      onClick={() => saveFile()}
                      isLoading={saving}
                    />
                  </>
                )}
              </Flex>
            </Flex>

            {/* 编辑器 */}
            <Box flex={1}>
              <Editor
                height="100%"
                language={
                  openedFiles.find((f) => f.path === activeFilePath)?.language || 'plaintext'
                }
                value={openedFiles.find((f) => f.path === activeFilePath)?.content || ''}
                theme="vs-light"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 12, bottom: 12 },
                  lineHeight: 20,
                  fontFamily: "'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace",
                  tabSize: 2,
                  wordWrap: 'on',
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  renderLineHighlight: 'line',
                  scrollbar: {
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10
                  }
                }}
                onMount={(editor, monaco) => {
                  editorRef.current = editor;

                  // 保存快捷键 Ctrl/Cmd + S
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                    saveFile();
                  });

                  // 全部保存快捷键 Ctrl/Cmd + Shift + S
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS,
                    () => {
                      // 保存所有未保存的文件
                      openedFiles.forEach((file) => {
                        if (file.isDirty) {
                          saveFile(file.path);
                        }
                      });
                    }
                  );
                }}
                onChange={(value) => {
                  // 防止循环更新
                  if (isUpdatingRef.current) return;

                  // 更新当前文件内容
                  if (activeFilePath && value !== undefined) {
                    setOpenedFiles((prev) =>
                      prev.map((f) =>
                        f.path === activeFilePath ? { ...f, content: value, isDirty: true } : f
                      )
                    );
                  }
                }}
              />
            </Box>
          </>
        ) : filteredTree.length > 0 ? (
          <Center h="full">
            <VStack spacing={3}>
              <EmptyTip text={t('app:sandbox.select_file')} mt={0} />
            </VStack>
          </Center>
        ) : null}
      </MyBox>
    </MyBox>
  );
};

export default SandboxEditor;
