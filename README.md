<p align="center">
  <img src="logo2.png" alt="ai-cli logo" width="256">
</p>

# ai-cli

Minimal CLI to stream LLM responses via [OpenRouter](https://openrouter.ai).

- 💬 **Interactive conversation mode** — follow-up naturally, context preserved
- 📎 **File attachments** — drag & drop images or code files right into the terminal
- ✨ **Syntax-highlighted markdown** — beautiful streaming output
- 🧩 **Code extraction** — pull code blocks straight to files
- 🎨 **Image generation & display** — inline images in iTerm2
- 🔄 **Conversation continuity** — pick up where you left off with `--continue`

## Setup

```sh
npm install
npm link        # makes `ai` available globally
```

Set your API key:

```sh
export OPENROUTER_API_KEY="sk-or-..."
```

## Usage

```
ai "<prompt>" [file ...] [--model id] [--out [path]] [--prefix str] [--size tier] [--ratio W:H] [--system text] [--no-stream] [--models] [--continue] [--code] [--json] [--max] [--debug] [--update-pricing] [--init]
```

### Examples

```sh
ai "explain closures in javascript" --model flash
ai "write a node http server" --code --model nano
ai "list 5 fruits" --json
ai "draw a banana" --model image
ai "draw a banana" --model image --ratio 16:9
ai "draw a banana" --model image --size 4K --ratio 16:9
ai "write a node http server" --code --out    # saves to code.js
ai "draw a logo" --model image --out logo.png # saves image to logo.png
ai "list 5 fruits" --json --out --prefix my-  # saves to my-conv-1.json
ai "describe this" photo.png                  # attach an image
ai "review these" src/app.js src/utils.js     # attach text files
ai --continue "now make it yellow"            # resume prior conversation
echo "summarize this" | ai                    # pipe input
```

### Interactive mode

After each response, you get an interactive prompt:

- **Type + Enter** — send a follow-up (drag/paste file paths to attach them)
- **Esc** — save the last response to a file
- **Ctrl+S** — save the full conversation transcript
- **Ctrl+C** — exit (conversation is persisted to config)

When piped (non-TTY), the response is auto-saved without prompting.

### Flags

| Flag | Description |
|---|---|
| `--model <alias\|id>` | Choose a model by alias or full OpenRouter ID |
| `--out [path]` | Save to file and exit — auto-names by content type if no path given. Never overwrites; increments filename. |
| `--prefix <str>` | Prepend string to auto-generated filenames (use with `--out`) |
| `--size <tier>` | Image resolution: `1K` (default), `2K`, `4K` |
| `--ratio <W:H>` | Image aspect ratio: `1:1`, `16:9`, `4:3`, `3:2`, etc. |
| `--no-inline` | Save images to disk instead of displaying inline |
| `--system <text>` | Override the system prompt |
| `--no-stream` | Wait for full response instead of streaming |
| `--models` | List available model aliases |
| `--continue` | Resume the previous conversation from config |
| `--code` | Extract code blocks on save (suggests `code.js`, etc.) |
| `--json` | Request JSON output format |
| `--max` | Remove max_tokens cap, use model's full output limit |
| `--debug` | Print raw request/response JSON to stderr |
| `--init` | Create a local `.ai/config.json` in the current directory, inheriting from parent |
| `--update-pricing` | Fetch latest model pricing from OpenRouter and cache locally |

### Models

| Alias | Model | Notes |
|---|---|---|
| `nano` | openai/gpt-4.1-nano | Cheapest, fast (default) |
| `mini` | openai/gpt-5-mini | Low-cost, good coding |
| `gpt5` | openai/gpt-5.2 | OpenAI GPT-5.2 |
| `flash` | google/gemini-2.5-flash | Gemini 2.5 Flash |
| `flash3` | google/gemini-3-flash-preview | Gemini 3 Flash (preview) |
| `pro3` | google/gemini-3-pro-preview | Gemini 3 Pro (preview) |
| `gemma` | google/gemma-3-27b-it | Google Gemma 3 27B |
| `gemma4b` | google/gemma-3-4b-it | Google Gemma 3 4B (tiny) |
| `llama` | meta-llama/llama-3.3-70b | Meta Llama 3.3 70B |
| `llama8b` | meta-llama/llama-3.1-8b | Meta Llama 3.1 8B (tiny) |
| `qwen7b` | qwen/qwen-2.5-7b-instruct | Qwen 2.5 7B (tiny) |
| `qwenvl` | qwen/qwen-2.5-vl-7b-instruct | Qwen 2.5 VL 7B (vision, charts) |
| `mistral` | mistralai/mistral-small-3.2 | Mistral Small 3.2 |
| `deepseek` | deepseek/deepseek-v3.2 | DeepSeek V3.2 |
| `kimi` | moonshotai/kimi-k2.5 | Moonshot Kimi K2.5 |
| `grok` | x-ai/grok-4 | xAI Grok 4 (thinking) |
| `grokcode` | x-ai/grok-code-fast-1 | xAI Grok Code Fast |
| `haiku` | anthropic/claude-haiku-4.5 | Claude Haiku 4.5 (fast) |
| `sonnet` | anthropic/claude-sonnet-4.6 | Claude Sonnet 4.6 |
| `opus` | anthropic/claude-opus-4.6 | Claude Opus 4.6 |
| `image` | google/gemini-2.5-flash-image | Image generation (Nano Banana) |

You can also pass any full OpenRouter model ID directly: `--model anthropic/claude-sonnet-4.6`

### File attachments

Attach files as extra positional args after the prompt. Images (`.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, `.svg`) are sent as base64; all other files are sent as inline text.

```sh
ai "describe this" photo.png
ai "review these files" src/app.js src/utils.js
```

In interactive mode, drag files into the terminal or paste absolute paths at the `>` prompt. Multi-file drag-and-drop is supported (bracketed paste). If you provide only file paths with no text, the default prompt "Describe the attached files" is used.

Attachments are stored in the conversation, so `--continue` re-reads the original files for context.

### Image generation

Use `--model image` to generate images. Use `--ratio` for aspect ratio and `--size` for resolution tier — they can be combined (e.g. `--size 4K --ratio 16:9`). Supported ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. Supported tiers: `1K` (default), `2K`, `4K`.

Images display inline in iTerm2 (including inside tmux with `allow-passthrough on`). In tmux, large images are automatically thumbnailed to fit tmux's passthrough buffer — the inline display is a preview that disappears on window redraw. Use `--out` to save the full-resolution file. In other terminals, images are saved to disk as PNG files. Use `--no-inline` to always save to disk instead of displaying inline.

**tmux setup** for inline images:
```
# ~/.tmux.conf
set -g allow-passthrough all
```

Files are never overwritten — if `image.png` exists, the next save writes `image-1.png`.

### Cost tracking

After each response, a status line shows context usage, tokens, and cost:

```
Context: ⢀ 0% | Tokens: 150↑/800↓ | Cost: $0.0004q/$0.0004s/$0.0004t
```

- **Context**: braille fill meter showing context window usage
- **Tokens**: green input↑ / red output↓
- **Cost**: query (`q`), session (`s`), and total conversation (`t`)

On quit, a session summary is displayed. When using `--continue`, the conversation total includes cost from prior sessions.

Pricing data is cached locally in `lib/pricing.json` from OpenRouter's model list. The cache is auto-fetched when running `--models` if missing or stale (>7 days). Run `--update-pricing` to refresh manually. If no local pricing is available, the cost field falls back to OpenRouter's `usage.cost` from the API response.

## Project structure

```
bin/ai.mjs                         CLI entrypoint
lib/markdown-renderer.mjs          Streaming markdown renderer with syntax highlighting
lib/options.mjs                    CLI flag parser
lib/pricing.mjs                    Pricing fetch, cache, lookup, cost calculation
lib/pricing.json                   Cached model pricing data from OpenRouter
lib/response-shape.mjs             Request body shaping (JSON format, etc.)
lib/validators.mjs                 Output validators by format
```

## Config

Config is resolved in this order:

1. `.ai/config.json` in the current directory (if it exists)
2. Walk up to the nearest `package.json` and use its `.ai/config.json`
3. Fall back to current directory

Use `ai --init` to create a local config in any subdirectory. It inherits settings (model, system prompt, API key) from the nearest parent config but starts with a fresh conversation.

## Tests

```sh
node --test bin/ai.test.mjs lib/options.test.mjs lib/markdown-renderer.snap.test.mjs lib/markdown-renderer.output.test.mjs lib/validators.test.mjs lib/pricing.test.mjs
```

## License

MIT
