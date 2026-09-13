import { flagBool, flagString, parseArgs } from './args.js'
import { cmdPull, cmdPush, cmdRemoteSet, cmdRemoteShow } from './commands/github.js'
import { cmdExport, cmdImport } from './commands/io.js'
import { cmdLogs, cmdSearch, cmdTags } from './commands/query.js'
import {
  cmdAdd,
  cmdRollArchive,
  cmdRollNew,
  cmdRollRename,
  cmdRolls,
  cmdShow,
} from './commands/rolls.js'
import { cmdInit, cmdStatus } from './commands/workspace.js'
import { CliError } from './errors.js'

const USAGE = `flolinr — local-first outliner CLI (.flolinr + GitHub vault)

Usage:
  flolinr [--dir <path>] <command> [args]

Workspace
  init [--git] [--remote owner/repo]   Create .flolinr/
  status                               Show workspace + remote

Rolls
  rolls                                List rolls
  roll new <name>
  roll rename <name|id> <new>
  roll archive <name|id>
  show <roll> [--ids]
  add <roll> <text> [--parent <id>]

Query
  search <query>
  tags [name]
  logs [YYYY-MM-DD]

Import / export
  import <file.csv|file.md>
  export <roll> [--format csv|md] [--out file]

GitHub
  remote set <owner/repo> [--path .flolinr] [--branch]
  remote show
  push
  pull

Token lookup: FLOLINR_GITHUB_TOKEN, GH_TOKEN, \`gh auth token\`,
then ~/.config/flolinr/config.json
`

async function main(argv: string[]): Promise<void> {
  const { flags, positionals } = parseArgs(argv)
  if (flagBool(flags, 'help') || positionals[0] === 'help' || positionals[0] === '-h') {
    process.stdout.write(USAGE)
    return
  }
  if (flagBool(flags, 'version') || positionals[0] === 'version') {
    process.stdout.write('flolinr 0.1.0\n')
    return
  }

  const dir = flagString(flags, 'dir')
  const [cmd, ...rest] = positionals
  if (!cmd) {
    process.stdout.write(USAGE)
    return
  }

  switch (cmd) {
    case 'init':
      process.stdout.write(
        `${cmdInit({
          dir,
          git: flagBool(flags, 'git'),
          remote: flagString(flags, 'remote'),
        })}\n`,
      )
      return
    case 'status':
      process.stdout.write(cmdStatus(dir))
      return
    case 'rolls':
    case 'ls':
      process.stdout.write(cmdRolls(dir))
      return
    case 'roll': {
      const sub = rest[0]
      if (sub === 'new') {
        if (!rest[1]) throw new CliError('Usage: flolinr roll new <name>')
        process.stdout.write(cmdRollNew(rest.slice(1).join(' '), dir))
        return
      }
      if (sub === 'rename') {
        if (!rest[1] || !rest[2]) {
          throw new CliError('Usage: flolinr roll rename <name|id> <new>')
        }
        process.stdout.write(cmdRollRename(rest[1], rest.slice(2).join(' '), dir))
        return
      }
      if (sub === 'archive') {
        if (!rest[1]) throw new CliError('Usage: flolinr roll archive <name|id>')
        process.stdout.write(cmdRollArchive(rest[1], dir))
        return
      }
      if (sub === 'list' || !sub) {
        process.stdout.write(cmdRolls(dir))
        return
      }
      throw new CliError(`Unknown roll subcommand: ${sub}`)
    }
    case 'show':
      if (!rest[0]) throw new CliError('Usage: flolinr show <roll>')
      process.stdout.write(cmdShow(rest[0], { dir, ids: flagBool(flags, 'ids') }))
      return
    case 'add':
      if (!rest[0] || rest.length < 2) {
        throw new CliError('Usage: flolinr add <roll> <text> [--parent id]')
      }
      process.stdout.write(
        cmdAdd(rest[0], rest.slice(1).join(' '), {
          dir,
          parent: flagString(flags, 'parent'),
        }),
      )
      return
    case 'search':
      process.stdout.write(cmdSearch(rest.join(' '), dir))
      return
    case 'tags':
      process.stdout.write(cmdTags(rest[0], dir))
      return
    case 'logs':
      process.stdout.write(cmdLogs(rest[0], dir))
      return
    case 'import':
      if (!rest[0]) throw new CliError('Usage: flolinr import <file>')
      process.stdout.write(cmdImport(rest[0], dir))
      return
    case 'export':
      if (!rest[0]) throw new CliError('Usage: flolinr export <roll>')
      process.stdout.write(
        cmdExport(rest[0], {
          dir,
          format: flagString(flags, 'format'),
          out: flagString(flags, 'out'),
        }),
      )
      return
    case 'remote': {
      const sub = rest[0]
      if (sub === 'show' || !sub) {
        process.stdout.write(cmdRemoteShow(dir))
        return
      }
      if (sub === 'set') {
        if (!rest[1]) throw new CliError('Usage: flolinr remote set owner/repo')
        process.stdout.write(
          cmdRemoteSet(rest[1], {
            dir,
            path: flagString(flags, 'path'),
            branch: flagString(flags, 'branch'),
          }),
        )
        return
      }
      throw new CliError(`Unknown remote subcommand: ${sub}`)
    }
    case 'push':
      process.stdout.write(await cmdPush(dir))
      return
    case 'pull':
      process.stdout.write(await cmdPull(dir))
      return
    default:
      throw new CliError(`Unknown command: ${cmd}\n\n${USAGE}`)
  }
}

const argv = process.argv.slice(2)
main(argv).catch((err: unknown) => {
  if (err instanceof CliError) {
    process.stderr.write(`${err.message}\n`)
    process.exit(err.exitCode)
  }
  const message = err instanceof Error ? err.stack ?? err.message : String(err)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
