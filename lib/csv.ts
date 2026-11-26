export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  const firstMeaningful = Array.from(text).find(character => {
    const code = character.codePointAt(0)!;
    return code > 32 && code !== 127 && !/\s/.test(character);
  });
  const startsWithControl = text.length > 0 &&
    (text.charCodeAt(0) <= 32 || text.charCodeAt(0) === 127);
  if (startsWithControl || (firstMeaningful && '=+-@'.includes(firstMeaningful))) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}
