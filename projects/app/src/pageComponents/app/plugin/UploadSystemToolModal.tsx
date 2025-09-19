import FileSelectorBox, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDocPath } from '@/web/common/system/doc';
import { Box, Button, Flex, HStack, Link, ModalBody, ModalFooter, VStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { postS3UploadFile } from '@/web/common/file/api';
import { getPluginUploadPresignedURL, postConfirmUpload } from '@/web/core/app/api/plugin';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';

function UploadSystemToolModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
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
    },
    {
      manual: true,
      onSuccess: async () => {
        toast({
          title: t('common:import_success'),
          status: 'success'
        });

        setSelectFiles([]);
        onSuccess();
        onClose();
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
  return (
    <MyModal
      title={t('file:common.upload_system_tools')}
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
        <FileSelectorBox
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
        <Button
          onClick={handlePluginUpload}
          isDisabled={selectFiles.length === 0}
          isLoading={uploadLoading}
        >
          {t('common:comfirm_import')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default UploadSystemToolModal;
