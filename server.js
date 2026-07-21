const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'marketing-sc-secret-key-2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads', { recursive: true });
}

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueName + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น'));
        }
    }
});

// === Database Setup ===
const db = new Database('./database.sqlite');
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        fullName TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        createdAt TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        officer TEXT NOT NULL,
        workDate TEXT NOT NULL,
        timeSlot TEXT NOT NULL,
        startTime TEXT,
        endTime TEXT,
        objectives TEXT NOT NULL,
        objectiveOther TEXT,
        leadSource TEXT,
        leadSourceOther TEXT,
        products TEXT,
        productOther TEXT,
        companyName TEXT NOT NULL,
        contactPerson TEXT NOT NULL,
        summary TEXT NOT NULL,
        nextSteps TEXT,
        nextStepOther TEXT,
        proposalDate TEXT,
        meetingDate TEXT,
        dealProbability TEXT,
        photo1 TEXT,
        photoDesc1 TEXT,
        photo2 TEXT,
        photoDesc2 TEXT,
        province TEXT NOT NULL,
        provinceOther TEXT,
        dealEstimate TEXT,
        dealValue TEXT,
        successRating INTEGER,
        competitors TEXT,
        competitorOther TEXT,
        supervisor TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now','localtime'))
    );
`);

// Create default admin user if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, fullName, role) VALUES (?, ?, ?, ?)')
      .run('admin', hashedPw, 'ผู้ดูแลระบบ', 'admin');
}

// === Auth Middleware ===
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    }
    next();
}

// === AUTH ROUTES ===

// Register
app.post('/api/auth/register', (req, res) => {
    const { username, password, fullName } = req.body;
    if (!username || !password || !fullName) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    }
    const hashedPw = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, fullName) VALUES (?, ?, ?)')
                     .run(username, hashedPw, fullName);
    res.json({ message: 'สร้างบัญชีสำเร็จ', userId: result.lastInsertRowid });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const token = jwt.sign(
        { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.json({ message: 'เข้าสู่ระบบสำเร็จ', token, user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } });
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, username, fullName, role, createdAt FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

// List all users (admin only)
app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
    const users = db.prepare('SELECT id, username, fullName, role, createdAt FROM users ORDER BY createdAt DESC').all();
    res.json(users);
});

// Delete user (admin only)
app.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const userId = req.params.id;
    if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ message: 'ลบผู้ใช้สำเร็จ' });
});

// Update user (admin only)
app.put('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { username, fullName, role } = req.body;
    const userId = req.params.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
        return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    }
    if (username && username !== user.username) {
        const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
        if (existing) {
            return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
        }
    }
    db.prepare('UPDATE users SET username = ?, fullName = ?, role = ? WHERE id = ?')
        .run(username || user.username, fullName || user.fullName, role || user.role, userId);
    res.json({ message: 'อัปเดตผู้ใช้สำเร็จ' });
});

// Reset password (admin only)
app.put('/api/users/:id/reset-password', authMiddleware, adminMiddleware, (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
        return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    }
    const hashedPw = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPw, req.params.id);
    res.json({ message: 'รีเซ็ตรหัสผ่านสำเร็จ' });
});

// Change own password
app.put('/api/auth/change-password', authMiddleware, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
        return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    const hashedPw = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPw, req.user.id);
    res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
});

// === REPORT ROUTES ===

// Submit report
app.post('/api/reports', authMiddleware, upload.fields([
    { name: 'photo1', maxCount: 1 },
    { name: 'photo2', maxCount: 1 }
]), (req, res) => {
    const b = req.body;
    const photo1 = req.files?.photo1?.[0]?.filename || null;
    const photo2 = req.files?.photo2?.[0]?.filename || null;

    if (!b.officer || !b.workDate || !b.timeSlot || !b.companyName || !b.contactPerson || !b.summary || !b.province || !b.supervisor) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ' });
    }

    const objectives = Array.isArray(b.objective) ? b.objective.join(', ') : (b.objective || '');
    const products = Array.isArray(b.product) ? b.product.join(', ') : (b.product || '');
    const nextSteps = Array.isArray(b.nextStep) ? b.nextStep.join(', ') : (b.nextStep || '');
    const competitors = Array.isArray(b.competitor) ? b.competitor.join(', ') : (b.competitor || '');

    const stmt = db.prepare(`
        INSERT INTO reports (
            userId, officer, workDate, timeSlot, startTime, endTime,
            objectives, objectiveOther, leadSource, leadSourceOther,
            products, productOther, companyName, contactPerson, summary,
            nextSteps, nextStepOther, proposalDate, meetingDate,
            dealProbability, photo1, photoDesc1, photo2, photoDesc2,
            province, provinceOther, dealEstimate, dealValue,
            successRating, competitors, competitorOther, supervisor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        req.user.id, b.officer, b.workDate, b.timeSlot, b.startTime || null, b.endTime || null,
        objectives, b.objectiveOtherText || null, b.leadSource || null, b.leadSourceOtherText || null,
        products, b.productOtherText || null, b.companyName, b.contactPerson, b.summary,
        nextSteps, b.nextStepOtherText || null, b.proposalDate || null, b.meetingDate || null,
        b.dealProbability || null, photo1, b.photoDesc1 || null, photo2, b.photoDesc2 || null,
        b.province, b.provinceOtherText || null, b.dealEstimate || null, b.dealValue || null,
        b.successRating ? parseInt(b.successRating) : null, competitors, b.competitorOtherText || null, b.supervisor
    );

    res.json({ message: 'บันทึกรายงานสำเร็จ', reportId: result.lastInsertRowid });
});

// Get reports with monthly filter
app.get('/api/reports', authMiddleware, (req, res) => {
    const { month, year, officer } = req.query;
    let query = 'SELECT * FROM reports WHERE 1=1';
    const params = [];

    if (month && year) {
        const monthStr = String(month).padStart(2, '0');
        query += ` AND strftime('%Y-%m', workDate) = ?`;
        params.push(`${year}-${monthStr}`);
    } else if (year) {
        query += ` AND strftime('%Y', workDate) = ?`;
        params.push(String(year));
    }

    if (officer) {
        query += ' AND officer = ?';
        params.push(officer);
    }

    // Non-admin can only see their own reports
    if (req.user.role !== 'admin') {
        query += ' AND userId = ?';
        params.push(req.user.id);
    }

    query += ' ORDER BY workDate DESC, createdAt DESC';

    const reports = db.prepare(query).all(...params);
    res.json(reports);
});

// Get monthly summary
app.get('/api/reports/summary', authMiddleware, (req, res) => {
    const { month, year } = req.query;
    let whereClause = '1=1';
    const params = [];

    if (month && year) {
        const monthStr = String(month).padStart(2, '0');
        whereClause += ` AND strftime('%Y-%m', workDate) = ?`;
        params.push(`${year}-${monthStr}`);
    } else if (year) {
        whereClause += ` AND strftime('%Y', workDate) = ?`;
        params.push(String(year));
    }

    if (req.user.role !== 'admin') {
        whereClause += ' AND userId = ?';
        params.push(req.user.id);
    }

    const summary = db.prepare(`
        SELECT
            COUNT(*) as totalReports,
            COUNT(DISTINCT companyName) as totalCompanies,
            COUNT(DISTINCT workDate) as totalDays,
            AVG(successRating) as avgRating,
            COUNT(CASE WHEN dealProbability = 'สูง (Hot Prospect)' THEN 1 END) as hotProspects,
            COUNT(CASE WHEN dealProbability = 'ปานกลาง (Warm Prospect)' THEN 1 END) as warmProspects,
            COUNT(CASE WHEN dealProbability = 'ติดตามระยะยาว (Cold Prospect)' THEN 1 END) as coldProspects
        FROM reports WHERE ${whereClause}
    `).get(...params);

    // Per officer breakdown
    const byOfficer = db.prepare(`
        SELECT officer, COUNT(*) as count
        FROM reports WHERE ${whereClause}
        GROUP BY officer ORDER BY count DESC
    `).all(...params);

    // Per province breakdown
    const byProvince = db.prepare(`
        SELECT province, COUNT(*) as count
        FROM reports WHERE ${whereClause}
        GROUP BY province ORDER BY count DESC
    `).all(...params);

    res.json({ summary, byOfficer, byProvince });
});

// Get single report
app.get('/api/reports/:id', authMiddleware, (req, res) => {
    const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'ไม่พบรายงาน' });
    if (req.user.role !== 'admin' && report.userId !== req.user.id) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง' });
    }
    res.json(report);
});

// Delete report (admin only)
app.delete('/api/reports/:id', authMiddleware, adminMiddleware, (req, res) => {
    db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
    res.json({ message: 'ลบรายงานสำเร็จ' });
});

// === EXPORT EXCEL ===
const ExcelJS = require('exceljs');

app.get('/api/reports/export/excel', authMiddleware, async (req, res) => {
    const { month, year, officer } = req.query;
    let query = 'SELECT * FROM reports WHERE 1=1';
    const params = [];

    if (month && year) {
        const monthStr = String(month).padStart(2, '0');
        query += ` AND strftime('%Y-%m', workDate) = ?`;
        params.push(`${year}-${monthStr}`);
    } else if (year) {
        query += ` AND strftime('%Y', workDate) = ?`;
        params.push(String(year));
    }
    if (officer) {
        query += ' AND officer = ?';
        params.push(officer);
    }
    if (req.user.role !== 'admin') {
        query += ' AND userId = ?';
        params.push(req.user.id);
    }
    query += ' ORDER BY workDate DESC';

    const reports = db.prepare(query).all(...params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Marketing SC';
    const sheet = workbook.addWorksheet('รายงานปฏิบัติงาน');

    // Header style
    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6C63FF' } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    };

    sheet.columns = [
        { header: 'ลำดับ', key: 'no', width: 6 },
        { header: 'วันที่', key: 'workDate', width: 12 },
        { header: 'เจ้าหน้าที่', key: 'officer', width: 22 },
        { header: 'ช่วงเวลา', key: 'timeSlot', width: 14 },
        { header: 'วัตถุประสงค์', key: 'objectives', width: 30 },
        { header: 'แหล่งที่มาลูกค้า', key: 'leadSource', width: 16 },
        { header: 'ผลิตภัณฑ์', key: 'products', width: 20 },
        { header: 'บริษัท/สถานที่', key: 'companyName', width: 25 },
        { header: 'ผู้ติดต่อ', key: 'contactPerson', width: 20 },
        { header: 'สรุปผลหารือ', key: 'summary', width: 40 },
        { header: 'Next Step', key: 'nextSteps', width: 20 },
        { header: 'ระดับดีล', key: 'dealProbability', width: 16 },
        { header: 'มูลค่าดีล', key: 'dealValue', width: 14 },
        { header: 'คะแนน', key: 'successRating', width: 8 },
        { header: 'คู่แข่ง', key: 'competitors', width: 18 },
        { header: 'พื้นที่', key: 'province', width: 14 },
        { header: 'ผู้ตรวจสอบ', key: 'supervisor', width: 22 },
        { header: 'ภาพ 1', key: 'photo1Col', width: 20 },
        { header: 'ภาพ 2', key: 'photo2Col', width: 20 },
        { header: 'วันที่บันทึก', key: 'createdAt', width: 18 }
    ];

    // Apply header style
    sheet.getRow(1).eachCell(cell => {
        cell.style = headerStyle;
    });
    sheet.getRow(1).height = 24;

    // Add custom questions columns
    const customQs = db.prepare('SELECT * FROM custom_questions WHERE isActive = 1 ORDER BY sortOrder').all();
    customQs.forEach(q => {
        sheet.columns = [...sheet.columns];
        sheet.getRow(1).getCell(sheet.columns.length + 1).value = q.label;
    });

    // Add data rows with images
    const photoCol1Index = 18; // column R (ภาพ 1)
    const photoCol2Index = 19; // column S (ภาพ 2)

    for (let i = 0; i < reports.length; i++) {
        const r = reports[i];
        const rowNum = i + 2; // row 1 is header
        const row = sheet.addRow({
            no: i + 1,
            workDate: r.workDate,
            officer: r.officer,
            timeSlot: r.timeSlot,
            objectives: r.objectives,
            leadSource: r.leadSource || '',
            products: r.products || '',
            companyName: r.companyName,
            contactPerson: r.contactPerson,
            summary: r.summary,
            nextSteps: r.nextSteps || '',
            dealProbability: r.dealProbability || '',
            dealValue: r.dealValue || '',
            successRating: r.successRating || '',
            competitors: r.competitors || '',
            province: r.province + (r.provinceOther ? ' (' + r.provinceOther + ')' : ''),
            supervisor: r.supervisor,
            photo1Col: r.photo1 ? '(ภาพแนบ)' : '-',
            photo2Col: r.photo2 ? '(ภาพแนบ)' : '-',
            createdAt: r.createdAt
        });

        // Set row height for images
        let hasImage = false;

        // Add photo1
        if (r.photo1) {
            const imgPath = path.join(__dirname, 'uploads', r.photo1);
            if (fs.existsSync(imgPath)) {
                try {
                    const ext = path.extname(r.photo1).toLowerCase().replace('.', '');
                    const imgId = workbook.addImage({ filename: imgPath, extension: ext === 'jpg' ? 'jpeg' : ext });
                    sheet.addImage(imgId, {
                        tl: { col: photoCol1Index - 1, row: rowNum - 1 },
                        ext: { width: 120, height: 90 }
                    });
                    hasImage = true;
                } catch(e) { /* skip if image fails */ }
            }
        }

        // Add photo2
        if (r.photo2) {
            const imgPath = path.join(__dirname, 'uploads', r.photo2);
            if (fs.existsSync(imgPath)) {
                try {
                    const ext = path.extname(r.photo2).toLowerCase().replace('.', '');
                    const imgId = workbook.addImage({ filename: imgPath, extension: ext === 'jpg' ? 'jpeg' : ext });
                    sheet.addImage(imgId, {
                        tl: { col: photoCol2Index - 1, row: rowNum - 1 },
                        ext: { width: 120, height: 90 }
                    });
                    hasImage = true;
                } catch(e) { /* skip if image fails */ }
            }
        }

        if (hasImage) {
            row.height = 70;
        }

        row.eachCell(cell => {
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { vertical: 'top', wrapText: true };
        });
    }

    // Auto-filter
    sheet.autoFilter = { from: 'A1', to: sheet.getColumn(sheet.columns.length).letter + '1' };

    const monthNames = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const filename = `report_${year || 'all'}${month ? '_' + monthNames[parseInt(month)] : ''}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    await workbook.xlsx.write(res);
    res.end();
});

// === CUSTOM QUESTIONS ===

// Create custom_questions table
db.exec(`
    CREATE TABLE IF NOT EXISTS custom_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        options TEXT,
        isRequired INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        sortOrder INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS custom_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reportId INTEGER NOT NULL,
        questionId INTEGER NOT NULL,
        answer TEXT,
        FOREIGN KEY (reportId) REFERENCES reports(id),
        FOREIGN KEY (questionId) REFERENCES custom_questions(id)
    );
`);

// Get all custom questions
app.get('/api/questions', (req, res) => {
    const questions = db.prepare('SELECT * FROM custom_questions WHERE isActive = 1 ORDER BY sortOrder, id').all();
    res.json(questions);
});

// Get all questions (including inactive) - admin
app.get('/api/questions/all', authMiddleware, adminMiddleware, (req, res) => {
    const questions = db.prepare('SELECT * FROM custom_questions ORDER BY sortOrder, id').all();
    res.json(questions);
});

// Create question
app.post('/api/questions', authMiddleware, adminMiddleware, (req, res) => {
    const { label, type, options, isRequired } = req.body;
    if (!label || !type) {
        return res.status(400).json({ error: 'กรุณาระบุคำถามและประเภท' });
    }
    const maxOrder = db.prepare('SELECT MAX(sortOrder) as max FROM custom_questions').get();
    const sortOrder = (maxOrder.max || 0) + 1;
    const optionsStr = options ? JSON.stringify(options) : null;
    const result = db.prepare('INSERT INTO custom_questions (label, type, options, isRequired, sortOrder) VALUES (?, ?, ?, ?, ?)')
        .run(label, type, optionsStr, isRequired ? 1 : 0, sortOrder);
    res.json({ message: 'เพิ่มคำถามสำเร็จ', id: result.lastInsertRowid });
});

// Update question
app.put('/api/questions/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { label, type, options, isRequired, isActive, sortOrder } = req.body;
    const optionsStr = options ? JSON.stringify(options) : null;
    db.prepare('UPDATE custom_questions SET label=?, type=?, options=?, isRequired=?, isActive=?, sortOrder=? WHERE id=?')
        .run(label, type, optionsStr, isRequired ? 1 : 0, isActive ? 1 : 0, sortOrder || 0, req.params.id);
    res.json({ message: 'อัปเดตคำถามสำเร็จ' });
});

// Delete question
app.delete('/api/questions/:id', authMiddleware, adminMiddleware, (req, res) => {
    db.prepare('UPDATE custom_questions SET isActive = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'ลบคำถามสำเร็จ' });
});

// Save custom answers with report
app.post('/api/reports/:id/answers', authMiddleware, (req, res) => {
    const { answers } = req.body; // [{questionId, answer}]
    if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
    }
    const stmt = db.prepare('INSERT OR REPLACE INTO custom_answers (reportId, questionId, answer) VALUES (?, ?, ?)');
    const insertMany = db.transaction((items) => {
        for (const item of items) {
            stmt.run(req.params.id, item.questionId, item.answer || '');
        }
    });
    insertMany(answers);
    res.json({ message: 'บันทึกคำตอบสำเร็จ' });
});

// Get custom answers for a report
app.get('/api/reports/:id/answers', authMiddleware, (req, res) => {
    const answers = db.prepare(`
        SELECT ca.*, cq.label, cq.type FROM custom_answers ca
        JOIN custom_questions cq ON ca.questionId = cq.id
        WHERE ca.reportId = ?
    `).all(req.params.id);
    res.json(answers);
});

// === Start Server ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    // Show network IP for sharing
    const os = require('os');
    const nets = os.networkInterfaces();
    Object.values(nets).forEach(interfaces => {
        interfaces.forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`Network access: http://${iface.address}:${PORT}`);
            }
        });
    });
    console.log(`\nAdmin: admin / admin123`);
});
