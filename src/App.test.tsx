import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { REQUIRED_COLUMNS } from "./lib/rulesCsv";

const sampleCsv = makeCsv([
  {
    rule_number: "1",
    resource_type: "Observation",
    mandatory: "true",
    systems: "http://loinc.org|http://unitsofmeasure.org",
    path1_name: "subject",
    path1_type: "Reference",
    path1_ref_allowed: "Patient",
  },
  {
    rule_number: "2",
    resource_type: "Patient",
    mandatory: "false",
    has_term: "false",
    path1_name: "gender",
    path1_type: "Code",
  },
]);

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sampleCsv, { status: 200 })),
    );
    Object.defineProperty(URL, "createObjectURL", {
      writable: true,
      value: vi.fn(() => "blob:rules-csv"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      writable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("loads the sample and renders summary counts", async () => {
    render(<App />);

    expect(await screen.findByText(/Sample validation_rules.csv berhasil dimuat/)).toBeInTheDocument();
    expect(metric("Total rules")).toHaveTextContent("2");
    expect(metric("Resources")).toHaveTextContent("2");
    expect(metric("Mandatory")).toHaveTextContent("1");
    expect(screen.getAllByText("Observation").length).toBeGreaterThan(0);

    await userEvent.selectOptions(screen.getByLabelText("Resource"), "Patient");

    await waitFor(() => {
      expect(screen.getByText("1 row terlihat")).toBeInTheDocument();
    });
  });

  it("uploads, edits, duplicates, deletes, downloads, and resets CSV rows", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/Sample validation_rules.csv berhasil dimuat/);
    const customFile = new File([sampleCsv], "custom_rules.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText("Upload CSV"), customFile);

    expect(await screen.findByText(/custom_rules.csv berhasil dimuat/)).toBeInTheDocument();

    const resourceInput = screen.getByLabelText("resource_type");
    await user.clear(resourceInput);
    await user.type(resourceInput, "DiagnosticReport");

    await user.click(screen.getByRole("button", { name: "Tambah row" }));
    expect(screen.getByRole("heading", { name: "Row 3" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Duplikasi row" }));
    expect(screen.getByRole("heading", { name: "Row 4" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hapus row" }));
    expect(screen.getByRole("heading", { name: "Row 3" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Download CSV/i }));
    const createObjectURL = vi.mocked(URL.createObjectURL);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    await expect(readBlobText(blob)).resolves.toContain("DiagnosticReport");

    await user.click(screen.getByRole("button", { name: /Reset/i }));
    expect(screen.getByLabelText("resource_type")).toHaveValue("Observation");
  }, 10_000);
});

function metric(label: string) {
  const labelNode = screen.getAllByText(label)[0];
  const wrapper = labelNode.parentElement?.parentElement;
  if (!wrapper) {
    throw new Error(`Metric ${label} not found`);
  }
  return wrapper;
}

function makeCsv(overrides: Array<Record<string, string>>) {
  const rows = overrides.map((override) =>
    REQUIRED_COLUMNS.map((column) => override[column] ?? "").join(","),
  );
  return `${REQUIRED_COLUMNS.join(",")}\n${rows.join("\n")}`;
}

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
