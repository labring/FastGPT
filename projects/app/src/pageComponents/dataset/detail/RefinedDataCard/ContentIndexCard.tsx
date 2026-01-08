import React, { useState, useRef, useEffect } from 'react';
import { Box, Card, Flex, IconButton, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

interface ContentIndexCardProps {
  content: string;
  isNew?: boolean;
  onEdit?: (newContent: string) => void;
  onDelete?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const ContentIndexCard: React.FC<ContentIndexCardProps> = ({
  content,
  isNew = false,
  onEdit,
  onDelete,
  onCancel,
  isLoading = false
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(isNew);
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Focus when editing mode is enabled
    if (isEditing && textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
          // Scroll to bottom to show cursor
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [isEditing]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(content);
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (isNew) {
      // For new card, if empty, cancel; otherwise save
      if (!editValue.trim()) {
        onCancel?.();
      } else {
        setIsSaving(true);
        onEdit?.(editValue);
        // Don't set isEditing to false immediately, wait for parent to handle
        setTimeout(() => {
          setIsSaving(false);
          setIsEditing(false);
        }, 100);
      }
    } else {
      // For existing card, save if changed
      if (editValue !== content && onEdit) {
        setIsSaving(true);
        onEdit(editValue);
        setTimeout(() => {
          setIsSaving(false);
        }, 100);
      }
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isNew && editValue.trim()) {
        setIsSaving(true);
        onEdit?.(editValue);
        setTimeout(() => {
          setIsSaving(false);
          setIsEditing(false);
        }, 100);
      } else if (!isNew) {
        if (editValue !== content && onEdit) {
          setIsSaving(true);
          onEdit(editValue);
          setTimeout(() => {
            setIsSaving(false);
          }, 100);
        }
        setIsEditing(false);
      }
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      if (isNew) {
        onCancel?.();
      } else {
        setEditValue(content);
        setIsEditing(false);
      }
    }
  };

  return (
    <Card
      p={4}
      boxShadow={'none'}
      bg={'primary.50'}
      border={'1px'}
      borderColor={'myGray.200'}
      borderRadius={'sm'}
      position={'relative'}
    >
      {/* Content or Input */}
      {isEditing ? (
        <Textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={isNew ? t('dataset:input_knowledge_point') : undefined}
          fontSize={'sm'}
          minH={'100px'}
          resize={'vertical'}
          bg={'white'}
          border={'none'}
          px={3}
          py={3.5}
          isDisabled={isLoading || isSaving}
          _focus={{
            border: 'none',
            boxShadow: 'none'
          }}
        />
      ) : (
        <Box
          fontSize={'sm'}
          color={'myGray.900'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-word'}
          lineHeight={'1.6'}
          pr={16}
        >
          {content}
        </Box>
      )}

      {/* Action Buttons */}
      {!isEditing && !isNew && (
        <Flex
          className="action-buttons"
          position={'absolute'}
          top={'50%'}
          right={2}
          gap={1}
          transform={'translateY(-50%)'}
        >
          {/* Edit Button */}
          <IconButton
            icon={<MyIcon name={'edit'} w={'14px'} />}
            variant={'transparentBase'}
            size={'xsSquare'}
            aria-label={'edit'}
            color={'myGray.500'}
            _hover={{
              color: 'primary.600'
            }}
            onClick={handleEditClick}
          />

          {/* Delete Button */}
          <PopoverConfirm
            Trigger={
              <IconButton
                icon={<MyIcon name={'common/trash'} w={'14px'} />}
                variant={'transparentDanger'}
                size={'xsSquare'}
                aria-label={'delete'}
                color={'myGray.500'}
                _hover={{
                  color: 'red.600'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            }
            content={t('dataset:confirm_delete_index')}
            type="delete"
            onConfirm={() => onDelete?.()}
          />
        </Flex>
      )}
    </Card>
  );
};

export default React.memo(ContentIndexCard);
