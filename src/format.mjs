const usd = (n) => `$${n.toFixed(2)}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();
  return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

export function formatReport(report, { top = 10 } = {}) {
  const s = report.summary;
  const out = [];
  out.push(`Slop level: ${pct(s.slopLineRatio)} of written lines, ${usd(s.wastedCost)} of ${usd(s.totalCost)} (${pct(s.slopCostRatio)})`);
  out.push('');
  out.push(
    table(
      ['Metric', 'Value'],
      [
        ['Prompts / API messages', `${s.turns} / ${s.messages}`],
        ['Total cost', usd(s.totalCost)],
        ['Cost of messages that wrote code', usd(s.codeCost)],
        ['Lines written (Edit/MultiEdit/Write)', s.linesWritten],
        ['Lines surviving', s.linesSurviving],
        ['Rewritten after a failure (rework)', `${s.linesRework}  ${usd(s.reworkCost)}`],
        ['Rewritten with no failure (slop)', `${s.linesUnprompted}  ${usd(s.wastedCost)}`],
      ],
    ),
  );
  if (s.unpricedModels.length) out.push(`\nNo rates in pricing.json for: ${s.unpricedModels.join(', ')} (counted as $0)`);

  const worst = [...report.turns].sort((a, b) => b.wastedCost - a.wastedCost || b.cost - a.cost).slice(0, top);
  if (worst.length) {
    out.push('\nCostliest turns by wasted spend');
    out.push(
      table(
        ['#', 'Cost', 'Written', 'Rework', 'Slop', 'Wasted', 'Prompt'],
        worst.map((t) => [t.turn, usd(t.cost), t.written, t.rework, t.unprompted, usd(t.wastedCost), t.prompt.slice(0, 50)]),
      ),
    );
  }

  const churned = report.files.filter((f) => f.churned > 0).slice(0, top);
  if (churned.length) {
    out.push('\nFiles with the most churn');
    out.push(table(['File', 'Written', 'Surviving', 'Churned'], churned.map((f) => [f.file, f.written, f.surviving, f.churned])));
  }

  if (report.smells.length) {
    out.push('\nSmells in surviving lines');
    for (const smell of report.smells) {
      out.push(`  ${smell.label}: ${smell.count}`);
      for (const example of smell.examples) out.push(`    ${example}`);
    }
  }
  return out.join('\n');
}
