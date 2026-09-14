import React, { useState } from 'react';
import { browserRequest, useBrowserAgent } from './client';
import { BrowserPlanPreview, describeBrowserState } from './BrowserPlanPreview';
import type { PlanPreview, EntityChange } from '@/shared/browser-agent/contracts';
import { useAgentLoopStore } from '../agent-loop/agent-loop-store';

type HistoryItem = { batch_id: string; tool: string; status: string; completed: number; planned: number; created_at: number; can_undo: boolean; error?: string };
const statusLabels: Record<string, string> = { applied: '已完成', failed: '已停止', applying: '执行中', unknown: '结果不确定，请检查浏览器', undone: '已撤销' };
export function BrowserAgentPanel() {
  const settings = useBrowserAgent(s => s.settings);
  const running = useAgentLoopStore(s => s.status !== 'idle');
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [detail, setDetail] = useState<EntityChange[] | null>(null);
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Array<{ id: number; title: string; label: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => { const result = await browserRequest<{ items: HistoryItem[] }>({ action: 'read', tool: 'browser_query_changes', params: { limit: '50' } }); setHistory(result.items); };
  const work = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <div className="mb-4 space-y-2 rounded-md border border-border/50 p-3 text-xs">
    <p>所有改动都需批准，包括排序。权限：{settings.capabilities.length ? `${settings.capabilities.length} 项已开启` : '尚未授权'}。</p>
    <p className="text-muted-foreground">完整 URL：{settings.shareFullUrls ? '允许 AI 读取' : '已脱敏'}。审计仅留本机。</p>
    <div className="flex gap-3">
      <button type="button" className="underline" onClick={() => void work(async () => { await browserRequest({ action: 'open-settings' }); })}>权限与隐私设置</button>
      <button type="button" disabled={busy} className="underline" onClick={() => void work(load)}>查看本机记录</button>
      {settings.capabilities.includes('tabs.read') && <button type="button" disabled={busy} className="underline" onClick={() => void work(async () => {
        const result = await browserRequest<{ items: Array<{ id: number; title: string; label: string }> }>({ action: 'read', tool: 'browser_list_tabs', params: { limit: '100' } });
        setNotes(result.items.filter(t => t.label));
      })}>标签备注</button>}
    </div>
    {notes && <div className="max-h-40 overflow-y-auto">{notes.length ? notes.map(n => <p key={n.id} className="mb-2 break-words"><strong>{n.title}</strong><br />{n.label}</p>) : <p>当前窗口前 100 个标签暂无备注。</p>}</div>}
    {history && <div className="max-h-52 space-y-2 overflow-y-auto">{history.length === 0 ? <p>暂无可查看的记录；历史读取也需要对应权限。</p> : history.map(b => <div key={b.batch_id} className="rounded bg-muted/40 p-2">
      <div>{new Date(b.created_at).toLocaleString()} · {statusLabels[b.status] ?? b.status} · {b.completed}/{b.planned}</div>
      {b.error && <p>{b.error}</p>}
      <button className="mr-3 underline" disabled={busy} onClick={() => void work(async () => {
        const result = await browserRequest<{ items: Array<{ steps: Array<{ step_index: number }> }> }>({ action: 'read', tool: 'browser_query_changes', params: { batch_id: b.batch_id } });
        const steps = await Promise.all((result.items[0]?.steps ?? []).map(s => browserRequest<{ items: Array<{ changes: { items: EntityChange[]; total: number } }> }>({ action: 'read', tool: 'browser_query_changes', params: { batch_id: b.batch_id, step_index: String(s.step_index), limit: '100' } })));
        setDetail(steps.flatMap(s => s.items[0]?.changes.items ?? []));
        setNotice('每步最多展示前 100 个变更；完整记录保存在本机，可由 Agent 分页查询。');
      })}>明细</button>
      <button className="underline disabled:opacity-40" disabled={busy || running || !b.can_undo} onClick={() => void work(async () => { setPlan(await browserRequest<PlanPreview>({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: b.batch_id } })); })}>预览撤销</button>
    </div>)}</div>}
    {notice && <p className="text-muted-foreground">{notice}</p>}
    {detail && <details open><summary>变更明细</summary><div className="max-h-48 space-y-2 overflow-auto">{detail.map((d, i) => <div key={i} className="break-all rounded bg-muted/30 p-2"><strong>对象 #{d.id}</strong><p>之前：{describeBrowserState(d.before)}</p><p>之后：{describeBrowserState(d.after)}</p></div>)}</div></details>}
    {plan && <><BrowserPlanPreview plan={plan} /><div className="flex gap-3">
      <button disabled={busy || running} className="rounded bg-primary px-3 py-1 text-primary-foreground" onClick={() => void work(async () => {
        const result = await browserRequest<{ status: string; completed: number; planned: number; error?: string }>({ action: 'commit', planId: plan.id });
        setNotice(`${statusLabels[result.status] ?? result.status}：${result.completed}/${result.planned}。${result.error ?? ''}`); setPlan(null); await load();
      })}>批准并撤销</button>
      <button disabled={busy} onClick={() => { void browserRequest({ action: 'cancel', planId: plan.id }); setPlan(null); }}>取消</button>
    </div></>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>;
}
