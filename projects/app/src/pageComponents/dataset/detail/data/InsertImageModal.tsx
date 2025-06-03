import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import MyImage from '@/components/MyImage';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { insertImagesToCollection } from '@/web/core/dataset/image/api';

const fileType = '.jpg, .jpeg, .png';
type MySelectFileItemType = SelectFileItemType & { previewUrl: string };

const InsertImageModal = ({
  collectionId,
  onClose
}: {
  collectionId: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const [selectFiles, setSelectFiles] = useState<MySelectFileItemType[]>([]);
  const onSelectFiles = (files: SelectFileItemType[]) => {
    setSelectFiles((pre) => {
      const formatFiles = Array.from(files).map<MySelectFileItemType>((item) => {
        const previewUrl = URL.createObjectURL(item.file);

        return {
          ...item,
          previewUrl
        };
      });

      return [...pre, ...formatFiles];
    });
  };

  const onRemoveFile = (index: number) => {
    setSelectFiles((prev) => {
      return prev.filter((_, i) => i !== index);
    });
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const { runAsync: onInsertImages, loading: inserting } = useRequest2(
    async () => {
      return await insertImagesToCollection({
        collectionId,
        files: selectFiles.map((item) => item.file!).filter(Boolean),
        onUploadProgress: setUploadProgress
      });
    },
    {
      manual: true,
      successToast: t('dataset:insert_images_success'),
      onSuccess() {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isOpen
      iconSrc="core/dataset/imageFill"
      title={t('dataset:insert_images')}
      maxW={['90vw', '605px']}
    >
      <ModalBody userSelect={'none'}>
        <Box>
          <FileSelector
            fileType={fileType}
            selectFiles={selectFiles}
            setSelectFiles={onSelectFiles}
          />
        </Box>
        {selectFiles.length > 0 && (
          <Flex flexWrap={'wrap'} gap={3} mt={3} width="100%">
            {selectFiles.map((file, index) => (
              <Box
                key={index}
                w="100px"
                h={'100px'}
                position={'relative'}
                _hover={{
                  '.close-icon': { display: 'block' }
                }}
                bg={'myGray.50'}
                borderRadius={'md'}
                border={'base'}
                borderStyle={'dashed'}
                p={1}
              >
                <MyImage src={file.previewUrl} w="100%" h={'100%'} objectFit={'contain'} />
                <MyIcon
                  name={'closeSolid'}
                  w={'1rem'}
                  h={'1rem'}
                  color={'myGray.700'}
                  cursor={'pointer'}
                  _hover={{ color: 'red.500' }}
                  position={'absolute'}
                  rounded={'full'}
                  bg={'white'}
                  right={'-8px'}
                  top={'-2px'}
                  onClick={() => onRemoveFile(index)}
                  className="close-icon"
                  display={['', 'none']}
                  zIndex={10}
                />
              </Box>
            ))}
          </Flex>
        )}
      </ModalBody>
      <ModalFooter>
        <Button isDisabled={inserting} variant={'whitePrimary'} mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          isDisabled={selectFiles.length === 0 || inserting}
          variant={'primary'}
          onClick={onInsertImages}
        >
          {inserting ? (
            <Box>{t('dataset:uploading_progress', { num: uploadProgress })}</Box>
          ) : (
            <Box>{t('common:Confirm')}</Box>
          )}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default InsertImageModal;
