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
 * Ask a question and return the user's answer (internal use only)
 */
async function askQuestion(rl: readline.Interface, question: string): Promise<string> {
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

