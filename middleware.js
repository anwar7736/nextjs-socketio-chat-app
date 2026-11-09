import { NextResponse } from 'next/server';
import { verifySessionToken } from './app/lib/session';

export async function middleware(request) {
  const token = request.cookies.get('auth')?.value;
  const isAuthenticated = await verifySessionToken(token);
  const pathname = request.nextUrl.pathname;
  const isPublicAuthApi = [
    '/api/auth/otp',
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/password',
    '/api/auth/logout',
  ].includes(pathname);

  if (pathname.startsWith('/api/')) {
    if (!isPublicAuthApi && !isAuthenticated) {
      return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
    }
    return NextResponse.next();
  }

  const AuthTryToAccess = request.nextUrl.pathname == '/auth';
  if(AuthTryToAccess)
  {
    if(isAuthenticated)
    {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
  else{
    if(!isAuthenticated)
      {
        return NextResponse.redirect(new URL('/auth', request.url));
      }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/auth', '/api/:path*'],
};
