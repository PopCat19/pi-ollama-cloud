declare module "@earendil-works/pi-coding-agent" {
	export type ProviderModelConfig = Record<string, unknown>;
	export interface ExtensionAPI {
		on(event: string, handler: (...args: any[]) => any): void;
		registerProvider(name: string, config: any): void;
	}
}
