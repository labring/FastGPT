import { Box, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import SelectOneResource from '@/components/common/folder/SelectOneResource';
import type {
  GetResourceFolderListProps,
  GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { shadowLight } from '@fastgpt/web/styles/theme';

interface AppSelectWithAllProps {
  value: string;
  onSelect: (id: string) => void;
  showAllOption?: boolean;
}

const AppSelectWithAll = ({ value, onSelect, showAllOption = false }: AppSelectWithAllProps) => {
  const [currentApp, setCurrentApp] = useState<
    (GetResourceListItemResponse & { showAvatar?: boolean }) | null
  >(null);
  const { t } = useTranslation();

  const getAppList = useCallback(
    async ({ parentId }: GetResourceFolderListProps) => {
      const apps = await getMyApps({
        parentId,
        type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
      }).then((res) =>
        res
          .filter((item) => !item.hasInteractiveNode)
          .map<GetResourceListItemResponse>((item) => ({
            id: item._id,
            name: item.name,
            avatar: item.avatar,
            isFolder: item.type === AppTypeEnum.folder
          }))
      );

      // 如果是根目录且需要显示全部选项，则添加"全部应用"选项
      if (showAllOption && !parentId) {
        return [
          {
            id: '',
            name: t('dashboard_evaluation:all'),
            avatar: 'common/app',
            isFolder: false,
            showAvatar: false
          },
          ...apps
        ];
      }

      return apps;
    },
    [showAllOption, t]
  );

  // 当value为空字符串且showAllOption为true时，设置为"全部应用"
  useEffect(() => {
    if (showAllOption && value === '') {
      setCurrentApp({
        id: '',
        name: t('dashboard_evaluation:all'),
        avatar: 'common/app',
        isFolder: false,
        showAvatar: false
      });
    }
  }, [value, showAllOption, t]);

  return (
    <MyPopover
      placement={'bottom'}
      p={4}
      w={'250px'}
      trigger={'click'}
      hasArrow={false}
      closeOnBlur={true}
      Trigger={
        <Flex
          px={3}
          py={1.5}
          alignItems={'center'}
          borderRadius={'md'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          userSelect={'none'}
          cursor={'pointer'}
          bg={'white'}
          h={'36px'}
          w={'full'}
          _hover={{
            borderColor: 'primary.300'
          }}
          _focus={{
            boxShadow: shadowLight,
            borderColor: 'primary.600'
          }}
        >
          <Flex alignItems={'center'} w={'100%'} h={'100%'}>
            <Box color={'myGray.600'} fontSize={'sm'} whiteSpace={'nowrap'}>
              {t('dashboard_evaluation:app')}
            </Box>
            <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
            <Flex flex={'1 0 0'} alignItems={'center'} gap={2}>
              {currentApp && currentApp.showAvatar !== false && (
                <Avatar src={currentApp.avatar} w={4} borderRadius={'sm'} />
              )}
              <Box fontSize={'sm'} color={'myGray.900'} flex={1} noOfLines={1}>
                {currentApp?.name || t('common:Select_App')}
              </Box>
            </Flex>
            <MyIcon name={'core/chat/chevronDown'} color={'myGray.600'} w={4} h={4} />
          </Flex>
        </Flex>
      }
    >
      {({ onClose }) => (
        <Box minH={'200px'}>
          <SelectOneResource
            maxH={'60vh'}
            value={value}
            showRoot={false}
            onSelect={(item) => {
              if (!item) return;
              onSelect(item.id);
              setCurrentApp(item);
              onClose();
            }}
            server={getAppList}
          />
        </Box>
      )}
    </MyPopover>
  );
};

export default AppSelectWithAll;
