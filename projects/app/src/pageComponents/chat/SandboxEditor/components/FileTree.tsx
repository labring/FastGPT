import React from 'react';
import {
  Box,
  VStack,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  Text,
  Spinner
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getIconByFilename } from '../utils';

export type FileItem = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

export type TreeNode = FileItem & {
  children?: TreeNode[];
  level: number;
  loaded?: boolean;
};

type Props = {
  filteredTree: TreeNode[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  activeFilePath: string;
  openFile: (path: string) => void;
  toggleDirectory: (node: TreeNode) => void;
  downloadingWorkspace: boolean;
  downloadWorkspace: () => void;
};

const FileTree = ({
  filteredTree,
  searchQuery,
  setSearchQuery,
  expandedDirs,
  loadingDirs,
  activeFilePath,
  openFile,
  toggleDirectory,
  downloadingWorkspace,
  downloadWorkspace
}: Props) => {
  const { t } = useTranslation();

  const renderTreeNode = (node: TreeNode): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isLoading = loadingDirs.has(node.path);
    const isActive = activeFilePath === node.path;

    const shouldShowArrow =
      node.type === 'directory' && (!node.loaded || (node.children && node.children.length > 0));

    return (
      <React.Fragment key={node.path}>
        <Flex
          pl={`${node.level * 16 + 4}px`}
          pr={2}
          py="6px"
          cursor="pointer"
          _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
          bg={isActive ? 'rgba(17, 24, 36, 0.05)' : 'transparent'}
          borderRadius="4px"
          onClick={() => {
            if (node.type === 'file') {
              openFile(node.path);
            } else {
              toggleDirectory(node);
            }
          }}
          align="center"
          fontSize="12px"
          color={isActive ? 'myGray.600' : 'myGray.600'}
        >
          <Flex justify="center" align="center" w="16px" h="16px">
            {shouldShowArrow ? (
              isLoading ? (
                <Spinner size="xs" color="primary.400" w="12px" h="12px" />
              ) : (
                <MyIcon
                  name={isExpanded ? 'core/chat/chevronDown' : 'core/chat/chevronRight'}
                  w="16px"
                  color="myGray.500"
                />
              )
            ) : null}
          </Flex>
          <MyIcon
            mr={1}
            ml={1}
            name={node.type === 'directory' ? 'common/folderFill' : getIconByFilename(node.name)}
            w="16px"
            color={node.type === 'directory' ? '#EF7623' : 'myGray.600'}
          />
          <Text
            flex={1}
            minW={0}
            noOfLines={1}
            overflow="hidden"
            textOverflow="ellipsis"
            fontWeight={isActive ? '600' : '400'}
            letterSpacing="0.5px"
          >
            {node.name}
          </Text>
        </Flex>
        {shouldShowArrow && isExpanded && node.children && node.children.map(renderTreeNode)}
      </React.Fragment>
    );
  };

  return (
    <Box
      flex="0 0 224px"
      w={0}
      borderRight="1px solid"
      borderColor="myGray.200"
      bg="myGray.25"
      display="flex"
      flexDirection="column"
    >
      <Box p={3}>
        <InputGroup size="sm">
          <InputLeftElement h="32px">
            <MyIcon name="common/searchLight" w="16px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder={t('chat:sandbox_search_files')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            bg="white"
            fontSize="12px"
            h="32px"
            borderRadius="6px"
            borderColor="myGray.200"
            _placeholder={{ color: 'myGray.500' }}
          />
        </InputGroup>
      </Box>

      <Box flex={1} overflowY="auto" overflowX="hidden" px={2}>
        <VStack align="stretch" spacing="0" pb={2}>
          {filteredTree.map(renderTreeNode)}
        </VStack>
      </Box>

      <Button
        m={2}
        variant={'unstyled'}
        bg={'myGray.150'}
        color={'primary.700'}
        fontSize={'12px'}
        fontWeight={'500'}
        leftIcon={<MyIcon name="common/downloadLine" w="16px" />}
        isLoading={downloadingWorkspace}
        onClick={downloadWorkspace}
        display={'flex'}
        alignItems={'center'}
        _disabled={{
          color: 'primary.700',
          bg: 'myGray.150',
          cursor: 'not-allowed',
          _hover: {
            color: 'primary.700',
            bg: 'myGray.150'
          }
        }}
      >
        {t('chat:download_all_files')}
      </Button>
    </Box>
  );
};

export default FileTree;
