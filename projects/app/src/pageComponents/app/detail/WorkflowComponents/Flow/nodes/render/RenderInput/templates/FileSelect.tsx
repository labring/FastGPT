import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, HStack, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useField } from '@/web/core/workflow/editor/react/useField';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';

const FileSelectRender = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const field = useField(nodeId, item.key, 'input');
  const currentInput = field?.data.input ?? item;
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();

  const [urlInput, setUrlInput] = useState('');
  const values = useMemo(() => {
    if (Array.isArray(currentInput.value)) {
      return currentInput.value;
    }
    return [];
  }, [currentInput.value]);

  const maxSelectFiles = getFileAmountLimit({
    moduleMaxFileAmount: currentInput.maxFiles,
    defaultModuleMaxFileAmount: 5,
    teamMaxFileAmount: teamPlanStatus?.standard?.maxUploadFileCount,
    systemMaxFileAmount: feConfigs.uploadFileMaxAmount
  });
  const isMaxSelected = values.length >= maxSelectFiles;

  const handleAddUrl = useCallback(
    (value: string) => {
      if (!value.trim()) return;

      field?.setValue([value.trim(), ...values]);
      setUrlInput('');
    },
    [field, values]
  );
  const handleDeleteUrl = useCallback(
    (index: number) => {
      field?.setValue(values.filter((_, i) => i !== index));
    },
    [field, values]
  );

  return (
    <Box w={'500px'}>
      <Box w={'100%'}>
        <InputGroup display={'flex'} alignItems={'center'}>
          <MyIcon
            position={'absolute'}
            left={2.5}
            name="common/addLight"
            w={'1.2rem'}
            color={'primary.600'}
            zIndex={10}
          />
          <Input
            isDisabled={isMaxSelected}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onBlur={(e) => handleAddUrl(e.target.value)}
            border={'1.5px dashed'}
            borderColor={'myGray.250'}
            borderRadius={'md'}
            pl={8}
            py={1.5}
            placeholder={
              isMaxSelected ? t('file:reached_max_file_count') : t('chat:click_to_add_url')
            }
          />
        </InputGroup>
      </Box>
      {/* Render */}
      {values.length > 0 && (
        <>
          <MyDivider />
          <VStack>
            {values.map((url, index) => {
              const fileIcon = getFileIcon(url, 'common/link');
              return (
                <Box key={index} w={'full'}>
                  <HStack py={2} px={3} bg={'white'} borderRadius={'md'} border={'sm'}>
                    <MyAvatar src={fileIcon} w={'1.2rem'} />
                    <Box fontSize={'sm'} flex={'1 0 0'} title={url} className="textEllipsis">
                      {url}
                    </Box>
                    {/* Status icon */}
                    <MyIconButton
                      icon={'close'}
                      onClick={() => handleDeleteUrl(index)}
                      hoverColor="red.600"
                      hoverBg="red.50"
                    />
                  </HStack>
                </Box>
              );
            })}
          </VStack>
        </>
      )}
    </Box>
  );
};

export default React.memo(FileSelectRender);
