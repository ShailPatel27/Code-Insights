export type ResolvedFunction = {
  key: string; // e.g. "np.random.shuffle"
};

const builtInFunctions = new Set(["len", "sorted"]);

// IMPORTANT: Order matters.
// More specific patterns MUST come before generic ones.
export function resolveFunction(
  documentText: string,
  lineNumber: number
): ResolvedFunction | null {
  const lines = documentText.split("\n");
  const variableTypes = inferVariableTypes(lines);
  const { aliasMap, directMap } = parseImports(lines);

  const line = lines[lineNumber];
  if (!line) { return null; }

  // case 1: np.random.shuffle(...)
  let m = line.match(/(\w+)\.(\w+)\.(\w+)\s*\(/);
  if (m) {
    const alias = m[1];
    const module = aliasMap.get(alias);
    if (module !== "numpy") { return null; }

    return {
      key: `np.${m[2]}.${m[3]}`
    };
  }

  // case 2: np.sort(...) or np.copy(...)
  m = line.match(/(\w+)\.(\w+)\s*\(/);
  if (m) {
    const alias = m[1];
    const module = aliasMap.get(alias);
    if (module === "numpy") {
      return {
        key: `np.${m[2]}`
      };
    }
  }

  // case 3: method call -> obj.method(...)
  m = line.match(/(\w+)\.(\w+)\s*\(/);
  if (m) {
    const objectName = m[1];
    const methodName = m[2];

    const receiverType = variableTypes.get(objectName);
    if (!receiverType) { return null; }

    return {
      key: `${receiverType}.${methodName}`
    };
  }

  // case 4: shuffle(...) from direct imports, or supported built-ins
  m = line.match(/(\w+)\s*\(/);
  if (m) {
    const fn = m[1];
    const full = directMap.get(fn);
    if (full) {
      return {
        key: `np.${full.replace(/^numpy\./, "")}`
      };
    }

    if (builtInFunctions.has(fn)) {
      return {
        key: `python.${fn}`
      };
    }
  }

  return null;
}

function parseImports(lines: string[]) {
  const aliasMap = new Map<string, string>();
  const directMap = new Map<string, string>();

  for (const line of lines) {
    let m;

    // import numpy as np
    m = line.match(/^import\s+(\w+)\s+as\s+(\w+)/);
    if (m) {
      aliasMap.set(m[2], m[1]);
      continue;
    }

    // import numpy
    m = line.match(/^import\s+(\w+)/);
    if (m) {
      aliasMap.set(m[1], m[1]);
      continue;
    }

    // from numpy.random import shuffle
    m = line.match(/^from\s+([\w.]+)\s+import\s+(\w+)\s*$/);
    if (m && m[1].startsWith("numpy")) {
      directMap.set(m[2], `${m[1]}.${m[2]}`);
    }
  }

  return { aliasMap, directMap };
}

function inferVariableTypes(lines: string[]) {
  const types = new Map<string, string>();

  for (const line of lines) {
    let m;

    // arr = np.array(...)
    m = line.match(/(\w+)\s*=\s*\w+\.array\s*\(/);
    if (m) {
      types.set(m[1], "ndarray");
      continue;
    }

    // arr = np.arange(...)
    m = line.match(/(\w+)\s*=\s*\w+\.arange\s*\(/);
    if (m) {
      types.set(m[1], "ndarray");
      continue;
    }

    // items = [3, 1, 2]
    m = line.match(/(\w+)\s*=\s*\[/);
    if (m) {
      types.set(m[1], "list");
      continue;
    }

    // items = list(...)
    m = line.match(/(\w+)\s*=\s*list\s*\(/);
    if (m) {
      types.set(m[1], "list");
      continue;
    }
  }

  return types;
}
