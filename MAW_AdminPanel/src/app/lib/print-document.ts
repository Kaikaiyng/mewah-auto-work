function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printableStyles() {
  const linkedStyles = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .map((link) => link.outerHTML)
    .join("\n");
  const injectedStyles = Array.from(document.querySelectorAll<HTMLStyleElement>("style"))
    .filter((style) => !style.textContent?.includes("body * { visibility:hidden"))
    .map((style) => style.outerHTML)
    .join("\n");
  return `${linkedStyles}\n${injectedStyles}`;
}

export async function printDocumentElement(elementId: string, title: string) {
  const source = document.getElementById(elementId);
  if (!source) throw new Error("The printable document is not available.");

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    throw new Error("Unable to create the print preview.");
  }
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <base href="${escapeHtml(document.baseURI)}" />
        <title>${escapeHtml(title)}</title>
        ${printableStyles()}
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-height: 100% !important;
            background: #fff !important;
            overflow: visible !important;
          }
          body {
            color: #0f172a;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #${elementId} {
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 100% !important;
            min-height: 275mm !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            transform: none !important;
            box-sizing: border-box !important;
          }
          #${elementId} thead { display: table-header-group !important; }
          #${elementId} tr { break-inside: avoid-page !important; page-break-inside: avoid !important; }
          #${elementId} > div:last-child { break-inside: avoid-page !important; page-break-inside: avoid-page !important; }
          .no-print { display: none !important; }
        </style>
      </head>
      <body>${source.outerHTML}</body>
    </html>`);
  printWindow.document.close();

  await new Promise<void>((resolve) => {
    if (printWindow.document.readyState === "complete") resolve();
    else printWindow.addEventListener("load", () => resolve(), { once: true });
  });
  await printWindow.document.fonts?.ready;
  await Promise.all(
    Array.from(printWindow.document.images).map((image) =>
      image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }),
    ),
  );
  let removed = false;
  const removeFrame = () => {
    if (removed) return;
    removed = true;
    window.setTimeout(() => frame.remove(), 250);
  };
  printWindow.addEventListener("afterprint", removeFrame, { once: true });
  printWindow.focus();
  printWindow.print();
  window.setTimeout(removeFrame, 60_000);
}
