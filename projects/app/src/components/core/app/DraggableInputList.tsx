import React from 'react';
import { Box, Button, Flex, Input, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import DndDrag, {
  Draggable,
  getDraggableItemProps,
  type DraggableProvided,
  type DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import ResizeTextarea from 'react-textarea-autosize';

export type DraggableInputListItemType = {
  key: string;
  value: string;
};

type DraggableInputListProps<T extends DraggableInputListItemType> = {
  items: T[];
  zoom?: number;
  placeholder?: string;
  addText: string;
  /** 输入框最大字符数，超出后无法继续输入 */
  maxLength?: number;
  /** 改用自动撑高的多行文本框，长文本会在框内换行而不是横向溢出 */
  multiline?: boolean;
  onDragEnd: (items: T[]) => void;
  onChange: (key: string, value: string) => void;
  onAdd: () => void;
  onDelete: (key: string) => void;
  renderRight?: (item: T, snapshot: DraggableStateSnapshot) => React.ReactNode;
};

/**
 * 渲染可排序的文本输入列表，统一交互节点选项和预设问题的拖拽规则。
 * 少于 2 项时禁用拖拽，只保留灰色手柄用于占位，避免单项误触发排序状态。
 */
function DraggableInputList<T extends DraggableInputListItemType>({
  items,
  zoom,
  placeholder,
  addText,
  maxLength,
  multiline,
  onDragEnd,
  onChange,
  onAdd,
  onDelete,
  renderRight
}: DraggableInputListProps<T>) {
  const canDrag = items.length > 1;

  return (
    <Box>
      {/* 关闭 DndDrag 在列表底部追加的整行空白占位，改用 rbd 原生 placeholder 精确占位 */}
      <DndDrag<T>
        dataList={items}
        zoom={zoom}
        onDragEndCb={onDragEnd}
        renderInnerPlaceholder={false}
        renderClone={(provided, snapshot, rubric) => (
          <DraggableInputItem
            provided={provided}
            snapshot={snapshot}
            item={items[rubric.source.index]}
            canDrag={canDrag}
            placeholder={placeholder}
            maxLength={maxLength}
            multiline={multiline}
            onChange={onChange}
            onDelete={onDelete}
            renderRight={renderRight}
          />
        )}
      >
        {({ provided }) => (
          <Box ref={provided.innerRef} {...provided.droppableProps}>
            {items.map((item, index) => (
              <Draggable
                key={item.key}
                draggableId={item.key}
                index={index}
                isDragDisabled={!canDrag}
              >
                {(provided, snapshot) => (
                  <DraggableInputItem
                    provided={provided}
                    snapshot={snapshot}
                    item={item}
                    canDrag={canDrag}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    multiline={multiline}
                    onChange={onChange}
                    onDelete={onDelete}
                    renderRight={renderRight}
                  />
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </Box>
        )}
      </DndDrag>
      <Button
        variant={'transparentBase'}
        h={8}
        minH={8}
        px={2}
        py={1.5}
        color={'myGray.600'}
        fontSize={'sm'}
        fontWeight={'medium'}
        lineHeight={5}
        letterSpacing={0}
        leftIcon={<MyIcon name={'common/addLight'} w={'18px'} color={'myGray.600'} />}
        onClick={onAdd}
      >
        {addText}
      </Button>
    </Box>
  );
}

export default React.memo(DraggableInputList) as <T extends DraggableInputListItemType>(
  props: DraggableInputListProps<T>
) => React.ReactElement;

function DraggableInputItem<T extends DraggableInputListItemType>({
  provided,
  snapshot,
  item,
  canDrag,
  placeholder,
  maxLength,
  multiline,
  onChange,
  onDelete,
  renderRight
}: {
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  item: T;
  canDrag: boolean;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  onChange: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  renderRight?: (item: T, snapshot: DraggableStateSnapshot) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const inputStyles = {
    value: item.value,
    w: '100%',
    minW: 0,
    bg: 'white',
    border: 'sm',
    borderRadius: 'md',
    px: 2.5,
    fontSize: 'sm',
    lineHeight: 5,
    color: 'myGray.900',
    letterSpacing: 0,
    placeholder,
    _placeholder: { color: 'myGray.500' },
    _hover: { borderColor: 'myGray.200' },
    _focus: {
      borderColor: 'primary.600',
      boxShadow: 'none'
    },
    maxLength
  } as const;
  const { draggableItemProps, dragHandleProps } = getDraggableItemProps(provided, snapshot);

  return (
    <Flex {...draggableItemProps} alignItems={'center'} gap={2} mb={2}>
      <Flex
        {...dragHandleProps}
        w={4}
        h={6}
        alignItems={'center'}
        justifyContent={'center'}
        cursor={canDrag ? 'grab' : 'not-allowed'}
      >
        <MyIcon name={'drag'} w={'14px'} color={'myGray.400'} />
      </Flex>
      <Box position={'relative'} flex={'1 0 0'} minW={0}>
        {multiline ? (
          <Textarea
            as={ResizeTextarea}
            className="nowheel"
            {...inputStyles}
            rows={1}
            minH={10}
            py={'9px'}
            resize={'none'}
            overflow={'hidden'}
            // 连续无空格的长串也要在框内换行，而不是横向撑出去
            sx={{ overflowWrap: 'anywhere' }}
            onChange={(e) => onChange(item.key, e.target.value)}
          />
        ) : (
          <Input {...inputStyles} h={10} onChange={(e) => onChange(item.key, e.target.value)} />
        )}
        {renderRight?.(item, snapshot)}
      </Box>
      <Flex w={4} alignItems={'center'} justifyContent={'center'}>
        <MyTooltip label={t('common:Delete')}>
          <MyIcon
            name={'circleMinus'}
            w={4}
            color={'myGray.500'}
            cursor={'pointer'}
            _hover={{ color: 'red.600' }}
            onClick={() => onDelete(item.key)}
          />
        </MyTooltip>
      </Flex>
    </Flex>
  );
}
