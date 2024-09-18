type ListItemType = {
  alias?: string;
  label: string | React.ReactNode;
  value: any;
  children?: ListItemType[];
};
export type MultipleSelectProps<T = any> = {
  label?: string | React.ReactNode;
  value: any[];
  placeholder?: string;
  list: ListItemType[];
  emptyTip?: string;
  maxH?: number;
  onSelect: (val: any[]) => void;
  styles?: ButtonProps;
  popDirection?: 'top' | 'bottom';
};
