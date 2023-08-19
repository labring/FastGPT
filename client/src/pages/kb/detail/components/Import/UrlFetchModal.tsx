import React, { useRef } from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@/components/MyModal';
import { Box, Button, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import type { FetchResultItem } from '@/types/plugin';
import { useRequest } from '@/hooks/useRequest';
import { fetchUrls } from '@/api/plugins/common';

const UrlFetchModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (e: FetchResultItem[]) => void;
}) => {
  const { t } = useTranslation();
  const Dom = useRef<HTMLTextAreaElement>(null);

  const { mutate, isLoading } = useRequest({
    mutationFn: async () => {
      const val = Dom.current?.value || '';
      const urls = val.split('\n').filter((e) => e);
      const res = await fetchUrls(urls);

      onSuccess(res);
      onClose();
    },
    errorToast: '获取链接失败'
  });

  return (
    <MyModal
      title={
        <>
          <Box>{t('file.Fetch Url')}</Box>
          <Box fontWeight={'normal'} fontSize={'sm'} color={'myGray.500'} mt={1}>
            目前仅支持读取静态链接，请注意检查结果
          </Box>
        </>
      }
      top={'15vh'}
      isOpen
      onClose={onClose}
      w={'600px'}
    >
      <ModalBody>
        <Textarea
          ref={Dom}
          rows={12}
          whiteSpace={'nowrap'}
          resize={'both'}
          placeholder={'最多10个链接，每行一个。'}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'base'} mr={4} onClick={onClose}>
          取消
        </Button>
        <Button isLoading={isLoading} onClick={mutate}>
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UrlFetchModal;
