import {
  Code2,
  Image,
  Table2,
  Link2,
  Sigma,
} from 'lucide-react';
import type { OutlineNode } from '../types';

/**
 * Leading icon for non-heading nodes.
 *
 * Headings render without an icon — their level is carried by the text style
 * (see getNodeTextClass). The remaining content-type icons share one muted
 * tone so they hint at the type without pulling the eye away from the text.
 */
export function getNodeIcon(node: OutlineNode) {
  const base = 'h-3 w-3 shrink-0 text-muted-foreground/45';
  switch (node.type) {
    case 'code-block':
      return <Code2 className={base} />;
    case 'image':
      return <Image className={base} />;
    case 'table':
      return <Table2 className={base} />;
    case 'link':
      return <Link2 className={base} />;
    case 'math':
      return <Sigma className={base} />;
    default:
      return null;
  }
}

/**
 * Text style per outline level. Hierarchy is expressed through three channels
 * at once — size, weight and color depth — so levels stay distinguishable
 * even when one channel is subtle in a given theme.
 */
export function getNodeTextClass(node: OutlineNode): string {
  if (node.type !== 'heading') {
    return 'text-xs font-normal text-muted-foreground';
  }
  switch (node.meta) {
    case 'h1':
      return 'text-[13.5px] font-semibold text-foreground';
    case 'h2':
      return 'text-[13px] font-medium text-foreground/85';
    case 'h3':
      return 'text-[12.5px] font-normal text-foreground/70';
    case 'h4':
    case 'h5':
    case 'h6':
      return 'text-xs font-normal text-foreground/60';
    case 'blockquote':
      return 'text-xs font-normal italic text-muted-foreground/80';
    // Pseudo-headings: bold paragraphs, list items, <details> summaries
    default:
      return 'text-xs font-normal text-muted-foreground';
  }
}
