import React from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@/components/MyModal';
import { Box, Button, Input, Link, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import { useRequest } from '@/web/common/hooks/useRequest';
import { postFetchUrls } from '@/web/common/tools/api';
import { useForm } from 'react-hook-form';
import { UrlFetchResponse } from '@fastgpt/global/common/file/api.d';
import { getDocPath } from '@/web/common/system/doc';
import { feConfigs } from '@/web/common/system/staticData';

const UrlFetchModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (e: UrlFetchResponse) => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      urls: '',
      selector: ''
    }
  });

  const { mutate, isLoading } = useRequest({
    mutationFn: async ({ urls, selector }: { urls: string; selector: string }) => {
      const urlList = urls.split('\n').filter((e) => e);
      const res = await postFetchUrls({
        urlList,
        selector
      });

      onSuccess(res);
      onClose();
    },
    errorToast: t('core.dataset.import.Fetch Error')
  });

  return (
    <MyModal
      iconSrc="/imgs/modal/network.svg"
      title={
        <Box>
          <Box>{t('file.Fetch Url')}</Box>
          <Box fontWeight={'normal'} fontSize={'sm'} color={'myGray.500'}>
            {t('core.dataset.import.Fetch url tip')}
          </Box>
        </Box>
      }
      top={'15vh'}
      isOpen
      onClose={onClose}
      w={'600px'}
    >
      <ModalBody>
        <Box>
          <Box fontWeight={'bold'}>{t('core.dataset.import.Fetch Url')}</Box>
          <Textarea
            {...register('urls', {
              required: true
            })}
            rows={11}
            whiteSpace={'nowrap'}
            resize={'both'}
            placeholder={t('core.dataset.import.Fetch url placeholder')}
          />
        </Box>
        <Box mt={4}>
          <Box fontWeight={'bold'}>
            {t('core.dataset.website.Selector')}({t('common.choosable')})
          </Box>
          {feConfigs?.docUrl && (
            <Link href={getDocPath('/docs/course/websync/#选择器如何使用')} target="_blank">
              {t('core.dataset.website.Selector Course')}
            </Link>
          )}
          <Input {...register('selector')} placeholder="body .content #document" />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => mutate(data))}>
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default UrlFetchModal;
