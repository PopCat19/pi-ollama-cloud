// index.ts
//
// Purpose: Discover ollama.com cloud models at startup and register them with Pi
//
// This module:
// - Fetches the live catalog from https://ollama.com/api/tags
// - Classifies each model (thinking, vision, context window, max tokens) via heuristic tables
// - Registers the resolved list with pi.registerProvider('ollama', ...)
// - Logs a warning for model ids that fall through to the unknown-default buckets

import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Heuristic detection (ollama.com cloud /api/tags doesn't return family/capabilities)
// ---------------------------------------------------------------------------

/** Model ID prefixes or exact matches known to support thinking. */
const THINKING_PATTERNS: (string | RegExp)[] = [
	/^deepseek-(r1|v[34])/, // deepseek-v3, v3.1, v3.2, v4, r1
	/^qwen3/, // qwen3-vl, qwen3-coder, qwen3-next, qwen3.5, etc.
	/^gpt-oss/, // gpt-oss:20b, gpt-oss:120b
	/^kimi-k2/, // kimi-k2, kimi-k2.5, kimi-k2.6, kimi-k2-thinking
	/^glm-5/, // glm-5, glm-5.1
	/^gemini-(2|3)/, // gemini-2.5, gemini-3-*
	/^minimax-m/, // minimax-m2, m2.1, m2.5, m2.7, m3 (per ollama library pages)
];

/** Model ID patterns for vision / image input. */
const VISION_PATTERNS: (string | RegExp)[] = [
	/vl/, // qwen3-vl, etc.
	/^gemma[34]/, // gemma3, gemma4
	/^gemini-(2|3)/, // gemini-2.5, gemini-3
	/^kimi-k2/, // kimi-k2*, all multimodal
	/^glm-5/, // glm-5, glm-5.1
	/^qwen3-vl/, // explicit VL models
	/^gpt-oss/, // all GPT-OSS support vision
	/^ministral-3/, // Mistral multimodal
	/^cogito-2\.1/, // cogito-2.1:671b supports vision
	/^minimax-m/, // minimax-m series is natively multimodal
];

/** Known context-window sizes keyed by model id (exact match first, then prefix). */
const EXACT_CONTEXT_WINDOWS: Record<string, number> = {
	"deepseek-v4-pro": 1_000_000,
	"deepseek-v4-flash": 1_000_000,
	"gemini-3-flash-preview": 1_000_000,
	"kimi-k2:1t": 1_048_576,
	"kimi-k2.5": 256_000,
	"kimi-k2.6": 256_000,
	"kimi-k2-thinking": 256_000,
	"kimi-k2.7-code": 256_000,
	"glm-5": 198_000,
	"glm-5.1": 198_000,
	"minimax-m3": 524_288, // ollama library page: 512K guaranteed, 1M max
};

const PREFIX_CONTEXT_WINDOWS: [string, number][] = [
	["deepseek-v3", 163_840],
	["deepseek-r1", 131_072],
	["qwen3", 131_072],
	["gpt-oss:20", 128_000],
	["gpt-oss:120", 256_000],
	["gemma4", 131_072],
	["gemma3", 131_072],
	["gemini-2", 1_048_576],
	["gemini-3", 1_048_576],
	["mistral-large-3", 256_000],
	["ministral", 131_072],
	["minimax-m2", 262_144],
	["glm-4", 128_000],
	["nemotron-3", 131_072],
	["kimi-k2", 256_000],
	["cogito-2", 262_144],
	["devstral", 131_072],
	["rnj-1", 131_072],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesAny(id: string, patterns: (string | RegExp)[]): boolean {
	return patterns.some((p) => (typeof p === "string" ? id === p : p.test(id)));
}

function resolveContextWindow(id: string): number {
	if (EXACT_CONTEXT_WINDOWS[id]) return EXACT_CONTEXT_WINDOWS[id];
	for (const [prefix, w] of PREFIX_CONTEXT_WINDOWS) {
		if (id.startsWith(prefix)) return w;
	}
	// ollama.com/api/tags omits context window; the library page is the only source.
	// Any id reaching this branch is missing from the heuristic tables and may be wrong.
	console.warn(`[ollama-cloud] unknown context window for "${id}", defaulting to 128_000 – check https://ollama.com/library/${id}`);
	return 128_000;
}

/** Guess `maxTokens` from model ID (e.g., ":120b", ":235b", ":1t"). */
function guessMaxTokens(id: string): number {
	const m = id.match(/:(\d+)\s*([bmt])\b/i);
	if (!m) return 16384;
	const n = parseInt(m[1], 10);
	const unit = m[2].toLowerCase();
	if (unit === "t") return 262_144; // trillion → huge max_tokens
	if (unit === "b") {
		if (n >= 400) return 131_072;
		if (n >= 100) return 65_536;
		if (n >= 20) return 32_768;
		return 16_384;
	}
	return 8_192; // millions
}

// ---------------------------------------------------------------------------
// Main extension factory
// ---------------------------------------------------------------------------
export default async function (pi: ExtensionAPI) {
	const apiKey = process.env.OLLAMA_API_KEY;
	if (!apiKey) {
		console.error("[ollama-cloud] OLLAMA_API_KEY not set – skipping dynamic model fetch");
		return;
	}

	try {
		const resp = await fetch("https://ollama.com/api/tags", {
			headers: { Authorization: `Bearer ${apiKey}` },
		});

		if (!resp.ok) {
			console.error(`[ollama-cloud] /api/tags returned ${resp.status} ${resp.statusText} – falling back to models.json`);
			return;
		}

		const payload = (await resp.json()) as OllamaTagsResponse;
		if (!payload.models?.length) {
			console.error("[ollama-cloud] /api/tags returned zero models – falling back to models.json");
			return;
		}

		const models: ProviderModelConfig[] = payload.models.map((m) => buildModelConfig(m));
		console.error(`[ollama-cloud] Registered ${models.length} models from ollama.com`);

		pi.registerProvider("ollama", {
			baseUrl: "https://ollama.com/v1",
			apiKey: "$OLLAMA_API_KEY",
			api: "openai-completions",
			models,
		});
	} catch (err) {
		console.error(`[ollama-cloud] Error fetching /api/tags: ${err} – falling back to models.json`);
	}
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------
interface OllamaTagsResponse {
	models: OllamaModelEntry[];
}

interface OllamaModelEntry {
	name: string;
	model: string;
	size: number;
	digest: string;
	modified_at: string;
	details: {
		format: string;
		family: string;
		families: string[] | null;
		parameter_size: string;
		quantization_level: string;
	};
	capabilities?: string[];
}

// ---------------------------------------------------------------------------
// Model builder
// ---------------------------------------------------------------------------
function buildModelConfig(entry: OllamaModelEntry): ProviderModelConfig {
	const id = entry.model;
	const explicitCaps = entry.capabilities ?? [];

	const hasThinking = explicitCaps.includes("thinking") || matchesAny(id, THINKING_PATTERNS);
	const hasVision = explicitCaps.includes("vision") || matchesAny(id, VISION_PATTERNS);

	const cfg: ProviderModelConfig = {
		id,
		name: id,
		reasoning: hasThinking,
		input: hasVision ? ["text", "image"] : ["text"],
		contextWindow: resolveContextWindow(id),
		maxTokens: guessMaxTokens(id),
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};

	// Pi levels → Ollama reasoning_effort (ollama.com OpenAI-compat supports: high/medium/low/none)
	if (hasThinking) {
		cfg.thinkingLevelMap = {
			off: "none",
			minimal: "low",
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "high",
		};
	}

	return cfg;
}
