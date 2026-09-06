export type MobilePlatform = "android" | "ios";
export type MobilePrimitive = "View" | "Text" | "Image" | "ScrollView" | "Pressable" | "TextInput" | "Switch" | "ActivityIndicator" | "SafeArea" | "WebView";
export interface MobileNode { type: MobilePrimitive; props?: Record<string, unknown>; children?: MobileNode[] | string; }
export interface BridgeRequest { id: string; namespace: string; method: string; args?: unknown[]; }
export interface BridgeResponse { id: string; ok: boolean; value?: unknown; error?: { code: string; message: string }; }
export interface MobileBridge { invoke<T = unknown>(namespace: string, method: string, ...args: unknown[]): Promise<T>; }
export interface MobileCapabilities { filesystem?: boolean; camera?: boolean; photos?: boolean; microphone?: boolean; clipboard?: boolean; notifications?: boolean; location?: boolean; haptics?: boolean; share?: boolean; system?: boolean; externalUrls?: boolean; }
export interface MobileRuntimeOptions { platform: MobilePlatform; capabilities?: MobileCapabilities; bridge: MobileBridge; allowWebViewFallback?: boolean; }
export class MobileRuntime {
  readonly capabilities: MobileCapabilities;
  constructor(readonly options: MobileRuntimeOptions) { this.capabilities = options.capabilities ?? {}; }
  assertCapability(name: keyof MobileCapabilities) { if (!this.capabilities[name]) throw new Error(`OneStack mobile: capability ${name} is not declared.`); }
  invoke<T = unknown>(capability: keyof MobileCapabilities, namespace: string, method: string, ...args: unknown[]) { this.assertCapability(capability); return this.options.bridge.invoke<T>(namespace, method, ...args); }
  render(node: MobileNode): MobileNode { if (node.type === "WebView" && !this.options.allowWebViewFallback) throw new Error("OneStack mobile: WebView fallback is disabled."); return node; }
}
export function createMobileRuntime(options: MobileRuntimeOptions) { return new MobileRuntime(options); }
