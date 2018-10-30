import { Pool } from 'pg';
import { getEnvVal, bool, sanitizeUser } from './util';
import { THING_TYPE } from './thing-type';

const pool = new Pool({
    connectionString: getEnvVal('DATABASE_URL'),
    ssl: getEnvVal('DATABASE_SSL', bool, true)
});

export interface KarmaRecord {
    id: number
    thing: string
    type: THING_TYPE
    karma: number
}

async function getTopOrBottom(type: THING_TYPE, direction: 'DESC' | 'ASC', n: number = 10): Promise<KarmaRecord[]> {
    const client = await pool.connect();
    const result = await client.query(`SELECT * FROM karma WHERE type = '${type}' ORDER BY karma ${direction} FETCH FIRST ${n} ROWS ONLY`);
    const records: KarmaRecord[] = result.rows;
    client.release();

    return records;
}

export async function getAll(): Promise<KarmaRecord[]> {
    const client = await pool.connect()
    const result = await client.query('SELECT * FROM karma ORDER BY karma DESC');
    const results: KarmaRecord[] = result.rows;
    client.release();

    return results;
}

export async function get(thing: string): Promise<KarmaRecord> {
    const client = await pool.connect();
    const result = await client.query(`SELECT * FROM karma WHERE thing = '${sanitizeUser(thing)}' FETCH FIRST 1 ROWS ONLY`);
    const record: KarmaRecord = result.rows[0];
    client.release();

    return record;
}

export async function getTop(type: THING_TYPE, n: number = 10): Promise<KarmaRecord[]> {
    return await getTopOrBottom(type, 'DESC', n);
}

export async function getBottom(type: THING_TYPE, n: number = 10): Promise<KarmaRecord[]> {
    return await getTopOrBottom(type, 'ASC', n);
}

export async function createOrUpdate(record: KarmaRecord): Promise<void> {
    const client = await pool.connect();
    const query = record.id ?
        `UPDATE karma SET karma=${record.karma}` :
        `INSERT INTO karma(thing, type, karma) values ('${sanitizeUser(record.thing)}', '${record.type}', ${record.karma})`;
    const result = await client.query(query);
    client.release();
}