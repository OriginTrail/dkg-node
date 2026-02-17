// Keep this file.
import { sha256 } from "js-sha256";

const CHAT_INPUT_SELECTOR = '[data-testid="chat-input"]';
const CHAT_INPUT_SCROLLBAR_STYLE_ID = "chat-input-scrollbar-style";
const CHAT_INPUT_SCROLLBAR_CSS = `
  ${CHAT_INPUT_SELECTOR},
  ${CHAT_INPUT_SELECTOR} * {
    scrollbar-width: none;
  }
  ${CHAT_INPUT_SELECTOR}::-webkit-scrollbar,
  ${CHAT_INPUT_SELECTOR} *::-webkit-scrollbar {
    width: 0 !important;
    height: 0 !important;
    background: transparent;
  }
`;

// Polyfill crypto.subtle for non-secure contexts (HTTP)
// This is needed because crypto.subtle is only available in secure contexts (HTTPS or localhost)
if (
  typeof window !== "undefined" &&
  (!window.crypto || !window.crypto.subtle)
) {
  console.warn(
    "⚠️  crypto.subtle is not available (non-secure context). Using polyfill for PKCE.",
  );

  const cryptoPolyfill = {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
    subtle: {
      digest: async (algorithm: string, data: BufferSource) => {
        if (algorithm === "SHA-256") {
          const bytes = new Uint8Array(data as ArrayBuffer);
          const hash = sha256.create();
          hash.update(bytes);
          return hash.arrayBuffer();
        }
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      },
    },
  };

  if (!window.crypto) {
    (window as any).crypto = cryptoPolyfill;
  } else if (!window.crypto.subtle) {
    (window.crypto as any).subtle = cryptoPolyfill.subtle;
  }
}

if (
  typeof document !== "undefined" &&
  !document.getElementById(CHAT_INPUT_SCROLLBAR_STYLE_ID)
) {
  const style = document.createElement("style");
  style.id = CHAT_INPUT_SCROLLBAR_STYLE_ID;
  style.textContent = CHAT_INPUT_SCROLLBAR_CSS;
  document.head.appendChild(style);
}
