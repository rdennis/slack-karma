import { Pool, PoolClient } from 'pg';
import { getEnvVal, bool, sanitizeUser } from './util';
import { THING_TYPE } from './thing-type';

const pool = new Pool({
    connectionString: getEnvVal('DATABASE_URL'),
    ssl: getEnvVal('DATABASE_SSL', bool, true)
});

// ensure our schema exists
const ensureSchemaExists = (() => {
    let called = false;

    return async (client: PoolClient) => {
        if (called) {
            return;
        }

        await client.query(`
CREATE TABLE IF NOT EXISTS karma(
    id serial PRIMARY KEY,
    thing text NOT NULL,
    type text NOT NULL,
    karma int NOT NULL,
    edited_on timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS change(
    id serial PRIMARY KEY,
    delta int NOT NULL,
    thing text NOT NULL,
    editor text NOT NULL,
    edited_on timestamp NOT NULL
);
`);

        called = true;
    };
})();

const p = (str: number) => `${str}`.padStart(2, '0');

/**
 * Format a date as a postgresql timestamp.
 * @param date 
 */
const timestamp = (date: Date) => `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`;

async function connect<T>(fn: (client: PoolClient) => Promise<T>) {
    const client = await pool.connect();
    await ensureSchemaExists(client);

    const result = await fn(client);

    client.release();

    return result;
}

async function query<T>(command: string) {
    const result = await connect(async (client) => await client.query(command));
    const rows: T[] = result.rows;
    return rows;
}

async function querySingle<T>(command: string) {
    const rows: T[] = await query<T>(command);
    return rows && rows[0];
}

export interface KarmaRecord {
    id: number
    thing: string
    type: THING_TYPE
    karma: number
    edited_on: Date
}

export interface CreateOrUpdateRecord {
    id?: number
    thing: string
    type: THING_TYPE
    karma: number
}

export interface KarmaChangeRecord {
    id: number
    delta: number
    thing: string
    editor: string
    edited_on: Date
}

async function getTopOrBottom(type: THING_TYPE, direction: 'DESC' | 'ASC', n: number = 10): Promise<KarmaRecord[]> {
    const records = await query<KarmaRecord>(`
SELECT *
    FROM karma 
    WHERE type = '${type}' 
    ORDER BY karma ${direction}
    FETCH FIRST ${n} ROWS ONLY`);

    return records;
}

export async function getAll(): Promise<KarmaRecord[]> {
    const results = await query<KarmaRecord>(`
SELECT *
    FROM karma
    ORDER BY karma DESC`);

    return results;
}

export async function get(thing: string): Promise<KarmaRecord> {
    const record = await querySingle<KarmaRecord>(`
SELECT *
    FROM karma
    WHERE thing = '${sanitizeUser(thing)}'
    FETCH FIRST 1 ROWS ONLY`);

    return record;
}

export async function getTop(type: THING_TYPE, n: number = 10): Promise<KarmaRecord[]> {
    return await getTopOrBottom(type, 'DESC', n);
}

export async function getBottom(type: THING_TYPE, n: number = 10): Promise<KarmaRecord[]> {
    return await getTopOrBottom(type, 'ASC', n);
}

export async function createOrUpdate(record: CreateOrUpdateRecord, change: number, editor: string): Promise<boolean> {
    // make sure users are good
    record.thing = sanitizeUser(record.thing);
    editor = sanitizeUser(editor);

    const now = timestamp(new Date());

    const {
        id,
        karma,
        thing,
        type
    } = record;

    // create or update karma record
    // create change record
    const command = `${(
        id ?
            `
UPDATE karma
    SET karma = ${karma}
    WHERE id = ${id};`
            :
            `
INSERT INTO karma
            (thing,      type,      karma,    edited_on)
    values  ('${thing}', '${type}', ${karma}, '${now}');`
    )}

INSERT INTO change
            (delta,     thing,      editor,      edited_on)
    values  (${change}, '${thing}', '${editor}', '${now}');`;


    try {
        await query(command);
    } catch (err) {
        console.error('Failed to create or update karma record.');
        console.error('command:', command);
        console.error(err);
        return false;
    }

    return true;
}