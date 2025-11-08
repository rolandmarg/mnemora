import readline from 'readline';

/**
 * CLI utilities for interactive scripts and argument parsing
 */

/**
 * Create a readline interface for user input
 */
export function createQuestionInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask a question and return the user's answer
 */
export async function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Ask for confirmation (y/yes returns true)
 */
export async function askConfirmation(rl: readline.Interface, question: string): Promise<boolean> {
  const answer = await askQuestion(rl, question);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Parsed command line arguments
 */
export interface ParsedArgs {
  flags: Set<string>;
  values: Map<string, string>;
  positional: string[];
}

/**
 * Parse command line arguments into structured format
 */
export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    flags: new Set<string>(),
    values: new Map<string, string>(),
    positional: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Check for flags (--flag or -f)
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      result.flags.add(flagName);
    } else if (arg.startsWith('-') && arg.length === 2) {
      const flagName = arg.slice(1);
      result.flags.add(flagName);
    } else if (i > 0 && args[i - 1].startsWith('--')) {
      // Value for a --key argument
      const key = args[i - 1].slice(2);
      result.values.set(key, arg);
    } else {
      // Positional argument
      result.positional.push(arg);
    }
  }

  return result;
}

/**
 * Check if a flag is present
 */
export function hasFlag(parsed: ParsedArgs, ...flagNames: string[]): boolean {
  return flagNames.some(name => parsed.flags.has(name));
}

/**
 * Get a value for a key
 */
export function getValue(parsed: ParsedArgs, key: string): string | undefined {
  return parsed.values.get(key);
}

/**
 * Get positional arguments
 */
export function getPositional(parsed: ParsedArgs): string[] {
  return parsed.positional;
}

/**
 * Filter out flags from arguments
 */
export function filterFlags(args: string[], ...flagsToRemove: string[]): string[] {
  const flagsSet = new Set(flagsToRemove);
  return args.filter((arg, index) => {
    // Remove --flag or -f format
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      return !flagsSet.has(flagName);
    }
    if (arg.startsWith('-') && arg.length === 2) {
      const flagName = arg.slice(1);
      return !flagsSet.has(flagName);
    }
    // Remove value if previous arg was a flag to remove
    if (index > 0 && args[index - 1].startsWith('--')) {
      const prevFlagName = args[index - 1].slice(2);
      return !flagsSet.has(prevFlagName);
    }
    return true;
  });
}

