import Papa from "papaparse";

export type ValidationRuleRow = Record<string, string>;

export type RulesCsvDocument = {
  columns: string[];
  rows: ValidationRuleRow[];
  sourceName?: string;
  loadedAt: string;
};

export type RuleIssue = {
  rowIndex: number;
  severity: "error" | "warning";
  field: string;
  message: string;
};

export type RulesSummary = {
  totalRules: number;
  resourceCount: number;
  mandatoryCount: number;
  terminologyCount: number;
  referenceConstraintCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
};

export const BASE_COLUMNS = [
  "rule_number",
  "resource_type",
  "attribute_path",
  "value_set",
  "mandatory",
  "has_term",
  "systems",
  "additional_validation",
  "conditional_systems",
] as const;

export const PATH_LEVELS = [1, 2, 3, 4, 5] as const;

export const PATH_FIELD_SUFFIXES = [
  "name",
  "type",
  "url",
  "ref_allowed",
] as const;

export const PATH_COLUMNS = PATH_LEVELS.flatMap((level) =>
  PATH_FIELD_SUFFIXES.map((suffix) => `path${level}_${suffix}`),
);

export const REQUIRED_COLUMNS = [...BASE_COLUMNS, ...PATH_COLUMNS];
export const BOOLEAN_COLUMNS = ["mandatory", "has_term"] as const;
export const LIST_COLUMNS = ["systems", ...PATH_LEVELS.map((level) => `path${level}_ref_allowed`)];

export const COMMON_PATH_TYPES = [
  "Array",
  "Boolean",
  "Code",
  "CodeableConcept",
  "Coding",
  "CodingArray",
  "Date",
  "Decimal",
  "Identifier",
  "Integer",
  "Object",
  "Reference",
  "ReferenceArray",
  "String",
  "TextNotEmpty",
  "Time",
  "dateTime",
  "dateTimeWithoutLimit",
  "futureDate",
  "FutureDateTime",
  "positiveDecimal",
  "positiveInteger",
];

export const KNOWN_ADDITIONAL_VALIDATIONS = [
  "customvalidation.AccountDuplicateCoverageCheck",
  "customvalidation.AccountSubjectNameCheck",
  "customvalidation.ActiveRelatedPersonCheck",
  "customvalidation.AppointmentSlotCheck",
  "customvalidation.BiologicallyDerivedProductIdentifierValue",
  "customvalidation.ChargeItemResponseOverrideCheck",
  "customvalidation.ConditionCodeCheck",
  "customvalidation.ConsentPolicyUriCheck",
  "customvalidation.CovElRequestCoverageWithPatientCheck",
  "customvalidation.CovElRequestMandatoryResourceCheck",
  "customvalidation.CoverageIdentifierCheck",
  "customvalidation.DocumentReferenceMasterIdentifierCheck",
  "customvalidation.EocPeriodEndValidation",
  "customvalidation.EocTypeValidation",
  "customvalidation.HasToReferMedication",
  "customvalidation.HasToReferMedicationRequest",
  "customvalidation.ImmunizationExpiredDateChecker",
  "customvalidation.ImmunizationVaccineCodeCheck",
  "customvalidation.InsurerMatchIdentifier",
  "customvalidation.KfaAllowOneCode",
  "customvalidation.MedicationRequestIdentifierNationalCheck",
  "customvalidation.MedicationRequestRequester",
  "customvalidation.PeriodStartEndChecker",
  "customvalidation.ProvenanceActivityCheck",
  "customvalidation.ProvenanceAgentCheck",
  "customvalidation.ProvenanceEntityWhatCheck",
  "customvalidation.ProvenanceSignatureCheck",
  "customvalidation.ProvenanceSignatureDataCheck",
  "customvalidation.ProvenanceTargetCheck",
  "customvalidation.RelatedPersonRelationshipValidation",
  "customvalidation.ServiceProviderMatchHeaderOrgId",
  "customvalidation.SupportingInfoHasInvoiceChargeItem",
  "customvalidation.TaskCodeCheck",
  "customvalidation.ValidateAddressParent",
  "customvalidation.ValidateChargeItemTotal",
  "customvalidation.ValidateEducationFatherKTPFormat",
  "customvalidation.ValidateEducationMotherKTPFormat",
  "customvalidation.ValidateImmunizationPerformer",
];

export const KNOWN_CONDITIONAL_FUNCTIONS = [
  "customterms.IsMdpn",
  "customterms.IsNar",
  "customterms.IsSitb",
];

const booleanColumnSet = new Set<string>(BOOLEAN_COLUMNS);
const listColumnSet = new Set<string>(LIST_COLUMNS);
const knownAdditionalSet = new Set<string>(KNOWN_ADDITIONAL_VALIDATIONS);
const knownConditionalSet = new Set<string>(KNOWN_CONDITIONAL_FUNCTIONS);

export class CsvRulesParseError extends Error {
  readonly details: string[];

  constructor(details: string[]) {
    super(details.join("\n"));
    this.name = "CsvRulesParseError";
    this.details = details;
  }
}

export function parseRulesCsv(csvText: string): RulesCsvDocument {
  const trimmedText = csvText.replace(/^\uFEFF/, "");
  const parsed = Papa.parse<ValidationRuleRow>(trimmedText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    transform: (value) => String(value ?? "").trimEnd(),
  });

  if (parsed.errors.length > 0) {
    throw new CsvRulesParseError(
      parsed.errors.map((error) => `Row ${error.row ?? "-"}: ${error.message}`),
    );
  }

  const columns = (parsed.meta.fields ?? []).filter(Boolean);
  if (columns.length === 0) {
    throw new CsvRulesParseError(["CSV tidak memiliki header kolom."]);
  }

  const rows = parsed.data
    .filter((row) => columns.some((column) => String(row[column] ?? "").trim() !== ""))
    .map((row) => normalizeRow(row, columns));

  return {
    columns,
    rows,
    loadedAt: new Date().toISOString(),
  };
}

export function serializeRulesCsv(document: RulesCsvDocument): string {
  const rows = document.rows.map((row) => {
    const normalized: ValidationRuleRow = {};
    for (const column of document.columns) {
      normalized[column] = normalizeValueForExport(column, row[column] ?? "");
    }
    return normalized;
  });

  return `\uFEFF${Papa.unparse(rows, {
    columns: document.columns,
    newline: "\n",
  })}`;
}

export function validateRulesCsv(document: RulesCsvDocument): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const columnSet = new Set(document.columns);

  for (const column of REQUIRED_COLUMNS) {
    if (!columnSet.has(column)) {
      issues.push({
        rowIndex: -1,
        severity: "error",
        field: column,
        message: `Kolom wajib "${column}" tidak ada di CSV.`,
      });
    }
  }

  const seenRuleNumbers = new Map<string, number>();

  document.rows.forEach((row, rowIndex) => {
    if (!row.resource_type?.trim()) {
      issues.push({
        rowIndex,
        severity: "error",
        field: "resource_type",
        message: "resource_type wajib diisi.",
      });
    }

    for (const column of BOOLEAN_COLUMNS) {
      const value = row[column]?.trim();
      if (value && !["true", "false"].includes(value.toLowerCase())) {
        issues.push({
          rowIndex,
          severity: "error",
          field: column,
          message: `${column} hanya boleh true, false, atau kosong.`,
        });
      }
    }

    const ruleNumber = row.rule_number?.trim();
    if (ruleNumber) {
      const previousIndex = seenRuleNumbers.get(ruleNumber);
      if (previousIndex !== undefined) {
        issues.push({
          rowIndex,
          severity: "warning",
          field: "rule_number",
          message: `rule_number duplikat dengan row ${previousIndex + 1}.`,
        });
      } else {
        seenRuleNumbers.set(ruleNumber, rowIndex);
      }
    }

    for (const column of LIST_COLUMNS) {
      const value = row[column]?.trim();
      if (value && value.includes(",")) {
        issues.push({
          rowIndex,
          severity: "warning",
          field: column,
          message: `${column} berisi koma. Gunakan delimiter "|" untuk daftar nilai.`,
        });
      }
    }

    for (const level of PATH_LEVELS) {
      const pathName = row[`path${level}_name`]?.trim();
      const levelHasAnyPathValue = PATH_FIELD_SUFFIXES.some((suffix) =>
        row[`path${level}_${suffix}`]?.trim(),
      );
      if (level > 1 && levelHasAnyPathValue && !row[`path${level - 1}_name`]?.trim()) {
        issues.push({
          rowIndex,
          severity: "warning",
          field: `path${level}_name`,
          message: `path${level} terisi tetapi path${level - 1}_name kosong.`,
        });
      }
      if (!pathName && levelHasAnyPathValue) {
        issues.push({
          rowIndex,
          severity: "warning",
          field: `path${level}_name`,
          message: `path${level}_name kosong walaupun kolom path level ini memiliki nilai lain.`,
        });
      }
    }

    const additionalValidation = row.additional_validation?.trim();
    if (additionalValidation && !knownAdditionalSet.has(additionalValidation)) {
      issues.push({
        rowIndex,
        severity: "warning",
        field: "additional_validation",
        message: "additional_validation belum ada di registry sample.",
      });
    }

    for (const conditionalFn of extractConditionalFunctionNames(row.conditional_systems ?? "")) {
      if (!knownConditionalSet.has(conditionalFn)) {
        issues.push({
          rowIndex,
          severity: "warning",
          field: "conditional_systems",
          message: `${conditionalFn} belum ada di registry conditional systems sample.`,
        });
      }
    }
  });

  return issues;
}

export function createEmptyRuleRow(columns: string[] = REQUIRED_COLUMNS): ValidationRuleRow {
  return Object.fromEntries(columns.map((column) => [column, ""]));
}

export function cloneRulesDocument(document: RulesCsvDocument): RulesCsvDocument {
  return {
    ...document,
    columns: [...document.columns],
    rows: document.rows.map((row) => ({ ...row })),
  };
}

export function getRuleFieldPath(row: ValidationRuleRow): string {
  if (row.attribute_path?.trim()) {
    return row.attribute_path.trim();
  }

  const pathParts = PATH_LEVELS.map((level) => row[`path${level}_name`]?.trim()).filter(Boolean);
  return pathParts.length ? pathParts.join(".") : "(resource root)";
}

export function splitDelimitedList(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinDelimitedList(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join("|");
}

export function summarizeRulesCsv(document: RulesCsvDocument, issues: RuleIssue[]): RulesSummary {
  const uniqueResources = new Set(
    document.rows.map((row) => row.resource_type?.trim()).filter(Boolean),
  );
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;

  return {
    totalRules: document.rows.length,
    resourceCount: uniqueResources.size,
    mandatoryCount: document.rows.filter((row) => row.mandatory?.toLowerCase() === "true").length,
    terminologyCount: document.rows.filter((row) => Boolean(row.systems?.trim() || row.value_set?.trim())).length,
    referenceConstraintCount: document.rows.filter((row) =>
      PATH_LEVELS.some((level) => row[`path${level}_ref_allowed`]?.trim()),
    ).length,
    issueCount: issues.length,
    errorCount,
    warningCount,
  };
}

export function getResourceOptions(document: RulesCsvDocument): string[] {
  return [...new Set(document.rows.map((row) => row.resource_type?.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export function getRowIssues(issues: RuleIssue[], rowIndex: number): RuleIssue[] {
  return issues.filter((issue) => issue.rowIndex === rowIndex);
}

function normalizeRow(row: ValidationRuleRow, columns: string[]): ValidationRuleRow {
  const normalized: ValidationRuleRow = {};
  for (const column of columns) {
    normalized[column] = String(row[column] ?? "");
  }
  return normalized;
}

function normalizeValueForExport(column: string, value: string): string {
  if (booleanColumnSet.has(column)) {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "false" ? normalized : value.trim();
  }

  if (listColumnSet.has(column)) {
    return joinDelimitedList(splitDelimitedList(value));
  }

  return value;
}

function extractConditionalFunctionNames(value: string): string[] {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.lastIndexOf("=");
      return separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim() : entry;
    })
    .filter(Boolean);
}
