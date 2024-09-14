import React, { DragEvent, useCallback, useMemo, useState } from 'react';
import { Textarea, Button, ModalBody, ModalFooter, Flex, Box } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { toast } = useToast();
  const { File, onOpen } = useSelectFile({
    fileType: 'json',
    multiple: false
  });
  const { isPc } = useSystem();
  const initData = useContextSelector(WorkflowContext, (v) => v.initData);
  const [isDragging, setIsDragging] = useState(false);
  const [value, setValue] = useState('');
  const { t } = useTranslation();

  const readJSONFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!file.name.endsWith('.json')) {
          toast({
            title: t('app:not_json_file'),
            status: 'error'
          });
          return;
        }
        if (e.target) {
          const res = JSON.parse(e.target.result as string);
          setValue(JSON.stringify(res, null, 2));
        }
      };
      reader.readAsText(file);
    },
    [t, toast]
  );

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      readJSONFile(file);
      setIsDragging(false);
    },
    [readJSONFile]
  );

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      readJSONFile(file);
    },
    [readJSONFile]
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/importLight"
      iconColor="primary.600"
      title={t('app:import_configs')}
      size={isPc ? 'lg' : 'md'}
    >
      <ModalBody>
        <File onSelect={onSelectFile} />
        {isDragging ? (
          <Flex
            align={'center'}
            justify={'center'}
            w={'31rem'}
            h={'17.5rem'}
            borderRadius={'md'}
            border={'1px dashed'}
            borderColor={'myGray.400'}
            onDragEnter={handleDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onDragLeave={handleDragLeave}
          >
            <Flex align={'center'} justify={'center'} flexDir={'column'} gap={'0.62rem'}>
              <MyIcon name={'configmap'} w={'1.5rem'} color={'myGray.500'} />
              <Box color={'myGray.600'} fontSize={'mini'}>
                {t('app:file_recover')}
              </Box>
            </Flex>
          </Flex>
        ) : (
          <Box w={['100%', '31rem']}>
            <Flex justify={'space-between'} align={'center'} pb={2}>
              <Box fontSize={'sm'} color={'myGray.900'} fontWeight={'500'}>
                {t('common:common.json_config')}
              </Box>
              <Button onClick={onOpen} variant={'whiteBase'} p={0}>
                <Flex px={'0.88rem'} py={'0.44rem'} color={'myGray.600'} fontSize={'mini'}>
                  <MyIcon name={'file/uploadFile'} w={'1rem'} mr={'0.38rem'} />
                  {t('common:common.upload_file')}
                </Flex>
              </Button>
            </Flex>
            <Box
              onDragEnter={handleDragEnter}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onDragLeave={handleDragLeave}
            >
              <Textarea
                bg={'myGray.50'}
                border={'1px solid'}
                borderRadius={'md'}
                borderColor={'myGray.200'}
                value={value}
                placeholder={
                  isPc
                    ? t('app:paste_config') + '\n' + t('app:or_drag_JSON')
                    : t('app:paste_config')
                }
                rows={16}
                onChange={(e) => setValue(e.target.value)}
              />
            </Box>
          </Box>
        )}
      </ModalBody>
      <ModalFooter justifyItems={'flex-end'}>
        <Button
          px={5}
          py={2}
          onClick={async () => {
            if (!value) {
              return onClose();
            }
            try {
              const data = JSON.parse(value);
              await initData(data);
              toast({
                title: t('app:import_configs_success'),
                status: 'success'
              });
              onClose();
            } catch (error) {
              toast({
                title: t('app:import_configs_failed')
              });
            }
          }}
          fontWeight={'500'}
        >
          {t('common:common.Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ImportSettings);
