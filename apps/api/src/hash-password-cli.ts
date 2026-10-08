import { emitKeypressEvents } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { hashPassword } from './auth.js';

function hiddenPrompt(label: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run this command in an interactive terminal.');
  stdout.write(label);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (input: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = Array.from(value).slice(0, -1).join('');
        stdout.write('\b \b');
        return;
      }
      if (input && !key.ctrl && input >= ' ') {
        value += input;
        stdout.write('•'.repeat(Array.from(input).length));
      }
    };
    stdin.on('keypress', onKeypress);
  });
}

try {
  const password = await hiddenPrompt('New storyboard password: ');
  const confirmation = await hiddenPrompt('Repeat password: ');
  if (password !== confirmation) throw new Error('Passwords did not match.');
  stdout.write(`AUTH_PASSWORD_HASH='${await hashPassword(password)}'\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Could not create password hash.'}\n`);
  process.exitCode = 1;
}
