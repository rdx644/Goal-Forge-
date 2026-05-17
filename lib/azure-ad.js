/**
 * GoalForge — Microsoft Entra ID (Azure AD) Integration
 * Section 5.1: SSO, Org Hierarchy Sync, Role Mapping
 * 
 * To enable Azure AD SSO:
 * 1. Register an app in Azure Portal → App Registrations
 * 2. Set redirect URI to: {YOUR_DOMAIN}/api/auth/sso/callback
 * 3. Add the following env vars:
 *    AZURE_AD_CLIENT_ID=<your-client-id>
 *    AZURE_AD_CLIENT_SECRET=<your-client-secret>
 *    AZURE_AD_TENANT_ID=<your-tenant-id>
 * 4. Grant API permissions: User.Read, Directory.Read.All
 */

const AZURE_AD_CONFIG = {
  clientId: process.env.AZURE_AD_CLIENT_ID || '',
  clientSecret: process.env.AZURE_AD_CLIENT_SECRET || '',
  tenantId: process.env.AZURE_AD_TENANT_ID || '',
  redirectUri: process.env.AZURE_AD_REDIRECT_URI || 'http://localhost:3000/api/auth/sso/callback',
  authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'common'}`,
  scopes: ['User.Read', 'Directory.Read.All'],
};

/**
 * Check if Azure AD is configured
 */
function isAzureADEnabled() {
  return !!(AZURE_AD_CONFIG.clientId && AZURE_AD_CONFIG.clientSecret && AZURE_AD_CONFIG.tenantId);
}

/**
 * Generate the Azure AD authorization URL for SSO login
 */
function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: AZURE_AD_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: AZURE_AD_CONFIG.redirectUri,
    scope: AZURE_AD_CONFIG.scopes.join(' '),
    response_mode: 'query',
    state: state || 'goalforge_sso',
  });

  return `${AZURE_AD_CONFIG.authority}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code) {
  const tokenEndpoint = `${AZURE_AD_CONFIG.authority}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: AZURE_AD_CONFIG.clientId,
    client_secret: AZURE_AD_CONFIG.clientSecret,
    code: code,
    redirect_uri: AZURE_AD_CONFIG.redirectUri,
    grant_type: 'authorization_code',
    scope: AZURE_AD_CONFIG.scopes.join(' '),
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch user profile from Microsoft Graph API
 */
async function getUserProfile(accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,employeeId,jobTitle,department,officeLocation', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Graph API error: ${res.status}`);
  return res.json();
}

/**
 * Fetch user's manager from Microsoft Graph (org hierarchy sync)
 */
async function getUserManager(accessToken) {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/manager?$select=id,displayName,mail,employeeId', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch user's group memberships for role mapping
 * Maps Azure AD groups to GoalForge roles:
 *   - Group "GoalForge-Admins" → admin
 *   - Group "GoalForge-Managers" → manager
 *   - Default → employee
 */
async function getUserRole(accessToken) {
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/memberOf?$select=displayName,id', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return 'employee';

    const data = await res.json();
    const groups = (data.value || []).map(g => g.displayName?.toLowerCase());

    if (groups.some(g => g?.includes('admin') || g?.includes('hr'))) return 'admin';
    if (groups.some(g => g?.includes('manager') || g?.includes('lead'))) return 'manager';
    return 'employee';
  } catch {
    return 'employee';
  }
}

/**
 * Sync a user from Azure AD profile into the local database
 * Creates or updates user record and maps org hierarchy
 */
function syncAzureADUser(db, profile, managerProfile, role) {
  const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.mail);

  if (existingUser) {
    // Update existing user
    db.prepare(`
      UPDATE users SET name = ?, department = ?, role = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(profile.displayName, profile.department || 'General', role, existingUser.id);

    // Sync manager relationship
    if (managerProfile?.mail) {
      const manager = db.prepare('SELECT id FROM users WHERE email = ?').get(managerProfile.mail);
      if (manager) {
        db.prepare('UPDATE users SET manager_id = ? WHERE id = ?').run(manager.id, existingUser.id);
      }
    }

    return existingUser;
  } else {
    // Create new user from Azure AD
    const { hashPassword } = require('./auth');
    const empId = profile.employeeId || `ad_${profile.id.substring(0, 8)}`;
    const result = db.prepare(`
      INSERT INTO users (employee_id, name, email, password_hash, role, department)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(empId, profile.displayName, profile.mail, hashPassword('sso_managed'), role, profile.department || 'General');

    return { id: result.lastInsertRowid, employee_id: empId, name: profile.displayName, email: profile.mail, role, department: profile.department || 'General' };
  }
}

module.exports = {
  AZURE_AD_CONFIG,
  isAzureADEnabled,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserProfile,
  getUserManager,
  getUserRole,
  syncAzureADUser,
};
