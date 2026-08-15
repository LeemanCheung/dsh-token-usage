/** Disable model-supplied Markdown images and raw HTML while preserving readable text and links. */
export function safeModelMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\(([^)\n]+)\)/g, (_match, alt: string, destination: string) =>
      `[${alt.length === 0 ? 'image' : alt}](${destination})`)
    .replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (_match, alt: string, reference: string) =>
      `[${alt.length === 0 ? 'image' : alt}][${reference}]`)
    .replace(/!\[([^\]]*)\]/g, (_match, alt: string) => alt.length === 0 ? 'image' : alt)
    // A CommonMark image always starts with `![`; entity-encode any marker left by the readable rewrites above.
    .replace(/!\[/g, '&#33;[')
    .replace(/<(?=[A-Za-z/!?])/g, '&lt;')
}
