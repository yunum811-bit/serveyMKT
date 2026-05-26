// Database abstraction layer - supports PostgreSQL (Neon) and SQLite (local)
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('ERROR: DATABASE_URL is not set!');
    console.error('Please set DATABASE_URL environment variable');
    process.exit(1);
}

console.log('Connecting to database:', connectionString.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

// Initialize tables
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                "fullName" TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                "createdAt" TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS reports (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                officer TEXT NOT NULL,
                "workDate" TEXT NOT NULL,
                "timeSlot" TEXT NOT NULL,
                "startTime" TEXT,
                "endTime" TEXT,
                objectives TEXT NOT NULL,
                "objectiveOther" TEXT,
                "leadSource" TEXT,
                "leadSourceOther" TEXT,
                products TEXT,
                "productOther" TEXT,
                "companyName" TEXT NOT NULL,
                "contactPerson" TEXT NOT NULL,
                summary TEXT NOT NULL,
                "nextSteps" TEXT,
                "nextStepOther" TEXT,
                "proposalDate" TEXT,
                "meetingDate" TEXT,
                "dealProbability" TEXT,
                photo1 TEXT,
                "photoDesc1" TEXT,
                photo2 TEXT,
                "photoDesc2" TEXT,
                province TEXT NOT NULL,
                "provinceOther" TEXT,
                "dealEstimate" TEXT,
                "dealValue" TEXT,
                "successRating" INTEGER,
                competitors TEXT,
                "competitorOther" TEXT,
                supervisor TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                "approvedByMgr" TEXT,
                "approvedByMd" TEXT,
                "mgrComment" TEXT,
                "mdComment" TEXT,
                "createdAt" TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS custom_questions (
                id SERIAL PRIMARY KEY,
                label TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'text',
                options TEXT,
                "isRequired" INTEGER DEFAULT 0,
                "isActive" INTEGER DEFAULT 1,
                "sortOrder" INTEGER DEFAULT 0,
                "createdAt" TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS custom_answers (
                id SERIAL PRIMARY KEY,
                "reportId" INTEGER NOT NULL,
                "questionId" INTEGER NOT NULL,
                answer TEXT
            );

            CREATE TABLE IF NOT EXISTS form_options (
                id SERIAL PRIMARY KEY,
                field_key TEXT UNIQUE NOT NULL,
                field_label TEXT NOT NULL,
                options TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_form_config (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                hidden_fields TEXT DEFAULT '[]',
                custom_options TEXT DEFAULT '{}',
                UNIQUE("userId")
            );
        `);
        console.log('Database tables initialized');

        // Add new columns if not exist (for existing databases)
        const addCols = [
            'ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'pending\'',
            'ALTER TABLE reports ADD COLUMN IF NOT EXISTS "approvedByMgr" TEXT',
            'ALTER TABLE reports ADD COLUMN IF NOT EXISTS "approvedByMd" TEXT',
            'ALTER TABLE reports ADD COLUMN IF NOT EXISTS "mgrComment" TEXT',
            'ALTER TABLE reports ADD COLUMN IF NOT EXISTS "mdComment" TEXT',
            'ALTER TABLE user_form_config ADD COLUMN IF NOT EXISTS custom_options TEXT DEFAULT \'{}\''
        ];
        for (const sql of addCols) {
            try { await client.query(sql); } catch(e) { /* column may already exist */ }
        }
    } finally {
        client.release();
    }
}

// Helper: run a query and return rows
async function query(text, params = []) {
    const res = await pool.query(text, params);
    return res.rows;
}

// Helper: run a query and return first row
async function queryOne(text, params = []) {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
}

// Helper: run insert and return inserted row
async function insert(text, params = []) {
    const res = await pool.query(text + ' RETURNING *', params);
    return res.rows[0];
}

// Helper: run update/delete
async function run(text, params = []) {
    const res = await pool.query(text, params);
    return { rowCount: res.rowCount };
}

module.exports = { pool, initDB, query, queryOne, insert, run };
