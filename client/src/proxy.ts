import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  const isLogin = request.nextUrl.pathname.startsWith('/admin/login');

  // No session: everything under /admin except the login page redirects to login
  if (!token && !isLogin) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Already signed in: skip the login page
  if (token && isLogin) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.next();
}

// Only run on /admin routes
export const config = {
  matcher: '/admin/:path*',
};
