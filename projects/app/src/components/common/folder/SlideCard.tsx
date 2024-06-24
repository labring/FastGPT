import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import DefaultPermissionList from '@/components/support/permission/DefaultPerList';
import CollaboratorContextProvider, {
  MemberManagerInputPropsType
} from '../../support/permission/MemberManager/context';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const FolderSlideCard = ({
  refreshDeps,
  name,
  intro,
  onEdit,
  onMove,
  deleteTip,
  onDelete,

  defaultPer,
  managePer
}: {
  refreshDeps?: any[];
  name: string;
  intro?: string;
  onEdit: () => void;
  onMove: () => void;
  deleteTip: string;
  onDelete: () => void;

  defaultPer: {
    value: PermissionValueType;
    defaultValue: PermissionValueType;
    onChange: (v: PermissionValueType) => Promise<any>;
  };
  managePer: MemberManagerInputPropsType;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: deleteTip
  });

  return (
    <Box w={'13rem'}>
      <Box>
        <HStack>
          <MyIcon name={FolderIcon} w={'1.5rem'} />
          <Box color={'myGray.900'}>{name}</Box>
          <MyIcon
            name={'edit'}
            _hover={{ color: 'primary.600' }}
            w={'0.875rem'}
            cursor={'pointer'}
            onClick={onEdit}
          />
        </HStack>
        <Box mt={3} fontSize={'sm'} color={'myGray.500'} cursor={'pointer'} onClick={onEdit}>
          {intro || '暂无介绍'}
        </Box>
      </Box>

      {managePer.permission.hasManagePer && (
        <>
          <MyDivider my={6} />

          <Box>
            <FormLabel>{t('common.Operation')}</FormLabel>

            <Button
              variant={'transparentBase'}
              pl={1}
              leftIcon={<MyIcon name={'common/file/move'} w={'1rem'} />}
              transform={'none !important'}
              w={'100%'}
              justifyContent={'flex-start'}
              size={'sm'}
              fontSize={'mini'}
              mt={4}
              onClick={onMove}
            >
              {t('common.Move')}
            </Button>
            {managePer.permission.isOwner && (
              <Button
                variant={'transparentDanger'}
                pl={1}
                leftIcon={<MyIcon name={'delete'} w={'1rem'} />}
                transform={'none !important'}
                w={'100%'}
                justifyContent={'flex-start'}
                size={'sm'}
                fontSize={'mini'}
                mt={3}
                onClick={() => {
                  openConfirm(onDelete)();
                }}
              >
                {t('common.Delete folder')}
              </Button>
            )}
          </Box>
        </>
      )}

      {feConfigs?.isPlus && (
        <>
          <MyDivider my={6} />

          <Box>
            <FormLabel>{t('support.permission.Permission')}</FormLabel>

            {managePer.permission.hasManagePer && (
              <Box mt={5}>
                <Box fontSize={'sm'} color={'myGray.500'}>
                  {t('permission.Default permission')}
                </Box>
                <DefaultPermissionList
                  mt="1"
                  per={defaultPer.value}
                  defaultPer={defaultPer.defaultValue}
                  onChange={defaultPer.onChange}
                />
              </Box>
            )}
            <Box mt={6}>
              <CollaboratorContextProvider {...managePer} refreshDeps={refreshDeps}>
                {({ MemberListCard, onOpenManageModal, onOpenAddMember }) => {
                  return (
                    <>
                      <Flex alignItems="center" justifyContent="space-between">
                        <Box fontSize={'sm'} color={'myGray.500'}>
                          {t('permission.Collaborator')}
                        </Box>
                        {managePer.permission.hasManagePer && (
                          <HStack spacing={3}>
                            <MyTooltip label={t('permission.Manage')}>
                              <MyIcon
                                w="1rem"
                                name="common/settingLight"
                                cursor={'pointer'}
                                _hover={{ color: 'primary.600' }}
                                onClick={onOpenManageModal}
                              />
                            </MyTooltip>
                            <MyTooltip label={t('common.Add')}>
                              <MyIcon
                                w="1rem"
                                name="support/permission/collaborator"
                                cursor={'pointer'}
                                _hover={{ color: 'primary.600' }}
                                onClick={onOpenAddMember}
                              />
                            </MyTooltip>
                          </HStack>
                        )}
                      </Flex>
                      <MemberListCard
                        mt={2}
                        tagStyle={{
                          type: 'borderSolid',
                          colorSchema: 'gray'
                        }}
                      />
                    </>
                  );
                }}
              </CollaboratorContextProvider>
            </Box>
          </Box>
        </>
      )}

      <ConfirmModal />
    </Box>
  );
};

export default FolderSlideCard;
