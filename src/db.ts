import pg from 'pg';

export const db = new pg.Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

export function migrate() {
    const migrationQuery = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        openid VARCHAR(255) UNIQUE NOT NULL,
        ysws_eligible BOOLEAN DEFAULT FALSE,
        verification_status VARCHAR(50) DEFAULT 'unverified',
        first_name VARCHAR(255) UNIQUE NOT NULL,
        last_name VARCHAR(255) UNIQUE NOT NULL,
        primary_email VARCHAR(255) UNIQUE NOT NULL,
        slack_id VARCHAR(255) UNIQUE,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    `;

    return db.query(migrationQuery);
}