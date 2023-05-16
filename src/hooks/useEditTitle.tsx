import { useState, useEffect, useRef } from 'react';
import { updateChatHistoryTitle } from '@/api/chat';

type UseEditTitleReturnType = {
  editingHistoryId: string | null;
  setEditingHistoryId: React.Dispatch<React.SetStateAction<string | null>>;
  editedTitle: string;
  setEditedTitle: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLInputElement>;
  onEditClick: (id: string, title: string) => void;
  onSaveClick: (chatId: string, modelId: string, editedTitle: string) => Promise<void>;
  onCloseClick: () => void;
};

export const useEditTitle = (): UseEditTitleReturnType => {
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState<string>('');

  const inputRef = useRef<HTMLInputElement | null>(null);

  const onEditClick = (id: string, title: string) => {
    setEditingHistoryId(id);
    setEditedTitle(title);
    inputRef.current && inputRef.current.focus();
  };

  const onSaveClick = async (chatId: string, modelId: string, editedTitle: string) => {
    setEditingHistoryId(null);

    await updateChatHistoryTitle({ chatId: chatId, modelId: modelId, newTitle: editedTitle });
  };

  const onCloseClick = () => {
    setEditingHistoryId(null);
  };

  useEffect(() => {
    if (editingHistoryId) {
      inputRef.current && inputRef.current.focus();
    }
  }, [editingHistoryId]);

  return {
    editingHistoryId,
    setEditingHistoryId,
    editedTitle,
    setEditedTitle,
    inputRef,
    onEditClick,
    onSaveClick,
    onCloseClick
  };
};
