import {
  AlignmentType, BorderStyle, Document, Footer, Header, HorizontalPositionRelativeFrom, ImageRun, LineRuleType, Packer, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, VerticalAlign,
  VerticalPositionRelativeFrom, WidthType,
} from "docx";
import { heading, outRows, runs, type OutLine, type Picture, type Sheet } from "@/lib/datasheet";

// Builds the .docx in the browser, matching the DBS electrical schedule pages (A4, DM Sans, navy-to-teal
// header bar and logo, cream title row, grey row rules, footer with document reference, page x of y and
// the teal hatch). Header/footer art lives in public/dbs/*.png. Measurements are taken from Type_D4.pdf;
// table spacing, grid and borders match Simon's corrected D2 datasheet (one table: pictures, title, rows).

const PT = 20;           // twips per point
const EMU = 12700;       // EMU per point
const PX = 96 / 72;      // docx image sizes are in 96-dpi pixels
const FONT = "DM Sans";
const TEAL = "06A796";
const CREAM = "F3EFE4";
const GREY = "BFBFBF";

const PAGE_W = 595.32;
const MARGIN_X = 42.52;  // 1.5 cm
const GRID = [2268, 2834, 5103]; // twips: label | rest of the photo cell | drawing cell
const TABLE_TW = GRID[0] + GRID[1] + GRID[2]; // 10205
const PICTURE_ROW = 4535;        // twips (226.75pt)
// 3pt before/after, single line ("auto" must be explicit: without it some readers use an exact 12pt line)
const TEXT_SPACING = { before: 60, after: 60, line: 240, lineRule: LineRuleType.AUTO };

async function bytesOf(src: string) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Couldn't load ${src}`);
  return new Uint8Array(await res.arrayBuffer());
}
const kind = (p: Picture) => (p.dataUrl.startsWith("data:image/png") ? "png" : "jpg") as "png" | "jpg";

function fit(p: Picture, maxW: number, maxH: number) {
  const s = Math.min(maxW / p.width, maxH / p.height, 1.6);
  return { width: Math.round(p.width * s * PX), height: Math.round(p.height * s * PX) };
}

const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const rule = { style: BorderStyle.SINGLE, size: 4, color: GREY };

function cellText(lines: OutLine[]) {
  return (lines.length ? lines : [{ text: " ", unchecked: false }]).map(
    (line) =>
      new Paragraph({
        spacing: TEXT_SPACING,
        children: runs(line.text || " ").map((r) => new TextRun({ text: r.text, bold: r.bold })),
      })
  );
}

export async function buildDocx(sheet: Sheet): Promise<Blob> {
  const [headerArt, hatchArt, needPhoto, needDrawing] = await Promise.all(
    ["/dbs/header.png", "/dbs/hatch.png", "/dbs/required-photo.png", "/dbs/required-drawing.png"].map(bytesOf)
  );
  const pics = await Promise.all([sheet.product, sheet.drawing].map((p) => (p ? bytesOf(p.dataUrl) : Promise.resolve(null))));
  const placeholders = [needPhoto, needDrawing];

  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: headerArt,
            transformation: { width: Math.round(PAGE_W * PX), height: Math.round(50 * PX) },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              behindDocument: true,
              allowOverlap: true,
            },
          }),
        ],
      }),
    ],
  });

  const small = { size: 15, color: GREY };
  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: Math.round((531 - MARGIN_X) * PT) }],
        spacing: { after: 0, line: 240 },
        children: [
          new TextRun({ text: sheet.docRef || " ", ...small }),
          new TextRun({ text: "\tPage ", ...small }),
          new TextRun({ children: [PageNumber.CURRENT], bold: true, ...small, color: "A6A6A6" }),
          new TextRun({ text: " of ", ...small }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], bold: true, ...small, color: "A6A6A6" }),
          new ImageRun({
            type: "png",
            data: hatchArt,
            transformation: { width: Math.round(77.32 * PX), height: Math.round(28 * PX) },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(518 * EMU) },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(798 * EMU) },
              behindDocument: true,
              allowOverlap: true,
            },
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 0, line: 240 }, children: [new TextRun({ text: sheet.copyright || " ", ...small })] }),
    ],
  });

  // One table, as in the DBS schedules: pictures (photo left, drawing right), the cream title row, then the rows.
  // Grey lines come from the table (top, bottom, between rows); the top one is the line under the header.
  const picCell = (i: 0 | 1) => {
    const p = [sheet.product, sheet.drawing][i];
    const data = pics[i];
    return new TableCell({
      columnSpan: i === 0 ? 2 : 1,
      width: { size: i === 0 ? GRID[0] + GRID[1] : GRID[2], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60, after: 60 }, // no line rule: the picture sets the line height
          children:
            p && data
              ? [new ImageRun({ type: kind(p), data, transformation: fit(p, 210, 200) })]
              : [new ImageRun({ type: "png", data: placeholders[i], transformation: { width: Math.round(150 * PX), height: Math.round(150 * PX) } })],
        }),
      ],
    });
  };
  const pictureRow = new TableRow({ cantSplit: true, height: { value: PICTURE_ROW, rule: "atLeast" }, children: [picCell(0), picCell(1)] });

  const titleRow = new TableRow({
    cantSplit: true,
    children: [
      new TableCell({
        columnSpan: 3,
        width: { size: TABLE_TW, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: CREAM },
        children: [new Paragraph({ spacing: TEXT_SPACING, children: [new TextRun({ text: heading(sheet) || " ", size: 28, color: TEAL })] })],
      }),
    ],
  });
  const bodyRows = outRows(sheet).map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({ width: { size: GRID[0], type: WidthType.DXA }, children: cellText([{ text: r.label, unchecked: false }]) }),
          new TableCell({ columnSpan: 2, width: { size: GRID[1] + GRID[2], type: WidthType.DXA }, children: cellText(r.lines) }),
        ],
      })
  );
  const table = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: TABLE_TW, type: WidthType.DXA },
    columnWidths: GRID,
    margins: { marginUnitType: WidthType.DXA, top: 57, bottom: 57, left: 108, right: 108 }, // 2.85pt / 5.4pt
    borders: { top: rule, bottom: rule, insideHorizontal: rule, left: none, right: none, insideVertical: none },
    rows: [pictureRow, titleRow, ...bodyRows],
  });

  const doc = new Document({
    creator: "DBS Consulting",
    title: heading(sheet) || "Datasheet",
    styles: { default: { document: { run: { font: FONT, size: 20, color: "000000" }, paragraph: { spacing: { after: 0 } } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(PAGE_W * PT), height: Math.round(841.92 * PT) },
            margin: { top: Math.round(65 * PT), bottom: Math.round(62 * PT), left: Math.round(MARGIN_X * PT), right: Math.round(MARGIN_X * PT), header: 0, footer: Math.round(21 * PT) },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: [table, new Paragraph({ spacing: { before: 0, after: 0, line: 240 }, children: [] })],
      },
    ],
  });
  return Packer.toBlob(doc);
}
