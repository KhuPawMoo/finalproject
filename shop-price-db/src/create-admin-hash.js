const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const { hashPassword } = require('./auth');

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function ask(question) {
  const rl = createReadline();
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function askHidden(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    return ask(question);
  }

  return new Promise((resolve) => {
    let answer = '';

    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function finish() {
      process.stdin.setRawMode(false);
      process.stdin.off('data', onData);
      process.stdout.write('\n');
      resolve(answer);
    }

    function onData(buffer) {
      const input = buffer.toString('utf8');

      if (input === '\u0003') {
        process.stdout.write('\n');
        process.exit(130);
      }

      if (input === '\r' || input === '\n') {
        finish();
        return;
      }

      if (input === '\u007f') {
        answer = answer.slice(0, -1);
        return;
      }

      answer += input;
    }

    process.stdin.on('data', onData);
  });
}

function envValue(value) {
  return /^[A-Za-z0-9_.@$:/+-]+$/.test(value) ? value : JSON.stringify(value);
}

async function readPipedAnswers() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const [username = '', password = '', confirmation = ''] = Buffer
    .concat(chunks)
    .toString('utf8')
    .split(/\r?\n/);

  return {
    username: username.trim() || 'admin',
    password,
    confirmation
  };
}

async function readInteractiveAnswers() {
  return {
    username: (await ask('Admin username [admin]: ')).trim() || 'admin',
    password: await askHidden('Admin password: '),
    confirmation: await askHidden('Confirm password: ')
  };
}

async function main() {
  const { username, password, confirmation } = process.stdin.isTTY
    ? await readInteractiveAnswers()
    : await readPipedAnswers();

  if (!password) {
    console.error('Password cannot be empty.');
    process.exit(1);
  }

  if (password !== confirmation) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  console.log('\nAdd these lines to .env:');
  console.log(`ADMIN_USERNAME=${envValue(username)}`);
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
  console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
  console.log('\nRemove ADMIN_PASSWORD from .env when ADMIN_PASSWORD_HASH is set.');
}

main();
