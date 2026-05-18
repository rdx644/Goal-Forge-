/**
 * GoalForge — Auth Utilities
 * JWT-based authentication with role-based access control
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'goalforge-hackathon-secret-key-2026';
const TOKEN_EXPIRY = '24h';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(user) {
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
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
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
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return verifyToken(token);
  }

  // Allows browser-triggered CSV downloads from window.open().
  if (req.url) {
    try {
      const token = new URL(req.url).searchParams.get('token');
      if (token) return verifyToken(token);
    } catch {
      return null;
    }
  }

  return null;
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
  JWT_SECRET,
};
