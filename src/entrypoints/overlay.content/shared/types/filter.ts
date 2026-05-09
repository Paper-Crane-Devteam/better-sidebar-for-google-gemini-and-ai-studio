/** Explorer / Favorites: filter by conversation vs text-to-image */
export type ExplorerTypeFilter =
  | 'all'
  | 'conversation'
  | 'text-to-image'
  | 'gem'
  | 'notebook';

/** Prompts: filter by normal vs system prompt */
export type PromptsTypeFilter = 'all' | 'normal' | 'system';

export interface FilterState<
  TTypeFilter extends string = ExplorerTypeFilter | PromptsTypeFilter,
> {
  search: {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    query: string;
    setQuery: (query: string) => void;
  };
  tags: {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    selected: string[];
    setSelected: (selected: string[]) => void;
  };
  type: {
    value: TTypeFilter;
    setValue: (value: TTypeFilter) => void;
  };
  onlyFavorites: {
    value: boolean;
    setValue: (value: boolean) => void;
  };
}
