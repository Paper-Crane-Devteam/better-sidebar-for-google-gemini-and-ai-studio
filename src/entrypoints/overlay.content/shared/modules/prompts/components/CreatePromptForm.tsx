import React, { useState, useEffect } from 'react';
import * as Form from '@radix-ui/react-form';
import { Info } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils/utils';
import { useModalStore } from '@/shared/lib/modal';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  PROMPT_ICON_NAMES,
  PromptIconDisplay,
  getPromptIconComponent,
} from '../lib/prompt-icons';

const TITLE_MAX_LENGTH = 100;

interface CreatePromptFormProps {
  initialValues?: {
    title: string;
    content: string;
    type: 'normal' | 'system';
    icon: string;
  };
  onChange: (data: {
    title: string;
    content: string;
    type: 'normal' | 'system';
    icon: string;
  }) => void;
  /** Ref to the form element so parent can trigger requestSubmit() on modal confirm */
  formRef?: React.RefObject<HTMLFormElement | null>;
  /** Called when form is submitted and passes validation (title + content required, title max 100) */
  onValidSubmit?: () => void;
}

const DEFAULT_ICON_BY_TYPE: Record<'normal' | 'system', string> = {
  system: 'Bot',
  normal: 'User',
};

export const CreatePromptForm = ({
  initialValues,
  onChange,
  formRef,
  onValidSubmit,
}: CreatePromptFormProps) => {
  const { t } = useI18n();
  const [title, setTitle] = useState(initialValues?.title || '');
  const [content, setContent] = useState(initialValues?.content || '');
  const [type, setType] = useState<'normal' | 'system'>(
    initialValues?.type ?? 'system',
  );
  const [icon, setIcon] = useState(
    initialValues?.icon ||
      DEFAULT_ICON_BY_TYPE[initialValues?.type ?? 'system'],
  );
  const [iconDropdownOpen, setIconDropdownOpen] = useState(false);
  /** True after user explicitly picks an icon from dropdown; then we don't override icon when type changes */
  const [iconTouchedByUser, setIconTouchedByUser] = useState(false);

  const openVariablePromptHelp = () => {
    useModalStore.getState().open({
      type: 'info',
      title: t('prompts.variablePromptModalTitle'),
      content: (
        <div className="space-y-4 text-sm text-muted-foreground text-left">
          <p className="leading-relaxed">
            {t('prompts.variablePromptModalIntro')}
          </p>
          {/* Basic variable */}
          <div className="rounded-md bg-secondary/40 border p-3 text-xs">
            <p className="font-medium text-foreground mb-2">
              {t('prompts.variablePromptModalExample')}
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-foreground/90">
              Write a {'{{tone}}'} email to {'{{recipient}}'} about{' '}
              {'{{topic}}'}.
            </pre>
          </div>
          {/* Dropdown variable */}
          <div className="rounded-md bg-secondary/40 border p-3 text-xs">
            <p className="font-medium text-foreground mb-2">
              {t('prompts.dropdownVariableExample')}
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-foreground/90">
              {'{{tone:professional,humorous,concise}}'}
            </pre>
            <p className="mt-1.5 text-muted-foreground">
              {t('prompts.dropdownVariableHint')}
            </p>
          </div>
          {/* @import */}
          <div className="rounded-md bg-secondary/40 border p-3 text-xs">
            <p className="font-medium text-foreground mb-2">
              {t('prompts.importExample')}
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-foreground/90">
              {'{{@import:General System Instructions}}'}
            </pre>
            <p className="mt-1.5 text-muted-foreground">
              {t('prompts.importHint')}
            </p>
          </div>
        </div>
      ),
      confirmText: t('common.ok'),
    });
  };

  useEffect(() => {
    onChange({ title, content, type, icon });
  }, [title, content, type, icon, onChange]);

  const handleTypeChange = (newType: 'normal' | 'system') => {
    setType(newType);
    if (!iconTouchedByUser) {
      setIcon(DEFAULT_ICON_BY_TYPE[newType]);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onValidSubmit?.();
  };

  return (
    <Form.Root
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 py-2 -mx-0.5 px-0.5"
    >
      {/* Type: label on top, radios below */}
      <div className="grid gap-2">
        <Label>{t('prompts.type')}</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="prompt-type"
              value="system"
              checked={type === 'system'}
              onChange={() => handleTypeChange('system')}
              className="h-4 w-4 border border-input accent-primary"
            />
            <span className="text-sm">{t('prompts.systemPrompt')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="prompt-type"
              value="normal"
              checked={type === 'normal'}
              onChange={() => handleTypeChange('normal')}
              className="h-4 w-4 border border-input accent-primary"
            />
            <span className="text-sm">{t('prompts.normalPrompt')}</span>
          </label>
        </div>
      </div>

      {/* Title: label on top, icon + input below */}
      <Form.Field name="title">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <Form.Label asChild>
              <Label htmlFor="title">{t('prompts.title')}</Label>
            </Form.Label>
            <Form.Message
              match="valueMissing"
              className="text-xs text-destructive"
            >
              {t('prompts.titleRequired')}
            </Form.Message>
            <Form.Message match="tooLong" className="text-xs text-destructive">
              {t('prompts.titleMaxLength', { count: TITLE_MAX_LENGTH })}
            </Form.Message>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu
              open={iconDropdownOpen}
              onOpenChange={setIconDropdownOpen}
            >
              <SimpleTooltip content={icon}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-9 w-9"
                  >
                    <PromptIconDisplay name={icon} className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </SimpleTooltip>
              <DropdownMenuContent
                align="end"
                className={cn(
                  'z-[100] max-h-[280px] overflow-y-auto min-w-[200px] shadow-md rounded-md p-2',
                  'bg-popover text-popover-foreground border border-border',
                  '[--popover:255_255_255] [--popover-foreground:50_48_44] [--accent:228_228_226] [--accent-foreground:50_48_44] [--border:238_238_236]',
                  'dark:[--popover:31_31_31] dark:[--popover-foreground:212_212_212] dark:[--accent:42_42_42] dark:[--accent-foreground:212_212_212] dark:[--border:42_42_42]',
                )}
              >
                <div className="grid grid-cols-4 gap-1">
                  {PROMPT_ICON_NAMES.map((name) => {
                    const IconComponent = getPromptIconComponent(name);
                    if (!IconComponent) return null;
                    return (
                      <SimpleTooltip content={name}>
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setIcon(name);
                            setIconTouchedByUser(true);
                            setIconDropdownOpen(false);
                          }}
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-md text-popover-foreground',
                            'hover:bg-accent hover:text-accent-foreground transition-colors',
                            icon === name && 'bg-accent text-accent-foreground',
                          )}
                        >
                          <IconComponent className="h-4 w-4" />
                        </button>
                      </SimpleTooltip>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <Form.Control asChild>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('prompts.promptTitlePlaceholder')}
                autoFocus
                required
                maxLength={TITLE_MAX_LENGTH}
              />
            </Form.Control>
          </div>
        </div>
      </Form.Field>

      {/* Content: label on top, textarea below */}
      <Form.Field name="content">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Form.Label asChild>
                <Label htmlFor="content">{t('prompts.content')}</Label>
              </Form.Label>
              <button
                type="button"
                onClick={openVariablePromptHelp}
                className="text-xs text-blue-500 hover:text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
              >
                <Info className="w-3 h-3 shrink-0" />
                {t('prompts.variablePromptHint')}
              </button>
            </div>
            <Form.Message
              match="valueMissing"
              className="text-xs text-destructive"
            >
              {t('prompts.contentRequired')}
            </Form.Message>
          </div>
          <Form.Control asChild>
            <textarea
              id="content"
              name="content"
              required
              className={cn(
                'flex min-h-[240px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50 resize-y',
              )}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('prompts.contentPlaceholder')}
            />
          </Form.Control>
        </div>
      </Form.Field>
    </Form.Root>
  );
};
