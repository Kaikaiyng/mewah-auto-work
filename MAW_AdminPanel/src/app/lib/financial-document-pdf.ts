import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type FinancialPdfCompany = {
  legalName?: string;
  registrationNo?: string;
  groupName?: string;
  address?: string;
  phone?: string;
  email?: string;
};

export type FinancialPdfLine = {
  code?: string;
  description: string;
  quantity: number;
  uom?: string;
  unitPrice: number;
  taxCode?: string;
  taxRate?: number;
  taxAmount?: number;
  amount?: number;
};

export type FinancialDocumentPdfInput = {
  documentType: "INVOICE" | "DELIVERY ORDER";
  reference: string;
  internalReference?: string;
  company?: FinancialPdfCompany | null;
  customer: {
    name: string;
    code?: string;
    contact?: string;
    phone?: string;
    address?: string;
  };
  details: Array<{ label: string; value?: string | number | null }>;
  items: FinancialPdfLine[];
  subtotal: number;
  discount?: number;
  taxAmount: number;
  total: number;
  paidAmount?: number;
  balance?: number;
  notes?: string;
  paymentInstructions?: string;
  showDeliverySignatures?: boolean;
};

const plainPdfText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function downloadFinancialDocumentPdf(input: FinancialDocumentPdfInput) {
  const document = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 14;
  const company = input.company;

  document.setTextColor(15, 23, 42);
  document.setFont("helvetica", "bold");
  document.setFontSize(16);
  document.text(plainPdfText(company?.legalName || "MEWAH AUTOWORKS SDN BHD"), margin, 16);
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  const companyLines = [
    company?.registrationNo ? `Registration No: ${company.registrationNo}` : "",
    company?.groupName || "",
    company?.address || "",
    [company?.phone, company?.email].filter(Boolean).join(" | "),
  ].filter(Boolean).map(plainPdfText);
  document.text(companyLines, margin, 21);

  document.setFont("helvetica", "bold");
  document.setFontSize(input.documentType === "DELIVERY ORDER" ? 17 : 19);
  document.setTextColor(30, 58, 138);
  document.text(input.documentType, pageWidth - margin, 16, { align: "right" });
  document.setTextColor(15, 23, 42);
  document.setFontSize(9);
  document.text(`No: ${plainPdfText(input.reference)}`, pageWidth - margin, 23, { align: "right" });
  if (input.internalReference && input.internalReference !== input.reference) {
    document.setFont("helvetica", "normal");
    document.text(`MAW Ref: ${plainPdfText(input.internalReference)}`, pageWidth - margin, 28, { align: "right" });
  }
  document.setDrawColor(30, 58, 138);
  document.setLineWidth(0.7);
  document.line(margin, 38, pageWidth - margin, 38);

  document.setFont("helvetica", "bold");
  document.setFontSize(9);
  document.text(input.documentType === "INVOICE" ? "BILL TO" : "DELIVER TO / CUSTOMER", margin, 46);
  document.text("DOCUMENT DETAILS", 116, 46);
  document.setFont("helvetica", "normal");
  document.setFontSize(8.5);
  const customerLines = [
    input.customer.name,
    input.customer.code ? `Account: ${input.customer.code}` : "",
    input.customer.contact || "",
    input.customer.phone || "",
    input.customer.address || "",
  ].filter(Boolean).map(plainPdfText);
  document.text(document.splitTextToSize(customerLines.join("\n"), 92), margin, 52);
  document.text(
    input.details
      .filter((detail) => detail.value !== undefined && detail.value !== null && String(detail.value).trim() !== "")
      .map((detail) => plainPdfText(`${detail.label}: ${detail.value}`)),
    116,
    52,
  );

  autoTable(document, {
    startY: 78,
    margin: { left: margin, right: margin, bottom: 20 },
    theme: "grid",
    head: [["No.", "Code / Description", "Qty", "UOM", "Unit Price (RM)", "Tax (RM)", "Amount (RM)"]],
    body: input.items.map((item, index) => {
      const baseAmount = Number(item.amount ?? Number(item.quantity || 0) * Number(item.unitPrice || 0));
      const taxAmount = Number(item.taxAmount ?? baseAmount * Number(item.taxRate || 0) / 100);
      return [
        String(index + 1),
        plainPdfText(`${item.code ? `${item.code} - ` : ""}${item.description}${item.taxCode ? ` [${item.taxCode}]` : ""}`),
        Number(item.quantity || 0).toFixed(2),
        plainPdfText(item.uom || "UNIT"),
        money(item.unitPrice),
        money(taxAmount),
        money(baseAmount),
      ];
    }),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.15 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 73 },
      2: { cellWidth: 14, halign: "right" },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 23, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 25, halign: "right" },
    },
    didDrawPage: () => {
      document.setFontSize(7);
      document.setTextColor(100, 116, 139);
      document.text(
        `${input.documentType} ${plainPdfText(input.reference)} | Page ${document.getNumberOfPages()}`,
        pageWidth / 2,
        pageHeight - 6,
        { align: "center" },
      );
    },
  });

  let finalY = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 82) + 6;
  if (finalY > 226) {
    document.addPage();
    finalY = 18;
  }

  const totalsX = pageWidth - margin - 65;
  const totalRows: Array<[string, number, boolean?]> = [
    ["Subtotal", input.subtotal],
    ...(Number(input.discount || 0) > 0 ? [["Discount", Number(input.discount)] as [string, number]] : []),
    ["SST / Tax", input.taxAmount],
    ["TOTAL", input.total, true],
    ...(input.paidAmount !== undefined ? [["Paid", Number(input.paidAmount)] as [string, number]] : []),
    ...(input.balance !== undefined ? [["Balance", Number(input.balance), true] as [string, number, boolean]] : []),
  ];
  document.setTextColor(15, 23, 42);
  totalRows.forEach(([label, value, emphasised], index) => {
    const y = finalY + index * 5.5;
    document.setFont("helvetica", emphasised ? "bold" : "normal");
    document.setFontSize(emphasised ? 9.5 : 8.5);
    if (emphasised) document.line(totalsX, y - 3.8, pageWidth - margin, y - 3.8);
    document.text(label, totalsX, y);
    document.text(`RM ${money(value)}`, pageWidth - margin, y, { align: "right" });
  });

  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  if (input.notes) {
    document.setFont("helvetica", "bold");
    document.text("Notes", margin, finalY);
    document.setFont("helvetica", "normal");
    document.text(document.splitTextToSize(plainPdfText(input.notes), 90), margin, finalY + 5);
  }

  const totalsHeight = totalRows.length * 5.5;
  let lowerY = Math.max(finalY + totalsHeight + 10, finalY + 28);
  if (input.paymentInstructions) {
    if (lowerY > 244) {
      document.addPage();
      lowerY = 18;
    }
    document.setFont("helvetica", "bold");
    document.text("Payment Instructions", margin, lowerY);
    document.setFont("helvetica", "normal");
    document.text(document.splitTextToSize(plainPdfText(input.paymentInstructions), pageWidth - margin * 2), margin, lowerY + 5);
    lowerY += 24;
  }

  if (input.showDeliverySignatures) {
    const signatureY = Math.min(Math.max(lowerY + 22, 250), 276);
    document.line(margin, signatureY, 78, signatureY);
    document.line(125, signatureY, pageWidth - margin, signatureY);
    document.setFontSize(7.5);
    document.text("Issued by Mewah AutoWorks", margin, signatureY + 4);
    document.text("Received and accepted by", 125, signatureY + 4);
  } else {
    document.setFont("helvetica", "bold");
    document.setFontSize(7.5);
    document.text("This is a computer-generated invoice. No signature is required.", pageWidth / 2, Math.min(lowerY + 12, 280), { align: "center" });
  }

  const safeReference = plainPdfText(input.reference || input.internalReference || "document").replace(/[^A-Za-z0-9_-]+/g, "-");
  const prefix = input.documentType === "INVOICE" ? "Invoice" : "DO";
  const fileName = `${prefix}-${safeReference}.pdf`;
  document.save(fileName);
  return fileName;
}
