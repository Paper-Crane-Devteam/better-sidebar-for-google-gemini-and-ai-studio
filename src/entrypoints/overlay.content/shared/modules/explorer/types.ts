export interface NodeData {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: NodeData[];
  data?: any;
}

export interface ArboristTreeHandle {
  collapseAll: () => void;
  edit: (id: string) => void;
  select: (id: string) => void;
  selectAll?: () => void;
  open?: (id: string) => void;
}
