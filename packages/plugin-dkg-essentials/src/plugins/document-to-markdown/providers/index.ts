/**
 * Provider registry for document-to-markdown conversion.
 * Handles provider creation and selection.
 */

import type { DocumentConversionProvider } from "../types";
import { MistralProvider, createMistralProvider } from "./mistral";

// Re-export provider implementations
export { MistralProvider, createMistralProvider } from "./mistral";

/**
 * Map of provider names to factory functions
 */
const PROVIDER_FACTORIES: Record<
  string,
  (options?: Record<string, unknown>) => DocumentConversionProvider
> = {
  mistral: (options) => createMistralProvider(options?.apiKey as string),
};

/**
 * Default provider name
 */
const DEFAULT_PROVIDER = "mistral";

/**
 * Get list of available provider names
 */
export function getAvailableProviders(): string[] {
  return Object.keys(PROVIDER_FACTORIES);
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(name: string): boolean {
  return name in PROVIDER_FACTORIES;
}

/**
 * Create a provider by name.
 *
 * @param name - Provider name (default: "mistral")
 * @param options - Provider-specific options
 * @throws Error if provider is not found
 */
export function createProvider(
  name: string = DEFAULT_PROVIDER,
  options?: Record<string, unknown>,
): DocumentConversionProvider {
  const factory = PROVIDER_FACTORIES[name.toLowerCase()];
  if (!factory) {
    const available = getAvailableProviders().join(", ");
    throw new Error(
      `Unknown document conversion provider: "${name}". Available: ${available}`,
    );
  }
  return factory(options);
}

/**
 * Get the default provider (Mistral).
 * This is the most common use case - just get a working provider.
 */
export function getDefaultProvider(): DocumentConversionProvider {
  return createProvider(DEFAULT_PROVIDER);
}
