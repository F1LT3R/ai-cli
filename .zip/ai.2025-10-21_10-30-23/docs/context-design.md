
# Chat Context Persistence — Design (CLI)

## Purpose
Persist conversation context and connection settings in a single JSON file at `/.ai/openai.json`, so the CLI can maintain continuity between prompts (turns) without relying on external state. The CLI will read, update, and write this file **on every run**.

## File Location & Shape
- Path: `/.ai/openai.json` (project-root relative)
- Sections:
  - **provider/base_url/model**: connection config
  - **system/temperature/max_tokens/stream_default/save_path_default**: runtime defaults
  - **conversation**: ordered list of prior messages `{role, content, timestamp}`
  - **meta**: bookkeeping like `last_updated` and `total_turns`

### Example (abbreviated)
```json
{
  "provider": "openai",
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-4o-mini",
  "system": "You are a helpful assistant.",
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream_default": true,
  "save_path_default": "ai.out.txt",
  "env_key": "OPENAI_API_KEY",
  "conversation": [
    { "role": "system", "content": "You are a helpful assistant.", "timestamp": "2025-10-20T12:00:00Z" },
    { "role": "user", "content": "First question ...", "timestamp": "2025-10-20T12:01:00Z" },
    { "role": "assistant", "content": "First answer ...", "timestamp": "2025-10-20T12:01:10Z" }
  ],
  "meta": { "last_updated": "2025-10-20T12:01:10Z", "total_turns": 1 }
}
```

## Lifecycle (per CLI run)
1. **Load** `/.ai/openai.json` (create with defaults if missing)
2. **Assemble prompt**:
   - Inject `system` from file unless overridden by `--system`
   - Prepend recent `conversation` turns (pruned to token budget; see below)
   - Append **current user message** from positional arg or stdin
3. **Call API** (streaming to stdout by default)
4. **On completion**:
   - Append `{ role: 'user', content: <prompt> }` and `{ role: 'assistant', content: <finalText> }` to `conversation`
   - Update `meta.last_updated` and increment `meta.total_turns`
   - **Write back** the JSON file atomically
5. **Save finalText** to `save_path_default` or `--save`

## Pruning Strategy (Token Budget)
- Maintain a target **context window** by trimming oldest pairs:
  - Keep most recent `N` tokens/characters (simple heuristic initially)
  - Always include 1 `system` message (latest)
- Future enhancement: approximate tokenization for smarter pruning

## Atomic Writes & Concurrency
- Write to a temporary file `openai.json.tmp` then rename → atomic on POSIX
- If another process writes concurrently, re-read and **merge** by keeping the most recent `meta.last_updated` and concatenating conversations (deduplicate if identical last turn)

## Overrides & Environment
- `OPENAI_API_KEY` is **not** stored in the JSON file
- Flags override JSON defaults at runtime but do **not** overwrite stored defaults unless a `--persist` flag is later introduced (out of scope for now)

## Error Handling
- If JSON is invalid, back it up to `openai.json.bak-<timestamp>` and regenerate with defaults
- If write fails, print a clear message to stderr and exit with code 2

## Security
- Do not store secrets in JSON
- Recommend adding `.ai/openai.json` to `.gitignore` or committing with caution

## Testing (later)
- Unit test read/update/write cycle with a temp directory
- Simulate concurrent writes via two processes
- Verify pruning keeps system + most recent turns
