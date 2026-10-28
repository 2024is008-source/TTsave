import { emitKeypressEvents } from 'node:readline';
import { hashAdminPassword } from './services/admin-auth.js';

async function hidden(prompt: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Run this command in a private interactive terminal. Password arguments and environment input are not accepted.',
    );
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.off('keypress', keypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const keypress = (
      text: string | undefined,
      key: { name?: string; ctrl?: boolean },
    ) => {
      if (key.ctrl && key.name === 'c') {
        finish();
        reject(new Error('Cancelled.'));
      } else if (key.name === 'return') {
        finish();
        resolve(value);
      } else if (key.name === 'backspace')
        value = Array.from(
          new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
          (part) => part.segment,
        )
          .slice(0, -1)
          .join('');
      else if (text && !/\p{Cc}/u.test(text) && value.length + text.length <= 256)
        value += text;
    };
    process.stdin.on('keypress', keypress);
  });
}

try {
  if (process.argv.length > 2) throw new Error('Password arguments are not accepted.');
  const password = await hidden('New admin password (12–256 characters, hidden): ');
  if (password !== (await hidden('Confirm password (hidden): ')))
    throw new Error('Passwords do not match.');
  process.stdout.write(
    `Store this hash privately as ADMIN_PASSWORD_HASH (single-quote its value):\n${await hashAdminPassword(password)}\n`,
  );
} catch {
  process.stderr.write(
    'Password hash not created. Use a private terminal, matching passwords and 12–256 characters.\n',
  );
  process.exitCode = 1;
}
