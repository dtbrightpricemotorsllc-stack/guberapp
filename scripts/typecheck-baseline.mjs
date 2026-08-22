const DIAGNOSTIC_HEADER =
  /^(.+?)\((\d+),(\d+)\): error (TS\d+):(?: (.*))?$/;
const SUMMARY_LINE = /^Found \d+ errors?\.$/;

function normalizeMessage(message) {
  return message.replace(/\s+/g, " ").trim();
}

export function parseDiagnostics(output) {
  const lines = output.split(/\r?\n/);
  const diagnostics = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(DIAGNOSTIC_HEADER);
    if (!match) continue;

    const messageLines = [match[5] ?? ""];
    for (let next = index + 1; next < lines.length; next += 1) {
      if (DIAGNOSTIC_HEADER.test(lines[next]) || SUMMARY_LINE.test(lines[next])) break;
      if (lines[next].trim()) messageLines.push(lines[next]);
      index = next;
    }

    diagnostics.push({
      path: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: normalizeMessage(messageLines.join(" ")),
    });
  }

  return diagnostics;
}

export function diagnosticFingerprint(diagnostic) {
  return JSON.stringify([
    diagnostic.path,
    diagnostic.line,
    diagnostic.column,
    diagnostic.code,
    diagnostic.message,
  ]);
}

export function compareDiagnostics(actual, baseline) {
  const countFingerprints = (diagnostics) => {
    const counts = new Map();
    for (const diagnostic of diagnostics) {
      const fingerprint = diagnosticFingerprint(diagnostic);
      counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }
    return counts;
  };

  const remainingBaseline = countFingerprints(baseline);
  const unexpected = [];
  for (const diagnostic of actual) {
    const fingerprint = diagnosticFingerprint(diagnostic);
    const remaining = remainingBaseline.get(fingerprint) ?? 0;
    if (remaining === 0) unexpected.push(diagnostic);
    else remainingBaseline.set(fingerprint, remaining - 1);
  }

  return {
    unexpected,
    resolved: baseline.filter((diagnostic) => {
      const fingerprint = diagnosticFingerprint(diagnostic);
      const remaining = remainingBaseline.get(fingerprint) ?? 0;
      if (remaining === 0) return false;
      remainingBaseline.set(fingerprint, remaining - 1);
      return true;
    }),
  };
}