import { useState } from 'react';
import { ChevronRight, Copy } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { OverflowTooltip } from '@/shared/components/ui/overflow-tooltip';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { toast } from '@/shared/lib/toast';
import { NodeActionBar } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { OutlineNode } from '../types';
import { getNodeIcon, getNodeTextClass } from './getNodeIcon';

/** Collect child content for tooltip preview (full content, no truncation) */
function collectChildrenContent(children: OutlineNode[]): string {
  const parts: string[] = [];

  for (const child of children) {
    let text = '';
    if (child.type === 'code-block') {
      const lang = child.meta || '';
      text = `\`\`\`${lang}\n${child.rawContent || ''}\n\`\`\``;
    } else if (child.type === 'table') {
      text = child.rawContent || child.label;
    } else if (child.type === 'math') {
      text = child.rawContent ? `$$\n${child.rawContent}\n$$` : child.label;
    } else if (child.rawContent) {
      text = child.rawContent;
    } else {
      text = child.label;
    }

    if (text) {
      parts.push(text);
    }

    if (child.children.length > 0) {
      const nested = collectChildrenContent(child.children);
      if (nested) {
        parts.push(nested);
      }
    }
  }

  return parts.join('\n\n');
}

export function OutlineNodeItem({
  node,
  onNavigate,
  messageId,
  modelContent,
  depth = 0,
}: {
  node: OutlineNode;
  onNavigate: (messageId: string, headingLabel?: string, headingLevel?: string) => void;
  messageId: string;
  /** Full model response content for source-range copy */
  modelContent?: string;
  depth?: number;
}) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    let content: string | undefined;

    // For heading nodes with source ranges, extract the full section from original content
    if (node.type === 'heading' && node.sourceStart != null && node.sourceEnd != null && modelContent) {
      content = modelContent.slice(node.sourceStart, node.sourceEnd).trim();
    }

    // Fallback: reconstruct from node data
    if (!content) {
      if (node.type === 'code-block') {
        const lang = node.meta || '';
        content = `\`\`\`${lang}\n${node.rawContent || node.label}\n\`\`\``;
      } else if (node.rawContent) {
        content = node.rawContent;
      } else {
        content = node.label;
      }
    }

    if (content) {
      navigator.clipboard.writeText(content);
      toast.success(t('toast.copiedToClipboard'), 1000);
    }
  };

  const tooltipMarkdown = (() => {
    const parts: string[] = [];
    if (node.type === 'heading') {
      if (node.meta === 'bold' || node.meta === 'list-item') {
        if (node.rawContent) {
          parts.push(node.rawContent);
        } else {
          parts.push(`**${node.label}**`);
        }
        const childContent = collectChildrenContent(node.children);
        if (childContent) parts.push(childContent);
      } else {
        const prefix = node.meta && node.meta.match(/^h\d$/) ? '#'.repeat(Number(node.meta[1])) + ' ' : '';
        parts.push(`${prefix}${node.label}`);
        const childContent = collectChildrenContent(node.children);
        if (childContent) parts.push(childContent);
      }
    } else if (node.type === 'code-block') {
      // Wrap rawContent in fenced code block so MarkdownRenderer renders it properly
      const lang = node.meta || '';
      parts.push(`\`\`\`${lang}\n${node.rawContent || ''}\n\`\`\``);
    } else if (node.type === 'table') {
      // Tables: rawContent is already markdown table syntax
      if (node.rawContent) parts.push(node.rawContent);
      else parts.push(node.label);
    } else if (node.type === 'math') {
      // Math nodes: wrap rawContent in $$ so MarkdownRenderer renders it as a formula
      if (node.rawContent) {
        parts.push(`$$\n${node.rawContent}\n$$`);
      } else {
        parts.push(node.label);
      }
    } else {
      if (node.label) parts.push(node.label);
      if (node.rawContent && node.rawContent !== node.label) parts.push(node.rawContent);
    }
    return parts.join('\n\n');
  })();

  return (
    <div>
      <div
        onClick={() => {
          if (hasChildren) {
            setIsExpanded(!isExpanded);
          }
        }}
        className={cn(
          'group flex items-center gap-1 px-2 py-1 rounded-md relative min-w-0',
          'transition-colors duration-100',
          'cursor-pointer hover:bg-accent/50',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-accent/60"
          >
            <ChevronRight
              className={cn(
                'h-2.5 w-2.5 transition-transform duration-100 text-muted-foreground/40',
                isExpanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        {getNodeIcon(node)}

        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden node-text-content">
          <OverflowTooltip
            content={
              tooltipMarkdown ? (
                <MarkdownRenderer className="text-xs max-h-[300px] overflow-y-auto custom-scrollbar-inverted tooltip-markdown">
                  {tooltipMarkdown}
                </MarkdownRenderer>
              ) : undefined
            }
            forceShow={!!tooltipMarkdown}
            interactive
            placement="right"
            tooltipClassName={cn(
              'max-w-[400px]',
              // Fix markdown elements for inverted tooltip background (bg-foreground text-background)
              '[&_.tooltip-markdown]:text-background',
              '[&_.tooltip-markdown_strong]:text-background',
              '[&_.tooltip-markdown_em]:text-background',
              '[&_.tooltip-markdown_code]:bg-background/15 [&_.tooltip-markdown_code]:text-background',
              '[&_.tooltip-markdown_pre]:bg-background/10 [&_.tooltip-markdown_pre]:border-background/20',
              '[&_.tooltip-markdown_th]:bg-background/10 [&_.tooltip-markdown_th]:text-background [&_.tooltip-markdown_th]:border-background/20',
              '[&_.tooltip-markdown_td]:text-background [&_.tooltip-markdown_td]:border-background/20',
              '[&_.tooltip-markdown_table]:border-background/20',
              '[&_.tooltip-markdown_a]:text-blue-300',
              '[&_.tooltip-markdown_blockquote]:border-background/40',
              // KaTeX formulas inherit color from parent
              '[&_.tooltip-markdown_.katex]:text-background',
            )}
            className={cn('leading-snug truncate flex-1', getNodeTextClass(node))}
          >
            {node.label}
          </OverflowTooltip>

          {node.meta && node.type === 'code-block' && (
            <span className="text-[10px] px-1 py-1 rounded bg-muted/50 text-muted-foreground/70 font-mono shrink-0">
              {node.meta}
            </span>
          )}
        </div>

        <NodeActionBar
          actions={[
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              tooltip: t('outline.copy'),
              onClick: handleCopy,
            },
          ]}
        />
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <OutlineNodeItem
              key={child.id}
              node={child}
              onNavigate={onNavigate}
              messageId={messageId}
              modelContent={modelContent}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
