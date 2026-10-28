import type { EngineInterface, Register } from 'claude-code'

const usd = (n: number) => `$${n.toFixed(2)}`

const idle = (cost: number) => `slop — · ${usd(cost)} spent, no code written yet`

const unavailable = 'slop — · report unavailable, see the debug log'

// Draws the session's status line entry; false when the transcript could not be read.
async function refresh($: EngineInterface, startCwd: string | undefined) {
  const cwd = startCwd ?? (await $.session.cwd())
  const args = ['--session', await $.session.id(), '--project', cwd, '--json']
  const { exitCode, stdout } = await $.process.run(['node', `${$.plugin.root}/bin/slop-report`, ...args], { timeoutMs: 10_000 })
  if (exitCode !== 0) {
    $.ui.log(`${$.plugin.name}: slop-report exited with ${exitCode}`, { to: 'debug' })
    return false
  }
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
  // Each refresh re-reads the whole session, so a turn that ends while one is still running skips its own.
  let running = false

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
    if (e.agentId || running) return done
    running = true
    try {
      // The transcript exists by now, so a failure (including a timeout on a long session) is shown, not hidden.
      if (!(await refresh($, startCwd))) $.ui.status(unavailable)
    } catch (err) {
      $.ui.log(`${$.plugin.name}: ${String(err)}`, { to: 'debug' })
      $.ui.status(unavailable)
    } finally {
      running = false
    }
    return done
  })
}
