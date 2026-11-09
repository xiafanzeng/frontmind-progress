import JSZip from "jszip";

export type ExportCell = string | number | boolean | null | undefined;
export type ExportSheet = { name: string; rows: ExportCell[][] };
const xml = (value: unknown) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
  .replace(/_x[0-9a-f]{4}_/gi, value => `_x005F_${value.slice(1)}`)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const column = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : column(Math.floor(index / 26) - 1) + column(index % 26);
const documentXml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;

/** Long source text is continued in subsequent rows, never silently truncated by Excel. */
export function continuedRows(rows: ExportCell[][]): ExportCell[][] {
  return rows.flatMap(row => {
    const cells = row.map(value => typeof value === "string" ? Array.from(value).reduce<string[]>((parts, char) => {
      if (!parts.length || parts[parts.length - 1].length + char.length > 30_000) parts.push("");
      parts[parts.length - 1] += char;
      return parts;
    }, []) : [value]);
    const count = Math.max(1, ...cells.map(parts => parts.length));
    return Array.from({ length: count }, (_, index) => cells.map(parts => parts.length <= 1 ? parts[0] : parts[index] || ""));
  });
}

/** Minimal OOXML workbook: typed text cells prevent formulas from untrusted answers/URLs. */
export async function exportWorkbook(sheets: ExportSheet[]): Promise<Blob> {
  const zip = new JSZip();
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const packageRel = "http://schemas.openxmlformats.org/package/2006/relationships";
  zip.file("[Content_Types].xml", documentXml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`));
  zip.file("_rels/.rels", documentXml(`<Relationships xmlns="${packageRel}"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`));
  zip.file("xl/workbook.xml", documentXml(`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`));
  zip.file("xl/_rels/workbook.xml.rels", documentXml(`<Relationships xmlns="${packageRel}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`));
  zip.file("xl/styles.xml", documentXml(`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF3D1560"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2EDF8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`));
  sheets.forEach((sheet, index) => {
    const rows = continuedRows(sheet.rows);
    if (rows.length > 1_048_576) throw new Error("导出行数超过 Excel 上限，请缩小日期范围。");
    const width = sheet.rows.reduce((max, row) => Math.max(max, row.length), 1);
    const last = `${column(width - 1)}${Math.max(rows.length, 1)}`;
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, documentXml(`<worksheet xmlns="${ns}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols><col min="1" max="${width}" width="28" customWidth="1"/></cols><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
      const ref = `${column(c)}${r + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}" s="${r === 0 ? 1 : 0}" t="n"><v>${value}</v></c>`;
      return `<c r="${ref}" s="${r === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(typeof value === "boolean" ? value ? "是" : "否" : value)}</t></is></c>`;
    }).join("")}</row>`).join("")}</sheetData>${rows.length > 1 ? `<autoFilter ref="A1:${last}"/>` : ""}</worksheet>`));
  });
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
