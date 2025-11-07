import readline from 'readline';

/**
 * CLI utilities for interactive scripts
 */

export function createQuestionInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export async function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

export async function askConfirmation(rl: readline.Interface, question: string): Promise<boolean> {
  const answer = await askQuestion(rl, question);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

