import * as React from "react"
import { ChevronRight, ChevronDown, Folder, FolderOpen, MessageSquare } from "lucide-react"
import { cn } from "../../lib/utils/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible"
import { Button } from "./button"
import { HighlightedText } from "../HighlightedText"

interface TreeViewItem {
  id: string
  name: string
  type: 'folder' | 'file'
  children?: TreeViewItem[]
  data?: any
}

export interface PendingNewFolder {
  /** Parent folder id, or null for root level */
  parentId: string | null;
  /** Called when the user confirms the name (non-empty on Enter or blur) */
  onConfirm: (name: string) => void;
  /** Called when the user cancels (Escape or blur with empty) */
  onCancel: () => void;
}

interface TreeViewProps {
  items: TreeViewItem[];
  onSelect?: (item: TreeViewItem) => void;
  className?: string;
  selectedId?: string | null;
  /** When set, renders an inline input row for creating a new folder */
  pendingNewFolder?: PendingNewFolder | null;
  /** Search query used to highlight matching parts of node names */
  searchQuery?: string;
}

/**
 * Inline input row for creating a new folder in the tree.
 */
const PendingFolderInput = ({
  level,
  onConfirm,
  onCancel,
}: {
  level: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState('');
  const confirmedRef = React.useRef(false);

  React.useEffect(() => {
    // Auto-focus when mounted
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleConfirm = () => {
    if (confirmedRef.current) return;
    const name = value.trim();
    if (name) {
      confirmedRef.current = true;
      onConfirm(name);
    } else {
      confirmedRef.current = true;
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center gap-2 py-1 px-2 text-sm w-full"
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      {/* Spacer to match chevron area */}
      <div className="h-4 w-4 shrink-0" />
      <Folder className="h-4 w-4 text-foreground/70 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        className="flex-1 min-w-0 h-6 px-1 text-sm bg-transparent border rounded-sm outline-none focus:ring-1 focus:ring-ring"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            confirmedRef.current = true;
            onCancel();
          }
        }}
        onBlur={handleConfirm}
      />
    </div>
  );
};

const TreeViewNode = ({
  item,
  level = 0,
  onSelect,
  selectedId,
  pendingNewFolder,
  searchQuery,
}: {
  item: TreeViewItem;
  level?: number;
  onSelect?: (item: TreeViewItem) => void;
  selectedId?: string | null;
  pendingNewFolder?: PendingNewFolder | null;
  searchQuery?: string;
}) => {
  const isPendingParent = pendingNewFolder?.parentId === item.id;
  // Default to true (expanded); force open if this is the pending parent
  const [isOpen, setIsOpen] = React.useState(true);
  const hasChildren = item.children && item.children.length > 0;
  const isSearching = !!searchQuery?.trim();
  // While searching, keep every branch open so matches are never hidden
  // inside a folder the user had collapsed.
  const showExpanded = isOpen || isPendingParent || isSearching;

  React.useEffect(() => {
    // Force open when a pending node targets this folder
    if (isPendingParent && !isOpen) {
      setIsOpen(true);
    }
  }, [isPendingParent]);

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(item);
    // Only toggle if it has children
    if (item.type === 'folder' && hasChildren) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <Collapsible open={showExpanded} onOpenChange={setIsOpen} className="w-full">
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-2 rounded-sm hover:bg-accent cursor-pointer text-sm w-full',
          selectedId === item.id && 'bg-accent'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleSelect(e as any);
          }
        }}
      >
        {item.type === 'folder' ? (
          <>
            {hasChildren ? (
              <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent shrink-0"
                >
                  {showExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="sr-only">Toggle</span>
                </Button>
              </CollapsibleTrigger>
            ) : (
              // Spacer for alignment if no children (leaf node)
              <div className="h-4 w-4 shrink-0" />
            )}

            {showExpanded && hasChildren ? (
              <FolderOpen className="h-4 w-4 text-foreground/70 shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-foreground/70 shrink-0" />
            )}
          </>
        ) : (
          <MessageSquare className="h-4 w-4 text-muted-foreground ml-6 shrink-0" />
        )}
        <HighlightedText
          text={item.name}
          query={searchQuery}
          className="truncate"
        />
      </div>

      {(hasChildren || isPendingParent) && (
        <CollapsibleContent>
          {isPendingParent && (
            <PendingFolderInput
              level={level + 1}
              onConfirm={pendingNewFolder!.onConfirm}
              onCancel={pendingNewFolder!.onCancel}
            />
          )}
          {item.children?.map((child) => (
            <TreeViewNode
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              pendingNewFolder={pendingNewFolder}
              searchQuery={searchQuery}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

export function TreeView({
  items,
  onSelect,
  className,
  selectedId,
  pendingNewFolder,
  searchQuery,
}: TreeViewProps) {
  return (
    <div className={cn('w-full space-y-1', className)}>
      {/* If pending node targets root (parentId === null), show input at top */}
      {pendingNewFolder?.parentId === null && (
        <PendingFolderInput
          level={0}
          onConfirm={pendingNewFolder.onConfirm}
          onCancel={pendingNewFolder.onCancel}
        />
      )}
      {items.map((item) => (
        <TreeViewNode
          key={item.id}
          item={item}
          onSelect={onSelect}
          selectedId={selectedId}
          pendingNewFolder={pendingNewFolder}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}
