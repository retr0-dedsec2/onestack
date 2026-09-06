export type CliCommand = "dev" | "build" | "preview" | "run" | "release" | "deploy" | "db" | "auth" | "check" | "add" | "import" | "help";

export interface ParsedCli {
  command: CliCommand;
  args: string[];
  flags: Record<string, string | boolean>;
}

export function parseCli(argv: string[]): ParsedCli {
  const input = [...argv];
  const rawCommand = input.shift() ?? "help";
  const commands = new Set<CliCommand>(["dev", "build", "preview", "run", "release", "deploy", "db", "auth", "check", "add", "import", "help"]);
  const command: CliCommand = commands.has(rawCommand as CliCommand) ? rawCommand as CliCommand : "help";
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < input.length; index += 1) {
    const token = input[index];
    if (!token.startsWith("--")) { args.push(token); continue; }
    const [name, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) flags[name] = inline;
    else if (input[index + 1] && !input[index + 1].startsWith("--")) flags[name] = input[++index];
    else flags[name] = true;
  }
  return { command, args, flags };
}

export function helpText() {
  return [
    "OneStack CLI",
    "",
    "  onestack dev [--target web|desktop|android|ios]",
    "  onestack build [--target web|desktop|android|ios]",
    "  onestack run --target android|ios",
    "  onestack preview [--target web|desktop]",
    "  onestack release --target desktop|android|ios",
    "  onestack deploy [--provider vercel|netlify|cloudflare|node|docker|static]",
    "  onestack db generate",
    "  onestack db migrate",
    "  onestack auth setup",
    "  onestack check",
    "  onestack add <component>",
    "  onestack import <file>",
  ].join("\n");
}
