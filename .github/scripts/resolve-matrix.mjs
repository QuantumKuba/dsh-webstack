#!/usr/bin/env node
// Resolves which @deepseek-ai/dsh-web versions CI / the canary should test.
//
//   --scope=range  versions inside the peerDependencies range we claim to support
//   --scope=all    the above plus versions the range does NOT cover yet, as an
//                  early warning: the dist-tags `next` / `alpha`, and the newest
//                  published version of every minor series (0.1.x, 0.2.x, ...)
//
// Legs are never merged: each label keeps its own failure/notification stream.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const PKG = "@deepseek-ai/dsh-web";
const scope = (process.argv.find((a) => a.startsWith("--scope=")) ?? "--scope=range").slice(8);
if (!["range", "all"].includes(scope)) throw new Error(`unknown scope: ${scope}`);

const npmView = (spec, field) =>
  JSON.parse(execFileSync("npm", ["view", spec, field, "--json"], { encoding: "utf8" }));

const range = JSON.parse(readFileSync("package.json", "utf8")).peerDependencies?.[PKG];
if (!range) throw new Error(`package.json has no peerDependencies["${PKG}"]`);

const matches = [].concat(npmView(`${PKG}@${range}`, "version"));
if (matches.length === 0) throw new Error(`no published version satisfies "${range}"`);

// Minimal semver ordering (x.y.z[-pre.N]); enough to pick the newest per series.
const cmpPre = (a, b) => {
  if (!a && !b) return 0;
  if (!a) return 1; // a release outranks its prereleases
  if (!b) return -1;
  const [x, y] = [a.split("."), b.split(".")];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const [nx, ny] = [Number(x[i]), Number(y[i])];
    const bothNum = !Number.isNaN(nx) && !Number.isNaN(ny);
    const d = bothNum ? nx - ny : x[i] < y[i] ? -1 : x[i] > y[i] ? 1 : 0;
    if (d !== 0) return d;
  }
  return 0;
};
const parse = (v) => {
  const [core, pre] = v.split(/-(.+)/);
  return { core: core.split(".").map(Number), pre };
};
const cmp = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  return cmpPre(x.pre, y.pre);
};

const include = [
  { label: "range-min", version: matches[0], beyondRange: false },
  { label: "range-max", version: matches.at(-1), beyondRange: false },
];

if (scope === "all") {
  const tags = npmView(PKG, "dist-tags");
  for (const tag of ["next", "alpha"]) {
    if (tags[tag]) include.push({ label: tag, version: tags[tag], beyondRange: !matches.includes(tags[tag]) });
  }

  const newestBySeries = new Map();
  for (const v of npmView(PKG, "versions").sort(cmp)) {
    if (cmp(v, matches[0]) < 0) continue; // older than anything we claim to support
    newestBySeries.set(v.split(".").slice(0, 2).join("."), v);
  }
  const covered = new Set(include.map((leg) => leg.version));
  for (const [series, version] of newestBySeries) {
    if (!covered.has(version)) {
      include.push({ label: `series-${series}`, version, beyondRange: !matches.includes(version) });
    }
  }
}

const matrix = JSON.stringify({ include });
console.log(`peer range: ${range}\nmatrix: ${matrix}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\n`);
