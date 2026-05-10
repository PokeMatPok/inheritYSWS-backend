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
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        primary_email VARCHAR(255) UNIQUE NOT NULL,
        slack_id VARCHAR(255),
        slack_welcome_sent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'open',
        creator_id INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT
    );

    CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER REFERENCES users(id),
        role_id INTEGER REFERENCES roles(id),
        PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS project_contributors (
        id SERIAL PRIMARY KEY,
        slack_id VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE,
        openid VARCHAR(255) UNIQUE,
        display_name VARCHAR(255) NOT NULL,
        verification_token_hash VARCHAR(255),
        verification_token_expires_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        user_id INTEGER REFERENCES users(id)
    );

	CREATE TABLE IF NOT EXISTS project_contributions (
		id SERIAL PRIMARY KEY,
		contributor_id INTEGER NOT NULL REFERENCES project_contributors(id) ON DELETE CASCADE,
		title VARCHAR(255) NOT NULL,
		description TEXT,
		github_url TEXT,
		improvement_areas TEXT,
		languages_used TEXT,
		difficulty_rating INTEGER CHECK (difficulty_rating BETWEEN 1 AND 5),
		status VARCHAR(50) DEFAULT 'pending',
		indexed_at TIMESTAMPTZ,
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW()
	);
    `;

    return db.query(migrationQuery);
}