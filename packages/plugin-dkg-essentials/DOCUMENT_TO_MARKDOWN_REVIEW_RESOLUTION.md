# Document-to-Markdown Review Resolution Summary

Date: 2026-02-26  
Source review: `C:\Users\jurij\Downloads\DOCUMENT_TO_MARKDOWN_REVIEW.md`

## Feedback Points and Resolution

1. Multipart response safety for REST uploads  
Status: Done  
Summary: Added `busboy` file limit (`files: 1`), single-response guard (`sendOnce`), safe stream draining for extra files, and deferred conversion until parser close.  
Key files: `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/index.ts`, `packages/plugin-dkg-essentials/tests/document-to-markdown.spec.ts`

2. Filesystem blob path confinement  
Status: Done  
Summary: Hardened filesystem blob storage with resolved-path containment checks for `put/get/delete/info` to prevent path traversal outside blob root.  
Key files: `packages/plugin-dkg-essentials/src/createFsBlobStorage.ts`, `packages/plugin-dkg-essentials/tests/createFsBlobStorage.spec.ts`

3. REST error-class mapping (4xx vs 5xx)  
Status: Done  
Summary: Added typed validation errors and classification so validation/input issues return 4xx and unexpected runtime/provider/storage failures return 500.  
Key files: `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/validation.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/index.ts`, `packages/plugin-dkg-essentials/tests/document-to-markdown.spec.ts`

4. Prompt smart quotes cleanup  
Status: Done  
Summary: Replaced smart punctuation in prompt examples with ASCII-safe characters to avoid malformed generated SPARQL/JSON-LD.  
Key file: `apps/agent/src/shared/chat.ts`

5. Prompt modularization (shared source of truth)  
Status: Done  
Summary: Moved `DEFAULT_SYSTEM_PROMPT` to a dedicated prompt module and imported it from both chat runtime and setup script.  
Key files: `apps/agent/src/shared/prompts/defaultSystemPrompt.ts`, `apps/agent/src/shared/chat.ts`, `apps/agent/src/server/scripts/setup.ts`

6. Mistral page numbering for ranged extraction  
Status: Done  
Summary: Preserved source page numbers when `pageStart/pageEnd` are used by applying start-page offset in markdown formatting.  
Key files: `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/providers/mistral.ts`, `packages/plugin-dkg-essentials/tests/document-to-markdown.spec.ts`

7. Page count semantics clarity  
Status: Done  
Summary: Standardized `pageCount` as total source pages and introduced `processedPageCount` for output pages after filtering; aligned types, API, providers, docs, and tests.  
Key files: `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/types.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/blob-integration.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/index.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/providers/unpdf.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/providers/mistral.ts`, `packages/plugin-dkg-essentials/DOCUMENT_TO_MARKDOWN.md`, `packages/plugin-dkg-essentials/tests/document-to-markdown.spec.ts`

8. Shared helper extraction / readability hardening  
Status: Done  
Summary: Extracted shared page-range normalization and shared conversion-error classification helpers; reused across providers and handlers to reduce drift and duplication.  
Key files: `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/page-range.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/conversion-errors.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/providers/unpdf.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/providers/mistral.ts`, `packages/plugin-dkg-essentials/src/plugins/document-to-markdown/index.ts`, `packages/plugin-dkg-essentials/tests/document-to-markdown.spec.ts`

## Post-Review QA Hardening

- Normalized non-integer/non-finite page bounds defensively in the shared page-range helper and added empty-document bound handling.
- Enforced positive integer constraints for MCP `pageStart` and `pageEnd`.
- Declared both success and error shapes in REST response schema to align OpenAPI/runtime validation behavior.
- Standardized MCP success/failure status text to ASCII-only output strings.

## Verification Snapshot

- `@dkg/plugin-dkg-essentials` typecheck: passing
- `document-to-markdown` test suite: passing (`56 passing` via direct `node --import tsx ... mocha.js` command on Windows)
- `createFsBlobStorage` tests: passing (`4 passing`)
- `@dkg/agent` typecheck: still has pre-existing unrelated fetch typing errors in `apps/agent/src/app/(protected)/login.tsx` and `apps/agent/src/client/createTransport.ts`
