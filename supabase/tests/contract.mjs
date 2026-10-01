// Contract check: every database call the two apps make, checked against the
// real final schema (v1 base + upgrade_v2 + every patch_*.sql + hardening).
//
//   node contract.mjs            → prints a report, exits 1 on any problem
//
// It reads the apps' TypeScript with the compiler API and collects:
//   * supabase.from("table").select("…embeds…").eq/order/or/…("column")
//   * supabase.rpc("fn", { args }) and callRpc(supabase, "fn", { args })
// then checks tables/views, columns, PostgREST embeds (incl. ambiguous FKs and
// !hints), RPC names, argument names, and whether the calling role (anon for
// the public site, authenticated for the staff app / signed-in customers) may
// SELECT those columns or EXECUTE those functions after hardening.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { makeDb, read, here } from "./harness.mjs";

const require = createRequire(import.meta.url);
const ts = require(join(here, "../../admin-app/node_modules/typescript"));
const ROOT = join(here, "../..");

// ---------------------------------------------------------------------------
// 1. Build the final schema exactly as production has it.
// ---------------------------------------------------------------------------
export async function buildFinalDb() {
  const db = await makeDb();
  await db.exec(read("fixtures/v1_phase5_schema.sql"));
  await db.exec(read("fixtures/v1_snippet_1_services.sql"));
  await db.exec(read("fixtures/v1_snippet_2_vehicle_pricing.sql"));
  await db.exec(read("../upgrade_v2.sql"));
  await db.exec(read("../post_merge_hardening.sql"));
  for (const f of readdirSync(join(here, "..")).filter((f) => /^patch_.*\.sql$/.test(f)).sort()) {
    await db.exec(read(`../${f}`));
  }
  return db;
}

async function introspect(db) {
  const cols = (await db.query(`select table_name t, column_name c from information_schema.columns where table_schema = 'public'`)).rows;
  const relKinds = (await db.query(`select c.relname n, c.relkind k from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v','m')`)).rows;
  const fks = (await db.query(`select con.conname name, src.relname src, tgt.relname tgt,
      (select array_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid = con.conrelid and a.attnum = any(con.conkey)) cols
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid join pg_namespace ns on ns.oid = src.relnamespace
    join pg_class tgt on tgt.oid = con.confrelid
    where con.contype = 'f' and ns.nspname = 'public'`)).rows;
  const fns = (await db.query(`select p.proname n, coalesce(p.proargnames, '{}') args, p.pronargs nargs, p.pronargdefaults ndef,
      has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth,
      pg_get_function_identity_arguments(p.oid) sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows;
  const colPriv = (await db.query(`select table_name t, column_name c, grantee g from information_schema.column_privileges
    where table_schema = 'public' and privilege_type = 'SELECT' and grantee in ('anon','authenticated')`)).rows;
  const tables = new Map();
  for (const r of relKinds) tables.set(r.n, { kind: r.k, cols: new Set() });
  for (const r of cols) tables.get(r.t)?.cols.add(r.c);
  const priv = new Set(colPriv.map((r) => `${r.g}|${r.t}|${r.c}`));
  return { tables, fks, fns, priv };
}

// ---------------------------------------------------------------------------
// 2. Collect every call from the apps.
// ---------------------------------------------------------------------------
function walkFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !p.includes("login-preview")) out.push(p);
  }
  return out;
}

const files = [...walkFiles(join(ROOT, "admin-app/src")), ...walkFiles(join(ROOT, "customer-app/src"))];
const sources = new Map(files.map((f) => [f, ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true)]));

// Top-level string constants (incl. [..].join(", ")) so selects built from
// shared constants resolve.
const consts = new Map();
function strValue(node, sf) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => "${}" + s.literal.text).join("");
  if (ts.isIdentifier(node)) return consts.get(node.text) ?? null;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = strValue(node.left, sf), b = strValue(node.right, sf);
    return a !== null && b !== null ? a + b : null;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const m = node.expression.name.text;
    if (m === "join" && ts.isArrayLiteralExpression(node.expression.expression)) {
      const parts = node.expression.expression.elements.map((e) => strValue(e, sf));
      if (parts.every((p) => p !== null)) return parts.join(strValue(node.arguments[0], sf) ?? ",");
    }
    if (m === "replace") return strValue(node.expression.expression, sf);
  }
  if (ts.isParenthesizedExpression(node)) return strValue(node.expression, sf);
  return null;
}
for (let pass = 0; pass < 3; pass++)
  for (const [, sf] of sources)
    sf.forEachChild(function visit(n) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const v = strValue(n.initializer, sf);
        if (v !== null) consts.set(n.name.text, v);
      }
      ts.forEachChild(n, visit);
    });

const FILTER_METHODS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy", "order", "not", "match", "filter", "textSearch"]);
const calls = [];
const rpcs = [];

function roleFor(file, fn) {
  if (file.includes("/admin-app/")) {
    if (file.includes("/app/display/") || file.includes("/api/cron/")) return "anon";
    return "authenticated";
  }
  if (file.includes("/app/account/") || file.includes("/app/book/wizard")) return fn ? (["get_available_slots", "validate_promo", "create_public_booking", "join_waitlist"].includes(fn) ? "anon" : "authenticated") : "authenticated";
  return "anon";
}

for (const [file, sf] of sources) {
  const where = (n) => `${relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  sf.forEachChild(function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const m = n.expression.name.text;
      if (m === "from" && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0]) && !n.expression.expression.getText().includes("Array")) {
        const table = n.arguments[0].text;
        const chain = [];
        let cur = n;
        while (cur.parent && ts.isPropertyAccessExpression(cur.parent) && cur.parent.parent && ts.isCallExpression(cur.parent.parent)) {
          const call = cur.parent.parent;
          chain.push({ method: cur.parent.name.text, args: call.arguments.map((a) => strValue(a, sf)), raw: call.arguments.map((a) => a.getText()) });
          cur = call;
        }
        // Chains reassigned later (let q = …; q = q.eq(…)) — collect those too.
        const decl = n.parent && findDecl(n);
        if (decl) collectReassigned(decl, sf, chain);
        calls.push({ file, at: where(n), table, chain, role: roleFor(file) });
      }
      if (m === "rpc" && n.arguments.length >= 1) {
        const name = strValue(n.arguments[0], sf);
        if (name) rpcs.push({ at: where(n), name, args: objKeys(n.arguments[1]), role: roleFor(file, name) });
      }
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "callRpc") {
      const name = strValue(n.arguments[1], sf);
      if (name) rpcs.push({ at: where(n), name, args: objKeys(n.arguments[2]), role: roleFor(file, name) });
      else rpcs.push({ at: where(n), name: null, args: null, role: roleFor(file) });
    }
    ts.forEachChild(n, visit);
  });
}

function objKeys(node) {
  if (!node) return [];
  if (!ts.isObjectLiteralExpression(node)) return null; // dynamic
  if (node.properties.some((p) => !p.name)) return null; // spread: dynamic
  return node.properties.map((p) => p.name.getText().replace(/['"]/g, ""));
}
function findDecl(n) {
  // Walk up through the method chain to a `let x = …` declaration.
  let cur = n;
  while (cur.parent && (ts.isPropertyAccessExpression(cur.parent) || ts.isCallExpression(cur.parent) || ts.isAwaitExpression(cur.parent))) cur = cur.parent;
  if (cur.parent && ts.isVariableDeclaration(cur.parent) && ts.isIdentifier(cur.parent.name)) return cur.parent.name.text;
  return null;
}
function collectReassigned(name, sf, chain) {
  sf.forEachChild(function visit(n) {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && n.left.text === name) {
      let c = n.right;
      const local = [];
      while (ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression)) {
        local.unshift({ method: c.expression.name.text, args: c.arguments.map((a) => strValue(a, sf)), raw: c.arguments.map((a) => a.getText()) });
        c = c.expression.expression;
      }
      chain.push(...local);
    }
    ts.forEachChild(n, visit);
  });
}

// ---------------------------------------------------------------------------
// 3. Check.
// ---------------------------------------------------------------------------
// PostgREST select parser: "a, b:c, rel:tbl!hint(x, y(z)), count" → tree.
function parseSelect(s) {
  let i = 0;
  function list() {
    const out = [];
    while (i < s.length) {
      skip();
      if (s[i] === ")") break;
      out.push(item());
      skip();
      if (s[i] === ",") i++;
    }
    return out;
  }
  function skip() {
    while (i < s.length && /\s/.test(s[i])) i++;
  }
  function word() {
    let w = "";
    while (i < s.length && !/[,():\s]/.test(s[i])) w += s[i++];
    return w;
  }
  function item() {
    let a = word();
    let alias = null;
    skip();
    if (s[i] === ":" && s[i + 1] !== ":") {
      i++;
      alias = a;
      skip();
      a = word();
    }
    skip();
    if (s[i] === "(") {
      i++;
      const kids = list();
      i++;
      const [rel, hint] = a.split("!");
      return { embed: rel, hint: hint ?? null, alias, kids };
    }
    return { col: a.split("::")[0].split("->")[0], alias };
  }
  return list();
}

const problems = [];
const notes = [];
const P = (sev, at, msg) => problems.push({ sev, at, msg });

function relationTo(info, from, to, hint) {
  // Candidate FKs either direction between `from` and `to`.
  const c = info.fks.filter((f) => (f.src === from && f.tgt === to) || (f.src === to && f.tgt === from));
  if (hint) return c.filter((f) => f.name === hint || f.cols.includes(hint));
  return c;
}

function checkSelectTree(info, table, tree, role, at, viaView = false) {
  const t = info.tables.get(table);
  if (!t) return P("error", at, `unknown table/view "${table}"`);
  for (const it of tree) {
    if (it.col !== undefined) {
      if (it.col === "*" || it.col === "count" || it.col === "") continue;
      if (!t.cols.has(it.col)) P("error", at, `${table}.${it.col} does not exist`);
      else if (info.priv.size && !info.priv.has(`${role}|${table}|${it.col}`)) P("error", at, `${role} cannot read ${table}.${it.col}`);
      continue;
    }
    const target = it.embed;
    if (!info.tables.has(target)) {
      P("error", at, `embed target "${target}" from ${table} is not a table`);
      continue;
    }
    if (t.kind === "v" || viaView) notes.push(`${at}: embed ${target} from view ${table} (relationship inferred by PostgREST — checked by hand)`);
    else {
      const rels = relationTo(info, table, target, it.hint);
      if (rels.length === 0) P("error", at, `no relationship ${table} → ${target}${it.hint ? "!" + it.hint : ""}`);
      else if (rels.length > 1) P("error", at, `ambiguous embed ${table} → ${target} (${rels.map((r) => r.name).join(", ")}); add a !hint`);
    }
    checkSelectTree(info, target, it.kids, role, at, t.kind === "v");
  }
}

function filterCols(m, args, raw) {
  if (m === "or") {
    const s = args[0];
    if (!s) return [];
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) parts.push(cur), (cur = "");
      else cur += ch;
    }
    parts.push(cur);
    return parts.map((x) => x.trim().split(".")[0]).filter((c) => c && !c.includes("${}") && !/^(and|or|not)\b/.test(c));
  }
  if (m === "order" || FILTER_METHODS.has(m)) {
    const c = args[0];
    if (c === null) return [];
    return [c];
  }
  return [];
}

export async function runContract() {
  const db = await buildFinalDb();
  const info = await introspect(db);
  for (const c of calls) {
    const t = info.tables.get(c.table);
    if (!t) {
      P("error", c.at, `unknown table "${c.table}"`);
      continue;
    }
    for (const step of c.chain) {
      if (step.method === "select") {
        const s = step.args[0];
        if (s === null) {
          notes.push(`${c.at}: dynamic select ${step.raw[0]} — not checked`);
          continue;
        }
        checkSelectTree(info, c.table, parseSelect(s), c.role, c.at);
      }
      if (["insert", "update", "upsert", "delete"].includes(step.method)) P("warn", c.at, `direct ${step.method} on ${c.table} (blocked after hardening unless RLS allows it)`);
      for (const col of filterCols(step.method, step.args, step.raw)) {
        if (col.includes(".")) continue; // foreign-table filter: skip
        if (!t.cols.has(col)) P("error", c.at, `filter/order column ${c.table}.${col} does not exist (.${step.method})`);
      }
    }
  }
  for (const r of rpcs) {
    if (!r.name) {
      notes.push(`${r.at}: callRpc with dynamic name — not checked`);
      continue;
    }
    const overloads = info.fns.filter((f) => f.n === r.name);
    if (!overloads.length) {
      P("error", r.at, `rpc ${r.name}() does not exist`);
      continue;
    }
    const executable = overloads.some((f) => (r.role === "anon" ? f.anon : f.auth));
    if (!executable) P("error", r.at, `${r.role} cannot execute ${r.name}()`);
    if (r.args === null) {
      notes.push(`${r.at}: ${r.name} called with non-literal args — not checked`);
      continue;
    }
    const match = overloads.find((f) => {
      const names = f.args.slice(0, f.nargs);
      const required = names.slice(0, f.nargs - f.ndef);
      return r.args.every((a) => names.includes(a)) && required.every((a) => r.args.includes(a));
    });
    if (!match) P("error", r.at, `rpc ${r.name}(${r.args.join(", ")}) doesn't match ${overloads.map((o) => o.sig).join(" | ")}`);
  }
  return { problems, notes, counts: { calls: calls.length, rpcs: rpcs.length } };
}

if (process.argv[1] && process.argv[1].endsWith("contract.mjs")) {
  const r = await runContract();
  console.log(`Checked ${r.counts.calls} table queries and ${r.counts.rpcs} RPC calls.`);
  for (const n of r.notes) console.log("note  ", n);
  for (const p of r.problems) console.log(p.sev.padEnd(6), p.at, "—", p.msg);
  const errors = r.problems.filter((p) => p.sev === "error").length;
  console.log(`${errors} error(s), ${r.problems.length - errors} warning(s)`);
  process.exit(errors ? 1 : 0);
}
