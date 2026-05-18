/**
 * Escape special characters for Telegram Markdown (not MarkdownV2).
 * In Markdown mode: _, *, ` need escaping to prevent formatting breakage.
 */
export function escMarkdown(text: string | number | null | undefined): string {
  if (text == null) return '';
  return String(text).replace(/[_*`]/g, '\\$&');
}
