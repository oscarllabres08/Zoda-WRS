import { SALES_CATEGORY_LABELS, type SalesCategoryKey } from './productCategory';
import type { DayExportPayload, MonthExportPayload, YearExportPayload } from './salesReportData';

type SheetCell = string | number;
type SheetRow = SheetCell[];
type XlsxMerge = { s: { r: number; c: number }; e: { r: number; c: number } };

type ColorSpec = { rgb: string };
type BorderEdge = { style: string; color: ColorSpec };
type CellStyle = {
  font?: {
    bold?: boolean;
    color?: ColorSpec;
    sz?: number;
    name?: string;
    italic?: boolean;
  };
  fill?: { patternType: string; fgColor: ColorSpec };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: {
    top?: BorderEdge;
    bottom?: BorderEdge;
    left?: BorderEdge;
    right?: BorderEdge;
  };
  numFmt?: string;
};

type WorksheetCell = { t?: string; v?: SheetCell; s?: CellStyle };
type Worksheet = Record<string, WorksheetCell | unknown> & {
  '!cols'?: { wch: number }[];
  '!merges'?: XlsxMerge[];
  '!rows'?: { hpt?: number }[];
};

type XlsxLib = {
  utils: {
    encode_cell: (addr: { r: number; c: number }) => string;
    book_new: () => unknown;
    aoa_to_sheet: (data: SheetRow[]) => Worksheet;
    book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
  };
  writeFile: (wb: unknown, filename: string) => void;
};

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js';

const COLORS = {
  navy: '0A1B37',
  blue: '1265D6',
  blueMid: '3B82D6',
  blueLight: 'D6E8FF',
  bluePale: 'F0F6FF',
  border: 'B8CCE4',
  white: 'FFFFFF',
  muted: '64748B',
};

const META_LABELS = new Set(['Report date', 'Report period', 'Report year', 'Generated on']);

const SECTION_TITLES = new Set([
  'SUMMARY',
  'SALES BY CATEGORY',
  'TOP SELLING PRODUCTS',
  'ALL TRANSACTIONS',
  'DAILY BREAKDOWN',
  'YEAR TOTALS',
  'MONTHLY SUMMARY',
  'SALES BY CATEGORY (FULL YEAR)',
  'TOP PRODUCTS (FULL YEAR)',
]);

const TABLE_HEADER_FIRST = new Set([
  'Metric',
  'Category',
  '#',
  'Date',
  'Date & time',
  'Month',
]);

let xlsxLoad: Promise<XlsxLib> | null = null;

function loadXlsx(): Promise<XlsxLib> {
  if (xlsxLoad) return xlsxLoad;
  xlsxLoad = new Promise((resolve, reject) => {
    const w = window as Window & { XLSX?: XlsxLib };
    if (w.XLSX) {
      resolve(w.XLSX);
      return;
    }
    const existing = document.querySelector(`script[src="${XLSX_CDN}"]`);
    if (existing) {
      existing.addEventListener('load', () => (w.XLSX ? resolve(w.XLSX) : reject(new Error('SheetJS failed to load'))));
      existing.addEventListener('error', () => reject(new Error('SheetJS failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.async = true;
    script.onload = () => {
      if (w.XLSX) resolve(w.XLSX);
      else reject(new Error('SheetJS failed to load'));
    };
    script.onerror = () => reject(new Error('SheetJS failed to load'));
    document.head.appendChild(script);
  });
  return xlsxLoad;
}

function formatDateTime(d: Date): string {
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function timelineDateLabel(isoDay: string): string {
  const d = new Date(isoDay + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function pushBlank(rows: SheetRow[]) {
  rows.push([]);
}

function pushSectionTitle(rows: SheetRow[], title: string) {
  pushBlank(rows);
  rows.push([title]);
}

function borderCell(): CellStyle['border'] {
  const edge: BorderEdge = { style: 'thin', color: { rgb: COLORS.border } };
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function mergeStyle(base: CellStyle): CellStyle {
  return { ...base, border: borderCell() };
}

const STYLES = {
  title: mergeStyle({
    font: { bold: true, sz: 16, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blue } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  metaLabel: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  metaValue: {
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  section: mergeStyle({
    font: { bold: true, sz: 12, color: { rgb: COLORS.white }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.navy } },
    alignment: { horizontal: 'left', vertical: 'center' },
  }),
  tableHeader: mergeStyle({
    font: { bold: true, sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.blueLight } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  }),
  data: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.white } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  }),
  dataStripe: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.bluePale } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  }),
  money: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
  }),
  moneyStripe: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.bluePale } },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
  }),
  integer: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    alignment: { horizontal: 'center', vertical: 'center' },
    numFmt: '#,##0',
  }),
  integerStripe: mergeStyle({
    font: { sz: 11, color: { rgb: COLORS.navy }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: COLORS.bluePale } },
    alignment: { horizontal: 'center', vertical: 'center' },
    numFmt: '#,##0',
  }),
  footer: {
    font: { italic: true, sz: 10, color: { rgb: COLORS.muted }, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
};

function isEmptyRow(row: SheetRow): boolean {
  return row.length === 0 || row.every((c) => c === '' || c === undefined);
}

function maxColIndex(rows: SheetRow[]): number {
  return Math.max(0, ...rows.map((r) => Math.max(0, r.length - 1)));
}

function isTableHeaderRow(row: SheetRow): boolean {
  const first = String(row[0] ?? '');
  return TABLE_HEADER_FIRST.has(first);
}

function isMoneyHeader(label: string): boolean {
  const s = label.toLowerCase();
  return (
    s.includes('(php)') ||
    s.includes('amount') ||
    s.includes('revenue') ||
    s.includes('online (php)') ||
    s.includes('walk-in (php)') ||
    s.includes('total (php)')
  );
}

function isIntegerHeader(label: string): boolean {
  const s = label.toLowerCase();
  return s === '#' || s.includes('units') || s.includes('orders') || s.includes('txns') || s.includes('transactions');
}

function columnStyleForCell(header: string, row: SheetRow, col: number, striped: boolean): CellStyle {
  if (header === 'Value' && col === 1) {
    const metric = String(row[0] ?? '').toLowerCase();
    if (metric.includes('(php)')) return striped ? STYLES.moneyStripe : STYLES.money;
    return striped ? STYLES.integerStripe : STYLES.integer;
  }
  if (isMoneyHeader(header)) return striped ? STYLES.moneyStripe : STYLES.money;
  if (isIntegerHeader(header)) return striped ? STYLES.integerStripe : STYLES.integer;
  return striped ? STYLES.dataStripe : STYLES.data;
}

function setCellStyle(XLSX: XlsxLib, ws: Worksheet, r: number, c: number, style: CellStyle) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr] as WorksheetCell | undefined;
  if (!cell) return;
  cell.s = style;
}

function applyRowStyle(XLSX: XlsxLib, ws: Worksheet, r: number, c0: number, c1: number, style: CellStyle) {
  for (let c = c0; c <= c1; c++) setCellStyle(XLSX, ws, r, c, style);
}

function applySheetStyles(XLSX: XlsxLib, ws: Worksheet, rows: SheetRow[], merges: XlsxMerge[]) {
  const maxCol = maxColIndex(rows);
  let inTable = false;
  let stripe = false;
  let currentHeaders: string[] = [];

  ws['!rows'] = rows.map((row, r) => {
    if (r === 0) return { hpt: 30 };
    if (!isEmptyRow(row) && SECTION_TITLES.has(String(row[0] ?? ''))) return { hpt: 22 };
    if (isTableHeaderRow(row)) return { hpt: 20 };
    return { hpt: 18 };
  });

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (isEmptyRow(row)) {
      inTable = false;
      stripe = false;
      currentHeaders = [];
      continue;
    }

    const first = String(row[0] ?? '');

    if (r === 0) {
      applyRowStyle(XLSX, ws, r, 0, maxCol, STYLES.title);
      if (!merges.some((m) => m.s.r === 0)) {
        merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: maxCol } });
      }
      continue;
    }

    if (META_LABELS.has(first)) {
      setCellStyle(XLSX, ws, r, 0, STYLES.metaLabel);
      for (let c = 1; c <= maxCol; c++) {
        if (ws[XLSX.utils.encode_cell({ r, c })]) setCellStyle(XLSX, ws, r, c, STYLES.metaValue);
      }
      continue;
    }

    if (SECTION_TITLES.has(first) && row.filter((c) => c !== '' && c !== undefined).length === 1) {
      inTable = false;
      stripe = false;
      currentHeaders = [];
      merges.push({ s: { r, c: 0 }, e: { r, c: maxCol } });
      applyRowStyle(XLSX, ws, r, 0, maxCol, STYLES.section);
      continue;
    }

    if (isTableHeaderRow(row)) {
      inTable = true;
      stripe = false;
      currentHeaders = row.map((c) => String(c ?? ''));
      for (let c = 0; c < row.length; c++) {
        const headerStyle = { ...STYLES.tableHeader };
        if (isMoneyHeader(currentHeaders[c])) {
          headerStyle.alignment = { ...headerStyle.alignment, horizontal: 'right' };
        } else if (isIntegerHeader(currentHeaders[c]) || currentHeaders[c] === '#') {
          headerStyle.alignment = { ...headerStyle.alignment, horizontal: 'center' };
        }
        setCellStyle(XLSX, ws, r, c, headerStyle);
      }
      continue;
    }

    if (first === 'Generated by Zoda WRS Admin') {
      inTable = false;
      setCellStyle(XLSX, ws, r, 0, STYLES.footer);
      continue;
    }

    if (inTable) {
      const colCount = Math.max(row.length, currentHeaders.length);
      for (let c = 0; c < colCount; c++) {
        const header = currentHeaders[c] ?? '';
        const style = columnStyleForCell(header, row, c, stripe);
        setCellStyle(XLSX, ws, r, c, style);
      }
      stripe = !stripe;
    }
  }
}

function buildDayRows(payload: DayExportPayload): { rows: SheetRow[]; merges: XlsxMerge[] } {
  const { dayLabel, generatedAt, data, transactions } = payload;
  const cats = Object.keys(SALES_CATEGORY_LABELS) as SalesCategoryKey[];
  const rows: SheetRow[] = [];
  const merges: XlsxMerge[] = [];

  rows.push(['Zoda WRS — Daily Sales Report']);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
  rows.push(['Report date', dayLabel]);
  rows.push(['Generated on', formatDateTime(generatedAt)]);

  pushSectionTitle(rows, 'SUMMARY');
  rows.push(['Metric', 'Value']);
  rows.push(['Total sales (PHP)', roundMoney(data.totalSales)]);
  rows.push(['Online sales (PHP)', roundMoney(data.onlineSales)]);
  rows.push(['Walk-in sales (PHP)', roundMoney(data.walkInSales)]);
  rows.push(['Online orders (paid)', data.onlineOrderCount]);
  rows.push(['Walk-in transactions', data.walkInTxnCount]);
  rows.push(['Paid orders', data.paidOrders]);
  rows.push(['Unpaid orders', data.unpaidOrders]);

  pushSectionTitle(rows, 'SALES BY CATEGORY');
  rows.push(['Category', 'Amount (PHP)']);
  for (const k of cats) {
    rows.push([SALES_CATEGORY_LABELS[k], roundMoney(data.categoryTotals[k])]);
  }

  pushSectionTitle(rows, 'TOP SELLING PRODUCTS');
  rows.push(['#', 'Product', 'Units sold', 'Revenue (PHP)']);
  if (data.topProducts.length === 0) {
    rows.push(['', 'No sales on this day', '', '']);
  } else {
    data.topProducts.forEach((p, i) => {
      rows.push([i + 1, p.name, p.units, roundMoney(p.revenue)]);
    });
  }

  pushSectionTitle(rows, 'ALL TRANSACTIONS');
  rows.push(['Date & time', 'Type', 'Status', 'Amount (PHP)', 'Products']);
  if (transactions.length === 0) {
    rows.push(['No transactions on this day', '', '', '', '']);
  } else {
    for (const t of transactions) {
      rows.push([formatDateTime(t.at), t.type, t.status, roundMoney(t.amount), t.products || '—']);
    }
  }

  rows.push([]);
  rows.push(['Generated by Zoda WRS Admin']);

  return { rows, merges };
}

function buildMonthRows(payload: MonthExportPayload): { rows: SheetRow[]; merges: XlsxMerge[] } {
  const { monthLabel, generatedAt, data, transactions } = payload;
  const cats = Object.keys(SALES_CATEGORY_LABELS) as SalesCategoryKey[];
  const rows: SheetRow[] = [];
  const merges: XlsxMerge[] = [];

  rows.push(['Zoda WRS — Monthly Sales Report']);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
  rows.push(['Report period', monthLabel]);
  rows.push(['Generated on', formatDateTime(generatedAt)]);

  pushSectionTitle(rows, 'SUMMARY');
  rows.push(['Metric', 'Value']);
  rows.push(['Total sales (PHP)', roundMoney(data.totalSales)]);
  rows.push(['Online sales (PHP)', roundMoney(data.onlineSales)]);
  rows.push(['Walk-in sales (PHP)', roundMoney(data.walkInSales)]);
  rows.push(['Online orders (paid)', data.onlineOrderCount]);
  rows.push(['Walk-in transactions', data.walkInTxnCount]);
  rows.push(['Paid orders', data.paidOrders]);
  rows.push(['Unpaid orders', data.unpaidOrders]);

  pushSectionTitle(rows, 'DAILY BREAKDOWN');
  rows.push(['Date', 'Online (PHP)', 'Walk-in (PHP)', 'Total (PHP)']);
  for (const pt of data.timeline) {
    rows.push([timelineDateLabel(pt.key), roundMoney(pt.online), roundMoney(pt.walkIn), roundMoney(pt.total)]);
  }

  pushSectionTitle(rows, 'SALES BY CATEGORY');
  rows.push(['Category', 'Amount (PHP)']);
  for (const k of cats) {
    rows.push([SALES_CATEGORY_LABELS[k], roundMoney(data.categoryTotals[k])]);
  }

  pushSectionTitle(rows, 'TOP SELLING PRODUCTS');
  rows.push(['#', 'Product', 'Units sold', 'Revenue (PHP)']);
  if (data.topProducts.length === 0) {
    rows.push(['', 'No sales in this period', '', '']);
  } else {
    data.topProducts.forEach((p, i) => {
      rows.push([i + 1, p.name, p.units, roundMoney(p.revenue)]);
    });
  }

  pushSectionTitle(rows, 'ALL TRANSACTIONS');
  rows.push(['Date & time', 'Type', 'Status', 'Amount (PHP)', 'Products']);
  if (transactions.length === 0) {
    rows.push(['No transactions in this period', '', '', '', '']);
  } else {
    for (const t of transactions) {
      rows.push([
        formatDateTime(t.at),
        t.type,
        t.status,
        roundMoney(t.amount),
        t.products || '—',
      ]);
    }
  }

  rows.push([]);
  rows.push(['Generated by Zoda WRS Admin']);

  return { rows, merges };
}

function buildYearRows(payload: YearExportPayload): { rows: SheetRow[]; merges: XlsxMerge[] } {
  const { year, generatedAt, months, yearTotals, categoryTotals, topProducts } = payload;
  const cats = Object.keys(SALES_CATEGORY_LABELS) as SalesCategoryKey[];
  const rows: SheetRow[] = [];
  const merges: XlsxMerge[] = [];

  rows.push(['Zoda WRS — Annual Sales Report']);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
  rows.push(['Report year', year]);
  rows.push(['Generated on', formatDateTime(generatedAt)]);

  pushSectionTitle(rows, 'YEAR TOTALS');
  rows.push(['Metric', 'Value']);
  rows.push(['Total sales (PHP)', roundMoney(yearTotals.totalSales)]);
  rows.push(['Online sales (PHP)', roundMoney(yearTotals.onlineSales)]);
  rows.push(['Walk-in sales (PHP)', roundMoney(yearTotals.walkInSales)]);
  rows.push(['Online orders', yearTotals.onlineOrders]);
  rows.push(['Walk-in transactions', yearTotals.walkInTxns]);

  pushSectionTitle(rows, 'MONTHLY SUMMARY');
  rows.push(['Month', 'Online (PHP)', 'Walk-in (PHP)', 'Total (PHP)', 'Online orders', 'Walk-in txns']);
  for (const m of months) {
    rows.push([
      m.monthLabel,
      roundMoney(m.online),
      roundMoney(m.walkIn),
      roundMoney(m.total),
      m.onlineOrders,
      m.walkInTxns,
    ]);
  }

  pushSectionTitle(rows, 'SALES BY CATEGORY (FULL YEAR)');
  rows.push(['Category', 'Amount (PHP)']);
  for (const k of cats) {
    rows.push([SALES_CATEGORY_LABELS[k], roundMoney(categoryTotals[k])]);
  }

  pushSectionTitle(rows, 'TOP PRODUCTS (FULL YEAR)');
  rows.push(['#', 'Product', 'Units', 'Revenue (PHP)']);
  if (topProducts.length === 0) {
    rows.push(['', 'No sales this year', '', '']);
  } else {
    topProducts.forEach((p, i) => {
      rows.push([i + 1, p.name, p.units, roundMoney(p.revenue)]);
    });
  }

  rows.push([]);
  rows.push(['Generated by Zoda WRS Admin']);

  return { rows, merges };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function applySheetLayout(ws: Worksheet) {
  ws['!cols'] = [
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 40 },
    { wch: 14 },
  ];
}

async function writeWorkbook(rows: SheetRow[], merges: XlsxMerge[], sheetName: string, filename: string) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applySheetLayout(ws);
  applySheetStyles(XLSX, ws, rows, merges);
  if (merges.length) ws['!merges'] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const out = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}

export async function downloadDaySpreadsheet(payload: DayExportPayload, filename: string) {
  const { rows, merges } = buildDayRows(payload);
  await writeWorkbook(rows, merges, 'Daily Report', filename);
}

export async function downloadMonthSpreadsheet(payload: MonthExportPayload, filename: string) {
  const { rows, merges } = buildMonthRows(payload);
  await writeWorkbook(rows, merges, 'Monthly Report', filename);
}

export async function downloadYearSpreadsheet(payload: YearExportPayload, filename: string) {
  const { rows, merges } = buildYearRows(payload);
  await writeWorkbook(rows, merges, 'Annual Report', filename);
}
