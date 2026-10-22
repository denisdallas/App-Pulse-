/**
 * Escapes a cell for CSV formatting.
 */
function escapeCsvCell(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of objects to a CSV string.
 */
export function jsonToCsv<T extends Record<string, any>>(data: T[], columns: { key: keyof T; header: string }[]): string {
  if (!data || data.length === 0) {
    return columns.map((c) => escapeCsvCell(c.header)).join(',');
  }

  const headerRow = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const rows = data.map((item) =>
    columns.map((c) => escapeCsvCell(item[c.key])).join(',')
  );

  return [headerRow, ...rows].join('\r\n');
}

/**
 * Parses simple CSV string into objects with given headers.
 */
export function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header.trim()] = values[index] ? values[index].trim() : '';
    });
    results.push(obj);
  }

  return results;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
