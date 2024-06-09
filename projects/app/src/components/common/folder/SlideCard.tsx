import { Box, Button, HStack } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

const FolderSlideCard = ({
  name,
  intro,
  onEdit,
  onMove,
  deleteTip,
  onDelete
}: {
  name: string;
  intro?: string;
  onEdit: () => void;
  onMove: () => void;
  deleteTip: string;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();

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
      </Box>

      <ConfirmModal />
    </Box>
  );
};

export default FolderSlideCard;
