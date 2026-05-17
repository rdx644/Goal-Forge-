import { NextResponse } from 'next/server';

const DEV_JWT_SECRET = 'goalforge-dev-secret';
function getJwtSecret() {
  return process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : DEV_JWT_SECRET);
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function base64UrlToBytes(value) {
  const decoded = decodeBase64Url(value);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

async function verifyJwt(token) {
  if (!token) return null;
  const secret = getJwtSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(decodeBase64Url(headerPart));
    payload = JSON.parse(decodeBase64Url(payloadPart));
  } catch (error) {
    return null;
  }

  if (header.alg !== 'HS256' || !signaturePart) return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const validSignature = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  );

  if (!validSignature) return null;
  if (payload.exp && payload.exp * 1000 <= Date.now()) return null;

  return payload;
}

function getTokenFromRequest(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return request.cookies.get('goalforge_token')?.value || null;
}

function hasDashboardAccess(pathname, role) {
  if (!role) return false;

  if (pathname.startsWith('/dashboard/admin')) {
    return role === 'admin';
  }

  if (pathname.startsWith('/dashboard/manager')) {
    return role === 'manager' || role === 'admin';
  }

  return true;
}

function redirectToHome(request) {
  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export async function middleware(request) {
  const token = getTokenFromRequest(request);
  const user = await verifyJwt(token);

  if (!user || !hasDashboardAccess(request.nextUrl.pathname, user.role)) {
    return redirectToHome(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
