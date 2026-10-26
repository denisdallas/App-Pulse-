import ExcelJS from 'exceljs';

export interface ExportColumn {
  key: string;
  header: string;
}

function toCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export async function jsonToXlsx(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  sheetName = 'AppPulse',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AppPulse Intelligence';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || 'AppPulse');
  worksheet.addRow(columns.map((column) => column.header));
  for (const row of rows) {
    worksheet.addRow(columns.map((column) => toCellValue(row[column.key])));
  }

  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  header.alignment = { vertical: 'middle' };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (columns.length) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: columns.length },
    };
  }

  columns.forEach((column, index) => {
    const sampleWidth = rows.slice(0, 100).reduce((width, row) => {
      const value = toCellValue(row[column.key]);
      return Math.max(width, String(value).length);
    }, column.header.length);
    worksheet.getColumn(index + 1).width = Math.max(14, Math.min(48, sampleWidth + 2));
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
