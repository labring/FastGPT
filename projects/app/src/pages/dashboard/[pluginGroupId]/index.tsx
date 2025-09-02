'use client';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import {
  Button,
  useDisclosure,
  ModalBody,
  ModalFooter,
  VStack,
  HStack,
  Link
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import FileSelector, {
  type SelectFileItemType
} from '@/pageComponents/dataset/detail/components/FileSelector';
import PluginCard from '@/pageComponents/dashboard/SystemPlugin/ToolCard';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import {
  getPluginUploadPresignedURL,
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
import { useUserStore } from '@/web/support/user/useUserStore';
import { getDocPath } from '@/web/common/system/doc';

const SystemTools = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { type, pluginGroupId } = router.query as { type?: string; pluginGroupId?: string };
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();

  const isRoot = userInfo?.username === 'root';

  const [searchKey, setSearchKey] = useState('');
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [deletingPlugins, setDeletingPlugins] = useState<Set<string>>(new Set());

  const {
    data: plugins = [],
    loading: isLoading,
    runAsync: refreshPlugins
  } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });
  const { isOpen, onOpen, onClose } = useDisclosure();

  const handleCloseUploadModal = () => {
    setSelectFiles([]);
    onClose();
  };

  const { run: handlePluginUpload, loading: uploadLoading } = useRequest2(
    async () => {
      const file = selectFiles[0];

      const presignedData = await getPluginUploadPresignedURL({
        filename: file.name
      });

      const formData = new FormData();
      Object.entries(presignedData.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file.file);

      await postS3UploadFile(presignedData.uploadUrl, formData);

      await postConfirmUpload({
        objectName: presignedData.objectName
      });

      // await postUploadFileAndUrl(fileUrl);
      await refreshPlugins({ parentId: null });
    },
    {
      manual: true,
      onSuccess: async () => {
        toast({
          title: t('common:import_success'),
          status: 'success'
        });

        setSelectFiles([]);
        onClose();
        // null means all tools
      },
      onError: (error) => {
        toast({
          title: t('common:import_failed'),
          description: error instanceof Error ? error.message : t('dataset:common.error.unKnow'),
          status: 'error'
        });
      }
    }
  );

  const handlePluginDelete = async (pluginId: string) => {
    setDeletingPlugins((prev) => new Set(prev).add(pluginId));

    try {
      await postDeletePlugin(pluginId);
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
        newSet.delete(pluginId);
        return newSet;
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
        const regex = new RegExp(searchKey, 'i');
        return regex.test(`${item.name}${item.intro}${item.instructions}`);
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
                      {t('app:core.module.template.System Tools')}
                    </Box>
                  ) : (
                    MenuIcon
                  )}
                  <Flex alignItems={'center'} gap={4}>
                    <Box flex={'0 0 200px'}>
                      <SearchInput
                        value={searchKey}
                        onChange={(e) => setSearchKey(e.target.value)}
                        placeholder={t('common:plugin.Search plugin')}
                      />
                    </Box>
                    {isRoot && <Button onClick={onOpen}>{t('file:common:import_update')}</Button>}
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
                      onDelete={isRoot ? handlePluginDelete : undefined}
                    />
                  ))}
                </Grid>
                {filterPluginsByGroup.length === 0 && <EmptyTip />}
              </Box>
            </MyBox>
            <MyModal
              title={t('file:common.upload_system_tools')}
              isOpen={isOpen}
              onClose={handleCloseUploadModal}
              iconSrc="core/app/type/plugin"
              iconColor={'primary.600'}
              h={'auto'}
            >
              <ModalBody>
                <Flex justifyContent={'flex-end'} mb={3} fontSize={'sm'} fontWeight={500}>
                  <Link
                    display={'flex'}
                    alignItems={'center'}
                    gap={0.5}
                    href={getDocPath('/docs/guide/plugins/upload_system_tool/')}
                    color="primary.600"
                    target="_blank"
                  >
                    <MyIcon name={'book'} w={'18px'} />
                    {t('common:Instructions')}
                  </Link>
                </Flex>
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
                <Button variant="whiteBase" mr={2} onClick={handleCloseUploadModal}>
                  {t('common:Close')}
                </Button>
                <Button
                  onClick={handlePluginUpload}
                  isDisabled={selectFiles.length === 0}
                  isLoading={uploadLoading}
                >
                  {t('common:comfirm_import')}
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
