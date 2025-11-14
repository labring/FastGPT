import React, { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { type McpAppType } from '@fastgpt/global/support/mcp/type';
import { useTranslation } from 'next-i18next';
import { useFieldArray, useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Path from '@/components/common/folder/Path';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppBasicInfoByIds, getMyApps } from '@/web/core/app/api';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { postCreateMcpServer, putUpdateMcpServer } from '../../../web/support/mcp/api';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

export type EditMcForm = {
  id?: string;
  name: string;
  apps: McpAppType[];
};

export const defaultForm: EditMcForm = {
  name: '',
  apps: []
};

const SelectAppModal = ({
  selectedApps,
  onClose,
  onConfirm
}: {
  selectedApps: McpAppType[];
  onClose: () => void;
  onConfirm: (e: McpAppType[]) => void;
}) => {
  const { t } = useTranslation();

  const [selectedList, setSelectedList] = useState<
    {
      appId: string;
      toolName: string;
      appName: string;
      avatar: string;
      description: string;
    }[]
  >([]);

  // Load selected app
  useRequest2(() => getAppBasicInfoByIds(selectedApps.map((item) => item.appId)), {
    manual: false,
    onSuccess: (data) => {
      setSelectedList(
        data.map((item) => ({
          appId: item.id,
          toolName: item.name,
          appName: item.name,
          avatar: item.avatar,
          description: selectedApps.find((app) => app.appId === item.id)?.description || ''
        }))
      );
    }
  });

  // Load all apps
  const [searchKey, setSearchKey] = useState('');
  const [parentId, setParentId] = useState<ParentIdType>('');

  const { data: apps = [], loading: loadingApps } = useRequest2(
    () =>
      getMyApps({
        searchKey,
        parentId
      }),
    {
      manual: false,
      refreshDeps: [searchKey, parentId],
      throttleWait: 200
    }
  );
  const { data: paths = [] } = useRequest2(
    () => getAppFolderPath({ sourceId: parentId, type: 'current' }),
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const isLoading = loadingApps;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc={'modal/AddClb'}
      title={t('dashboard_mcp:select_app')}
      minW="800px"
      maxW={'60vw'}
      h={'100%'}
      maxH={'90vh'}
      isCentered
      isLoading={isLoading}
    >
      <ModalBody flex={'1'}>
        <Grid
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="1fr 1fr"
          h={'100%'}
        >
          <Flex
            h={'100%'}
            flexDirection="column"
            borderRight="1px solid"
            borderColor="myGray.200"
            p="4"
          >
            <SearchInput
              placeholder={t('dashboard_mcp:search_app')}
              bgColor="myGray.50"
              onChange={(e) => setSearchKey(e.target.value)}
            />

            {paths.length > 0 && !searchKey && (
              <Box mt={3}>
                <Path paths={paths} hoverStyle={{ bg: 'myGray.200' }} onClick={setParentId} />
              </Box>
            )}

            <Box mt="3" overflow={'auto'} flex={'1 0 0'} h={0}>
              {apps.map((item) => {
                const selected = selectedList.some((app) => app.appId === item._id);
                const isFolder = AppFolderTypeList.includes(item.type);

                const handleItemClick = () => {
                  if (isFolder) {
                    setParentId(item._id);
                  } else if (selected) {
                    setSelectedList((state) => state.filter((app) => app.appId !== item._id));
                  } else {
                    setSelectedList((state) => [
                      ...state,
                      {
                        appId: item._id,
                        toolName: item.name,
                        appName: item.name,
                        avatar: item.avatar,
                        description: item.intro
                      }
                    ]);
                  }
                };

                return (
                  <HStack
                    key={item._id}
                    py={2}
                    px={3}
                    borderRadius={'md'}
                    cursor={'pointer'}
                    _hover={{
                      bg: 'myGray.100'
                    }}
                    onClick={handleItemClick}
                  >
                    <Flex alignItems={'center'} w={'1.25rem'} onClick={(e) => e.stopPropagation()}>
                      {!isFolder && <Checkbox isChecked={selected} onChange={handleItemClick} />}
                    </Flex>
                    <Avatar src={item.avatar} w="1.5rem" borderRadius={'sm'} />
                    <Box>{item.name}</Box>
                  </HStack>
                );
              })}
            </Box>
          </Flex>

          <Flex h={'100%'} p="4" flexDirection="column">
            <Box>
              {`${t('dashboard_mcp:has_chosen')}: `}
              {selectedList.length}
            </Box>
            <Flex flexDirection="column" mt="2" gap={1} overflow={'auto'} flex={'1 0 0'} h={0}>
              {selectedList.map((item) => {
                return (
                  <HStack
                    key={item.appId}
                    py={2}
                    px={3}
                    borderRadius={'md'}
                    cursor={'pointer'}
                    _hover={{
                      bg: 'myGray.100'
                    }}
                  >
                    <Avatar src={item.avatar} w="1.5rem" borderRadius={'sm'} />
                    <Box ml="2" flex={'1 0 0'}>
                      {item.toolName}
                    </Box>
                    <MyIcon
                      name="common/closeLight"
                      w="1rem"
                      cursor={'pointer'}
                      _hover={{
                        color: 'red.600'
                      }}
                      onClick={() => {
                        setSelectedList((state) => state.filter((app) => app.appId !== item.appId));
                      }}
                    />
                  </HStack>
                );
              })}
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button ml="4" h={'32px'} onClick={() => onConfirm(selectedList)}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

const EditMcpModal = ({
  editMcp,
  onClose,
  onSuccess
}: {
  editMcp: EditMcForm;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t } = useTranslation();
  const isEdit = !!editMcp.id;
  const {
    isOpen: isOpenSelectApp,
    onOpen: onOpenSelectApp,
    onClose: onCloseSelectApp
  } = useDisclosure();

  const { register, handleSubmit, control } = useForm({
    defaultValues: editMcp
  });

  const {
    fields: apps,
    replace: replaceSelectedApps,
    remove
  } = useFieldArray({
    control,
    name: 'apps'
  });

  const { runAsync: createMcp, loading: loadingCreate } = useRequest2(
    (data: EditMcForm) =>
      postCreateMcpServer({
        name: data.name,
        apps: data.apps.map((item) => ({
          appId: item.appId,
          toolName: item.toolName,
          appName: item.appName,
          description: item.description
        }))
      }),
    {
      manual: true,
      successToast: t('common:create_success'),
      onSuccess
    }
  );
  const { runAsync: updateMcp, loading: loadingUpdate } = useRequest2(
    (data: EditMcForm) =>
      putUpdateMcpServer({
        id: data.id!,
        name: data.name,
        apps: data.apps.map((item) => ({
          appId: item.appId,
          toolName: item.toolName,
          appName: item.appName,
          description: item.description
        }))
      }),
    {
      manual: true,
      successToast: t('common:update_success'),
      onSuccess
    }
  );
  const isConfirming = loadingCreate || loadingUpdate;

  return (
    <>
      <MyModal
        iconSrc="key"
        title={isEdit ? t('dashboard_mcp:edit_mcp') : t('dashboard_mcp:create_mcp')}
        w={'100%'}
        maxW={['90vw', '800px']}
        isOpen
        onClose={onClose}
      >
        <ModalBody>
          <Box>
            <FormLabel required mb={0.5}>
              {t('common:input_name')}
            </FormLabel>
            <Input {...register('name', { required: true })} bg={'myGray.50'} />
          </Box>
          <Box mt={6}>
            <Flex justifyContent={'space-between'} alignItems={'center'}>
              <FormLabel>{t('dashboard_mcp:apps')}</FormLabel>
              <Button variant={'whiteBase'} size={'sm'} onClick={onOpenSelectApp}>
                {t('dashboard_mcp:manage_app')}
              </Button>
            </Flex>
            <TableContainer mt={2} position={'relative'}>
              <Table>
                <Thead>
                  <Tr>
                    <Th>
                      {t('dashboard_mcp:tool_name')}
                      <QuestionTip label={t('dashboard_mcp:tool_name_tip')} />
                    </Th>
                    <Th>{t('dashboard_mcp:app_name')}</Th>
                    <Th>{t('dashboard_mcp:app_description')}</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody fontSize={'sm'}>
                  {apps.map((app, index) => {
                    return (
                      <Tr key={app.id} fontWeight={500} fontSize={'mini'} color={'myGray.900'}>
                        <Td>
                          <Input
                            {...register(`apps.${index}.toolName`, { required: true })}
                            placeholder={t('dashboard_mcp:tool_name_placeholder')}
                            bg={'myGray.50'}
                            w={'100%'}
                          />
                        </Td>
                        <Td>{app.appName}</Td>
                        <Td>
                          <Input
                            {...register(`apps.${index}.description`, { required: true })}
                            bg={'myGray.50'}
                            w={'100%'}
                          />
                        </Td>
                        <Td>
                          <Flex justifyContent={'flex-end'}>
                            <MyIconButton
                              icon="delete"
                              hoverColor={'red.600'}
                              onClick={() => remove(index)}
                              color={'myGray.600'}
                            />
                          </Flex>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
              {apps.length === 0 && <EmptyTip />}
            </TableContainer>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant={'whiteBase'} mr={4} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            isLoading={isConfirming}
            variant={'primary'}
            isDisabled={apps.length === 0}
            onClick={handleSubmit((data) => {
              if (isEdit) {
                return updateMcp(data);
              }
              return createMcp(data);
            })}
          >
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>

      {isOpenSelectApp && (
        <SelectAppModal
          selectedApps={apps}
          onClose={onCloseSelectApp}
          onConfirm={(e) => {
            replaceSelectedApps(
              e.map((item) => ({
                appId: item.appId,
                toolName: item.toolName,
                appName: item.appName,
                description: item.description
              }))
            );
            onCloseSelectApp();
          }}
        />
      )}
    </>
  );
};

export default EditMcpModal;
