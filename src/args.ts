export type Flags = Record<string, string | boolean>

export type ParsedArgs = {
  flags: Flags
  positionals: string[]
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Flags = {}
  const positionals: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg.startsWith('--') && arg.length > 2) {
      const eq = arg.indexOf('=')
      if (eq > 2) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1)
        continue
      }
      const name = arg.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags[name] = next
        i += 1
      } else {
        flags[name] = true
      }
      continue
    }
    positionals.push(arg)
  }

  return { flags, positionals }
}

export function flagString(flags: Flags, name: string): string | undefined {
  const value = flags[name]
  return typeof value === 'string' ? value : undefined
}

export function flagBool(flags: Flags, name: string): boolean {
  return flags[name] === true || flags[name] === 'true'
}
