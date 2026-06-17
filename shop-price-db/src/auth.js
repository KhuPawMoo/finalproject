const crypto = require('node:crypto');

const COOKIE_NAME = 'shop_price_admin';
const SESSION_LENGTH_MS = 1000 * 60 * 60 * 10;

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex === -1) {
      return cookies;
    }

    const key = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }

    return cookies;
  }, {});
}

function createToken(username, secret) {
  const payload = base64Url(JSON.stringify({
    sub: username,
    exp: Date.now() + SESSION_LENGTH_MS
  }));
  const signature = signPayload(payload, secret);

  return `${payload}.${signature}`;
}

function verifyToken(token, secret) {
  const [payload, signature] = String(token || '').split('.');

  if (!payload || !signature || !timingSafeEqual(signature, signPayload(payload, secret))) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    if (!session.sub || !session.exp || session.exp < Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly; Path=/; Max-Age=${SESSION_LENGTH_MS / 1000}; SameSite=Lax${secure}`;
}

function clearCookieOptions() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

function createAuth() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'change-this-password';
  const secret = process.env.SESSION_SECRET || 'development-secret-change-me';

  function authenticate(inputUsername, inputPassword) {
    return timingSafeEqual(inputUsername, username) && timingSafeEqual(inputPassword, password);
  }

  function currentSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    return verifyToken(cookies[COOKIE_NAME], secret);
  }

  function requireAdmin(req, res, next) {
    const session = currentSession(req);

    if (!session) {
      return res.status(401).json({ error: 'Admin login required.' });
    }

    req.admin = session;
    return next();
  }

  function login(req, res) {
    const { username: inputUsername = '', password: inputPassword = '' } = req.body || {};

    if (!authenticate(inputUsername, inputPassword)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = createToken(username, secret);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieOptions()}`);
    return res.json({ authenticated: true, username });
  }

  function logout(_req, res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${clearCookieOptions()}`);
    return res.json({ authenticated: false });
  }

  function session(req, res) {
    const activeSession = currentSession(req);
    return res.json({
      authenticated: Boolean(activeSession),
      username: activeSession?.sub || null
    });
  }

  return {
    login,
    logout,
    requireAdmin,
    session
  };
}

module.exports = { createAuth };
