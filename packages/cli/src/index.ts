export type CliCommand = "dev" | "build" | "preview" | "check" | "add" | "import" | "help";

export interface ParsedCli {
  command: CliCommand;
  args: string[];
  flags: Record<string, string | boolean>;
}

export function parseCli(argv: string[]): ParsedCli {
  const input = [...argv];
  const rawCommand = input.shift() ?? "help";
  const commands = new Set<CliCommand>(["dev", "build", "preview", "check", "add", "import", "help"]);
  const command: CliCommand = commands.has(rawCommand as CliCommand) ? rawCommand as CliCommand : "help";
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < input.length; index += 1) {
    const token = input[index];
    if (!token.startsWith("--")) {
      args.push(token);
      continue;
    }
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
    "  onestack dev",
    "  onestack build [--target web]",
    "  onestack preview",
    "  onestack check",
    "  onestack add <component>",
    "  onestack import <file>",
  ].join("\n");
}
