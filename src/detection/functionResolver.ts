export type ResolvedFunction = {
  key: string; // e.g. "np.random.shuffle"
};


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
  if (!line) { return null; };

  // case 1: np.random.shuffle(...)
  let m = line.match(/(\w+)\.(\w+)\.(\w+)\s*\(/);
  if (m) {
    const alias = m[1];
    const module = aliasMap.get(alias);
    if (!module) { return null; };

    return {
      key: `np.${m[2]}.${m[3]}`
    };
  }

  // case 2: method call → obj.method(...)
  m = line.match(/(\w+)\.(\w+)\s*\(/);
  if (m) {
    const objectName = m[1];
    const methodName = m[2];

    const receiverType = variableTypes.get(objectName);
    if (!receiverType) { return null; };

    return {
      key: `${receiverType}.${methodName}`
    };
  }

  // case 3: shuffle(...)
  m = line.match(/(\w+)\s*\(/);
  if (m) {
    const fn = m[1];
    const full = directMap.get(fn);
    if (!full) { return null; };

    // convert numpy.random.shuffle → np.random.shuffle
    return {
      key: `np.${full.replace(/^numpy\./, "")}`
    };
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
    m = line.match(/^from\s+([\w\.]+)\s+import\s+(\w+)\s*$/);
    if (m) {
      directMap.set(m[2], `${m[1]}.${m[2]}`);
    }

    // ❌ intentionally ignore: "as ad"
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
  }

  return types;
}
