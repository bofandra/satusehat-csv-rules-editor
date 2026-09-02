import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_COLUMNS,
  createEmptyRuleRow,
  parseRulesCsv,
  serializeRulesCsv,
  validateRulesCsv,
  type RulesCsvDocument,
} from "./rulesCsv";

const sampleCsv = readFileSync(
  "public/samples/validation_rules.csv",
  "utf8",
);

describe("rulesCsv", () => {
  it("parses the bundled validation_rules.csv sample", () => {
    const document = parseRulesCsv(sampleCsv);

    expect(document.rows).toHaveLength(1161);
    expect(document.columns).toContain("path5_ref_allowed");
    expect(new Set(document.rows.map((row) => row.resource_type)).size).toBe(62);
    expect(document.rows.some((row) => row.systems.includes("|"))).toBe(true);
    expect(
      document.rows.some((row) =>
        [1, 2, 3, 4, 5].some((level) => row[`path${level}_ref_allowed`]),
      ),
    ).toBe(true);
    expect(document.rows.some((row) => row.additional_validation)).toBe(true);
    expect(document.rows.some((row) => row.conditional_systems)).toBe(true);
    expect(document.rows.some((row) => row.path5_name || row.path5_type)).toBe(true);
  });

  it("round-trips edits while preserving column order and unknown columns", () => {
    const columns = [...REQUIRED_COLUMNS, "clinical_note"];
    const values = columns.map((column) => {
      if (column === "rule_number") return "1";
      if (column === "resource_type") return "Observation";
      if (column === "mandatory") return "TRUE";
      if (column === "has_term") return "False";
      if (column === "systems") return "http://loinc.org|http://unitsofmeasure.org";
      if (column === "path1_name") return "subject";
      if (column === "path1_type") return "Reference";
      if (column === "path1_ref_allowed") return "Patient|Group";
      if (column === "clinical_note") return "contoh";
      return "";
    });
    const document = parseRulesCsv(`${columns.join(",")}\n${values.join(",")}`);
    document.rows[0].resource_type = "DiagnosticReport";
    document.rows[0].clinical_note = "tetap disimpan";

    const exported = serializeRulesCsv(document);
    const reparsed = parseRulesCsv(exported);

    expect(exported.charCodeAt(0)).toBe(0xfeff);
    expect(reparsed.columns).toEqual(columns);
    expect(reparsed.rows).toHaveLength(1);
    expect(reparsed.rows[0].resource_type).toBe("DiagnosticReport");
    expect(reparsed.rows[0].mandatory).toBe("true");
    expect(reparsed.rows[0].has_term).toBe("false");
    expect(reparsed.rows[0].systems).toBe("http://loinc.org|http://unitsofmeasure.org");
    expect(reparsed.rows[0].path1_ref_allowed).toBe("Patient|Group");
    expect(reparsed.rows[0].clinical_note).toBe("tetap disimpan");
  });

  it("throws on malformed CSV and reports missing required columns", () => {
    expect(() => parseRulesCsv('rule_number,resource_type\n"1,Patient')).toThrow();

    const document = parseRulesCsv("rule_number,resource_type\n1,\n");
    const issues = validateRulesCsv(document);

    expect(issues.some((issue) => issue.rowIndex === -1 && issue.field === "path5_ref_allowed")).toBe(true);
    expect(issues.some((issue) => issue.field === "resource_type")).toBe(true);
  });

  it("detects duplicate rule numbers, bad booleans, path gaps, comma lists, and unknown registries", () => {
    const firstRow = createEmptyRuleRow();
    firstRow.rule_number = "10";
    firstRow.mandatory = "maybe";
    firstRow.resource_type = "";
    firstRow.systems = "http://a,http://b";
    firstRow.path3_name = "code";
    firstRow.path3_type = "CodeableConcept";
    firstRow.additional_validation = "customvalidation.UnknownCheck";
    firstRow.conditional_systems = "http://example.org=customterms.Unknown";

    const secondRow = { ...createEmptyRuleRow(), rule_number: "10", resource_type: "Patient" };
    const document: RulesCsvDocument = {
      columns: REQUIRED_COLUMNS,
      rows: [firstRow, secondRow],
      loadedAt: new Date("2026-09-02T00:00:00Z").toISOString(),
    };

    const issues = validateRulesCsv(document);
    const fields = issues.map((issue) => issue.field);

    expect(fields).toContain("resource_type");
    expect(fields).toContain("mandatory");
    expect(fields).toContain("rule_number");
    expect(fields).toContain("systems");
    expect(fields).toContain("path3_name");
    expect(fields).toContain("additional_validation");
    expect(fields).toContain("conditional_systems");
  });
});
