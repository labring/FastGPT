'use client';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { Button, useDisclosure, ModalBody, ModalFooter, VStack, HStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import FileSelector, {
  type SelectFileItemType
} from '@/pageComponents/dataset/detail/components/FileSelector';
import PluginCard from '@/pageComponents/dashboard/SystemPlugin/ToolCard';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import {
  postUploadFileAndUrl,
  postPresignedUrl,
  postConfirmUpload,
  postS3UploadFile,
  postDeletePlugin
} from '@/web/common/file/api';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';

const SystemTools = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { type, pluginGroupId } = router.query as { type?: string; pluginGroupId?: string };
  const { isPc } = useSystem();

  const [searchKey, setSearchKey] = useState('');
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [pluginToDelete, setPluginToDelete] = useState<string | null>(null);
  const [deletingPlugins, setDeletingPlugins] = useState<Set<string>>(new Set());
  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const {
    data: plugins = [],
    loading: isLoading,
    runAsync: refreshPlugins
  } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });
  const { isOpen, onOpen, onClose } = useDisclosure();

  const handlePluginDelete = (pluginId: string) => {
    setPluginToDelete(pluginId);
    setIsDeletePopoverOpen(true);
  };

  const executePluginDelete = async () => {
    if (!pluginToDelete) return;

    setDeletingPlugins((prev) => new Set(prev).add(pluginToDelete));
    setIsDeletePopoverOpen(false);

    try {
      await postDeletePlugin(pluginToDelete);
      toast({
        title: t('common:delete_success'),
        status: 'success'
      });

      // null means all tools
      await refreshPlugins({ parentId: null });
    } catch (error) {
      Promise.reject(error);
      toast({
        title: t('common:delete_failed'),
        status: 'error'
      });
    } finally {
      setDeletingPlugins((prev) => {
        const newSet = new Set(prev);
        newSet.delete(pluginToDelete);
        return newSet;
      });
      setPluginToDelete(null);
    }
  };

  const cancelDelete = () => {
    setPluginToDelete(null);
    setIsDeletePopoverOpen(false);
  };

  const handlePluginUpload = async () => {
    try {
      const file = selectFiles[0];

      const presignedData = await postPresignedUrl({
        filename: file.name,
        contentType: file.file.type,
        metadata: {
          size: String(file.file.size)
        }
      });

      const formData = new FormData();
      Object.entries(presignedData.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file.file);

      await postS3UploadFile(presignedData.uploadUrl, formData, (progress) => {
        console.log('Upload progress:', progress);
      });

      const fileUrl = await postConfirmUpload({
        objectName: presignedData.objectName,
        size: String(file.file.size)
      });

      await postUploadFileAndUrl(fileUrl);

      toast({
        title: '导入成功',
        status: 'success'
      });

      setSelectFiles([]);
      onClose();
      // null means all tools
      await refreshPlugins({ parentId: null });
    } catch (error) {
      toast({
        title: '导入失败，文件内容存在错误',
        description: error instanceof Error ? error.message : '未知错误',
        status: 'error'
      });
    }
  };

  const currentPlugins = useMemo(() => {
    return plugins
      .filter((plugin) => {
        if (!type || type === 'all') return true;
        return plugin.templateType === type;
      })
      .filter((item) => {
        if (!searchKey) return true;
        const regx = new RegExp(searchKey, 'i');
        return regx.test(`${item.name}${item.intro}${item.instructions}`);
      });
  }, [plugins, searchKey, type]);

  return (
    <DashboardContainer>
      {({ pluginGroups, MenuIcon }) => {
        const currentGroup = pluginGroups.find((group) => group.groupId === pluginGroupId);
        const groupTemplateTypeIds =
          currentGroup?.groupTypes
            ?.map((type) => type.typeId)
            .reduce(
              (acc, cur) => {
                acc[cur] = true;
                return acc;
              },
              {} as Record<string, boolean>
            ) || {};
        const filterPluginsByGroup = currentPlugins.filter((plugin) => {
          if (!currentGroup) return true;
          return groupTemplateTypeIds[plugin.templateType];
        });

        return (
          <>
            <MyBox isLoading={isLoading} h={'100%'}>
              <Box p={6} h={'100%'} overflowY={'auto'}>
                <Flex alignItems={'center'} justifyContent={'space-between'}>
                  {isPc ? (
                    <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                      {t('common:core.module.template.System Plugin')}
                    </Box>
                  ) : (
                    MenuIcon
                  )}
                  <Flex alignItems={'center'} gap={2}>
                    <Button onClick={onOpen}>导入/更新</Button>
                    <Box flex={'0 0 200px'}>
                      <SearchInput
                        value={searchKey}
                        onChange={(e) => setSearchKey(e.target.value)}
                        placeholder={t('common:plugin.Search plugin')}
                      />
                    </Box>
                  </Flex>
                </Flex>
                <Grid
                  gridTemplateColumns={[
                    '1fr',
                    'repeat(2,1fr)',
                    'repeat(2,1fr)',
                    'repeat(3,1fr)',
                    'repeat(4,1fr)'
                  ]}
                  gridGap={4}
                  alignItems={'stretch'}
                  py={5}
                >
                  {filterPluginsByGroup.map((item) => (
                    <PluginCard
                      key={item.id}
                      item={item}
                      groups={pluginGroups}
                      onDelete={handlePluginDelete}
                    />
                  ))}
                </Grid>
                {filterPluginsByGroup.length === 0 && <EmptyTip />}
              </Box>
            </MyBox>

            {/* Delete confirmation modal */}
            <MyModal title="删除确认" isOpen={!!pluginToDelete} onClose={cancelDelete}>
              <ModalBody>
                <Box>是否确认删除该工具？该操作无法撤回。</Box>
              </ModalBody>
              <ModalFooter>
                <Button variant="whiteBase" mr={2} onClick={cancelDelete}>
                  取消
                </Button>
                <Button
                  colorScheme="red"
                  onClick={executePluginDelete}
                  isLoading={pluginToDelete ? deletingPlugins.has(pluginToDelete) : false}
                >
                  删除确认
                </Button>
              </ModalFooter>
            </MyModal>

            <MyModal title="上传系统工具" isOpen={isOpen}>
              <ModalBody>
                <FileSelector
                  maxCount={1}
                  maxSize="10MB"
                  fileType=".js"
                  selectFiles={selectFiles}
                  setSelectFiles={setSelectFiles}
                />
                {/* File render */}
                {selectFiles.length > 0 && (
                  <VStack mt={4} gap={2}>
                    {selectFiles.map((item, index) => (
                      <HStack key={index} w={'100%'}>
                        <MyIcon name={item.icon as any} w={'1rem'} />
                        <Box color={'myGray.900'}>{item.name}</Box>
                        <Box fontSize={'xs'} color={'myGray.500'} flex={1}>
                          {item.size}
                        </Box>
                        <MyIconButton
                          icon="delete"
                          hoverColor="red.500"
                          hoverBg="red.50"
                          onClick={() => {
                            setSelectFiles(selectFiles.filter((_, i) => i !== index));
                          }}
                        />
                      </HStack>
                    ))}
                  </VStack>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="whiteBase" mr={2} onClick={onClose}>
                  {t('common:Close')}
                </Button>
                <Button onClick={handlePluginUpload} isDisabled={selectFiles.length === 0}>
                  确认导入
                </Button>
              </ModalFooter>
            </MyModal>
          </>
        );
      }}
    </DashboardContainer>
  );
};

export default SystemTools;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'file']))
    }
  };
}
