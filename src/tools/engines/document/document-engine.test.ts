import { describe, expect, it } from "vitest";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from "docx";
import { documentEngine, getDocumentOutputName } from "./document-engine";

const makeDocxFile = async () => {
  const children = [
    new Paragraph({ text: "Quarterly notes", heading: HeadingLevel.HEADING_1 }),
    new Paragraph("First paragraph with readable text."),
    new Paragraph({ text: "A list item", bullet: { level: 0 } }),
    new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("Table cell")] })] })] }),
  ];
  const document = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(document);
  return new File([blob], "quarterly-notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
};

describe("document engine", () => {
  it("extracts representative DOCX content to TXT", async () => {
    const input = await makeDocxFile();
    const result = await documentEngine.process([input], { tool: "docx-to-txt" });

    expect(result.failures).toHaveLength(0);
    expect(result.items[0]?.output.name).toBe("quarterly-notes-text.txt");
    await expect(result.items[0]?.output.text()).resolves.toContain("Quarterly notes");
    await expect(result.items[0]?.output.text()).resolves.toContain("Table cell");
  });

  it("creates a complete HTML document from DOCX", async () => {
    const input = await makeDocxFile();
    const result = await documentEngine.process([input], { tool: "docx-to-html" });
    const html = await result.items[0]?.output.text();

    expect(result.failures).toHaveLength(0);
    expect(result.items[0]?.output.name).toBe("quarterly-notes-html.html");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<body>");
    expect(html).toContain("Quarterly notes");
  });

  it("packages plain text lines as a valid DOCX with a deterministic name", async () => {
    const input = new File(["Heading\nSecond line\n\nFinal line"], "notes.txt", { type: "text/plain" });
    const result = await documentEngine.process([input], { tool: "txt-to-docx" });
    const output = result.items[0]?.output;

    expect(result.failures).toHaveLength(0);
    expect(output?.name).toBe("notes.docx");
    expect(output?.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(new Uint8Array(await output!.slice(0, 4).arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
  });

  it("rejects corrupt DOCX and binary TXT before processing", async () => {
    const corruptDocx = new File(["not a zip"], "broken.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const binaryTxt = new File([new Uint8Array([0x41, 0x00, 0x42])], "binary.txt", { type: "text/plain" });

    const docxResult = await documentEngine.process([corruptDocx], { tool: "docx-to-txt" });
    const txtResult = await documentEngine.process([binaryTxt], { tool: "txt-to-docx" });

    expect(docxResult.items).toHaveLength(0);
    expect(docxResult.failures[0]?.error.code).toBe("CORRUPT_FILE");
    expect(txtResult.items).toHaveLength(0);
    expect(txtResult.failures[0]?.error.code).toBe("CORRUPT_FILE");
  });

  it("rejects legacy DOC and exposes deterministic output naming", async () => {
    const legacy = new File(["legacy"], "legacy.doc", { type: "application/msword" });
    const result = await documentEngine.process([legacy], { tool: "docx-to-html" });

    expect(result.failures[0]?.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(getDocumentOutputName("report.docx", "docx-to-txt")).toBe("report-text.txt");
  });
});
