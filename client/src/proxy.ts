import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;

  // If there's no token and they're trying to access /admin (but not /admin/login)
  if (!token && !request.nextUrl.pathname.startsWith('/admin/login')) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // If they have a token and try to access /admin/login, redirect them to /admin
  if (token && request.nextUrl.pathname.startsWith('/admin/login')) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

// Only run middleware on /admin routes
export const config = {
  matcher: '/admin/:path*',
};
