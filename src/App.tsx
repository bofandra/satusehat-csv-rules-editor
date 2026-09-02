import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileInput,
  Filter,
  ListPlus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  COMMON_PATH_TYPES,
  CsvRulesParseError,
  PATH_LEVELS,
  REQUIRED_COLUMNS,
  cloneRulesDocument,
  createEmptyRuleRow,
  getResourceOptions,
  getRowIssues,
  getRuleFieldPath,
  joinDelimitedList,
  parseRulesCsv,
  serializeRulesCsv,
  splitDelimitedList,
  summarizeRulesCsv,
  validateRulesCsv,
  type RuleIssue,
  type RulesCsvDocument,
  type ValidationRuleRow,
} from "./lib/rulesCsv";

type GridRow = {
  index: number;
  row: ValidationRuleRow;
  issues: RuleIssue[];
};

type MandatoryFilter = "all" | "true" | "false";
type IssueFilter = "all" | "with" | "errors";

const requiredColumnSet = new Set<string>(REQUIRED_COLUMNS);
const basicFields = [
  "rule_number",
  "resource_type",
  "attribute_path",
  "value_set",
  "additional_validation",
  "conditional_systems",
];

function App() {
  const [document, setDocument] = useState<RulesCsvDocument | null>(null);
  const [baselineDocument, setBaselineDocument] = useState<RulesCsvDocument | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Belum ada CSV dimuat.");
  const [isLoading, setIsLoading] = useState(false);
  const [resourceFilter, setResourceFilter] = useState("all");
  const [mandatoryFilter, setMandatoryFilter] = useState<MandatoryFilter>("all");
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const didAutoLoadSample = useRef(false);

  const issues = useMemo(() => (document ? validateRulesCsv(document) : []), [document]);
  const summary = useMemo(
    () => (document ? summarizeRulesCsv(document, issues) : null),
    [document, issues],
  );
  const resourceOptions = useMemo(
    () => (document ? getResourceOptions(document) : []),
    [document],
  );
  const documentIssues = useMemo(
    () => issues.filter((issue) => issue.rowIndex === -1),
    [issues],
  );

  const rows = useMemo<GridRow[]>(() => {
    if (!document) return [];

    const loweredKeyword = keyword.trim().toLowerCase();
    return document.rows
      .map((row, index) => ({
        index,
        row,
        issues: getRowIssues(issues, index),
      }))
      .filter(({ row, issues: rowIssues }) => {
        if (resourceFilter !== "all" && row.resource_type !== resourceFilter) return false;
        if (mandatoryFilter !== "all" && row.mandatory?.toLowerCase() !== mandatoryFilter) {
          return false;
        }
        if (issueFilter === "with" && rowIssues.length === 0) return false;
        if (
          issueFilter === "errors" &&
          !rowIssues.some((issue) => issue.severity === "error")
        ) {
          return false;
        }
        if (!loweredKeyword) return true;

        const searchable = [
          row.rule_number,
          row.resource_type,
          row.attribute_path,
          row.systems,
          row.additional_validation,
          row.conditional_systems,
          getRuleFieldPath(row),
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(loweredKeyword);
      });
  }, [document, issues, issueFilter, keyword, mandatoryFilter, resourceFilter]);

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [issueFilter, keyword, mandatoryFilter, resourceFilter]);

  const loadDocument = useCallback((csvText: string, sourceName: string) => {
    try {
      const parsedDocument = {
        ...parseRulesCsv(csvText),
        sourceName,
      };
      setDocument(parsedDocument);
      setBaselineDocument(cloneRulesDocument(parsedDocument));
      setSelectedRowIndex(parsedDocument.rows.length ? 0 : null);
      setParseError(null);
      setStatusMessage(`${sourceName} berhasil dimuat.`);
    } catch (error) {
      const message =
        error instanceof CsvRulesParseError
          ? error.details.join("\n")
          : error instanceof Error
            ? error.message
            : "CSV tidak bisa dibaca.";
      setParseError(message);
      setStatusMessage("CSV gagal dimuat.");
    }
  }, []);

  const loadSample = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/samples/validation_rules.csv");
      if (!response.ok) {
        throw new Error(`Sample CSV tidak tersedia (${response.status}).`);
      }
      loadDocument(await response.text(), "Sample validation_rules.csv");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sample CSV gagal dimuat.";
      setParseError(message);
      setStatusMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, [loadDocument]);

  useEffect(() => {
    if (didAutoLoadSample.current) return;
    didAutoLoadSample.current = true;
    void loadSample();
  }, [loadSample]);

  const tableColumns = useMemo<ColumnDef<GridRow>[]>(
    () => [
      {
        id: "row",
        header: "No",
        cell: ({ row }) => row.original.index + 1,
      },
      {
        id: "issues",
        header: "Issue",
        cell: ({ row }) => <IssueBadge issues={row.original.issues} />,
        sortingFn: (left, right) => left.original.issues.length - right.original.issues.length,
      },
      {
        id: "rule_number",
        header: "Rule",
        accessorFn: ({ row }) => row.rule_number,
      },
      {
        id: "resource_type",
        header: "Resource",
        accessorFn: ({ row }) => row.resource_type,
      },
      {
        id: "field",
        header: "Field SATUSEHAT / FHIR",
        accessorFn: ({ row }) => getRuleFieldPath(row),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-slate-900">{getRuleFieldPath(row.original.row)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {describePathTypes(row.original.row)}
            </div>
          </div>
        ),
      },
      {
        id: "mandatory",
        header: "Wajib",
        accessorFn: ({ row }) => row.mandatory,
        cell: ({ row }) => (
          <span
            className={
              row.original.row.mandatory?.toLowerCase() === "true"
                ? "status-pill bg-emerald-50 text-emerald-700"
                : "status-pill bg-slate-100 text-slate-600"
            }
          >
            {row.original.row.mandatory?.toLowerCase() === "true" ? "Ya" : "Tidak"}
          </span>
        ),
      },
      {
        id: "systems",
        header: "Systems",
        accessorFn: ({ row }) => splitDelimitedList(row.systems ?? "").length,
        cell: ({ row }) => (
          <CompactList value={row.original.row.systems} emptyLabel="-" maxItems={2} />
        ),
      },
      {
        id: "ref_allowed",
        header: "Ref allowed",
        accessorFn: ({ row }) => getReferenceAllowedValues(row).length,
        cell: ({ row }) => (
          <CompactList
            value={getReferenceAllowedValues(row.original.row).join("|")}
            emptyLabel="-"
            maxItems={3}
          />
        ),
      },
      {
        id: "additional_validation",
        header: "Additional",
        accessorFn: ({ row }) => row.additional_validation,
        cell: ({ row }) => (
          <div className="max-w-60 truncate" title={row.original.row.additional_validation}>
            {row.original.row.additional_validation || "-"}
          </div>
        ),
      },
    ],
    [],
  );

  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedRow = document && selectedRowIndex !== null ? document.rows[selectedRowIndex] : null;
  const selectedIssues = selectedRowIndex !== null ? getRowIssues(issues, selectedRowIndex) : [];

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => loadDocument(String(reader.result ?? ""), file.name);
    reader.onerror = () => {
      setParseError("File CSV gagal dibaca oleh browser.");
      setStatusMessage("Upload gagal.");
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function updateRowField(rowIndex: number, field: string, value: string) {
    setDocument((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((row, index) =>
          index === rowIndex ? { ...row, [field]: value } : row,
        ),
      };
    });
  }

  function addRow() {
    if (!document) return;
    const newRow = createEmptyRuleRow(document.columns);
    if (resourceFilter !== "all") newRow.resource_type = resourceFilter;
    setDocument({
      ...document,
      rows: [...document.rows, newRow],
    });
    setSelectedRowIndex(document.rows.length);
    setStatusMessage("Row baru ditambahkan.");
  }

  function duplicateRow() {
    if (!document || document.rows.length === 0) return;
    const visibleFallback = rows[0]?.index ?? 0;
    const sourceIndex = selectedRowIndex ?? visibleFallback;
    const copyRow = { ...document.rows[sourceIndex] };
    const nextRows = [
      ...document.rows.slice(0, sourceIndex + 1),
      copyRow,
      ...document.rows.slice(sourceIndex + 1),
    ];
    setDocument({ ...document, rows: nextRows });
    setSelectedRowIndex(sourceIndex + 1);
    setStatusMessage("Row terpilih diduplikasi.");
  }

  function deleteRow() {
    if (!document || selectedRowIndex === null) return;
    const nextRows = document.rows.filter((_, index) => index !== selectedRowIndex);
    setDocument({ ...document, rows: nextRows });
    setSelectedRowIndex(nextRows.length ? Math.min(selectedRowIndex, nextRows.length - 1) : null);
    setStatusMessage("Row terpilih dihapus.");
  }

  function resetDocument() {
    if (!baselineDocument) return;
    const cloned = cloneRulesDocument(baselineDocument);
    setDocument(cloned);
    setSelectedRowIndex(cloned.rows.length ? 0 : null);
    setStatusMessage("CSV dikembalikan ke versi terakhir yang dimuat.");
  }

  function validateNow() {
    setStatusMessage(
      issues.length
        ? `Validasi selesai: ${issues.length} issue ditemukan.`
        : "Validasi selesai: tidak ada issue struktur CSV.",
    );
  }

  function downloadCsv() {
    if (!document) return;

    const csv = serializeRulesCsv(document);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `validation_rules_edited_${formatDownloadTimestamp(new Date())}.csv`;
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatusMessage("CSV hasil edit siap diunduh.");
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-teal-700">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                SATUSEHAT CSV Rules Editor
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 md:text-3xl">
                Editor CSV validation rules tanpa database
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Upload CSV rules, review issue struktur, edit row dan nested path, lalu download CSV
                hasil edit langsung dari browser.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".csv,text/csv"
                onChange={handleUpload}
                aria-label="Upload CSV"
              />
              <Button onClick={() => fileInputRef.current?.click()} icon={Upload}>
                Upload CSV
              </Button>
              <Button onClick={loadSample} icon={FileInput} variant="secondary" disabled={isLoading}>
                {isLoading ? "Loading..." : "Load sample"}
              </Button>
              <Button onClick={validateNow} icon={CheckCircle2} variant="secondary" disabled={!document}>
                Validate
              </Button>
              <Button onClick={resetDocument} icon={RefreshCcw} variant="secondary" disabled={!baselineDocument}>
                Reset
              </Button>
              <Button onClick={downloadCsv} icon={Download} variant="primary" disabled={!document}>
                Download CSV
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600" role="status">
            <span className="font-medium text-slate-800">{statusMessage}</span>
            {document?.sourceName ? <span>Source: {document.sourceName}</span> : null}
          </div>

          {parseError ? (
            <div className="flex gap-3 border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <pre className="whitespace-pre-wrap font-sans">{parseError}</pre>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-8">
        <div className="min-w-0 space-y-4">
          <SummaryStrip summary={summary} />

          <div className="border border-slate-200 bg-white p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_1fr]">
              <label className="field-label">
                <span>Resource</span>
                <select
                  value={resourceFilter}
                  onChange={(event) => setResourceFilter(event.target.value)}
                  className="control"
                >
                  <option value="all">Semua resource</option>
                  {resourceOptions.map((resource) => (
                    <option key={resource} value={resource}>
                      {resource}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                <span>Mandatory</span>
                <select
                  value={mandatoryFilter}
                  onChange={(event) => setMandatoryFilter(event.target.value as MandatoryFilter)}
                  className="control"
                >
                  <option value="all">Semua</option>
                  <option value="true">Ya</option>
                  <option value="false">Tidak</option>
                </select>
              </label>
              <label className="field-label">
                <span>Issue</span>
                <select
                  value={issueFilter}
                  onChange={(event) => setIssueFilter(event.target.value as IssueFilter)}
                  className="control"
                >
                  <option value="all">Semua</option>
                  <option value="with">Dengan issue</option>
                  <option value="errors">Error saja</option>
                </select>
              </label>
              <label className="field-label">
                <span>Search</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    className="control pl-9"
                    placeholder="Cari rule, resource, field, system..."
                    type="search"
                  />
                </div>
              </label>
            </div>
          </div>

          {documentIssues.length ? <GlobalIssues issues={documentIssues} /> : null}

          <div className="border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Filter className="h-4 w-4 text-teal-700" aria-hidden="true" />
                  {rows.length.toLocaleString("id-ID")} row terlihat
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Sorting hanya mengubah tampilan; download tetap mempertahankan urutan row asli.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <IconButton onClick={addRow} icon={ListPlus} label="Tambah row" disabled={!document} />
                <IconButton onClick={duplicateRow} icon={Copy} label="Duplikasi row" disabled={!document} />
                <IconButton onClick={deleteRow} icon={Trash2} label="Hapus row" disabled={!selectedRow} danger />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-left text-sm">
                <thead className="bg-slate-900 text-white">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-3 py-2 text-xs font-semibold uppercase tracking-normal"
                          style={{ width: headerWidth(header.id) }}
                        >
                          {header.isPlaceholder ? null : (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 text-left"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <span className="text-slate-300">{sortLabel(header.column.getIsSorted())}</span>
                            </button>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((tableRow) => {
                    const isSelected = selectedRowIndex === tableRow.original.index;
                    return (
                      <tr
                        key={tableRow.original.index}
                        className={`cursor-pointer border-b border-slate-100 ${
                          isSelected ? "bg-teal-50" : tableRow.index % 2 ? "bg-white" : "bg-slate-50"
                        }`}
                        onClick={() => setSelectedRowIndex(tableRow.original.index)}
                      >
                        {tableRow.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-3 py-2 align-top text-slate-700">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3 text-sm">
              <div className="text-slate-600">
                Page {table.getState().pagination.pageIndex + 1} dari {table.getPageCount() || 1}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Berikutnya
                </Button>
                <select
                  value={pagination.pageSize}
                  onChange={(event) =>
                    setPagination((current) => ({
                      ...current,
                      pageSize: Number(event.target.value),
                      pageIndex: 0,
                    }))
                  }
                  className="control w-28"
                  aria-label="Rows per page"
                >
                  {[25, 50, 100].map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize}/page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <RowEditor
          document={document}
          row={selectedRow}
          rowIndex={selectedRowIndex}
          issues={selectedIssues}
          onUpdate={updateRowField}
        />
      </section>
    </main>
  );
}

function SummaryStrip({ summary }: { summary: ReturnType<typeof summarizeRulesCsv> | null }) {
  const cards = [
    ["Total rules", summary?.totalRules ?? 0, "bg-white"],
    ["Resources", summary?.resourceCount ?? 0, "bg-blue-50"],
    ["Mandatory", summary?.mandatoryCount ?? 0, "bg-emerald-50"],
    ["Terminology", summary?.terminologyCount ?? 0, "bg-teal-50"],
    ["Ref constraints", summary?.referenceConstraintCount ?? 0, "bg-amber-50"],
    ["Issues", summary?.issueCount ?? 0, summary?.errorCount ? "bg-red-50" : "bg-slate-50"],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map(([label, value, tone]) => (
        <div key={label} className={`border border-slate-200 p-3 ${tone}`}>
          <div className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">
            {Number(value).toLocaleString("id-ID")}
          </div>
        </div>
      ))}
    </div>
  );
}

function RowEditor({
  document,
  row,
  rowIndex,
  issues,
  onUpdate,
}: {
  document: RulesCsvDocument | null;
  row: ValidationRuleRow | null;
  rowIndex: number | null;
  issues: RuleIssue[];
  onUpdate: (rowIndex: number, field: string, value: string) => void;
}) {
  if (!document || !row || rowIndex === null) {
    return (
      <aside className="border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Row editor</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Load atau upload CSV, lalu pilih salah satu row untuk diedit.
        </p>
      </aside>
    );
  }

  const extraColumns = document.columns.filter((column) => !requiredColumnSet.has(column));

  return (
    <aside className="h-fit border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Row {rowIndex + 1}</h2>
            <p className="mt-1 text-sm text-slate-500">{row.resource_type || "Resource belum diisi"}</p>
          </div>
          <IssueBadge issues={issues} />
        </div>
        {issues.length ? <IssueList issues={issues} /> : null}
      </div>

      <div className="max-h-[calc(100vh-130px)] space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          <SectionTitle>Basic fields</SectionTitle>
          {basicFields.map((field) => (
            <TextField
              key={field}
              label={field}
              value={row[field] ?? ""}
              onChange={(value) => onUpdate(rowIndex, field, value)}
              multiline={field === "conditional_systems" || field === "value_set"}
              suggestions={field === "additional_validation" ? undefined : undefined}
            />
          ))}
          <div className="grid grid-cols-2 gap-3">
            <BooleanField
              label="mandatory"
              value={row.mandatory ?? ""}
              onChange={(value) => onUpdate(rowIndex, "mandatory", value)}
            />
            <BooleanField
              label="has_term"
              value={row.has_term ?? ""}
              onChange={(value) => onUpdate(rowIndex, "has_term", value)}
            />
          </div>
          <DelimitedListEditor
            label="systems"
            value={row.systems ?? ""}
            onChange={(value) => onUpdate(rowIndex, "systems", value)}
          />
        </section>

        <section className="space-y-3">
          <SectionTitle>Nested path</SectionTitle>
          <datalist id="path-type-options">
            {COMMON_PATH_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
          {PATH_LEVELS.map((level) => (
            <PathLevelEditor
              key={level}
              level={level}
              row={row}
              onUpdate={(field, value) => onUpdate(rowIndex, field, value)}
            />
          ))}
        </section>

        {extraColumns.length ? (
          <section className="space-y-3">
            <SectionTitle>Extra columns</SectionTitle>
            {extraColumns.map((field) => (
              <TextField
                key={field}
                label={field}
                value={row[field] ?? ""}
                onChange={(value) => onUpdate(rowIndex, field, value)}
                multiline
              />
            ))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function PathLevelEditor({
  level,
  row,
  onUpdate,
}: {
  level: number;
  row: ValidationRuleRow;
  onUpdate: (field: string, value: string) => void;
}) {
  const prefix = `path${level}`;
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 text-sm font-semibold text-slate-800">Path level {level}</div>
      <div className="grid gap-3">
        <TextField
          label={`${prefix}_name`}
          value={row[`${prefix}_name`] ?? ""}
          onChange={(value) => onUpdate(`${prefix}_name`, value)}
        />
        <TextField
          label={`${prefix}_type`}
          value={row[`${prefix}_type`] ?? ""}
          onChange={(value) => onUpdate(`${prefix}_type`, value)}
          list="path-type-options"
        />
        <TextField
          label={`${prefix}_url`}
          value={row[`${prefix}_url`] ?? ""}
          onChange={(value) => onUpdate(`${prefix}_url`, value)}
          multiline
        />
        <DelimitedListEditor
          label={`${prefix}_ref_allowed`}
          value={row[`${prefix}_ref_allowed`] ?? ""}
          onChange={(value) => onUpdate(`${prefix}_ref_allowed`, value)}
        />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
  list,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  list?: string;
  suggestions?: string[];
}) {
  return (
    <label className="field-label">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="control min-h-20 resize-y"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="control"
          list={list}
        />
      )}
    </label>
  );
}

function BooleanField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const enabled = value.toLowerCase() === "true";
  return (
    <label className="field-label">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`flex h-10 items-center justify-between border px-3 text-sm font-medium ${
          enabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
        onClick={() => onChange(enabled ? "false" : "true")}
      >
        <span>{enabled ? "true" : "false"}</span>
        <span
          className={`h-4 w-8 border p-0.5 ${
            enabled ? "border-emerald-300 bg-emerald-200" : "border-slate-300 bg-white"
          }`}
        >
          <span
            className={`block h-2.5 w-2.5 bg-current transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
      </button>
    </label>
  );
}

function DelimitedListEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const items = splitDelimitedList(value);

  function addDraft() {
    const additions = draft
      .split(/[\n|]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!additions.length) return;
    onChange(joinDelimitedList([...items, ...additions]));
    setDraft("");
  }

  function removeItem(indexToRemove: number) {
    onChange(joinDelimitedList(items.filter((_, index) => index !== indexToRemove)));
  }

  return (
    <div className="field-label">
      <span>{label}</span>
      <div className="space-y-2 border border-slate-200 bg-white p-2">
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
          {items.length ? (
            items.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="inline-flex max-w-full items-center gap-1 bg-slate-100 px-2 py-1 text-xs text-slate-700"
              >
                <span className="truncate">{item}</span>
                <button
                  type="button"
                  className="text-slate-500 hover:text-red-600"
                  onClick={() => removeItem(index)}
                  aria-label={`Remove ${item}`}
                >
                  x
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400">Empty</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addDraft();
              }
            }}
            className="control h-9 min-w-0 flex-1"
            placeholder="Tambah token"
          />
          <Button variant="secondary" onClick={addDraft}>
            Tambah
          </Button>
        </div>
      </div>
    </div>
  );
}

function IssueBadge({ issues }: { issues: RuleIssue[] }) {
  if (!issues.length) {
    return <span className="status-pill bg-emerald-50 text-emerald-700">OK</span>;
  }
  const hasError = issues.some((issue) => issue.severity === "error");
  return (
    <span className={`status-pill ${hasError ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
      {hasError ? "Error" : "Warn"} {issues.length}
    </span>
  );
}

function IssueList({ issues }: { issues: RuleIssue[] }) {
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {issues.map((issue, index) => (
        <li key={`${issue.field}-${index}`} className="border border-slate-200 bg-slate-50 p-2">
          <div className="font-medium text-slate-800">
            {issue.severity.toUpperCase()} · {issue.field}
          </div>
          <div className="mt-1 text-slate-600">{issue.message}</div>
        </li>
      ))}
    </ul>
  );
}

function GlobalIssues({ issues }: { issues: RuleIssue[] }) {
  return (
    <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Issue pada struktur file
      </div>
      <IssueList issues={issues.slice(0, 8)} />
    </div>
  );
}

function Button({
  children,
  icon: Icon,
  onClick,
  variant = "default",
  disabled,
}: {
  children: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  onClick?: () => void;
  variant?: "default" | "primary" | "secondary";
  disabled?: boolean;
}) {
  const tone =
    variant === "primary"
      ? "border-teal-700 bg-teal-700 text-white hover:bg-teal-800"
      : variant === "secondary"
        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center gap-2 border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden={true} /> : null}
      {children}
    </button>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden={true} />
    </button>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">{children}</h3>;
}

function CompactList({
  value,
  emptyLabel,
  maxItems,
}: {
  value: string;
  emptyLabel: string;
  maxItems: number;
}) {
  const items = splitDelimitedList(value);
  if (!items.length) return <span className="text-slate-400">{emptyLabel}</span>;
  return (
    <div className="space-y-1">
      {items.slice(0, maxItems).map((item) => (
        <div key={item} className="truncate text-xs text-slate-700" title={item}>
          {item}
        </div>
      ))}
      {items.length > maxItems ? <div className="text-xs text-slate-500">+{items.length - maxItems} lainnya</div> : null}
    </div>
  );
}

function getReferenceAllowedValues(row: ValidationRuleRow): string[] {
  return PATH_LEVELS.flatMap((level) => splitDelimitedList(row[`path${level}_ref_allowed`] ?? ""));
}

function describePathTypes(row: ValidationRuleRow): string {
  return PATH_LEVELS.map((level) => {
    const name = row[`path${level}_name`];
    const type = row[`path${level}_type`];
    if (!name && !type) return "";
    return type ? `${name || "(path)"}: ${type}` : name;
  })
    .filter(Boolean)
    .join(" > ");
}

function sortLabel(sorted: false | "asc" | "desc") {
  if (sorted === "asc") return "↑";
  if (sorted === "desc") return "↓";
  return "";
}

function headerWidth(id: string) {
  const widths: Record<string, string> = {
    row: "64px",
    issues: "90px",
    rule_number: "90px",
    resource_type: "150px",
    field: "310px",
    mandatory: "85px",
    systems: "270px",
    ref_allowed: "180px",
    additional_validation: "260px",
  };
  return widths[id] ?? "160px";
}

function formatDownloadTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}

export default App;
