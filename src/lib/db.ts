import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let fallbackMode = false;

type AppFallbackRow = {
  id: number;
  name: string;
  type: 'nodejs' | 'python';
  directory: string;
  entry_file: string;
  github_url: string | null;
  status: 'running' | 'stopped' | 'installing' | 'error';
  passenger_app_id: string | null;
  created_at: Date;
};

type BluepanelFallbackState = {
  apps: AppFallbackRow[];
  nextId: number;
};

const globalForDb = globalThis as typeof globalThis & {
  __bluepanelFallbackState?: BluepanelFallbackState;
};

const fallbackState: BluepanelFallbackState =
  globalForDb.__bluepanelFallbackState ?? {
    apps: [],
    nextId: 1
  };

globalForDb.__bluepanelFallbackState = fallbackState;

function getPool() {
  if (fallbackMode) {
    return null;
  }

  if (!pool) {
    try {
      pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        namedPlaceholders: true
      });
    } catch {
      fallbackMode = true;
      return null;
    }
  }

  return pool;
}

export async function dbExecute<T = mysql.ResultSetHeader>(sql: string, params: Array<unknown> = []) {
  const activePool = getPool();
  if (activePool) {
    try {
      const [result] = await activePool.execute<T>(sql, params);
      return result;
    } catch (error) {
      fallbackMode = true;
      return dbExecute<T>(sql, params);
    }
  }

  const normalized = sql.trim().toLowerCase();

  if (normalized.startsWith('insert into apps')) {
    const [name, type, directory, entryFile, githubUrl, status, passengerAppId] = params as [string, 'nodejs' | 'python', string, string, string | null, 'running' | 'stopped' | 'installing' | 'error', string | null];
    const row: AppFallbackRow = {
      id: fallbackState.nextId++,
      name,
      type,
      directory,
      entry_file: entryFile,
      github_url: githubUrl ?? null,
      status: status ?? 'stopped',
      passenger_app_id: passengerAppId ?? null,
      created_at: new Date()
    };

    fallbackState.apps.push(row);
    return { insertId: row.id } as T;
  }

  if (normalized.startsWith('update apps set status = ?, passenger_app_id = coalesce(?, passenger_app_id) where id = ?')) {
    const [status, passengerAppId, id] = params as ['running' | 'stopped' | 'installing' | 'error', string | null, number];
    fallbackState.apps = fallbackState.apps.map((row) =>
      row.id === id ? { ...row, status, passenger_app_id: passengerAppId ?? row.passenger_app_id } : row
    );
    return { affectedRows: 1 } as T;
  }

  if (normalized.startsWith('update apps set directory = ? where id = ?')) {
    const [directory, id] = params as [string, number];
    fallbackState.apps = fallbackState.apps.map((row) => (row.id === id ? { ...row, directory } : row));
    return { affectedRows: 1 } as T;
  }

  if (normalized.startsWith('delete from apps where id = ?')) {
    const [id] = params as [number];
    fallbackState.apps = fallbackState.apps.filter((row) => row.id !== id);
    return { affectedRows: 1 } as T;
  }

  return {} as T;
}

export async function dbQuery<T = mysql.RowDataPacket[]>(sql: string, params: Array<unknown> = []) {
  const activePool = getPool();
  if (activePool) {
    try {
      const [rows] = await activePool.query<T>(sql, params);
      return rows;
    } catch (error) {
      fallbackMode = true;
      return dbQuery<T>(sql, params);
    }
  }

  const normalized = sql.trim().toLowerCase();

  if (normalized.startsWith('select * from apps where id = ? limit 1')) {
    const [id] = params as [number];
    return fallbackState.apps.filter((row) => row.id === id) as T;
  }

  if (normalized.startsWith('select * from apps order by created_at desc, id desc')) {
    return [...fallbackState.apps].sort((left, right) => right.created_at.getTime() - left.created_at.getTime() || right.id - left.id) as T;
  }

  return [] as T;
}
