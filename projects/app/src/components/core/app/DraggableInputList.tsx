import React from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  Textarea,
  type InputProps,
  type TextareaProps
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import DndDrag, {
  Draggable,
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
  getInputProps?: (item: T) => InputProps;
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
  renderRight,
  getInputProps
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
            getInputProps={getInputProps}
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
                    getInputProps={getInputProps}
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
        h={'32px'}
        minH={'32px'}
        px={'8px'}
        py={'6px'}
        color={'#485264'}
        fontFamily={'PingFang SC'}
        fontSize={'14px'}
        fontWeight={500}
        lineHeight={'20px'}
        letterSpacing={'0.1px'}
        leftIcon={<MyIcon name={'common/addLight'} w={'18px'} color={'#485264'} />}
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
  renderRight,
  getInputProps
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
  getInputProps?: (item: T) => InputProps;
}) {
  const { t } = useTranslation();
  const inputProps = getInputProps?.(item) ?? {};

  /* eslint-disable react-hooks/refs -- @hello-pangea/dnd passes refs via render props */
  return (
    <Flex
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
      alignItems={'center'}
      gap={'8px'}
      mb={'8px'}
    >
      <Flex
        {...provided.dragHandleProps}
        w={'16px'}
        h={'24px'}
        alignItems={'center'}
        justifyContent={'center'}
        cursor={canDrag ? 'grab' : 'not-allowed'}
      >
        <MyIcon name={'drag'} w={'14px'} color={canDrag ? '#8A95A7' : 'myGray.400'} />
      </Flex>
      <Box position={'relative'} flex={'1 0 0'} minW={0}>
        {multiline ? (
          <Textarea
            as={ResizeTextarea}
            className="nowheel"
            value={item.value}
            w={'100%'}
            minW={0}
            rows={1}
            minH={'40px'}
            py={'9px'}
            px={'10px'}
            bg={'white'}
            border={'1px solid'}
            borderColor={'#E8EBF0'}
            borderRadius={'8px'}
            fontFamily={'PingFang SC'}
            fontSize={'14px'}
            lineHeight={'20px'}
            color={'#111824'}
            letterSpacing={'0'}
            placeholder={placeholder}
            _placeholder={{
              color: '#667085'
            }}
            _hover={{
              borderColor: '#E8EBF0'
            }}
            _focus={{
              borderColor: 'primary.600',
              boxShadow: 'none'
            }}
            resize={'none'}
            overflow={'hidden'}
            maxLength={maxLength}
            // 连续无空格的长串也要在框内换行，而不是横向撑出去
            sx={{ overflowWrap: 'anywhere' }}
            onChange={(e) => onChange(item.key, e.target.value)}
            {...(inputProps as TextareaProps)}
          />
        ) : (
          <Input
            value={item.value}
            h={'40px'}
            w={'100%'}
            minW={0}
            bg={'white'}
            border={'1px solid'}
            borderColor={'#E8EBF0'}
            borderRadius={'8px'}
            px={'10px'}
            fontFamily={'PingFang SC'}
            fontSize={'14px'}
            lineHeight={'20px'}
            color={'#111824'}
            letterSpacing={'0'}
            placeholder={placeholder}
            _placeholder={{
              color: '#667085'
            }}
            _hover={{
              borderColor: '#E8EBF0'
            }}
            _focus={{
              borderColor: 'primary.600',
              boxShadow: 'none'
            }}
            maxLength={maxLength}
            onChange={(e) => onChange(item.key, e.target.value)}
            {...inputProps}
          />
        )}
        {renderRight?.(item, snapshot)}
      </Box>
      <Flex w={'16px'} alignItems={'center'} justifyContent={'center'}>
        <MyTooltip label={t('common:Delete')}>
          <MyIcon
            name={'circleMinus'}
            w={'16px'}
            color={'#667085'}
            cursor={'pointer'}
            _hover={{ color: 'red.600' }}
            onClick={() => onDelete(item.key)}
          />
        </MyTooltip>
      </Flex>
    </Flex>
  );
}
