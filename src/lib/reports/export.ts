import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportExportFormat, ReportPayload } from '@/types/search-reports';
import { serializeReportValue } from '@/lib/reports/build-report';

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

export function exportReportToPdf(report: ReportPayload): {
  bytes: Buffer;
  contentType: string;
  fileName: string;
} {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(report.title, 40, 36);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(report.subtitle, 40, 52);
  doc.text(`Generated ${new Date(report.generatedAt).toLocaleString()}`, 40, 66);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 80,
    head: [headers(report)],
    body: matrix(report),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [10, 10, 10], textColor: 255 },
    alternateRowStyles: { fillColor: [247, 247, 248] },
  });

  if (report.summary?.length) {
    const finalY =
      (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 100;
    doc.setFontSize(11);
    doc.text('Summary', 40, finalY + 24);
    autoTable(doc, {
      startY: finalY + 32,
      head: [['Metric', 'Value']],
      body: report.summary.map((item) => [item.label, item.value]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [10, 10, 10], textColor: 255 },
    });
  }

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
