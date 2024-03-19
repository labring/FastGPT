import React, { useCallback, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalBody,
  Input,
  Textarea,
  TableContainer,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
  useDisclosure,
  Center,
  Spinner
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@/web/common/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import { useTranslation } from 'next-i18next';
import { CreateOnePluginParams, MethodType } from '@fastgpt/global/core/plugin/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
import {
  delOnePlugin,
  getSchema,
  postCreatePlugin,
  postImportPlugin,
  putUpdatePlugin
} from '@/web/core/plugin/api';
import {
  ApiData,
  getPluginsData,
  handleOpenAPI,
  text2json
} from '@/service/core/plugin/getModules';
import AuthMethodModal from './AuthMethodModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { FormType, defaultForm } from './EditModal';
import { debounce } from 'lodash';
import { AddIcon } from '@chakra-ui/icons';
import MyModal from '@fastgpt/web/components/common/MyModal';

export const defaultHttpPlugin: CreateOnePluginParams = {
  avatar: '/imgs/module/http.png',
  name: '',
  intro: '',
  parentId: null,
  type: PluginTypeEnum.folder,
  schema: null,
  authMethod: null
};

const ImportModal = ({
  defaultPlugin = defaultHttpPlugin,
  onClose,
  onSuccess,
  onDelete
}: {
  defaultPlugin?: FormType;
  onClose: () => void;
  onSuccess: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPc } = useSystemStore();
  const [refresh, setRefresh] = useState(false);
  const [apiData, setApiData] = useState<ApiData>(() => {
    try {
      return handleOpenAPI(text2json(defaultPlugin.schema || '')) as ApiData;
    } catch (err) {
      return { pathData: [], serverPath: '' };
    }
  });
  const [authMethod, setAuthMethod] = useState<MethodType>(
    defaultPlugin.authMethod || {
      name: t('plugin.None'),
      prefix: 'Basic',
      key: 'Authorization',
      value: ''
    }
  );
  const [isOpen, setIsOpen] = useState(false);
  const isEdit = !!defaultPlugin.id;

  const [schemaUrl, setSchemaUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { isOpen: isOpenUrl, onOpen: onOpenUrl, onClose: onCloseUrl } = useDisclosure();

  const { mutate: createPlugins, isLoading: creating } = useRequest({
    mutationFn: async (data: CreateOnePluginParams) => {
      return postCreatePlugin(data);
    },
    onSuccess(id: string) {
      if (!apiData?.pathData) {
        onClose();
        onSuccess();
        return;
      }
      const pluginData = getPluginsData({ id, apiData, authMethod });
      importPlugins({ pluginData, parentId: id });
    },
    successToast: apiData?.pathData ? '' : t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });

  const { mutate: importPlugins, isLoading: importing } = useRequest({
    mutationFn: async (data: CreateOnePluginParams[]) => {
      return postImportPlugin(data);
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: isEdit ? t('common.Update Success') : t('common.Create Success'),
    errorToast: isEdit ? t('common.Update Failed') : t('common.Create Failed')
  });

  const { mutate: updatePlugins, isLoading: updating } = useRequest({
    mutationFn: async (data: FormType) => {
      if (!data.id) return Promise.resolve('');
      // @ts-ignore
      return putUpdatePlugin(data);
    },
    onSuccess() {
      if (!apiData?.pathData) {
        onClose();
        onSuccess();
      }
    },
    successToast: apiData?.pathData ? '' : t('common.Update Success'),
    errorToast: t('common.Update Failed')
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    title: t('common.Delete Tip'),
    content: t('plugin.Confirm Delete')
  });

  const { register, setValue, getValues, handleSubmit } = useForm<CreateOnePluginParams>({
    defaultValues: defaultPlugin
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.pluginAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.Select File Failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const onclickDelApp = useCallback(async () => {
    if (!defaultPlugin.id) return;
    try {
      setDeleteLoading(true);
      await delOnePlugin(defaultPlugin.id);
      toast({
        title: t('common.Delete Success'),
        status: 'success'
      });
      onDelete();
    } catch (err: any) {
      toast({
        title: getErrText(err, t('common.Delete Failed')),
        status: 'error'
      });
    }
    setDeleteLoading(false);
    onClose();
  }, [defaultPlugin.id, onClose, toast, t, onDelete]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/edit.svg"
      title={isEdit ? t('plugin.Edit Http Plugin') : t('plugin.Import Plugin')}
      isCentered={!isPc}
      w={['90vw', '600px']}
      position={'relative'}
    >
      <ModalBody pb={20}>
        <Box color={'myGray.800'} fontWeight={'bold'}>
          {t('plugin.Set Name')}
        </Box>
        <Flex mt={3} alignItems={'center'}>
          <MyTooltip label={t('common.Set Avatar')}>
            <Avatar
              flexShrink={0}
              src={getValues('avatar')}
              w={['28px', '32px']}
              h={['28px', '32px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={4}
            bg={'myWhite.600'}
            {...register('name', {
              required: t("common.Name Can't Be Empty")
            })}
          />
        </Flex>
        <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
          {t('plugin.Intro')}
        </Box>
        <Textarea {...register('intro')} bg={'myWhite.600'} rows={4} mt={3} />
        <Box
          color={'myGray.800'}
          fontWeight={'bold'}
          mt={3}
          justifyContent={'space-between'}
          w={'full'}
          display={'flex'}
        >
          <Box my={'auto'}>{'Schema'}</Box>
          <Box>
            <Popover isOpen={isOpenUrl}>
              <PopoverTrigger>
                <Button
                  variant={'whiteBase'}
                  size={'sm'}
                  fontSize={'xs'}
                  leftIcon={<AddIcon fontSize={'xs'} />}
                  onClick={isOpenUrl ? onCloseUrl : onOpenUrl}
                >
                  {t('plugin.Import from URL')}
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <PopoverArrow />
                <PopoverBody display={'flex'} h={12}>
                  <Input
                    h={'full'}
                    mr={2}
                    placeholder={'https://...'}
                    onBlur={(e) => setSchemaUrl(e.target.value)}
                  />
                  <Button
                    h={'full'}
                    size={'sm'}
                    isLoading={urlLoading}
                    onClick={async () => {
                      if (!schemaUrl || !schemaUrl.startsWith('https://')) {
                        toast({
                          title: t('plugin.Invalid URL'),
                          status: 'warning'
                        });
                        return;
                      }

                      try {
                        setUrlLoading(true);
                        const schema = await getSchema(schemaUrl);

                        console.log(
                          '%cprojects/app/src/pages/plugin/list/component/ImportModal.tsx:304 schema',
                          'color: #007acc;',
                          schema
                        );

                        setValue('schema', JSON.stringify(schema));
                        const pathData = handleOpenAPI(schema);
                        setApiData(pathData as ApiData);
                      } catch (err) {
                        toast({
                          title: t('plugin.Invalid Schema'),
                          status: 'warning'
                        });
                      }
                      setUrlLoading(false);
                      onCloseUrl();
                    }}
                  >
                    {t('common.Confirm')}
                  </Button>
                </PopoverBody>
              </PopoverContent>
            </Popover>
          </Box>
        </Box>
        <Textarea
          {...register('schema')}
          bg={'myWhite.600'}
          rows={10}
          mt={3}
          onChange={debounce((e) => {
            const content = e.target.value;
            try {
              const schema = text2json(content);
              const pathData = handleOpenAPI(schema);
              setApiData(pathData as ApiData);
            } catch (err) {
              toast({
                title: t('plugin.Invalid Schema'),
                status: 'warning'
              });
            }
          }, 500)}
        />
        <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
          {t('plugin.Plugin List')}
        </Box>
        <TableContainer maxH={400} overflowY={'auto'} mt={3}>
          <Table border={'1px solid'} borderColor={'myGray.200'}>
            <Thead>
              <Th>{t('Name')}</Th>
              <Th>{t('plugin.Description')}</Th>
              <Th>{t('plugin.Method')}</Th>
              <Th>{t('plugin.Path')}</Th>
            </Thead>
            <Tbody>
              {apiData?.pathData?.map((item, index) => (
                <Tr key={index}>
                  <Td>{item.name}</Td>
                  <Td
                    fontSize={'sm'}
                    textColor={'gray.600'}
                    w={'auto'}
                    maxW={80}
                    whiteSpace={'pre-wrap'}
                  >
                    {item.description}
                  </Td>
                  <Td>{item.method}</Td>
                  <Td>{item.path}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        <Box color={'myGray.800'} fontWeight={'bold'} mt={3}>
          {t('plugin.Auth Method')}
        </Box>
        <Box
          bg={'myWhite.600'}
          h={'40px'}
          borderRadius={'md'}
          mt={3}
          fontSize={'sm'}
          color={'myGray.800'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          cursor={'pointer'}
          onClick={() => {
            setIsOpen(true);
          }}
          display={'flex'}
          alignItems={'center'}
          pl={6}
        >
          {authMethod.name}
        </Box>
      </ModalBody>

      <Flex
        px={5}
        py={4}
        alignItems={'center'}
        position={'absolute'}
        bottom={0}
        w={'full'}
        bg={'white'}
        roundedBottom={'xl'}
      >
        {isEdit && (
          <IconButton
            className="delete"
            size={'xsSquare'}
            icon={<MyIcon name={'delete'} w={'14px'} />}
            variant={'whiteDanger'}
            aria-label={'delete'}
            _hover={{
              bg: 'red.100'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openConfirm(onclickDelApp)();
            }}
          />
        )}
        <Box flex={1} />
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        {!isEdit ? (
          <Button
            onClick={handleSubmit((data) => {
              createPlugins({
                ...defaultForm,
                type: PluginTypeEnum.folder,
                name: data.name,
                intro: data.intro,
                avatar: data.avatar,
                authMethod,
                schema: data.schema
              });
            })}
            isLoading={creating || importing}
          >
            {t('common.Confirm Create')}
          </Button>
        ) : (
          <Button
            onClick={handleSubmit((data) => {
              const id = defaultPlugin.id as string;
              updatePlugins({ ...data, authMethod });
              const pluginData = getPluginsData({ id, apiData, authMethod });
              importPlugins({ pluginData, parentId: id });
            })}
            isLoading={creating || importing}
          >
            {t('common.Confirm Update')}
          </Button>
        )}
      </Flex>

      {deleteLoading && (
        <Center
          top={0}
          left={0}
          right={0}
          bottom={0}
          borderRadius={'xl'}
          position={'absolute'}
          bg={'white'}
          zIndex={'999'}
          opacity={0.8}
        >
          <Spinner />
        </Center>
      )}

      <File onSelect={onSelectFile} />
      {isOpen && (
        <AuthMethodModal
          onClose={() => {
            setIsOpen(false);
          }}
          setAuthMethod={setAuthMethod}
          authMethod={authMethod}
        />
      )}
      <ConfirmModal />
    </MyModal>
  );
};

export default ImportModal;
