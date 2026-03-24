import React, { useRef, useEffect } from 'react';
import { NodeApi } from 'react-arborist';
import { FolderTreeNodeData } from './types';

interface RenameFormProps {
  node: NodeApi<FolderTreeNodeData>;
  newName: string;
  setNewName: (name: string) => void;
}

export const RenameForm = ({ node, newName, setNewName }: RenameFormProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isReadyRef = useRef(false);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.select();
    }

    // Prevent immediate blur which can happen when context menu closes and restores focus
    const timer = setTimeout(() => {
      isReadyRef.current = true;
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    node.submit(newName);
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 min-w-0">
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        maxLength={60}
        onBlur={() => {
          if (isReadyRef.current) {
            node.submit(newName);
          } else {
            inputRef.current?.focus();
          }
        }}
        className="w-full bg-background border border-primary rounded-sm h-6 px-1 text-sm outline-none shadow-sm"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            node.reset();
          }
        }}
      />
    </form>
  );
};
