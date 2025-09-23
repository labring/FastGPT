import { Box, Button, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useTranslation } from 'next-i18next';
import { AppLogKeysEnumMap } from '@fastgpt/global/core/app/logs/constants';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React from 'react';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import type { SetState } from 'ahooks/lib/createUseStorageState';

const LogKeysConfigPopover = ({
  logKeysList,
  setLogKeysList
}: {
  logKeysList: AppLogKeysType[];
  setLogKeysList: (value: SetState<AppLogKeysType[]>) => void;
}) => {
  const { t } = useTranslation();
  return (
    <MyPopover
      placement="bottom-end"
      w={'300px'}
      closeOnBlur={true}
      trigger="click"
      Trigger={
        <Button
          size={'md'}
          variant={'whiteBase'}
          leftIcon={<MyIcon name={'common/setting'} w={'18px'} />}
        >
          {t('app:logs_key_config')}
        </Button>
      }
    >
      {({ onClose }) => {
        return (
          <Box p={4} overflowY={'auto'} maxH={['300px', '500px']}>
            <DndDrag<AppLogKeysType>
              onDragEndCb={setLogKeysList}
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
                          {index !== logKeysList.length - 1 && <Box h={'1px'} bg={'myGray.200'} />}
                        </>
                      )}
                    </Draggable>
                  ))}
                </Box>
              )}
            </DndDrag>
          </Box>
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
  item: AppLogKeysType;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  logKeys: AppLogKeysType[];
  setLogKeys: (logKeys: AppLogKeysType[]) => void;
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
