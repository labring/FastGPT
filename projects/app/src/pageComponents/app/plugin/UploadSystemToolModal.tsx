import FileSelectorBox, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getDocPath } from '@/web/common/system/doc';
import { Box, Button, Flex, HStack, Link, ModalBody, ModalFooter, VStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { postS3UploadFile } from '@/web/common/file/api';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { pluginClient } from '@/web/core/app/api/plugin';

function UploadSystemToolModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);

  const { runAsync: handlePluginUpload, loading: uploadLoading } = useRequest2(
    async () => {
      const file = selectFiles[0];

      const presignedData = await pluginClient.tool.upload.getUploadURL({
        query: {
          filename: file.name
        }
      });
      if (presignedData.status !== 200) {
        return Promise.reject(presignedData.body);
      }

      const formData = new FormData();
      Object.entries(presignedData.body.formData).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file.file);

      await postS3UploadFile(presignedData.body.postURL, formData);

      await pluginClient.tool.upload.confirmUpload({
        body: {
          objectName: presignedData.body.objectName
        }
      });
    },
    {
      manual: true,
      successToast: t('common:import_success'),
      onSuccess: async () => {
        onSuccess();
        onClose();
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
          maxSize="50MB"
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
