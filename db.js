// Database abstraction layer - supports PostgreSQL (Neon) and SQLite (local)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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
        `);
        console.log('Database tables initialized');
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
