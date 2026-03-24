import { FolderTreeNodeProps } from '../../../../components/folder-tree';

export interface NodeProps extends FolderTreeNodeProps {
  onPreview?: (prompt: any) => void;
}
