import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const libDirectory = resolve("src/lib");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/lib/")) {
      return nextResolve(pathToFileURL(resolve(libDirectory, `${specifier.slice(6)}.ts`)).href, context);
    }
    if (specifier.startsWith("./") && context.parentURL?.startsWith(pathToFileURL(`${libDirectory}/`).href)) {
      const resolved = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(resolved.pathname)) resolved.pathname += ".ts";
      return nextResolve(resolved.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { formatExportXlsx } = await import("../src/lib/export-format.ts");

function zipEntries(buffer) {
  const bytes = Buffer.from(buffer);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  assert.notEqual(end, -1, "valid ZIP end record exists");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50, "valid ZIP central entry");
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : assert.fail(`unsupported ZIP method ${method}`);
    entries.set(name, data.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlText(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

function parseWorkbook(buffer) {
  const entries = zipEntries(buffer);
  const workbook = entries.get("xl/workbook.xml");
  const relationships = entries.get("xl/_rels/workbook.xml.rels");
  assert.ok(workbook && relationships, "workbook metadata is present");
  const sharedXml = entries.get("xl/sharedStrings.xml") ?? "<sst/>";
  const strings = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(([, item]) =>
    [...item.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, text]) => xmlText(text)).join(""),
  );
  const targets = new Map([...relationships.matchAll(/<Relationship\b([^>]*)\/>/g)].map(([, attributes]) => {
    const id = attributes.match(/\bId="([^"]+)"/)?.[1];
    const target = attributes.match(/\bTarget="([^"]+)"/)?.[1];
    return [id, target];
  }));
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/>/g)].map(([, attributes]) => {
    const name = xmlText(attributes.match(/\bname="([^"]+)"/)?.[1] ?? "");
    const relation = attributes.match(/\br:id="([^"]+)"/)?.[1];
    const target = targets.get(relation);
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    const xml = entries.get(path);
    assert.ok(xml, `worksheet XML exists for ${name}`);
    const cells = new Map([...xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(([, attributes, body]) => {
      const ref = attributes.match(/\br="([^"]+)"/)?.[1];
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const value = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      const inline = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(([, text]) => xmlText(text)).join("");
      return [ref, { type, value: type === "s" ? strings[Number(value)] : value === undefined ? inline : xmlText(value), body }];
    }));
    return { name, xml, cells };
  });
  return sheets;
}

const sections = Array.from({ length: 10 }, (_, index) => ({
  id: `slot_${index + 1}`,
  label: index === 0 ? "مطالعه & <تمرین>" : `Section ${index + 1}`,
  active: index === 0,
  order: index,
}));
const populatedPayload = {
  exported_at: "2026-10-11T12:30:00Z",
  weeks: [{
    start_date: "2026-10-10", end_date: "2026-10-16", label: "Week",
    weekly_goal: "=SUM(A1:A2)", weekly_note: "فارسی\nquoted \"text\" & <tag> &lt;",
    planner_sections: sections,
    days: [{
      date: "2026-10-10", weekday_index: 0, weekday_name: "شنبه",
      day_note: "+2+3",
      sections: {
        slot_1: { duration_minutes: 0, goal: "-cmd", note: "line one\nline two" },
        slot_2: { duration_minutes: 25, goal: "inactive", note: "must not export" },
      },
      schedule_entries: [
        { id: "event-1", start_time: "09:05", end_time: "10:15", title: "@SUM(A1:A2)", note: "چای & <صبحانه>", section_id: "slot_1", order: 0 },
        { id: "event-2", start_time: "10:30", end_time: "11:00", title: "Unknown section", note: "", section_id: "slot_9", order: 1 },
      ],
    }],
    totals: { by_section_minutes: { slot_1: 0 }, week_total_minutes: 0 },
  }],
  finance: {
    goal_amount: -12.5, total_income: 0, remaining_amount: -12.5, progress_percent: 0,
    entries: [{ id: 42, amount: 0.25, note: "=1+1 & \"quoted\"", received_on: "2026-10-10" }],
  },
};

const sheetHeaders = [
  ["Metric", "Value"],
  ["Week start", "Week end", "Weekly goal", "Weekly note", "Section", "Section minutes", "Total minutes"],
  ["Week start", "Date", "Weekday", "Section", "Duration minutes", "Goal", "Note"],
  ["Week start", "Date", "Weekday", "Start time", "End time", "Title", "Section", "Note"],
  ["Week start", "Date", "Weekday", "Day note"],
  ["Date", "Amount", "Note", "Entry ID"],
];

test("XLSX export writes six ordered sheets, headers, typed values and escaped text", () => {
  const originalPayload = structuredClone(populatedPayload);
  const output = formatExportXlsx(populatedPayload);
  const entries = zipEntries(output);
  const sheets = parseWorkbook(output);
  assert.deepEqual(populatedPayload, originalPayload, "writing does not mutate source payload");
  assert.deepEqual(sheets.map(({ name }) => name), ["Overview", "Weeks", "Day Sections", "Schedule", "Day Notes", "Income"]);
  for (const [index, sheet] of sheets.entries()) {
    assert.deepEqual(sheetHeaders[index].map((_, column) => sheet.cells.get(`${String.fromCharCode(65 + column)}1`)?.value), sheetHeaders[index]);
    assert.doesNotMatch(sheet.xml, /<f(?:\s|>)/, `${sheet.name} contains no formula nodes`);
  }
  assert.deepEqual(sheets.map(({ cells }) => cells.size), [14, 14, 14, 24, 8, 8]);
  assert.equal(sheets[0].cells.get("B4").value, "-12.5");
  assert.ok([undefined, "n"].includes(sheets[0].cells.get("B4").type));
  assert.equal(sheets[0].cells.get("B6").value, "-12.5");
  assert.ok([undefined, "n"].includes(sheets[0].cells.get("B6").type));
  assert.equal(sheets[1].cells.get("A2").value, "2026-10-10");
  assert.equal(sheets[1].cells.get("C2").value, "=SUM(A1:A2)");
  assert.ok(["s", "str", "inlineStr"].includes(sheets[1].cells.get("C2").type));
  assert.equal(sheets[1].cells.get("F2").value, "0");
  assert.ok([undefined, "n"].includes(sheets[1].cells.get("F2").type));
  assert.equal(sheets[1].cells.get("E3"), undefined, "inactive section is omitted");
  assert.equal(sheets[2].cells.get("E2").value, "0");
  assert.ok([undefined, "n"].includes(sheets[2].cells.get("E2").type));
  assert.equal(sheets[3].cells.get("D2").value, "09:05");
  assert.ok(["s", "str", "inlineStr"].includes(sheets[3].cells.get("D2").type));
  assert.equal(sheets[3].cells.get("F2").value, "@SUM(A1:A2)");
  assert.ok(["s", "str", "inlineStr"].includes(sheets[3].cells.get("F2").type));
  assert.equal(sheets[3].cells.get("G3").value, "slot_9");
  assert.equal(sheets[4].cells.get("D2").value, "+2+3");
  assert.ok(["s", "str", "inlineStr"].includes(sheets[4].cells.get("D2").type));
  assert.equal(sheets[5].cells.get("A2").value, "2026-10-10");
  assert.equal(sheets[5].cells.get("B2").value, "0.25");
  assert.ok([undefined, "n"].includes(sheets[5].cells.get("B2").type));
  assert.equal(sheets[5].cells.get("D2").value, "42");
  assert.ok([undefined, "n"].includes(sheets[5].cells.get("D2").type));
  assert.equal(sheets[5].cells.get("C2").value, '=1+1 & "quoted"');
  assert.ok(["s", "str", "inlineStr"].includes(sheets[5].cells.get("C2").type));
  const sharedStrings = entries.get("xl/sharedStrings.xml");
  const stringXml = sharedStrings ?? entries.get("xl/worksheets/sheet2.xml");
  assert.ok(stringXml.includes("&amp;"), "ampersands are XML escaped in string values");
  assert.ok(stringXml.includes("&lt;"), "angle brackets are XML escaped in string values");
  assert.ok(stringXml.includes("&amp;lt;"), "entity-like user text stays literal after XML escaping");
  assert.ok(stringXml.includes("\u0645"), "Persian text is retained in workbook XML");
  assert.equal(sheets[1].cells.get("D2").value, "فارسی\nquoted \"text\" & <tag> &lt;");
  assert.equal(sheets[2].cells.get("F2").value, "-cmd");
  assert.ok(["s", "str", "inlineStr"].includes(sheets[2].cells.get("F2").type));
});

test("XLSX export keeps all six sheets and headers for empty planner and income data", () => {
  const emptyPayload = {
    exported_at: "2026-10-11T00:00:00Z", weeks: [],
    finance: { goal_amount: 0, total_income: 0, remaining_amount: 0, progress_percent: 0, entries: [] },
  };
  const sheets = parseWorkbook(formatExportXlsx(emptyPayload));
  assert.deepEqual(sheets.map(({ name }) => name), ["Overview", "Weeks", "Day Sections", "Schedule", "Day Notes", "Income"]);
  for (const [index, sheet] of sheets.entries()) {
    assert.deepEqual(sheetHeaders[index].map((_, column) => sheet.cells.get(`${String.fromCharCode(65 + column)}1`)?.value), sheetHeaders[index]);
  }
  assert.equal(sheets[1].cells.size, 7);
  assert.equal(sheets[2].cells.size, 7);
  assert.equal(sheets[3].cells.size, 8);
  assert.equal(sheets[4].cells.size, 4);
  assert.equal(sheets[5].cells.size, 4);
});
