import type { Register } from 'claude-code'

// Claude Code names a project's folder after its start directory with every non-alphanumeric character as '-'.
const transcriptDir = (home: string, cwd: string) => `${home}/.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}`

const usd = (n: number) => `$${n.toFixed(2)}`

export const register: Register = on => {
  let startCwd: string | undefined

  on('session.start', async ($, e, next) => {
    startCwd = e.cwd
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    try {
      const home = await $.env.get('HOME')
      const cwd = startCwd ?? (await $.session.cwd())
      const path = `${transcriptDir(home ?? '', cwd)}/${await $.session.id()}.jsonl`
      const { exitCode, stdout } = await $.process.run(['node', `${$.plugin.root}/bin/slop-report`, path, '--json'], { timeoutMs: 10_000 })
      if (exitCode !== 0) return done
      const { summary: s } = JSON.parse(stdout)
      $.ui.status(
        s.linesWritten
          ? `slop ${(s.slopLineRatio * 100).toFixed(1)}% · ${usd(s.wastedCost)} wasted of ${usd(s.totalCost)}`
          : undefined,
      )
    } catch (err) {
      $.ui.log(`${$.plugin.name}: ${String(err)}`, { to: 'debug' })
    }
    return done
  })
}
