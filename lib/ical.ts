export function escapeIcalText(value: unknown): string {
  return String(value ?? '')
    .split('').filter(character => {
      const code = character.charCodeAt(0);
      return code >= 32 || character === '\n' || character === '\r';
    }).join('')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function foldIcalLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let part = '';
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      parts.push(part);
      part = ' ';
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  parts.push(part);
  return parts.join('\r\n');
}
