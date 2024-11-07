import { useCopyData } from '@/web/common/hooks/useCopyData';
import { Box, Image, Flex, ModalBody } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';

export type ShowShareLinkModalProps = {
  shareLink: string;
  onClose: () => void;
  img: string;
};

function ShowShareLinkModal({ shareLink, onClose, img }: ShowShareLinkModalProps) {
  const { copyData } = useCopyData();
  const { t } = useTranslation();

  return (
    <MyModal onClose={onClose} title={t('publish:show_share_link_modal_title')}>
      <ModalBody>
        <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'}>
          <Flex
            p={3}
            bg={'myWhite.500'}
            border="base"
            borderTopLeftRadius={'md'}
            borderTopRightRadius={'md'}
          >
            <Box flex={1}>{t('publish:copy_link_hint')}</Box>
            <MyIcon
              name={'copy'}
              w={'16px'}
              color={'myGray.600'}
              cursor={'pointer'}
              _hover={{ color: 'primary.500' }}
              onClick={() => copyData(shareLink)}
            />
          </Flex>
          <Box whiteSpace={'pre'} p={3} overflowX={'auto'}>
            {shareLink}
          </Box>
        </Box>
        <Box mt="4" borderRadius="0.5rem" border="1px" borderStyle="solid" borderColor="myGray.200">
          <MyImage src={img} borderRadius="0.5rem" alt="" />
        </Box>
      </ModalBody>
    </MyModal>
  );
}

export default ShowShareLinkModal;
