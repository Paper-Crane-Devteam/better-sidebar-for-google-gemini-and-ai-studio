import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useI18n } from '@/shared/hooks/useI18n';
import type { PromptVariable } from '@/shared/lib/prompt-variables';

export interface VariableFillFormRef {
  getValues(): Record<string, string>;
}

interface VariableFillFormProps {
  /** Parsed variable descriptors (supports input + select kinds) */
  variables: PromptVariable[];
}

export const VariableFillForm = forwardRef<VariableFillFormRef, VariableFillFormProps>(
  function VariableFillForm({ variables }, ref) {
    const { t } = useI18n();
    const [values, setValues] = useState<Record<string, string>>(() => {
      const init: Record<string, string> = {};
      variables.forEach((v) => {
        // Default: first option for select, empty for input
        init[v.name] = v.kind === 'select' && v.options?.length ? v.options[0] : '';
      });
      return init;
    });
    const valuesRef = useRef(values);
    valuesRef.current = values;

    useImperativeHandle(ref, () => ({
      getValues() {
        return { ...valuesRef.current };
      },
    }));

    // Filter to only input/select variables (imports are resolved before this form)
    const formVars = variables.filter((v) => v.kind !== 'import');

    return (
      <div className="space-y-4 text-sm text-muted-foreground text-left">
        <p className="leading-relaxed">{t('prompts.fillVariablesIntro')}</p>
        <div className="grid gap-3">
          {formVars.map((variable) => (
            <div key={variable.raw} className="grid gap-1.5">
              <Label
                htmlFor={`var-${variable.name}`}
                className="text-foreground font-medium"
              >
                {variable.name}
              </Label>
              {variable.kind === 'select' && variable.options ? (
                <Select
                  value={values[variable.name] ?? variable.options[0]}
                  onValueChange={(value) =>
                    setValues((prev) => ({ ...prev, [variable.name]: value }))
                  }
                >
                  <SelectTrigger id={`var-${variable.name}`}>
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {variable.options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`var-${variable.name}`}
                  value={values[variable.name] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [variable.name]: e.target.value }))
                  }
                  placeholder={t('prompts.variablePlaceholder')}
                  className="text-foreground"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
);
