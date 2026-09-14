/**
 * The parts of a soul that belong to the loop, not to the agent.
 *
 * Two agents now, each with its own identity, tools and rules — but the *protocol* is the
 * same for both, because it is the extension's protocol: how a tool call is written, how
 * results come back, how a response is allowed to end. Those blocks live here so a change
 * to the loop does not have to be made twice and cannot drift between agents.
 *
 * ⚠️ Anything agent-specific must **not** end up in this file. The tell is whether the
 * text mentions a table, a file, a tool name or a domain concept. "Call complete_task
 * alone in its own response" is protocol; "always SELECT before you write" is the Better
 * Sidebar agent's rule and lives in its own soul.
 *
 * Every block is a plain function returning markdown, deliberately: the assembler joins
 * them, so an agent can reorder, drop, or wrap any of them without a template engine.
 */

// Deep import on purpose: `budget.ts` is a dependency-free constants leaf, while going
// through `engine/index` would close a cycle (engine → tools → prompt-assembler → here).
// The number the prompt quotes has to be the one the code enforces.
import { ROUND_BUDGET } from '../../engine/stages/handoff/budget';

/** The tool-call wire format. Identical for every agent — the parser is one parser. */
export function toolProtocolBlock(): string {
  return `## How to Call Tools

Every tool call goes inside a \`\`\`text fenced code block, like this:

\`\`\`text
<bs_agent_tool>
{"name": "TOOL_NAME", "description": "brief description of what this call does", "params": {"PARAM_NAME": "PARAM_VALUE"}}
</bs_agent_tool>
\`\`\`

Rules for tool call format:
- **The \`\`\`text fence is REQUIRED.** Outside a fence the platform rewrites your text
  before the extension sees it: quoted attributes get requoted and reordered, so
  \`className=\\"w-4 h-4\\"\` arrives as \`className="\\"w-4" h-4\\"\` and the call is discarded.
  Inside the fence it arrives exactly as you wrote it. This is not a style preference —
  it is the difference between the call running and the call being thrown away.
- The \`<bs_agent_tool>\` wrapper is REQUIRED, inside the fence
- Inside must be a valid JSON object with "name", "description", and "params" fields
- "description" is REQUIRED — a short human-readable explanation
- Escape quotes inside all JSON strings (including summary/change_summary); use Chinese quotation marks 「…」 in prose to avoid nested double quotes. Do not Markdown-escape tag names or tool names.
- A param that takes a list is a real JSON array: \`"ids": ["a", "b"]\`. Never a quoted string \`"ids": "[...]"\` — the inner quotes come out unescaped and the entire tool call is discarded unparsed
- You can output multiple fenced tool calls in one response (executed in order). Give each
  its own fence rather than putting several in one.
- IMPORTANT: Always use <bs_agent_tool> tags (NOT <tool_call>)`;
}

/**
 * `change_summary` on anything that changes the user's data.
 *
 * Phrased around "the person who has to say yes" rather than around a tool name, because
 * both agents have write tools and the approval card is the same card.
 */
export function changeSummaryBlock(): string {
  return `## Every write must explain itself

Any tool call that **changes** something — a row, a file, a document — must carry a
\`change_summary\` param: markdown, in plain language, saying what the user's data will
look like afterwards. Reads change nothing and need none.

**Write it for the person who has to say yes.** They are shown this text and asked to
allow or refuse, and they generally cannot read the SQL or the file body themselves.

⚠️ **Escape every line break as \`\\n\`.** \`change_summary\` sits inside a JSON string, and
a real line break there is invalid JSON — it throws away the whole tool call, the
operation included.`;
}

/** How results arrive, and the marker to ignore. */
export function resultsBlock(): string {
  return `## How Results Come Back

Results arrive as your next user message, inside \`<bs_agent_result>\`, one \`###\` section
per call. Each heading ends with a marker like \`[[bs:a1b2c3d4e5]]\`.

That marker is bookkeeping for the extension — it is how the interface knows which of
your calls each result belongs to. **Ignore it.** Do not copy it into your tool calls, and
do not try to produce one yourself.`;
}

/**
 * The two ways a response may end.
 *
 * The `complete_task`-alone rule is the one piece of protocol the loop cannot survive
 * without: a response that both does work and declares the task finished is claiming
 * results it has not seen, and the session ends on a guess.
 */
export function responseEndBlock(): string {
  return `## How a Response Ends

### Never call complete_task in the same response as work

**You have not seen the results of the tools in the response you are currently writing.**


You do **not** need to ask permission before a write. The extension confirms those with
the user itself`;
}

/**
 * How much room results have.
 *
 * Framed as "a generous budget, spend it" rather than as a list of caps, and that framing
 * is deliberate: an agent told to keep things small samples three rows from every source
 * and then answers confidently from almost nothing. Truncation, by contrast, announces
 * itself — `budget.ts` appends a notice saying what was cut and how to ask for the rest.
 *
 * `heavyField` is the one thing worth naming per agent: the field or file that can eat the
 * whole budget in a single result.
 */
export function resultBudgetBlock(heavyField?: string): string {
  const base = `## Result Size Budget

All tool results from one response travel back to you through the chat input, which holds
about ${ROUND_BUDGET} characters. Past that the extension truncates the output and tells
you it did.

**This is a lot of room — use it.** Do not shrink every request to a handful of items
"just in case". If output does come back truncated, don't repeat the same call hoping for more — it
will be cut at the same point. Narrow it, or page through it.`;

  return heavyField ? `${base}\n\n${heavyField}` : base;
}

/**
 * The skills the running agent can pull in on demand.
 *
 * ⚠️ Returns an empty string when the agent has no skills. An agent told to consider
 * skills and then shown an empty list will call `activate_skill` with an invented id,
 * burning a round to be told the id does not exist.
 */
export function skillsBlock(summary: string): string {
  if (!summary.trim()) return '';

  return `## Skills

If the task clearly matches one of these, call \`activate_skill\` to load its detailed
instructions. If none matches, just proceed — but still make your first response a tool
call of some kind.

${summary}`;
}

/** The tool schemas for whichever MCP servers this agent owns. */
export function toolsBlock(schemas: string): string {
  return `## Available Tools

${schemas}`;
}

/** Join blocks, dropping the empty ones and normalising the gaps between them. */
export function joinBlocks(blocks: Array<string | null | undefined>): string {
  return blocks
    .map((block) => (block ?? '').trim())
    .filter((block) => block !== '')
    .join('\n\n');
}
