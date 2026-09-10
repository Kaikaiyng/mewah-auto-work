import type ExcelJS from "exceljs";
import { toast } from "sonner";

export interface ExcelColumnDef {
  header: string;
  key: string;
  align?: "left" | "center" | "right";
  minWidth?: number;
  numFmt?: string;
}

export interface SheetExportSpec {
  name: string;
  columns: ExcelColumnDef[];
  data: Record<string, any>[];
  sheetViews?: any[];
}

export interface TableExportOptions {
  fileName: string;
  sheetName?: string;
  columns: ExcelColumnDef[];
  data: Record<string, any>[];
  successMessage?: string;
}

export interface MultiSheetExportOptions {
  fileName: string;
  sheets: SheetExportSpec[];
  successMessage?: string;
}

const BRAND_NAVY_ARGB = "FF1E3A8A";
const BORDER_COLOR_ARGB = "FFE2E8F0";
const ZEBRA_BG_ARGB = "FFF8FAFC";
const TEXT_COLOR_ARGB = "FF1E293B";

async function createWorkbook() {
  const { default: ExcelJSImport } = await import("exceljs");
  return new ExcelJSImport.Workbook();
}

function buildWorksheet(ws: ExcelJS.Worksheet, spec: SheetExportSpec) {
  const { columns, data } = spec;

  // Set columns header & key
  ws.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
  }));

  // Freeze top row
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Format Header Row (Row 1)
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell, colIndex) => {
    const colDef = columns[colIndex - 1];
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND_NAVY_ARGB },
    };
    cell.font = {
      name: "Segoe UI",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: colDef?.align || "left",
    };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND_NAVY_ARGB } },
      left: { style: "thin", color: { argb: "FF3B82F6" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      right: { style: "thin", color: { argb: "FF3B82F6" } },
    };
  });

  // Populate data rows with zebra striping and borders
  data.forEach((item, idx) => {
    const row = ws.addRow(item);
    row.height = 22;

    const isOdd = idx % 2 === 1;
    const rowBgColor = isOdd ? ZEBRA_BG_ARGB : "FFFFFFFF";

    row.eachCell((cell, colIndex) => {
      const colDef = columns[colIndex - 1];

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowBgColor },
      };
      cell.font = {
        name: "Segoe UI",
        size: 10,
        color: { argb: TEXT_COLOR_ARGB },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: colDef?.align || "left",
      };
      cell.border = {
        top: { style: "thin", color: { argb: BORDER_COLOR_ARGB } },
        left: { style: "thin", color: { argb: BORDER_COLOR_ARGB } },
        bottom: { style: "thin", color: { argb: BORDER_COLOR_ARGB } },
        right: { style: "thin", color: { argb: BORDER_COLOR_ARGB } },
      };

      if (colDef?.numFmt) {
        cell.numFmt = colDef.numFmt;
      }
    });
  });

  // Auto-fit column widths based on maximum contents
  columns.forEach((colDef, colIndex) => {
    let maxLen = colDef.header.length;
    data.forEach((row) => {
      const val = row[colDef.key];
      if (val !== undefined && val !== null) {
        let str = String(val);
        if (typeof val === "number" && colDef.numFmt?.includes(".00")) {
          str = val.toFixed(2);
        }
        if (str.length > maxLen) maxLen = str.length;
      }
    });

    const minWidth = colDef.minWidth || 12;
    const calculatedWidth = Math.min(Math.max(maxLen + 4, minWidth), 60);
    ws.getColumn(colIndex + 1).width = calculatedWidth;
  });

  // Auto-filter on header
  if (columns.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }
}

async function triggerWorkbookDownload(workbook: ExcelJS.Workbook, fileName: string, successMessage?: string) {
  workbook.creator = "Mewah AutoWorks Admin";
  workbook.lastModifiedBy = "Mewah AutoWorks Admin";
  workbook.created = new Date();
  workbook.modified = new Date();

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);

  toast.success(successMessage || `Exported to ${link.download}`);
}

export async function exportTableToExcel(options: TableExportOptions) {
  const { fileName, sheetName = "Data", columns, data, successMessage } = options;
  if (!data || data.length === 0) {
    toast.error("No data available to export.");
    return;
  }

  try {
    const workbook = await createWorkbook();
    const ws = workbook.addWorksheet(sheetName);
    buildWorksheet(ws, { name: sheetName, columns, data });
    await triggerWorkbookDownload(workbook, fileName, successMessage);
  } catch (err) {
    console.error("Export Excel error:", err);
    toast.error("Failed to export Excel file.");
  }
}

export async function exportMultiSheetExcel(options: MultiSheetExportOptions) {
  const { fileName, sheets, successMessage } = options;
  if (!sheets || sheets.length === 0) {
    toast.error("No report sheets available to export.");
    return;
  }

  try {
    const workbook = await createWorkbook();
    sheets.forEach((sheetSpec) => {
      const ws = workbook.addWorksheet(sheetSpec.name);
      buildWorksheet(ws, sheetSpec);
    });
    await triggerWorkbookDownload(workbook, fileName, successMessage);
  } catch (err) {
    console.error("Export MultiSheet Excel error:", err);
    toast.error("Failed to export Excel report.");
  }
}
