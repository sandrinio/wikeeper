import { describe, expect, it } from "vitest";
import {
  makeBrokenPdf,
  makeNoDocumentDocx,
  makeReportDocx,
  makeReportPdf,
  makeScannedPdf,
} from "./make-fixtures.js";

describe("make-fixtures: byte-for-byte deterministic", () => {
  it.each([
    ["makeReportDocx", () => makeReportDocx()],
    ["makeNoDocumentDocx", () => makeNoDocumentDocx()],
    ["makeReportPdf", () => makeReportPdf()],
    ["makeScannedPdf", () => makeScannedPdf({ pages: 4, imageOnlyPages: [2], outlinedPages: [3] })],
    ["makeBrokenPdf", () => makeBrokenPdf()],
  ])("%s returns identical bytes on two calls", (_name, make) => {
    expect(Buffer.from(make()).equals(Buffer.from(make()))).toBe(true);
  });
});
