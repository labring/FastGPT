import type { ButtonProps } from '@chakra-ui/react';

export type ListItemType = {
  label: string | React.ReactNode;
  value: any;
  children?: ListItemType[];
};
export type MultipleSelectProps = {
  label?: string | React.ReactNode;
  value?: any[];
  placeholder?: string;
  list: ListItemType[];
  emptyTip?: string;
  /** 加载态仅显示在下拉面板中，不替换触发按钮上的已选内容。 */
  isLoading?: boolean;
  maxH?: number;
  onSelect: (val: any[]) => void;
  popDirection?: 'top' | 'bottom';
  changeOnEverySelect?: boolean;
  /** 切换父级选项时清空其子级选择，要求重新选择完整路径。 */
  clearChildrenOnChange?: boolean;
  ButtonProps?: ButtonProps;
  onOpenFunc?: () => void;
  onCloseFunc?: () => void;
};
export type MultipleArraySelectProps = Omit<MultipleSelectProps, 'value'> & {
  value?: any[][];
  onSelect: (val: any[][]) => void;
};
