import React, { DragEvent, useCallback, useState } from 'react';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystem } from '../../../../hooks/useSystem';
import MyIcon from '../../Icon';
import { useToast } from '../../../../hooks/useToast';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  File?: ({ onSelect }: { onSelect: (e: File[], sign?: any) => void }) => React.JSX.Element;
  onOpen?: () => void;
};

const DragEditor = ({ value, onChange, placeholder, rows = 16, File, onOpen }: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

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
          onChange(JSON.stringify(res, null, 2));
        }
      };
      reader.readAsText(file);
    },
    [t, toast]
  );

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      readJSONFile(file);
    },
    [readJSONFile]
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      console.log(file);
      readJSONFile(file);
      setIsDragging(false);
    },
    [readJSONFile]
  );

  return (
    <>
      <Box w={['100%', '31rem']}>
        {isDragging ? (
          <Flex
            align={'center'}
            justify={'center'}
            w={'full'}
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
          <Box>
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
                  placeholder ||
                  (isPc
                    ? t('app:paste_config') + '\n' + t('app:or_drag_JSON')
                    : t('app:paste_config'))
                }
                rows={rows}
                onChange={(e) => onChange(e.target.value)}
              />
            </Box>
          </Box>
        )}
      </Box>
      {File && <File onSelect={onSelectFile} />}
    </>
  );
};

export default React.memo(DragEditor);
