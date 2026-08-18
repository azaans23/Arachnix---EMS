import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportExportFormat, ReportPayload } from '@/types/search-reports';
import { serializeReportValue } from '@/lib/reports/build-report';
import { drawBrandMark, drawBrandWordmark, markWidth, PDF_THEME } from '@/lib/reports/pdf-brand';

function fileStem(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'report'
  );
}

function headers(report: ReportPayload) {
  return report.columns.map((column) => column.label);
}

function matrix(report: ReportPayload) {
  return report.rows.map((row) =>
    report.columns.map((column) => serializeReportValue(row[column.key]))
  );
}

export function exportReportToCsv(report: ReportPayload): {
  bytes: Buffer;
  contentType: string;
  fileName: string;
} {
  const lines: string[] = [];
  lines.push(headers(report).map(csvEscape).join(','));
  for (const row of matrix(report)) {
    lines.push(row.map(csvEscape).join(','));
  }
  if (report.summary?.length) {
    lines.push('');
    lines.push('Summary');
    for (const item of report.summary) {
      lines.push([csvEscape(item.label), csvEscape(item.value)].join(','));
    }
  }

  return {
    bytes: Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8'),
    contentType: 'text/csv; charset=utf-8',
    fileName: `${fileStem(report.title)}.csv`,
  };
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportReportToXlsx(report: ReportPayload): {
  bytes: Buffer;
  contentType: string;
  fileName: string;
} {
  const sheetRows = [headers(report), ...matrix(report)];

  if (report.summary?.length) {
    sheetRows.push([]);
    sheetRows.push(['Summary', 'Value']);
    for (const item of report.summary) {
      sheetRows.push([item.label, item.value]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Report');
  const bytes = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));

  return {
    bytes,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileName: `${fileStem(report.title)}.xlsx`,
  };
}

const PAGE_MARGIN = 36;
const MARK_HEIGHT = 30;
const WORDMARK_HEIGHT = 11;

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Right-align columns whose values read as numbers / money. */
function numericColumns(report: ReportPayload): Set<number> {
  const numeric = new Set<number>();
  report.columns.forEach((column, index) => {
    const values = report.rows
      .map((row) => serializeReportValue(row[column.key]).trim())
      .filter((value) => value !== '' && value !== '—');
    if (values.length === 0) return;
    if (values.every((value) => /^-?[\d,]+(\.\d+)?$/.test(value))) {
      numeric.add(index);
    }
  });
  return numeric;
}

function drawBrandHeader(doc: jsPDF, report: ReportPayload, compact: boolean) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - PAGE_MARGIN;
  const markHeight = compact ? 18 : MARK_HEIGHT;
  const wordHeight = compact ? 8 : WORDMARK_HEIGHT;
  const top = compact ? 22 : 30;

  drawBrandMark(doc, { x: PAGE_MARGIN, y: top, height: markHeight });

  const textLeft = PAGE_MARGIN + markWidth(markHeight) + 10;
  drawBrandWordmark(doc, { x: textLeft, y: top + 2, height: wordHeight });

  if (!compact) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...PDF_THEME.muted);
    doc.setCharSpace(1.1);
    doc.text('EMPLOYEE MANAGEMENT SYSTEM', textLeft, top + wordHeight + 12);
    doc.setCharSpace(0);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_THEME.ink);
  if (compact) {
    doc.text(report.title, right, top + 7, { align: 'right' });
  } else {
    doc.setCharSpace(1.2);
    doc.text('REPORT', right, top + 8, { align: 'right' });
    doc.setCharSpace(0);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PDF_THEME.muted);
  doc.text(`Generated ${formatTimestamp(report.generatedAt)}`, right, top + (compact ? 18 : 20), {
    align: 'right',
  });

  const ruleY = compact ? top + markHeight + 10 : top + markHeight + 14;
  doc.setDrawColor(...PDF_THEME.ink);
  doc.setLineWidth(compact ? 0.5 : 1);
  doc.line(PAGE_MARGIN, ruleY, right, ruleY);
  return ruleY;
}

function drawFooters(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  const y = pageHeight - 24;

  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...PDF_THEME.border);
    doc.setLineWidth(0.5);
    doc.line(PAGE_MARGIN, y - 12, pageWidth - PAGE_MARGIN, y - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_THEME.muted);
    doc.text('Arachnix · Confidential', PAGE_MARGIN, y);
    doc.text(`Page ${page} of ${total}`, pageWidth - PAGE_MARGIN, y, { align: 'right' });
  }
}

/** Key metrics as bordered cards above the table. */
function drawSummaryCards(
  doc: jsPDF,
  summary: Array<{ label: string; value: string }>,
  startY: number
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const available = pageWidth - PAGE_MARGIN * 2;
  const gap = 10;
  // Always size cards to a 4-up grid so short summaries don't stretch.
  const perRow = 4;
  const cardWidth = (available - gap * (perRow - 1)) / perRow;
  const cardHeight = 42;
  let y = startY;

  summary.forEach((item, index) => {
    const column = index % perRow;
    if (column === 0 && index > 0) y += cardHeight + gap;
    const x = PAGE_MARGIN + column * (cardWidth + gap);

    doc.setFillColor(...PDF_THEME.canvas);
    doc.setDrawColor(...PDF_THEME.border);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...PDF_THEME.muted);
    doc.setCharSpace(0.8);
    doc.text(item.label.toUpperCase(), x + 10, y + 15);
    doc.setCharSpace(0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...PDF_THEME.ink);
    doc.text(item.value || '—', x + 10, y + 32);
  });

  return y + cardHeight;
}

export function exportReportToPdf(report: ReportPayload): {
  bytes: Buffer;
  contentType: string;
  fileName: string;
} {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const numeric = numericColumns(report);

  const ruleY = drawBrandHeader(doc, report, false);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...PDF_THEME.ink);
  doc.text(report.title, PAGE_MARGIN, ruleY + 28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_THEME.muted);
  doc.text(report.subtitle, PAGE_MARGIN, ruleY + 44);

  let tableStart = ruleY + 64;
  if (report.summary?.length) {
    tableStart = drawSummaryCards(doc, report.summary, ruleY + 58) + 22;
  }

  autoTable(doc, {
    startY: tableStart,
    head: [headers(report)],
    body: matrix(report),
    theme: 'grid',
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 70, bottom: 48 },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 5,
      textColor: PDF_THEME.inkSoft,
      lineColor: PDF_THEME.border,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: PDF_THEME.ink,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: 6,
      lineColor: PDF_THEME.ink,
    },
    alternateRowStyles: { fillColor: PDF_THEME.canvas },
    columnStyles: Object.fromEntries(
      [...numeric].map((index) => [index, { halign: 'right' as const }])
    ),
    didParseCell: (data) => {
      // Negative money (expenses) picks up the danger tone from the theme.
      if (data.section !== 'body') return;
      const text = Array.isArray(data.cell.text) ? data.cell.text.join('') : String(data.cell.text);
      if (numeric.has(data.column.index) && text.trim().startsWith('-')) {
        data.cell.styles.textColor = PDF_THEME.danger;
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawBrandHeader(doc, report, true);
    },
  });

  drawFooters(doc);

  const arrayBuffer = doc.output('arraybuffer');
  return {
    bytes: Buffer.from(arrayBuffer),
    contentType: 'application/pdf',
    fileName: `${fileStem(report.title)}.pdf`,
  };
}

export function exportReport(report: ReportPayload, format: ReportExportFormat) {
  switch (format) {
    case 'csv':
      return exportReportToCsv(report);
    case 'xlsx':
      return exportReportToXlsx(report);
    case 'pdf':
      return exportReportToPdf(report);
    default:
      throw new Error('Unsupported export format.');
  }
}
