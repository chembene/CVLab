import { createHash } from 'crypto';

/** SHA-256 hex digest of prompt text — the same algorithm ai_requests.prompt_hash already assumed in Phase 5's schema comment. Never hash raw user PII beyond what's already in the prompt itself; this is a fingerprint for dedupe/cache/analytics, not a content store. */
export class PromptHash {
  static generate(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}
