import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CAPABILITIES, DEFAULT_SETTINGS, dependencies, permissionsFor, type BrowserSettings, type Capability } from '@/shared/browser-agent/contracts';
import { applyCachedExtensionPageTheme, syncExtensionPageTheme, watchExtensionPageTheme } from '@/shared/lib/extension-page-theme';
import '@/index.scss';
import './style.css';

// Replay the cached theme before the first paint, then reconcile with the
// stored preference. This window can stay open while the theme is changed in
// the sidebar, so it also keeps watching.
applyCachedExtensionPageTheme();
void syncExtensionPageTheme();
watchExtensionPageTheme();

const labels: Record<Capability, string> = { 'tabs.read': '读取标签页', 'tabs.write': '整理标签页与备注', 'tabGroups.read': '读取标签组', 'tabGroups.write': '整理标签组', 'bookmarks.read': '读取收藏夹', 'bookmarks.write': '整理收藏夹' };
async function request(settings?: BrowserSettings) {
  const result = await browser.runtime.sendMessage({ type: 'BROWSER_AGENT', payload: settings ? { action: 'configure', settings } : { action: 'settings' } });
  if (!result.success) throw new Error(result.error);
  return result.data as BrowserSettings;
}
function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { request().then(setSettings).catch(e => setError(e.message)).finally(() => setBusy(false)); }, []);
  const change = async (next: BrowserSettings, grant?: Capability) => {
    setBusy(true); setError('');
    try {
      // The request is invoked directly inside the extension-page click gesture.
      if (grant && !await chrome.permissions.request({ permissions: permissionsFor(dependencies(grant)) })) throw new Error('未授权，能力保持关闭。');
      setSettings(await request(next));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <main>
    <h1>Browser Agent</h1><p>仅支持 Chrome。所有整理改动都需要逐批批准，包括排序、分组和撤销。</p>
    <h2>浏览器权限</h2>
    {CAPABILITIES.map(cap => <label key={cap}>
      <input type="checkbox" checked={settings.capabilities.includes(cap)} disabled={busy} onChange={e => {
        const enabled = e.target.checked;
        const capabilities = enabled ? [...new Set([...settings.capabilities, ...dependencies(cap)])] : settings.capabilities.filter(c => !dependencies(c).includes(cap));
        void change({ ...settings, capabilities }, enabled ? cap : undefined);
      }} />{labels[cap]}
    </label>)}
    <p>整理需要同时读取对象及组关系。关闭读取会同时关闭依赖它的整理能力；不会移除扩展其他功能共用的 Chrome 权限。</p>
    <h2>URL 隐私</h2>
    <label><input type="checkbox" checked={settings.shareFullUrls} disabled={busy} onChange={e => void change({ ...settings, shareFullUrls: e.target.checked })} />允许 AI 读取完整 URL</label>
    <p>默认开启：完整链接会发送到当前 AI 对话。标题含糊时，支持原生网页访问的模型可以自行查看链接，了解是什么页面。页面访问是模型自身能力，插件不提供或控制此能力。</p>
    <p>关闭后仅提供协议和域名，隐藏路径、参数与片段。已经发送到对话的地址无法收回。</p>
    <h2>本机记录与撤销</h2>
    <p>审计与恢复数据仅保存在当前 Chrome 配置文件，不参与插件同步和备份。发送给模型的工具结果仍属于当前 AI 对话。</p>
    <p>关闭标签后只尽力重新打开链接，不能保证恢复表单、滚动位置或页面运行状态。重启 Chrome 后不能撤销旧标签操作；恢复收藏夹会生成新 ID。</p>
    {error && <p role="alert" className="error">{error}</p>}
    <button onClick={() => window.close()}>完成</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Settings />);
