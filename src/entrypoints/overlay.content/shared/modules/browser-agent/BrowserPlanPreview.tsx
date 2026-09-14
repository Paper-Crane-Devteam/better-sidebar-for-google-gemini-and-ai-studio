import React from 'react';
import type { PlanPreview } from '@/shared/browser-agent/contracts';

const names: Record<string, string> = { create: '创建', activate: '激活', move: '移动 / 排序', pin: '固定状态', close: '关闭', label: '修改扩展备注', update: '修改', delete: '删除', ungroup: '取消分组' };
const fields: Record<string, string> = { tab_id: '标签', tab_ids: '标签', group_id: '组', window_id: '目标窗口', index: '位置（从 0 开始）', pinned: '固定', collapsed: '折叠', title: '标题', label: '备注', id: '对象', parent_id: '目标目录', url: '地址', color: '颜色' };
export function BrowserPlanPreview({ plan }: { plan: PlanPreview }) {
  return <div className="space-y-2 rounded border border-border/50 bg-background/60 p-3 text-xs text-foreground">
    <strong>{plan.count} 项操作 · 批准仅适用于下面这一批</strong>
    <div className="max-h-64 space-y-2 overflow-y-auto">
      {plan.items.map((raw, index) => {
        const item = raw as { operation: Record<string, unknown>; targets?: Array<Record<string, unknown>>; target_count?: number; undo?: boolean; changes?: Array<{ kind: string; id: string; from?: unknown; to?: unknown }> };
        return <div key={index} className="rounded bg-muted/40 p-2">
          <div className="font-medium">{index + 1}. {item.undo ? '撤销：' : ''}{names[String(item.operation.type)] ?? String(item.operation.type)}</div>
          {!!item.target_count && <div>涉及 {item.target_count} 个对象{item.target_count > 100 ? '（前 100 个如下）' : ''}</div>}
          {item.targets?.map((t, i) => <div key={i} className="break-all text-muted-foreground">{String(t.title || t.label || '无标题')} · #{String(t.id)}{t.url ? ` · ${t.url}` : ''}{t.windowId !== undefined ? ` · 当前窗口 ${t.windowId}` : ''}{t.index !== undefined ? ` · 原位置 ${t.index}` : ''}{t.parentId !== undefined ? ` · 原目录 ${t.parentId}` : ''}</div>)}
          {Object.entries(item.operation).filter(([k]) => k !== 'type').map(([k, v]) => <div key={k} className="break-all">{fields[k] ?? k}：{typeof v === 'boolean' ? (v ? '是' : '否') : String(v)}</div>)}
          {item.changes?.map((change, i) => <div key={i} className="mt-2 break-all border-t border-border/40 pt-1">
            <div>对象 #{change.id}</div><div>当前：{describeBrowserState(change.from)}</div><div>恢复为：{describeBrowserState(change.to)}</div>
          </div>)}
        </div>;
      })}
    </div>
    <p className="text-muted-foreground">{plan.warning}</p>
  </div>;
}

export function describeBrowserState(value: unknown): string {
  if (!value) return '不存在';
  const state = value as Record<string, unknown>;
  return Object.entries(state).filter(([key]) => key !== 'id').map(([key, value]) => `${({ windowId: '窗口', groupId: '组', parentId: '目录', active: '激活', ...fields } as Record<string, string>)[key] ?? key}: ${typeof value === 'boolean' ? value ? '是' : '否' : value}`).join('；');
}
