import { Pool } from 'pg';
import { getEnvVal, bool } from './util';

const pool = new Pool({
    connectionString: getEnvVal('DATABASE_URL'),
    ssl: getEnvVal('DATABASE_SSL', bool, true)
});

interface KarmaRecord {
    id: number
    thing: string
    karma: number
}

export async function getAll(): Promise<KarmaRecord[]> {
    const client = await pool.connect()
    const result = await client.query('SELECT * FROM karma');
    const results: KarmaRecord[] = result.rows;
    client.release();

    return results;
}

export async function get(thing: string): Promise<KarmaRecord> {
    const client = await pool.connect();
    const result = await client.query(`SELECT TOP 1 * FROM karma WHERE thing = '${thing}'`);
    const record: KarmaRecord = result.rows[0];
    client.release();

    return record;
}

export async function createOrUpdate(record: KarmaRecord): Promise<void> {
    const client = await pool.connect();
    const query = record.id ?
        `UPDATE karma SET karma=${record.karma}` :
        `INSERT INTO karma(thing, karma) values ('${record.thing}', ${record.karma})`;
    const result = await client.query(query);
    client.release();
}