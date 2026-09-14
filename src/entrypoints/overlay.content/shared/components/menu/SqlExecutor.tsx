import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Database, X, ChevronUp, ChevronDown, Filter, ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';
import { applyShadowStyles } from '@/shared/lib/utils';
import { bindShadowRootToTheme } from '@/themes';
import mainStyles from '@/index.scss?inline';

const PAGE_SIZE = 10;

interface SqlExecutorProps {
  onClose: () => void;
}

type SortDirection = 'asc' | 'desc' | null;
interface SortState {
  column: string;
  direction: SortDirection;
}

/**
 * Creates a standalone shadow DOM host on document.body for the SQL Executor.
 * This ensures drag events are not captured/blocked by the sidebar's shadow DOM.
 */
function useSqlPortal() {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const wrapper = document.createElement('div');
    wrapper.id = 'better-sidebar-sql-executor';
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '0';
    wrapper.style.height = '0';
    wrapper.style.zIndex = '99999';
    document.body.appendChild(wrapper);

    const shadow = wrapper.attachShadow({ mode: 'open' });
    applyShadowStyles(shadow, mainStyles);

    const root = document.createElement('div');
    root.classList.add('shadow-body', 'theme-gemini');

    // Dark mode sync
    const syncTheme = () => {
      const themeValue = localStorage.getItem('Bard-Color-Theme');
      let isDark = false;
      if (!themeValue) {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = themeValue === 'Bard-Dark-Theme';
      }
      if (isDark) root.classList.add('dark');
      else root.classList.remove('dark');
    };
    syncTheme();
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', syncTheme);

    shadow.appendChild(root);
    bindShadowRootToTheme(root);
    setContainer(root);

    return () => {
      mql.removeEventListener('change', syncTheme);
      wrapper.remove();
    };
  }, []);

  return container;
}

export const SqlExecutor = ({ onClose }: SqlExecutorProps) => {
  const portalContainer = useSqlPortal();
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlResult, setSqlResult] = useState<any[] | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<SortState>({ column: '', direction: null });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  // Column resize via drag
  const resizingCol = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onResizeStart = useCallback((e: React.MouseEvent, col: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = col;
    resizeStartX.current = e.clientX;
    resizeStartW.current = columnWidths[col] || 120;

    const onMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - resizeStartX.current;
      const newW = Math.max(50, resizeStartW.current + diff);
      setColumnWidths((prev) => ({ ...prev, [resizingCol.current!]: newW }));
    };
    const onMouseUp = () => {
      resizingCol.current = null;
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
  }, [columnWidths]);

  // Drag state — direct DOM manipulation for smooth dragging
  const elRef = useRef<HTMLDivElement | null>(null);
  const pos = useRef({ x: 0, y: 0 });

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX - pos.current.x;
    const startY = e.clientY - pos.current.y;

    const onMouseMove = (ev: MouseEvent) => {
      pos.current = { x: ev.clientX - startX, y: ev.clientY - startY };
      if (elRef.current) {
        elRef.current.style.transform = `translate(calc(-50% + ${pos.current.x}px), calc(-50% + ${pos.current.y}px))`;
      }
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
    // Use capture phase on window to guarantee we always get the events
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
  }, []);

  const executeSql = async (query: string) => {
    setSqlError(null);
    setSqlResult(null);
    setCurrentPage(1);
    setSort({ column: '', direction: null });
    setFilters({});
    setActiveFilter(null);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'EXECUTE_SQL',
        payload: { sql: query },
      });
      if (response.success) {
        setSqlResult(response.data);
      } else {
        setSqlError(response.error || 'Execution failed');
      }
    } catch (e: any) {
      setSqlError(e.message);
    }
  };

  const handleExecuteSql = () => executeSql(sqlQuery);

  const handleQuickQuery = (query: string) => {
    setSqlQuery(query);
    executeSql(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleExecuteSql();
    }
  };

  // Filtering
  const filteredData = useMemo(() => {
    if (!sqlResult) return [];
    return sqlResult.filter((row) =>
      Object.entries(filters).every(([col, value]) => {
        if (!value) return true;
        return String(row[col] ?? '').toLowerCase().includes(value.toLowerCase());
      }),
    );
  }, [sqlResult, filters]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sort.column || !sort.direction) return filteredData;
    return [...filteredData].sort((a, b) => {
      const av = a[sort.column];
      const bv = b[sort.column];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.direction === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sort]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedData.slice(start, start + PAGE_SIZE);
  }, [sortedData, currentPage]);

  const columns = useMemo(() => {
    if (!sqlResult || sqlResult.length === 0) return [];
    return Object.keys(sqlResult[0]);
  }, [sqlResult]);

  const handleSort = useCallback((col: string) => {
    setSort((prev) => {
      if (prev.column !== col) return { column: col, direction: 'asc' };
      if (prev.direction === 'asc') return { column: col, direction: 'desc' };
      return { column: '', direction: null };
    });
    setCurrentPage(1);
  }, []);

  const handleFilterChange = useCallback((col: string, value: string) => {
    setFilters((prev) => ({ ...prev, [col]: value }));
    setCurrentPage(1);
  }, []);

  if (!portalContainer) return null;

  return createPortal(
    <div
      ref={elRef}
      className="fixed flex flex-col w-[90vw] max-w-4xl h-[80vh] max-h-[700px] rounded-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
      style={{
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'var(--panel-bg, rgb(var(--popover)))',
        boxShadow: 'var(--shadow-panel)',
        backdropFilter: 'var(--panel-blur)',
        WebkitBackdropFilter: 'var(--panel-blur)',
      }}
    >
      {/* Draggable Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <Database className="h-4 w-4" />
          <span className="font-semibold text-sm">SQL Executor</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7" onMouseDown={(e) => e.stopPropagation()}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0 p-3 gap-2">
        {/* Quick query buttons */}
        <div className="flex gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM folders')}>folders</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM conversations')}>conversations</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM messages')}>messages</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM tags')}>tags</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM conversation_tags')}>conversation_tags</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM favorites')}>favorites</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM prompts')}>prompts</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM prompt_folders')}>prompt_folders</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM gems')}>gems</Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleQuickQuery('SELECT * FROM notebooks')}>notebooks</Button>
        </div>

        {/* SQL input */}
        <div className="flex gap-2">
          <textarea
            className="flex-1 p-2 rounded-md border border-border/60 bg-transparent text-xs font-mono h-16 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SELECT * FROM folders  (Ctrl+Enter to execute)"
          />
          <Button onClick={handleExecuteSql} size="sm" className="self-end">Execute</Button>
        </div>

        {/* Error */}
        {sqlError && (
          <div className="p-2 bg-destructive/10 text-destructive text-xs rounded">{sqlError}</div>
        )}

        {/* Results table */}
        {sqlResult && (
          <div className="flex-1 flex flex-col min-h-0 border rounded-md overflow-hidden">
            {sqlResult.length === 0 ? (
              <div className="p-4 text-muted-foreground text-sm">No results</div>
            ) : (
              <>
                <ScrollArea className="flex-1 min-h-0">
                  <table className="text-xs text-left border-collapse" style={{ minWidth: '100%' }}>
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                      <tr className="border-b">
                        {columns.map((col) => (
                          <th
                            key={col}
                            className="p-1.5 font-medium text-muted-foreground select-none whitespace-nowrap relative"
                            style={{ width: columnWidths[col] ? `${columnWidths[col]}px` : undefined, minWidth: columnWidths[col] ? `${columnWidths[col]}px` : 80 }}
                          >
                            <div className="flex items-center gap-1">
                              <span
                                className="cursor-pointer hover:text-foreground transition-colors"
                                onClick={() => handleSort(col)}
                              >
                                {col}
                                {sort.column === col && sort.direction === 'asc' && <ChevronUp className="inline h-3 w-3" />}
                                {sort.column === col && sort.direction === 'desc' && <ChevronDown className="inline h-3 w-3" />}
                              </span>
                              <button
                                className={`p-0.5 rounded hover:bg-accent transition-colors ${activeFilter === col || filters[col] ? 'text-primary' : 'text-muted-foreground/50'}`}
                                onClick={() => setActiveFilter(activeFilter === col ? null : col)}
                              >
                                <Filter className="h-3 w-3" />
                              </button>
                            </div>
                            {activeFilter === col && (
                              <input
                                autoFocus
                                className="mt-1 w-full px-1.5 py-0.5 text-xs rounded border border-border/60 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                placeholder={`Filter ${col}...`}
                                value={filters[col] || ''}
                                onChange={(e) => handleFilterChange(col, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                            {/* Resize handle */}
                            <div
                              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
                              onMouseDown={(e) => onResizeStart(e, col)}
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedData.map((row, i) => (
                        <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                          {columns.map((col, j) => (
                            <SimpleTooltip content={String(row[col] ?? '')} key={j}>
                              <td
                                className="p-1.5 truncate"
                                style={{ maxWidth: columnWidths[col] ? `${columnWidths[col]}px` : 180 }}
                              >
                                {String(row[col] ?? '')}
                              </td>
                            </SimpleTooltip>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>

                {/* Pagination footer */}
                <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-muted/40 text-xs text-muted-foreground">
                  <span>{filteredData.length} rows ({(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, sortedData.length)})</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-2">{currentPage} / {totalPages}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    portalContainer,
  );
};
