import * as React from "react"
import { ChevronRight, ChevronDown, Folder, FolderOpen, MessageSquare } from "lucide-react"
import { cn } from "../../lib/utils/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@radix-ui/react-collapsible"
import { Button } from "./button"

interface TreeViewItem {
  id: string
  name: string
  type: 'folder' | 'file'
  children?: TreeViewItem[]
  data?: any
}

interface TreeViewProps {
  items: TreeViewItem[];
  onSelect?: (item: TreeViewItem) => void;
  className?: string;
  selectedId?: string | null;
}

const TreeViewNode = ({
  item,
  level = 0,
  onSelect,
  selectedId,
}: {
  item: TreeViewItem;
  level?: number;
  onSelect?: (item: TreeViewItem) => void;
  selectedId?: string | null;
}) => {
  // Default to true (expanded)
  const [isOpen, setIsOpen] = React.useState(true);
  const hasChildren = item.children && item.children.length > 0;

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(item);
    // Only toggle if it has children
    if (item.type === 'folder' && hasChildren) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
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
                  {isOpen ? (
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

            {isOpen && hasChildren ? (
              <FolderOpen className="h-4 w-4 text-foreground/70 shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-foreground/70 shrink-0" />
            )}
          </>
        ) : (
          <MessageSquare className="h-4 w-4 text-muted-foreground ml-6 shrink-0" />
        )}
        <span className="truncate">{item.name}</span>
      </div>

      {hasChildren && (
        <CollapsibleContent>
          {item.children!.map((child) => (
            <TreeViewNode
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
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
}: TreeViewProps) {
  return (
    <div className={cn('w-full space-y-1', className)}>
      {items.map((item) => (
        <TreeViewNode
          key={item.id}
          item={item}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  );
}
