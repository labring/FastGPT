import { Box, Button, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useTranslation } from 'next-i18next';
import type { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';
import { AppLogKeysEnumMap } from '@fastgpt/global/core/app/logs/constants';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React, { useState } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { type updateLogKeysBody } from '@/pages/api/core/app/logs/updateLogKeys';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { updateLogKeys } from '@/web/core/app/api/log';
import type { getLogKeysResponse } from '@/pages/api/core/app/logs/getLogKeys';
import { i18nT } from '@fastgpt/web/i18n/utils';

const ConfirmingTypeMap = {
  personal: i18nT('app:logs_saved_as_personal'),
  restore: i18nT('app:logs_restore_to_team'),
  team: i18nT('app:logs_saved_as_team')
};

const LogKeysConfigPopover = ({
  children,
  logKeysList,
  setLogKeysList,
  fetchLogKeys
}: {
  children: React.ReactElement;
  logKeysList: {
    key: AppLogKeysEnum;
    enable: boolean;
  }[];
  setLogKeysList: (logKeysList: { key: AppLogKeysEnum; enable: boolean }[] | undefined) => void;
  fetchLogKeys: () => Promise<getLogKeysResponse>;
}) => {
  const { t } = useTranslation();
  const appId = useContextSelector(AppContext, (v) => v.appId);

  const [confirmingType, setConfirmingType] = useState<'personal' | 'team' | 'restore' | null>(
    null
  );
  const [originalLogKeys, setOriginalLogKeys] = useState<
    { key: AppLogKeysEnum; enable: boolean }[]
  >([]);

  const hasChanges = JSON.stringify(originalLogKeys) !== JSON.stringify(logKeysList);

  const { runAsync: updateList, loading: updateLoading } = useRequest2(
    async (data: updateLogKeysBody) => {
      await updateLogKeys(data);
    },
    {
      manual: true,
      onSuccess: async () => {
        await fetchLogKeys();
      }
    }
  );

  const handlePopoverOpen = () => {
    setOriginalLogKeys(JSON.parse(JSON.stringify(logKeysList)));
    setConfirmingType(null);
  };

  const TriggerWithHandler = React.cloneElement(children, {
    onClick: (e: any) => {
      handlePopoverOpen();
      if (children.props.onClick) {
        children.props.onClick(e);
      }
    }
  });

  return (
    <MyPopover
      placement="bottom-end"
      w={confirmingType ? '300px' : '400px'}
      trigger="click"
      Trigger={TriggerWithHandler}
      closeOnBlur={false}
    >
      {({ onClose }) => {
        return (
          <>
            {!confirmingType ? (
              <Box p={4}>
                <DndDrag<{ key: AppLogKeysEnum; enable: boolean }>
                  onDragEndCb={(list) => {
                    setLogKeysList(list);
                  }}
                  dataList={logKeysList}
                  renderClone={(provided, snapshot, rubric) => (
                    <DragItem
                      item={logKeysList[rubric.source.index]}
                      provided={provided}
                      snapshot={snapshot}
                      logKeys={logKeysList}
                      setLogKeys={setLogKeysList}
                    />
                  )}
                >
                  {({ provided }) => (
                    <Box {...provided.droppableProps} ref={provided.innerRef}>
                      {logKeysList.map((item, index) => (
                        <Draggable key={item.key} draggableId={item.key} index={index}>
                          {(provided, snapshot) => (
                            <>
                              <DragItem
                                item={item}
                                provided={provided}
                                snapshot={snapshot}
                                logKeys={logKeysList}
                                setLogKeys={setLogKeysList}
                              />
                              {index !== logKeysList.length - 1 && (
                                <Box h={'1px'} bg={'myGray.200'} />
                              )}
                            </>
                          )}
                        </Draggable>
                      ))}
                    </Box>
                  )}
                </DndDrag>

                <Flex gap={2} justifyContent={'flex-end'}>
                  <Button
                    onClick={() => {
                      setLogKeysList(originalLogKeys);
                      onClose();
                    }}
                    variant={'outline'}
                    size={'sm'}
                  >
                    {t('common:Close')}
                  </Button>
                  <Button
                    size={'sm'}
                    isLoading={updateLoading}
                    onClick={async () => {
                      if (!hasChanges) return onClose();
                      setConfirmingType('personal');
                    }}
                  >
                    {t('common:Save')}
                  </Button>
                </Flex>
              </Box>
            ) : (
              <Box p={4}>
                {Object.entries(ConfirmingTypeMap).map(([key, title]) => (
                  <Flex
                    key={key}
                    p={2}
                    cursor={'pointer'}
                    rounded={'8px'}
                    alignItems={'center'}
                    _hover={{ color: 'primary.600', bg: 'myGray.50' }}
                    onClick={() => {
                      setConfirmingType(key as 'personal' | 'restore' | 'team');
                    }}
                  >
                    {confirmingType === key && (
                      <MyIcon
                        name={'check'}
                        borderRadius={'md'}
                        w={4}
                        mr={1}
                        color={'primary.600'}
                        _hover={{ bg: 'myGray.50' }}
                      />
                    )}
                    <Box
                      fontSize={'sm'}
                      color={confirmingType === key ? 'primary.600' : 'myGray.700'}
                    >
                      {t(title)}
                    </Box>
                  </Flex>
                ))}

                <Flex gap={2} justifyContent={'flex-end'}>
                  <Button
                    onClick={() => {
                      setLogKeysList(JSON.parse(JSON.stringify(originalLogKeys)));
                      onClose();
                    }}
                    variant={'outline'}
                    size={'sm'}
                  >
                    {t('common:Cancel')}
                  </Button>
                  <Button
                    size={'sm'}
                    isLoading={updateLoading}
                    onClick={async () => {
                      if (confirmingType === 'restore') {
                        setLogKeysList(undefined);
                      } else if (confirmingType === 'team') {
                        await updateList({
                          appId,
                          logKeys: logKeysList
                        });
                      }
                      onClose();
                    }}
                  >
                    {t('common:Confirm')}
                  </Button>
                </Flex>
              </Box>
            )}
          </>
        );
      }}
    </MyPopover>
  );
};

export default LogKeysConfigPopover;

const DragItem = ({
  item,
  provided,
  snapshot,
  logKeys,
  setLogKeys
}: {
  item: { key: AppLogKeysEnum; enable: boolean };
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  logKeys: { key: AppLogKeysEnum; enable: boolean }[];
  setLogKeys: (logKeys: { key: AppLogKeysEnum; enable: boolean }[]) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
      alignItems={'center'}
      py={1}
    >
      <Box {...provided.dragHandleProps}>
        <MyIcon
          name={'drag'}
          p={2}
          borderRadius={'md'}
          _hover={{ color: 'primary.600' }}
          w={'12px'}
          color={'myGray.600'}
        />
      </Box>
      <Box fontSize={'14px'} color={'myGray.900'}>
        {t(AppLogKeysEnumMap[item.key])}
      </Box>
      <Box flex={1} />
      {item.enable ? (
        <MyIcon
          name={'visible'}
          borderRadius={'md'}
          w={4}
          p={1}
          cursor={'pointer'}
          color={'primary.600'}
          _hover={{ bg: 'myGray.50' }}
          onClick={() => {
            setLogKeys(
              logKeys.map((key) => (key.key === item.key ? { ...key, enable: false } : key))
            );
          }}
        />
      ) : (
        <MyIcon
          name={'invisible'}
          borderRadius={'md'}
          w={4}
          p={1}
          cursor={'pointer'}
          _hover={{ bg: 'myGray.50' }}
          onClick={() => {
            setLogKeys(
              logKeys.map((key) => (key.key === item.key ? { ...key, enable: true } : key))
            );
          }}
        />
      )}
    </Flex>
  );
};
