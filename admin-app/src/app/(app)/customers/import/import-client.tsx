"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { cn } from "@/lib/core/cn";
import { errorMessage } from "@/lib/core/errors";
import { formatPhone, normalizeRego } from "@/lib/core/phone";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { useShop } from "@/components/shop-context";
import { IMPORT_FIELDS, downloadCsv, guessMapping, normaliseVehicleType, parseCsv, type ImportField } from "@/lib/csv";
import { importCustomers, type ImportRow } from "@/lib/shop/customers";

const CHUNK = 1000;
const MAX_ROWS = 20000;

type Mapping = Partial<Record<ImportField, number>> & { first?: number; last?: number };
type Summary = { created: number; updated: number; skipped: number; errors: Array<{ row: number; error: string }> };

export function ImportClient() {
  const { supabase, staff } = useShop();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping>({});
  const [check, setCheck] = useState<Summary | null>(null);
  const [result, setResult] = useState<Summary | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setCheck(null);
    setResult(null);
    if (file.size > 15 * 1024 * 1024) {
      setError("That file is too big (over 15 MB).");
      return;
    }
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      setError("That file doesn't have a header row and at least one customer.");
      return;
    }
    if (rows.length - 1 > MAX_ROWS) {
      setError(`That file has ${rows.length - 1} rows. Split it into files of up to ${MAX_ROWS.toLocaleString()}.`);
      return;
    }
    setFileName(file.name);
    setHeaders(rows[0].map((h) => h.trim()));
    setData(rows.slice(1));
    setMap(guessMapping(rows[0]));
  }

  function toRows(): ImportRow[] {
    return data.map((r) => {
        const get = (i: number | undefined) => (i === undefined ? "" : (r[i] ?? "").trim());
        const name = map.name !== undefined ? get(map.name) : [get(map.first), get(map.last)].filter(Boolean).join(" ");
        return {
          name,
          phone: get(map.phone),
          email: get(map.email),
          rego: get(map.rego),
          make_model: get(map.make_model),
          vehicle_type: normaliseVehicleType(get(map.vehicle_type)),
          last_visit: get(map.last_visit),
          total_spend: get(map.total_spend),
          notes: get(map.notes),
        };
      });
  }

  const hasName = map.name !== undefined || map.first !== undefined || map.last !== undefined;
  const ready = hasName && map.phone !== undefined;

  async function run(dryRun: boolean) {
    setError(null);
    setProgress(0);
    const rows = toRows();
    const total: Summary = { created: 0, updated: 0, skipped: 0, errors: [] };
    try {
      for (let start = 0; start < rows.length; start += CHUNK) {
        const r = await importCustomers(supabase, rows.slice(start, start + CHUNK), dryRun);
        total.created += r.created;
        total.updated += r.updated;
        total.skipped += r.skipped;
        // Row numbers in the file: +1 for the header row, +chunk offset.
        total.errors.push(...r.errors.map((e) => ({ row: e.row + start + 1, error: e.error })));
        setProgress(Math.min(100, Math.round(((start + CHUNK) / rows.length) * 100)));
      }
      if (dryRun) setCheck(total);
      else setResult(total);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setProgress(null);
    }
  }

  function errorReport(s: Summary) {
    downloadCsv("import-problems.csv", [["Row in file", "Problem", ...headers], ...s.errors.map((e) => [e.row, e.error, ...(data[e.row - 2] ?? [])])]);
  }

  if (staff.role !== "admin") {
    return <Notice tone="warn" title="Admins only">Importing customers needs an admin login.</Notice>;
  }

  const fieldOptions = [
    { value: "", label: "— Not in file —" },
    ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
  ];
  const preview = ready ? toRows().slice(0, 5) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/customers" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> Customers
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import customers</h1>
        <p className="mt-1 text-fg-muted">
          From a CSV file, e.g. exported from PickTime, Odoo or a spreadsheet. Customers are matched on mobile number: existing ones are updated, new ones added. Nothing is saved until you press Import.
        </p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <Card>
        <CardHeader title="1. Choose the file" />
        <CardBody>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void onFile(f);
            }}
            className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-6 py-8 text-center transition hover:border-accent focus-visible:outline-2 focus-visible:outline-focus"
          >
            <FileUp size={28} className="text-fg-faint" aria-hidden />
            {fileName ? (
              <span>
                <span className="font-semibold">{fileName}</span>
                <span className="block text-sm text-fg-muted">{data.length.toLocaleString()} customers · tap to choose a different file</span>
              </span>
            ) : (
              <span>
                <span className="font-semibold">Choose a CSV file</span>
                <span className="block text-sm text-fg-muted">or drop it here. Needs at least a name and a mobile column.</span>
              </span>
            )}
          </button>
        </CardBody>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader title="2. Match the columns" description="We've guessed from the column names. Fix anything that's wrong." />
          <CardBody className="grid gap-4 @3xl:grid-cols-3">
            {map.first !== undefined || map.last !== undefined ? (
              <Notice tone="info" className="@3xl:col-span-3">
                Using “{headers[map.first ?? -1] ?? "—"}” + “{headers[map.last ?? -1] ?? "—"}” as the name.
              </Notice>
            ) : null}
            {IMPORT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} optional={!("required" in f && f.required)} error={f.key === "phone" && map.phone === undefined ? "Needed to match customers" : f.key === "name" && !hasName ? "Needed" : null}>
                <Select
                  value={map[f.key] === undefined ? "" : String(map[f.key])}
                  onChange={(e) => {
                    setCheck(null);
                    setMap((m) => {
                      const next = { ...m };
                      if (e.target.value === "") delete next[f.key];
                      else next[f.key] = Number(e.target.value);
                      if (f.key === "name" && e.target.value !== "") {
                        delete next.first;
                        delete next.last;
                      }
                      return next;
                    });
                  }}
                >
                  {fieldOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </CardBody>
          {preview.length > 0 && (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <caption className="px-5 pt-4 text-left font-semibold">First rows as they&apos;ll be imported</caption>
                <thead>
                  <tr className="text-left text-xs text-fg-muted uppercase">
                    {["Name", "Mobile", "Email", "Rego", "Car", "Type"].map((h) => (
                      <th key={h} className="px-5 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-5 py-2">{r.name || <span className="text-bad-ink">missing</span>}</td>
                      <td className="px-5 py-2 tabular-nums">{r.phone ? formatPhone(r.phone) || r.phone : <span className="text-bad-ink">missing</span>}</td>
                      <td className="px-5 py-2">{r.email}</td>
                      <td className="px-5 py-2 font-mono">{normalizeRego(r.rego) ?? ""}</td>
                      <td className="px-5 py-2">{r.make_model}</td>
                      <td className="px-5 py-2">{r.vehicle_type || (r.rego ? "sedan" : "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {headers.length > 0 && (
        <Card>
          <CardHeader title="3. Check, then import" />
          <CardBody className="space-y-4">
            {progress !== null && (
              <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Import progress" className="h-3 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            {result ? (
              <>
                <Notice tone="ok" title="Import finished">
                  {result.created} added, {result.updated} updated, {result.skipped} skipped.
                </Notice>
                <div className="flex flex-wrap gap-2">
                  <LinkButton href="/customers" variant="primary" icon={CheckCircle2}>
                    See customers
                  </LinkButton>
                  {result.errors.length > 0 && (
                    <Button icon={Download} onClick={() => errorReport(result)}>
                      Download skipped rows
                    </Button>
                  )}
                </div>
              </>
            ) : check ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Will be added" value={check.created} />
                  <Stat label="Will be updated" value={check.updated} sub="Matched on mobile" />
                  <Stat label="Will be skipped" value={<span className={cn(check.skipped > 0 && "text-warn-ink")}>{check.skipped}</span>} />
                </div>
                {check.errors.length > 0 && (
                  <div className="rounded-xl bg-sunken p-4 ring-1 ring-line">
                    <p className="mb-2 font-semibold">Skipped rows</p>
                    <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                      {check.errors.slice(0, 100).map((e) => (
                        <li key={`${e.row}-${e.error}`}>
                          Row {e.row}: {e.error}
                        </li>
                      ))}
                    </ul>
                    <Button size="sm" className="mt-3" icon={Download} onClick={() => errorReport(check)}>
                      Download the list
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="lg" icon={Upload} loading={progress !== null} disabled={check.created + check.updated === 0} onClick={() => run(false)}>
                    Import {check.created + check.updated} customers
                  </Button>
                  <Button variant="ghost" disabled={progress !== null} onClick={() => setCheck(null)}>
                    Change something
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="primary" size="lg" loading={progress !== null} disabled={!ready} onClick={() => run(true)}>
                Check the file (nothing is saved)
              </Button>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
