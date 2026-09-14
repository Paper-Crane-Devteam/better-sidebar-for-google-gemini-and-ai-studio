import React, { useEffect, useState } from 'react';
import { BrowserAgentPanel } from './BrowserAgentPanel';
import { browserRequest, initializeBrowserAgent } from './client';
import { browserEntryNeedsPermission, getAgentEntries } from '../agent-loop/agent-entry';
import { agentEventBus } from '../agent-loop/event-bus';
import { useAgentLoopStore } from '../agent-loop/agent-loop-store';

/** The browser panel shares the upstream agent switcher and session identity. */
export function BrowserAgentLauncher() {
  useEffect(initializeBrowserAgent, []);
  const busy = useAgentLoopStore(s => s.status !== 'idle');
  const [task, setTask] = useState('');
  const [error, setError] = useState('');
  useEffect(() => agentEventBus.on('launcher:failed', () => setError('请先打开聊天，并完成或停止正在运行的任务。')), []);
  const stage = async (entryId: string) => {
    if (busy) return;
    setError('');
    if (browserEntryNeedsPermission(entryId)) {
      try { await browserRequest({ action: 'open-settings' }); } catch (e) { setError((e as Error).message); }
      return;
    }
    agentEventBus.emit('launcher:run-entry', { entryId, userInput: task.trim(), autoSend: false });
  };
  return <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
    <p>用 AI 整理 Chrome 标签页、标签组与收藏夹。</p>
    <BrowserAgentPanel />
    <textarea aria-label="Browser Agent 任务" value={task} onChange={e => setTask(e.target.value.slice(0, 1000))} disabled={busy}
      placeholder="描述你想整理的内容…" rows={3} className="w-full rounded border border-border bg-background p-2" />
    {getAgentEntries().filter(e => e.agent.id === 'browser').map(entry => <button key={entry.id} type="button" disabled={busy}
      className="block w-full rounded bg-muted/40 p-2 text-left hover:bg-accent disabled:opacity-40" onClick={() => void stage(entry.id)}>{entry.title}</button>)}
    <p className="text-muted-foreground">选择后会填入聊天输入框，确认内容后发送。所有浏览器改动都需逐批批准。</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>;
}
