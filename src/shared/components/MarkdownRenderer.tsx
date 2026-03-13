import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/shared/lib/utils/utils';

interface MarkdownRendererProps {
  children: string;
  className?: string;
  highlight?: string;
  highlightOptions?: {
    caseSensitive?: boolean;
    wholeWord?: boolean;
  };
}

export const MarkdownRenderer = memo(({ children, className, highlight, highlightOptions }: MarkdownRendererProps) => {
  
  const highlightText = (text: string) => {
    if (!highlight || !highlight.trim()) return text;

    const escapeRegExp = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };
    
    const escapedHighlight = escapeRegExp(highlight);
    let pattern = escapedHighlight;
    let flags = 'g';
    
    if (!highlightOptions?.caseSensitive) {
      flags += 'i';
    }
    
    if (highlightOptions?.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    
    const regex = new RegExp(`(${pattern})`, flags);
    const parts = text.split(regex);
    
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <span
          key={i}
          className="bg-yellow-500/30 text-foreground font-medium rounded-[2px]"
        >
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  const processChildren = (node: React.ReactNode): React.ReactNode => {
    if (!node) return node;
    
    if (typeof node === 'string') {
      return highlightText(node);
    }
    if (Array.isArray(node)) {
      return node.map((child, index) => <React.Fragment key={index}>{processChildren(child)}</React.Fragment>);
    }
    if (React.isValidElement(node)) {
       const element = node as React.ReactElement<{ children?: React.ReactNode }>;
       if (element.props && element.props.children) {
           return React.cloneElement(element, {
               children: processChildren(element.props.children)
           });
       }
       return node;
    }
    return node;
  };

  // We need to override components that can contain text.
  const components: any = {
      a: ({ node, children, ...props }: any) => (
        <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
             {processChildren(children)}
        </a>
      ),
      code: ({ node, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const isInline = !match && !String(children).includes('\n');
        return (
          <code 
            className={cn(
              "bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground",
              !isInline && "block p-4",
              className
            )} 
            {...props}
          >
             {processChildren(children)}
          </code>
        );
      },
      pre: ({ children }: any) => (
        <pre className="bg-muted p-0 rounded-lg overflow-x-auto my-4 border border-border/50 max-w-full">
          {processChildren(children)}
        </pre>
      ),
      p: ({ children }: any) => <p className="leading-7 [&:not(:first-child)]:mt-6">{processChildren(children)}</p>,
      li: ({ children }: any) => <li>{processChildren(children)}</li>,
      ul: ({ children }: any) => <ul className="my-6 ml-6 list-disc [&>li]:mt-2">{children}</ul>,
      ol: ({ children }: any) => <ol className="my-6 ml-6 list-decimal [&>li]:mt-2">{children}</ol>,
      h1: ({ children }: any) => <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">{processChildren(children)}</h1>,
      h2: ({ children }: any) => <h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0">{processChildren(children)}</h2>,
      h3: ({ children }: any) => <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">{processChildren(children)}</h3>,
      h4: ({ children }: any) => <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">{processChildren(children)}</h4>,
      h5: ({ children }: any) => <h5 className="scroll-m-20 text-lg font-semibold tracking-tight">{processChildren(children)}</h5>,
      h6: ({ children }: any) => <h6 className="scroll-m-20 text-base font-semibold tracking-tight">{processChildren(children)}</h6>,
      strong: ({ children }: any) => <strong className="font-semibold">{processChildren(children)}</strong>,
      em: ({ children }: any) => <em className="italic">{processChildren(children)}</em>,
      blockquote: ({ children }: any) => (
          <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2">
              {processChildren(children)}
          </blockquote>
      ),
      table: ({ children }: any) => (
        <div className="overflow-x-auto my-4">
          <table className="min-w-full border-collapse border border-border">
            {children}
          </table>
        </div>
      ),
      th: ({ children }: any) => (
        <th className="border border-border bg-muted p-2 text-left font-medium">
          {processChildren(children)}
        </th>
      ),
      td: ({ children }: any) => (
        <td className="border border-border p-2">
          {processChildren(children)}
        </td>
      ),
  };

  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
