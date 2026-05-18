# pi-ollama-cloud

Pi extension — dynamic model discovery with thinking-level support for [ollama.com](https://ollama.com) cloud API.

Fetches the live model catalog from `https://ollama.com/api/tags` at startup and registers all available models via `pi.registerProvider()`. Falls back to `models.json` when the API is unreachable.

## Features

- **Dynamic model list** — no manual `models.json` upkeep; 39+ models auto-discovered
- **Thinking-level support** — maps Pi thinking levels (off→xhigh) to Ollama's `reasoning_effort` (none/low/medium/high)
- **Streaming reasoning** — `delta.reasoning` in streamed chat completions, handled natively by Pi's OpenAI-compat parser
- **Vision detection** — models supporting image input get `input: ["text", "image"]`
- **Context windows** — per-model context sizes resolved via lookup table
- **Graceful fallback** — keeps whatever `models.json` provides when `/api/tags` is down

## Thinking-level mapping

| Pi level | `reasoning_effort` |
|----------|-------------------|
| off | `none` |
| minimal | `low` |
| low | `low` |
| medium | `medium` |
| high | `high` |
| xhigh | `high` |

Cycle levels with `Shift+Tab` or via `/settings`.

## Install

```bash
pi install git:github.com/PopCat19/pi-ollama-cloud
```

Requires `OLLAMA_API_KEY` environment variable set to an [ollama.com API key](https://ollama.com/settings/keys).

## Prerequisites

- [ollama.com](https://ollama.com) account
- API key from https://ollama.com/settings/keys
- Pi ≥ 0.74.0

## License

MIT
