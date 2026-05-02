import { NextResponse } from 'next/server';

// GET /api/db-config - Return current database configuration info
export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';

  let dbType = 'sqlite';
  let dbInfo: Record<string, string> = {};

  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    dbType = 'postgresql';
    try {
      const url = new URL(dbUrl);
      dbInfo = {
        host: url.hostname,
        port: url.port || '5432',
        database: url.pathname.slice(1),
        user: url.username,
      };
    } catch {
      dbInfo = { url: 'Invalid PostgreSQL URL' };
    }
  } else if (dbUrl.startsWith('mysql://')) {
    dbType = 'mysql';
    try {
      const url = new URL(dbUrl);
      dbInfo = {
        host: url.hostname,
        port: url.port || '3306',
        database: url.pathname.slice(1),
        user: url.username,
      };
    } catch {
      dbInfo = { url: 'Invalid MySQL URL' };
    }
  } else if (dbUrl.startsWith('file:')) {
    dbType = 'sqlite';
    dbInfo = {
      file: dbUrl.replace('file:', ''),
    };
  } else {
    dbInfo = {
      url: 'Unknown format',
    };
  }

  return NextResponse.json({
    type: dbType,
    info: dbInfo,
    supportedTypes: ['sqlite', 'postgresql', 'mysql'],
  });
}
