import type { EngineInterface, Register } from 'claude-code'

// Claude Code names a project's folder after its start directory with every non-alphanumeric character as '-'.
const transcriptDir = (home: string, cwd: string) => `${home}/.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}`

const usd = (n: number) => `$${n.toFixed(2)}`

const idle = (cost: number) => `slop — · ${usd(cost)} spent, no code written yet`

// Draws the session's status line entry; false when the transcript could not be read.
async function refresh($: EngineInterface, startCwd: string | undefined) {
  const home = await $.env.get('HOME')
  const cwd = startCwd ?? (await $.session.cwd())
  const path = `${transcriptDir(home ?? '', cwd)}/${await $.session.id()}.jsonl`
  const { exitCode, stdout } = await $.process.run(['node', `${$.plugin.root}/bin/slop-report`, path, '--json'], { timeoutMs: 10_000 })
  if (exitCode !== 0) return false
  const { summary: s, smells } = JSON.parse(stdout)
  const left = smells.reduce((total: number, smell: { count: number }) => total + smell.count, 0)
  $.ui.status(
    s.linesWritten
      ? `slop ${(s.slopLineRatio * 100).toFixed(1)}% · ${s.linesUnprompted} lines thrown away, ${usd(s.wastedCost)} of ${usd(s.totalCost)} · ${left} ${left === 1 ? 'smell' : 'smells'} left`
      : idle(s.totalCost),
  )
  return true
}

export const register: Register = on => {
  let startCwd: string | undefined

  on('session.start', async ($, e, next) => {
    startCwd = e.cwd
    const done = await next(e)
    try {
      // A new session has no transcript yet; a resumed one is measured straight away.
      if (!(await refresh($, startCwd))) $.ui.status(idle(0))
    } catch (err) {
      $.ui.log(`${$.plugin.name}: ${String(err)}`, { to: 'debug' })
    }
    return done
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    try {
      await refresh($, startCwd)
    } catch (err) {
      $.ui.log(`${$.plugin.name}: ${String(err)}`, { to: 'debug' })
    }
    return done
  })
}
