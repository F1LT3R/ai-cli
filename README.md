# ai-cli

Minimal CLI to stream LLM responses via [OpenRouter](https://openrouter.ai) with interactive conversation mode, syntax-highlighted markdown, code extraction, and inline image display.

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
ai "<prompt>" [--model id] [--system text] [--no-stream] [--models] [--continue] [--code] [--json] [--debug]
```

### Examples

```sh
ai "explain closures in javascript" --model flash
ai "write a node http server" --code --model nano
ai "list 5 fruits" --json
ai "draw a banana" --model image
ai --continue "now make it yellow"     # resume prior conversation
echo "summarize this" | ai             # pipe input
```

### Interactive mode

After each response, you get an interactive prompt:

- **Type + Enter** — send a follow-up message
- **Esc** — save the last response to a file
- **Ctrl+S** — save the full conversation transcript
- **Ctrl+C** — exit (conversation is persisted to config)

When piped (non-TTY), the response is auto-saved without prompting.

### Flags

| Flag | Description |
|---|---|
| `--model <alias\|id>` | Choose a model by alias or full OpenRouter ID |
| `--system <text>` | Override the system prompt |
| `--no-stream` | Wait for full response instead of streaming |
| `--models` | List available model aliases |
| `--continue` | Resume the previous conversation from config |
| `--code` | Extract code blocks on save (suggests `code.js`, etc.) |
| `--json` | Request JSON output format |
| `--debug` | Print raw request/response JSON to stderr |

### Models

| Alias | Model | Notes |
|---|---|---|
| `nano` | openai/gpt-4.1-nano | Cheapest, fast (default) |
| `mini` | openai/gpt-5-mini | Low-cost, good coding |
| `gpt5` | openai/gpt-5.2 | OpenAI GPT-5.2 |
| `flash` | google/gemini-2.5-flash | Gemini 2.5 Flash |
| `gemma` | google/gemma-3-27b-it | Google Gemma 3 27B |
| `llama` | meta-llama/llama-3.3-70b | Meta Llama 3.3 70B |
| `mistral` | mistralai/mistral-small-3.2 | Mistral Small 3.2 |
| `deepseek` | deepseek/deepseek-v3.2 | DeepSeek V3.2 |
| `image` | google/gemini-2.5-flash-image | Image generation (Nano Banana) |

You can also pass any full OpenRouter model ID directly: `--model anthropic/claude-sonnet-4`

### Image generation

Use `--model image` to generate images. In iTerm2, images display inline. In other terminals, images are saved to disk as PNG files.

## Project structure

```
bin/ai.mjs                         CLI entrypoint
lib/markdown-renderer.mjs          Streaming markdown renderer with syntax highlighting
lib/options.mjs                    CLI flag parser
lib/response-shape.mjs             Request body shaping (JSON format, etc.)
lib/validators.mjs                 Output validators by format
```

## Config

On first run, a `.ai/config.json` file is created in the nearest directory containing a `package.json`. It stores model settings and conversation history for `--continue`.

## Tests

```sh
node --test bin/ai.test.mjs lib/options.test.mjs lib/markdown-renderer.snap.test.mjs lib/markdown-renderer.output.test.mjs lib/validators.test.mjs
```

## License

MIT
