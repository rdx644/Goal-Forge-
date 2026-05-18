import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/sso/callback — Azure AD SSO callback
 * Handles the authorization code exchange and creates/syncs user
 */
export async function GET(request) {
  try {
    const { isAzureADEnabled, exchangeCodeForTokens, getUserProfile, getUserManager, getUserRole, syncAzureADUser } = require('../../../../../lib/azure-ad');
    const { generateToken } = require('../../../../../lib/auth');
    const { getDb } = require('../../../../../lib/db');

    if (!isAzureADEnabled()) {
      return NextResponse.redirect(new URL('/?error=sso_not_configured', request.url));
    }

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/?error=no_code', request.url));
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    const accessToken = tokens.access_token;

    // Fetch user profile and manager from Microsoft Graph
    const [profile, managerProfile, role] = await Promise.all([
      getUserProfile(accessToken),
      getUserManager(accessToken),
      getUserRole(accessToken),
    ]);

    // Sync user into local database
    const db = getDb();
    const user = syncAzureADUser(db, profile, managerProfile, role);

    // Generate JWT for the synced user
    const token = generateToken(user);

    // Redirect to dashboard with token
    const dashboardUrl = new URL(`/dashboard/${role}`, request.url);
    const response = NextResponse.redirect(dashboardUrl);

    // Set token as a cookie for the frontend to pick up
    response.cookies.set('goalforge_token', token, {
      httpOnly: false, // Frontend needs to read it
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
    });

    // Log the SSO login in audit trail
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, changed_by, reason)
      VALUES ('user', ?, 'sso_login', ?, 'Azure AD SSO authentication')
    `).run(user.id, user.id);

    return response;
  } catch (err) {
    console.error('SSO callback error:', err);
    return NextResponse.redirect(new URL('/?error=sso_failed', request.url));
  }
}
