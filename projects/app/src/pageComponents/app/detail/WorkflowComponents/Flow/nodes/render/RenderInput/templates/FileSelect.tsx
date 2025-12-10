import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, HStack, Input, InputGroup, useDisclosure, VStack } from '@chakra-ui/react';
import type { SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import SelectAppModal from '../../../../SelectAppModal';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppDetailById } from '@/web/core/app/api';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import IconButton from '@/pageComponents/account/team/OrgManage/IconButton';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const FileSelectRender = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const [urlInput, setUrlInput] = useState('');
  const values = useMemo(() => {
    if (Array.isArray(item.value)) {
      return item.value;
    }
    return [];
  }, [item.value]);
  const maxSelectFiles = item.maxFiles || 10;
  const isMaxSelected = values.length >= maxSelectFiles;

  const handleAddUrl = useCallback(
    (value: string) => {
      if (!value.trim()) return;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: [value.trim(), ...values]
        }
      });
      setUrlInput('');
    },
    [item, nodeId, onChangeNode, values]
  );
  const handleDeleteUrl = useCallback(
    (index: number) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: values.filter((_, i) => i !== index)
        }
      });
    },
    [item, nodeId, onChangeNode, values]
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
