import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// In-memory session store. Good enough for a small internal tool without a
// database - sessions are lost on a server restart (rare, and just means a
// re-login), never persisted or shared across processes.
const sessions = new Map();

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  return getAdminEmails().includes((email || '').toLowerCase());
}

export function createSession(payload) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { ...payload, createdAt: Date.now() });
  return token;
}

export function getSession(token) {
  return sessions.get(token) || null;
}

export function destroySession(token) {
  sessions.delete(token);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'יש להתחבר מחדש' });
  }
  req.session = session;
  next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.session.role !== 'admin') {
      return res.status(403).json({ error: 'פעולה זו זמינה למנהלי מערכת בלבד' });
    }
    next();
  });
}
