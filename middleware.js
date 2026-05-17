import { NextResponse } from 'next/server';

export function middleware(request) {
  // Allow API and static routes
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
