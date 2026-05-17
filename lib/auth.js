/**
 * GoalForge — Auth Utilities
 * JWT-based authentication with role-based access control
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const DEV_JWT_SECRET = 'goalforge-dev-secret';
function getJwtSecret() {
  return process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : DEV_JWT_SECRET);
}
const TOKEN_EXPIRY = '24h';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(user) {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET must be set in production');
  }

  return jwt.sign(
    {
      id: user.id,
      employee_id: user.employee_id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      manager_id: user.manager_id,
    },
    secret,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    const secret = getJwtSecret();
    if (!secret) {
      return null;
    }
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
}

/**
 * Middleware-like function to extract user from request headers.
 * Use in API routes: const user = getUserFromRequest(req);
 */
function getUserFromRequest(req) {
  const authHeader = req.headers.get?.('authorization') || req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  return verifyToken(token);
}

/**
 * Role-based access guard
 */
function requireRole(user, ...roles) {
  if (!user) {
    return { error: 'Authentication required', status: 401 };
  }
  if (!roles.includes(user.role)) {
    return { error: `Access denied. Required role: ${roles.join(' or ')}`, status: 403 };
  }
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  getUserFromRequest,
  requireRole,
  JWT_SECRET: getJwtSecret(),
};
