import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'tool-parser-'));
try {
  await build({ stdin: { resolveDir: process.cwd(), contents: `
    export * from './src/entrypoints/overlay.content/shared/modules/agent-loop/engine/parser/index.ts';
    export * from './src/entrypoints/overlay.content/shared/modules/agent-loop/renderer/helpers/tool-parser.ts';
    export * from './src/shared/documents/ops.ts';
  ` }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'parser.mjs') });
  const { parseToolCalls, parseAllToolCallsFromText, parseOps, hasUnclosedToolBlock } = await import(pathToFileURL(join(dir, 'parser.mjs')));
  const ops = [{ type: 'highlight', page: 1, text: '1) 按 照提供的需求文档模版，填写好相应的内容， 如果有群， @ Kay Wu( 吴凯 ) 、', comment: '【接入申请】需联系项目组关键接口人，无群则通过邮件发送需求文档。' }, { type: 'watermark', pages: '1-3', text: 'Better Sidebar', size: 36, opacity: 0.15 }];
  const body = `{"name":"doc_edit","description":"添加批注","params":{"path":"业务方接入常见问题.pdf","ops":"${JSON.stringify(ops)}","change_summary":"在第 1 至 3 页添加 "Better Sidebar" 水印。"}}`;
  const raw = `<bs_agent_tool>${body}</bs_agent_tool>`;
  const escaped = raw.replaceAll('<', '\\<').replaceAll('_', '\\_');
  for (const source of [raw, escaped]) {
    const result = parseToolCalls(source);
    assert.deepEqual(result.errors, []);
    assert.equal(result.toolCalls.length, 1);
    const rendered = parseAllToolCallsFromText(source);
    assert.equal(rendered.length, 1);
    assert.deepEqual(rendered[0].toolCall, result.toolCalls[0]);
    assert.equal(source.slice(rendered[0].startIndex, rendered[0].endIndex), source);
    assert.equal(result.toolCalls[0].params.change_summary, '在第 1 至 3 页添加 "Better Sidebar" 水印。');
    const normalized = parseOps(result.toolCalls[0].params.ops);
    assert.equal(normalized[0].op, 'highlight');
    assert.equal(normalized[1].op, 'watermark');
    assert.equal(normalized[0].text, ops[0].text);
    assert.equal(hasUnclosedToolBlock(source), false);
    assert.equal(hasUnclosedToolBlock(source.slice(0, source.lastIndexOf('}'))), true);
    assert.equal(parseToolCalls('```json\n' + source + '\n```').toolCalls.length, 0);
  }
  const completed = '<bs_agent_tool>{"name":"complete_task","description":"完成 PDF 水印添加任务","params":{"status":"success","summary":"已成功在《业务方接入常见问题.pdf》的前 3 页加上了 "Better Sidebar" 水印。"}}</bs_agent_tool>';
  for (const source of [completed, completed.replaceAll('<', '\\<').replaceAll('_', '\\_')]) {
    const result = parseToolCalls(source);
    assert.deepEqual(result.errors, []);
    assert.equal(result.toolCalls[0].name, 'complete_task');
    assert.equal(result.toolCalls[0].params.summary, '已成功在《业务方接入常见问题.pdf》的前 3 页加上了 "Better Sidebar" 水印。');
    assert.deepEqual(parseAllToolCallsFromText(source)[0].toolCall, result.toolCalls[0]);
  }
  // Existing valid calls and nested arrays stay byte-for-byte equivalent at the tool boundary.
  const nested = [{ op: 'set_cells', values: [['a]', 'b'], ['c', 'd']] }];
  for (const value of [nested, JSON.stringify(nested)]) {
    const valid = { name: 'doc_edit', params: { path: 'test.xlsx', ops: value, change_summary: 'Keep "quotes" and \\ paths' } };
    const result = parseToolCalls(`<bs_agent_tool>${JSON.stringify(valid)}</bs_agent_tool>`);
    assert.equal(result.toolCalls[0].params.ops, JSON.stringify(nested));
  }
  const nestedBroken = `<bs_agent_tool>{"name":"doc_edit","params":{"path":"test.xlsx","ops":"${JSON.stringify(nested)}"}}</bs_agent_tool>`;
  assert.equal(parseToolCalls(nestedBroken).toolCalls[0].params.ops, JSON.stringify(nested));
  assert.throws(() => parseOps('[{"op":"highlight","type":"delete_pages"}]'), /conflicting/);
  assert.throws(() => parseOps('[{"op":42}]'), /op/);
  // Do not guess malformed executable strings, or swallow later parameters into a summary.
  assert.equal(parseToolCalls('<bs_agent_tool>{"name":"doc_edit","params":{"path":"a "b".pdf","ops":[]}}</bs_agent_tool>').toolCalls.length, 0);
  assert.equal(parseToolCalls('<bs_agent_tool>{"name":"doc_edit","params":{"path":"x.pdf","ops":[],"change_summary":"bad "quote", "extra":"still broken"text"}}</bs_agent_tool>').toolCalls.length, 0);
  console.log('Document tool parser checks passed: quoted ops, summary quotes, escaped protocol, renderer parity, type alias, nested arrays and conservative rejection.');
} finally { await rm(dir, { recursive: true, force: true }); }
