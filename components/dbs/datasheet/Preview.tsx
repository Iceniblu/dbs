"use client";

import { heading, outRows, runs, type OutLine, type Sheet } from "@/lib/datasheet";

// An on-screen A4 page that mirrors what buildDocx writes (lib/datasheet-docx.ts).
// Unlike the Word file, values that still need checking are shown in red here.
function Lines({ lines }: { lines: OutLine[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={line.unchecked ? "ds-red" : undefined}>
          {line.text ? runs(line.text).map((r, j) => (r.bold ? <b key={j}>{r.text}</b> : <span key={j}>{r.text}</span>)) : " "}
        </div>
      ))}
    </>
  );
}

export default function Preview({ sheet }: { sheet: Sheet }) {
  const head = heading(sheet);
  return (
    <div className="ds-sheet" aria-label="Datasheet preview">
      <img className="ds-sheet-head" src="/dbs/header.png" alt="" />
      <div className="ds-sheet-pics">
        <div className={sheet.product?.unchecked ? "ds-red-pic" : undefined}>
          <img src={sheet.product?.dataUrl ?? "/dbs/required-photo.png"} alt={sheet.product ? "Product" : "Product photo required"} className={sheet.product ? undefined : "ds-need"} />
        </div>
        <div className={sheet.drawing?.unchecked ? "ds-red-pic" : undefined}>
          <img src={sheet.drawing?.dataUrl ?? "/dbs/required-drawing.png"} alt={sheet.drawing ? "Dimension drawing" : "Dimension drawing required"} className={sheet.drawing ? undefined : "ds-need"} />
        </div>
      </div>
      <table className="ds-sheet-table">
        <colgroup>
          <col className="ds-sheet-label" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={2} className={sheet.title.unchecked || sheet.type.unchecked ? "ds-red" : undefined}>{head || " "}</th>
          </tr>
        </thead>
        <tbody>
          {outRows(sheet).map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td><Lines lines={r.lines} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ds-sheet-foot">
        <div>
          <div>{sheet.docRef || " "}</div>
          <div>{sheet.copyright}</div>
        </div>
        <div>Page <b>1</b> of <b>1</b></div>
      </div>
      <img className="ds-sheet-hatch" src="/dbs/hatch.png" alt="" />
    </div>
  );
}
