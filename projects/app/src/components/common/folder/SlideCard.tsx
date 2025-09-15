import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useTranslation } from 'next-i18next';
import CollaboratorContextProvider, {
  type MemberManagerInputPropsType
} from '../../support/permission/MemberManager/context';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ResumeInherit from '@/components/support/permission/ResumeInheritText';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const FolderSlideCard = ({
  refreshDeps,
  name,
  intro,
  onEdit,
  onMove,
  deleteTip,
  onDelete,

  managePer,
  isInheritPermission,
  resumeInheritPermission,
  hasParent,
  refetchResource
}: {
  refreshDeps?: any[];
  name: string;
  intro?: string;
  onEdit: () => void;
  onMove: () => void;
  deleteTip: string;
  onDelete: () => void;

  managePer: MemberManagerInputPropsType;

  isInheritPermission?: boolean;
  resumeInheritPermission?: () => Promise<void>;
  hasParent?: boolean;
  refetchResource?: () => Promise<any>;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  return (
    <Box w={'13rem'}>
      <Box>
        <HStack>
          <MyIcon name={FolderIcon} w={'1.5rem'} />
          <Box
            color={'myGray.900'}
            overflow={'hidden'}
            textOverflow={'ellipsis'}
            whiteSpace={'nowrap'}
          >
            {name}
          </Box>
          <MyIcon
            name={'edit'}
            _hover={{ color: 'primary.600' }}
            w={'0.875rem'}
            cursor={'pointer'}
            onClick={onEdit}
          />
        </HStack>
        <Box mt={3} fontSize={'sm'} color={'myGray.500'} cursor={'pointer'} onClick={onEdit}>
          {intro || t('common:not_yet_introduced')}
        </Box>
      </Box>

      {managePer.permission.hasManagePer && (
        <>
          <MyDivider my={6} />

          <Box>
            <FormLabel>{t('common:Operation')}</FormLabel>

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
              {t('common:Move')}
            </Button>
            {managePer.permission.isOwner && (
              <PopoverConfirm
                Trigger={
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
                  >
                    {t('common:delete_folder')}
                  </Button>
                }
                type="delete"
                content={deleteTip}
                onConfirm={onDelete}
              />
            )}
          </Box>
        </>
      )}

      {feConfigs?.isPlus && (
        <>
          <MyDivider my={6} />

          <Box>
            {!isInheritPermission && (
              <Box mt={2}>
                <ResumeInherit onResume={() => resumeInheritPermission?.().then(refetchResource)} />
              </Box>
            )}
            <Box mt={6}>
              <CollaboratorContextProvider
                {...managePer}
                refreshDeps={refreshDeps}
                refetchResource={refetchResource}
                isInheritPermission={isInheritPermission}
                hasParent={hasParent}
              >
                {({ MemberListCard, onOpenManageModal }) => {
                  return (
                    <>
                      <Flex alignItems="center" justifyContent="space-between">
                        <Box fontSize={'sm'} color={'myGray.500'}>
                          {t('common:permission.Collaborator')}
                        </Box>
                        {managePer.permission.hasManagePer && (
                          <MyTooltip label={t('common:permission.Manage')}>
                            <MyIcon
                              w="1rem"
                              name="common/settingLight"
                              cursor={'pointer'}
                              _hover={{ color: 'primary.600' }}
                              onClick={onOpenManageModal}
                            />
                          </MyTooltip>
                        )}
                      </Flex>
                      <MemberListCard
                        mt={2}
                        tagStyle={{
                          type: 'fill',
                          colorSchema: 'white'
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
    </Box>
  );
};

export default FolderSlideCard;
