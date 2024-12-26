import { NextResponse } from 'next/server';

export function middleware(request) {
  const token = request.cookies.get('auth')?.value;
  
  const AuthTryToAccess = request.nextUrl.pathname == '/auth';
  if(AuthTryToAccess)
  {
    if(token)
    {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
  else{
    if(!token)
      {
        return NextResponse.redirect(new URL('/auth', request.url));
      }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/auth'],
};
