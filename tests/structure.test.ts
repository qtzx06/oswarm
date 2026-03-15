import { test, expect } from "bun:test";
import { Glob } from "bun";

// Layer order: types < config < providers < protocol < engine < adapters
const LAYER_ORDER = [
  "types",
  "config",
  "providers",
  "observer",  // protocol-equivalent
  "engine",
  "adapters",
] as const;

function layerIndex(layer: string): number {
  return LAYER_ORDER.indexOf(layer as (typeof LAYER_ORDER)[number]);
}

function extractImports(source: string): string[] {
  const re = /from\s+["']\.\.\/(\w+)/g;
  const imports: string[] = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    imports.push(match[1]!);
  }
  return imports;
}

test("layers only import from lower layers (left-to-right)", async () => {
  const violations: string[] = [];

  for (const layer of LAYER_ORDER) {
    const glob = new Glob(`src/${layer}/**/*.ts`);
    const myIndex = layerIndex(layer);

    for await (const filePath of glob.scan(".")) {
      const source = await Bun.file(filePath).text();
      const imports = extractImports(source);

      for (const imp of imports) {
        const impIndex = layerIndex(imp);
        if (impIndex >= 0 && impIndex >= myIndex) {
          violations.push(
            `${filePath} imports from "${imp}" (layer ${impIndex}) but is in "${layer}" (layer ${myIndex})`
          );
        }
      }
    }
  }

  expect(violations).toEqual([]);
});
