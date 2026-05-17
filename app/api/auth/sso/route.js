import { NextResponse } from 'next/server';

/**
 * GET /api/auth/sso — Initiate Azure AD SSO login
 * Redirects user to Microsoft login page
 */
export async function GET(request) {
  try {
    const { isAzureADEnabled, getAuthorizationUrl } = require('../../../../lib/azure-ad');

    if (!isAzureADEnabled()) {
      return NextResponse.json({
        error: 'Azure AD SSO is not configured',
        message: 'Set AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID environment variables to enable SSO.',
        setup_guide: {
          step1: 'Register an app in Azure Portal → App Registrations',
          step2: 'Set redirect URI to: {YOUR_DOMAIN}/api/auth/sso/callback',
          step3: 'Add env vars: AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID',
          step4: 'Grant API permissions: User.Read, Directory.Read.All',
        },
      }, { status: 501 });
    }

    const authUrl = getAuthorizationUrl();
    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error('SSO init error:', err);
    return NextResponse.json({ error: 'SSO initialization failed' }, { status: 500 });
  }
}
