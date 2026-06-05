require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const { initDB, query, queryOne, insert, run } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'marketing-sc-secret-key-2024';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// === File Upload Config ===
let upload;

if (process.env.CLOUDINARY_CLOUD_NAME) {
    // Cloudinary upload (production)
    const cloudinary = require('cloudinary').v2;
    const { CloudinaryStorage } = require('multer-storage-cloudinary');
    console.log('Cloudinary config:', { cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY ? process.env.CLOUDINARY_API_KEY.substring(0,6) + '...' : 'MISSING' });
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    const storage = new CloudinaryStorage({
        cloudinary,
        params: { folder: 'marketing-sc', allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
    });
    upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    console.log('Upload: Cloudinary');
} else {
    // Local upload (development)
    if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads', { recursive: true });
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, './uploads'),
        filename: (req, file, cb) => {
            const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueName + path.extname(file.originalname));
        }
    });
    upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
    console.log('Upload: Local disk');
}

// === Auth Middleware ===
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
}

// Roles: admin > md > mgr > user
function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง (admin only)' });
    next();
}

function mdMiddleware(req, res, next) {
    if (!['admin', 'md'].includes(req.user.role)) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง (MD+ only)' });
    next();
}

function mgrMiddleware(req, res, next) {
    if (!['admin', 'md', 'mgr'].includes(req.user.role)) return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึง (MGR+ only)' });
    next();
}

// === AUTH ROUTES ===
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, fullName, role } = req.body;
        if (!username || !password || !fullName) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
        if (password.length < 4) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' });
        const existing = await queryOne('SELECT id FROM users WHERE username = $1', [username]);
        if (existing) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
        const hashedPw = bcrypt.hashSync(password, 10);
        const validRoles = ['user', 'mgr', 'md', 'admin'];
        const userRole = validRoles.includes(role) ? role : 'user';
        const user = await insert('INSERT INTO users (username, password, "fullName", role) VALUES ($1, $2, $3, $4)', [username, hashedPw, fullName, userRole]);
        res.json({ message: 'สร้างบัญชีสำเร็จ', userId: user.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
        const user = await queryOne('SELECT * FROM users WHERE username = $1', [username]);
        if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        const token = jwt.sign({ id: user.id, username: user.username, fullName: user.fullName, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'เข้าสู่ระบบสำเร็จ', token, user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await queryOne('SELECT id, username, "fullName", role, "createdAt" FROM users WHERE id = $1', [req.user.id]);
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
        if (newPassword.length < 4) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
        const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
        if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(401).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        const hashedPw = bcrypt.hashSync(newPassword, 10);
        await run('UPDATE users SET password = $1 WHERE id = $2', [hashedPw, req.user.id]);
        res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === USER ROUTES ===
app.get('/api/users', authMiddleware, mdMiddleware, async (req, res) => {
    try {
        const users = await query('SELECT id, username, "fullName", role, "createdAt" FROM users ORDER BY "createdAt" DESC');
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { username, fullName, role } = req.body;
        const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
        if (username && username !== user.username) {
            const existing = await queryOne('SELECT id FROM users WHERE username = $1 AND id != $2', [username, req.params.id]);
            if (existing) return res.status(400).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
        }
        await run('UPDATE users SET username = $1, "fullName" = $2, role = $3 WHERE id = $4', [username || user.username, fullName || user.fullName, role || user.role, req.params.id]);
        res.json({ message: 'อัปเดตผู้ใช้สำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
        const hashedPw = bcrypt.hashSync(newPassword, 10);
        await run('UPDATE users SET password = $1 WHERE id = $2', [hashedPw, req.params.id]);
        res.json({ message: 'รีเซ็ตรหัสผ่านสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' });
        await run('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ message: 'ลบผู้ใช้สำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === REPORT ROUTES ===
app.post('/api/reports', authMiddleware, (req, res, next) => {
    upload.fields([{ name: 'photo1', maxCount: 1 }, { name: 'photo2', maxCount: 1 }])(req, res, (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ error: 'อัปโหลดไฟล์ไม่สำเร็จ: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const b = req.body;
        // Get photo URL (Cloudinary returns path, local returns filename)
        const photo1 = req.files?.photo1?.[0]?.path || req.files?.photo1?.[0]?.filename || null;
        const photo2 = req.files?.photo2?.[0]?.path || req.files?.photo2?.[0]?.filename || null;

        console.log('Report submit by user:', req.user.id, '| Photos:', photo1 ? 'yes' : 'no', photo2 ? 'yes' : 'no');

        if (!b.officer || !b.workDate || !b.timeSlot || !b.companyName || !b.contactPerson || !b.summary || !b.province || !b.supervisor) {
            console.log('Missing fields:', { officer: !!b.officer, workDate: !!b.workDate, timeSlot: !!b.timeSlot, companyName: !!b.companyName, contactPerson: !!b.contactPerson, summary: !!b.summary, province: !!b.province, supervisor: !!b.supervisor });
            return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ' });
        }

        const objectives = Array.isArray(b.objective) ? b.objective.join(', ') : (b.objective || '');
        const products = Array.isArray(b.product) ? b.product.join(', ') : (b.product || '');
        const nextSteps = Array.isArray(b.nextStep) ? b.nextStep.join(', ') : (b.nextStep || '');
        const competitors = Array.isArray(b.competitor) ? b.competitor.join(', ') : (b.competitor || '');

        const result = await insert(`
            INSERT INTO reports ("userId", officer, "workDate", "timeSlot", "startTime", "endTime",
                objectives, "objectiveOther", "leadSource", "leadSourceOther",
                products, "productOther", "companyName", "contactPerson", summary,
                "nextSteps", "nextStepOther", "proposalDate", "meetingDate",
                "dealProbability", photo1, "photoDesc1", photo2, "photoDesc2",
                province, "provinceOther", "dealEstimate", "dealValue",
                "successRating", competitors, "competitorOther", supervisor)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
            [req.user.id, b.officer, b.workDate, b.timeSlot, b.startTime||null, b.endTime||null,
             objectives, b.objectiveOtherText||null, b.leadSource||null, b.leadSourceOtherText||null,
             products, b.productOtherText||null, b.companyName, b.contactPerson, b.summary,
             nextSteps, b.nextStepOtherText||null, b.proposalDate||null, b.meetingDate||null,
             b.dealProbability||null, photo1, b.photoDesc1||null, photo2, b.photoDesc2||null,
             b.province, b.provinceOtherText||null, b.dealEstimate||null, b.dealValue||null,
             b.successRating ? parseInt(b.successRating) : null, competitors, b.competitorOtherText||null, b.supervisor]
        );
        res.json({ message: 'บันทึกรายงานสำเร็จ', reportId: result.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports', authMiddleware, async (req, res) => {
    try {
        const { month, year, officer } = req.query;
        let where = 'WHERE 1=1';
        const params = [];
        let idx = 1;

        if (month && year) {
            const monthStr = String(month).padStart(2, '0');
            where += ` AND substring("workDate", 1, 7) = $${idx++}`;
            params.push(`${year}-${monthStr}`);
        } else if (year) {
            where += ` AND substring("workDate", 1, 4) = $${idx++}`;
            params.push(String(year));
        }
        if (officer) { where += ` AND officer = $${idx++}`; params.push(officer); }
        if (req.user.role === 'user') { where += ` AND "userId" = $${idx++}`; params.push(req.user.id); }

        const reports = await query(`SELECT * FROM reports ${where} ORDER BY "workDate" DESC, "createdAt" DESC`, params);
        res.json(reports);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/summary', authMiddleware, async (req, res) => {
    try {
        const { month, year } = req.query;
        let where = 'WHERE 1=1';
        const params = [];
        let idx = 1;

        if (month && year) {
            const monthStr = String(month).padStart(2, '0');
            where += ` AND substring("workDate", 1, 7) = $${idx++}`;
            params.push(`${year}-${monthStr}`);
        } else if (year) {
            where += ` AND substring("workDate", 1, 4) = $${idx++}`;
            params.push(String(year));
        }
        if (req.user.role === 'user') { where += ` AND "userId" = $${idx++}`; params.push(req.user.id); }

        const summary = await queryOne(`
            SELECT COUNT(*) as "totalReports", COUNT(DISTINCT "companyName") as "totalCompanies",
                COUNT(DISTINCT "workDate") as "totalDays", AVG("successRating") as "avgRating",
                COUNT(CASE WHEN "dealProbability" LIKE '%สูง%' THEN 1 END) as "hotProspects",
                COUNT(CASE WHEN "dealProbability" LIKE '%ปานกลาง%' THEN 1 END) as "warmProspects",
                COUNT(CASE WHEN "dealProbability" LIKE '%ระยะยาว%' THEN 1 END) as "coldProspects"
            FROM reports ${where}`, params);

        const byOfficer = await query(`SELECT officer, COUNT(*) as count FROM reports ${where} GROUP BY officer ORDER BY count DESC`, params);
        const byProvince = await query(`SELECT province, COUNT(*) as count FROM reports ${where} GROUP BY province ORDER BY count DESC`, params);

        res.json({ summary, byOfficer, byProvince });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/export/excel', authMiddleware, async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { month, year, officer } = req.query;
        let where = 'WHERE 1=1';
        const params = [];
        let idx = 1;

        if (month && year) { where += ` AND substring("workDate", 1, 7) = $${idx++}`; params.push(`${year}-${String(month).padStart(2, '0')}`); }
        else if (year) { where += ` AND substring("workDate", 1, 4) = $${idx++}`; params.push(String(year)); }
        if (officer) { where += ` AND officer = $${idx++}`; params.push(officer); }
        if (req.user.role === 'user') { where += ` AND "userId" = $${idx++}`; params.push(req.user.id); }

        const reports = await query(`SELECT * FROM reports ${where} ORDER BY "workDate" DESC`, params);
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('รายงานปฏิบัติงาน');

        const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6C63FF' } }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } };

        sheet.columns = [
            { header: 'ลำดับ', key: 'no', width: 6 }, { header: 'วันที่', key: 'workDate', width: 12 },
            { header: 'เจ้าหน้าที่', key: 'officer', width: 22 }, { header: 'ช่วงเวลา', key: 'timeSlot', width: 14 },
            { header: 'วัตถุประสงค์', key: 'objectives', width: 30 }, { header: 'แหล่งที่มา', key: 'leadSource', width: 16 },
            { header: 'ผลิตภัณฑ์', key: 'products', width: 20 }, { header: 'บริษัท', key: 'companyName', width: 25 },
            { header: 'ผู้ติดต่อ', key: 'contactPerson', width: 20 }, { header: 'สรุปผล', key: 'summary', width: 40 },
            { header: 'Next Step', key: 'nextSteps', width: 20 }, { header: 'ระดับดีล', key: 'dealProbability', width: 16 },
            { header: 'มูลค่าดีล', key: 'dealValue', width: 14 }, { header: 'คะแนน', key: 'successRating', width: 8 },
            { header: 'คู่แข่ง', key: 'competitors', width: 18 }, { header: 'พื้นที่', key: 'province', width: 14 },
            { header: 'ผู้ตรวจสอบ', key: 'supervisor', width: 22 }, { header: 'ภาพ 1 (URL)', key: 'photo1url', width: 30 },
            { header: 'ภาพ 2 (URL)', key: 'photo2url', width: 30 }, { header: 'วันที่บันทึก', key: 'createdAt', width: 18 }
        ];
        sheet.getRow(1).eachCell(cell => { cell.style = headerStyle; });

        reports.forEach((r, i) => {
            const row = sheet.addRow({ no: i+1, workDate: r.workDate, officer: r.officer, timeSlot: r.timeSlot, objectives: r.objectives, leadSource: r.leadSource||'', products: r.products||'', companyName: r.companyName, contactPerson: r.contactPerson, summary: r.summary, nextSteps: r.nextSteps||'', dealProbability: r.dealProbability||'', dealValue: r.dealValue||'', successRating: r.successRating||'', competitors: r.competitors||'', province: r.province, supervisor: r.supervisor, photo1url: r.photo1||'-', photo2url: r.photo2||'-', createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString('th-TH') : '' });
            row.eachCell(cell => { cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; cell.alignment = { vertical: 'top', wrapText: true }; });
        });

        const monthNames = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
        const filename = `report_${year||'all'}${month ? '_'+monthNames[parseInt(month)] : ''}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/:id', authMiddleware, async (req, res) => {
    try {
        const report = await queryOne('SELECT * FROM reports WHERE id = $1', [req.params.id]);
        if (!report) return res.status(404).json({ error: 'ไม่พบรายงาน' });
        if (req.user.role === 'user' && report.userId !== req.user.id) return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
        res.json(report);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reports/:id', authMiddleware, mdMiddleware, async (req, res) => {
    try { await run('DELETE FROM reports WHERE id = $1', [req.params.id]); res.json({ message: 'ลบรายงานสำเร็จ' }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

// === CUSTOM QUESTIONS ===
app.get('/api/questions', async (req, res) => {
    try { res.json(await query('SELECT * FROM custom_questions WHERE "isActive" = 1 ORDER BY "sortOrder", id')); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/questions/all', authMiddleware, adminMiddleware, async (req, res) => {
    try { res.json(await query('SELECT * FROM custom_questions ORDER BY "sortOrder", id')); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/questions', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { label, type, options, isRequired } = req.body;
        if (!label || !type) return res.status(400).json({ error: 'กรุณาระบุคำถามและประเภท' });
        const maxOrder = await queryOne('SELECT COALESCE(MAX("sortOrder"), 0) as max FROM custom_questions');
        const sortOrder = (maxOrder.max || 0) + 1;
        const optionsStr = options ? JSON.stringify(options) : null;
        const result = await insert('INSERT INTO custom_questions (label, type, options, "isRequired", "sortOrder") VALUES ($1, $2, $3, $4, $5)', [label, type, optionsStr, isRequired ? 1 : 0, sortOrder]);
        res.json({ message: 'เพิ่มคำถามสำเร็จ', id: result.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/questions/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { label, type, options, isRequired, isActive, sortOrder } = req.body;
        const optionsStr = options ? JSON.stringify(options) : null;
        await run('UPDATE custom_questions SET label=$1, type=$2, options=$3, "isRequired"=$4, "isActive"=$5, "sortOrder"=$6 WHERE id=$7', [label, type, optionsStr, isRequired?1:0, isActive?1:0, sortOrder||0, req.params.id]);
        res.json({ message: 'อัปเดตคำถามสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/questions/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { await run('UPDATE custom_questions SET "isActive" = 0 WHERE id = $1', [req.params.id]); res.json({ message: 'ลบคำถามสำเร็จ' }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reports/:id/answers', authMiddleware, async (req, res) => {
    try {
        const { answers } = req.body;
        if (!answers || !Array.isArray(answers)) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง' });
        for (const item of answers) {
            await run('INSERT INTO custom_answers ("reportId", "questionId", answer) VALUES ($1, $2, $3)', [req.params.id, item.questionId, item.answer || '']);
        }
        res.json({ message: 'บันทึกคำตอบสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/:id/answers', authMiddleware, async (req, res) => {
    try {
        const answers = await query('SELECT ca.*, cq.label, cq.type FROM custom_answers ca JOIN custom_questions cq ON ca."questionId" = cq.id WHERE ca."reportId" = $1', [req.params.id]);
        res.json(answers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === APPROVAL ROUTES ===
// MGR approves report (pending -> mgr_approved)
app.put('/api/reports/:id/approve-mgr', authMiddleware, mgrMiddleware, async (req, res) => {
    try {
        const { comment } = req.body;
        await run('UPDATE reports SET status = $1, "approvedByMgr" = $2, "mgrComment" = $3 WHERE id = $4',
            ['mgr_approved', req.user.fullName, comment || null, req.params.id]);
        res.json({ message: 'MGR อนุมัติสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// MD approves report (mgr_approved -> approved)
app.put('/api/reports/:id/approve-md', authMiddleware, mdMiddleware, async (req, res) => {
    try {
        const { comment } = req.body;
        await run('UPDATE reports SET status = $1, "approvedByMd" = $2, "mdComment" = $3 WHERE id = $4',
            ['approved', req.user.fullName, comment || null, req.params.id]);
        res.json({ message: 'MD อนุมัติสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reject report (any approver)
app.put('/api/reports/:id/reject', authMiddleware, mgrMiddleware, async (req, res) => {
    try {
        const { comment } = req.body;
        const field = ['md', 'admin'].includes(req.user.role) ? '"mdComment"' : '"mgrComment"';
        await run(`UPDATE reports SET status = 'rejected', ${field} = $1 WHERE id = $2`, [comment || 'ไม่อนุมัติ', req.params.id]);
        res.json({ message: 'ปฏิเสธรายงานแล้ว' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === FORM OPTIONS (editable main questions) ===
app.get('/api/form-options', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM form_options ORDER BY id');
        const result = {};
        rows.forEach(r => { result[r.field_key] = { label: r.field_label, options: JSON.parse(r.options) }; });
        res.json(result);
    } catch (e) { res.json({}); }
});

app.put('/api/form-options/:key', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { label, options } = req.body;
        if (!options || !Array.isArray(options)) return res.status(400).json({ error: 'กรุณาระบุตัวเลือก' });
        const existing = await queryOne('SELECT id FROM form_options WHERE field_key = $1', [req.params.key]);
        if (existing) {
            await run('UPDATE form_options SET field_label = $1, options = $2 WHERE field_key = $3', [label, JSON.stringify(options), req.params.key]);
        } else {
            await insert('INSERT INTO form_options (field_key, field_label, options) VALUES ($1, $2, $3)', [req.params.key, label, JSON.stringify(options)]);
        }
        res.json({ message: 'บันทึกสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === USER FORM CONFIG (admin controls which fields each user sees) ===
app.get('/api/user-form-config/:userId', authMiddleware, async (req, res) => {
    try {
        const config = await queryOne('SELECT * FROM user_form_config WHERE "userId" = $1', [req.params.userId]);
        res.json(config ? { hiddenFields: JSON.parse(config.hidden_fields), customOptions: JSON.parse(config.custom_options || '{}'), customLabels: JSON.parse(config.custom_labels || '{}') } : { hiddenFields: [], customOptions: {}, customLabels: {} });
    } catch (e) { res.json({ hiddenFields: [], customOptions: {}, customLabels: {} }); }
});

app.get('/api/user-form-config', authMiddleware, async (req, res) => {
    try {
        const config = await queryOne('SELECT * FROM user_form_config WHERE "userId" = $1', [req.user.id]);
        res.json(config ? { hiddenFields: JSON.parse(config.hidden_fields), customOptions: JSON.parse(config.custom_options || '{}'), customLabels: JSON.parse(config.custom_labels || '{}') } : { hiddenFields: [], customOptions: {}, customLabels: {} });
    } catch (e) { res.json({ hiddenFields: [], customOptions: {}, customLabels: {} }); }
});

app.put('/api/user-form-config/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { hiddenFields, customOptions, customLabels } = req.body;
        const hf = JSON.stringify(hiddenFields || []);
        const co = JSON.stringify(customOptions || {});
        const cl = JSON.stringify(customLabels || {});
        const existing = await queryOne('SELECT id FROM user_form_config WHERE "userId" = $1', [req.params.userId]);
        if (existing) {
            await run('UPDATE user_form_config SET hidden_fields = $1, custom_options = $2, custom_labels = $3 WHERE "userId" = $4', [hf, co, cl, req.params.userId]);
        } else {
            await insert('INSERT INTO user_form_config ("userId", hidden_fields, custom_options, custom_labels) VALUES ($1, $2, $3, $4)', [req.params.userId, hf, co, cl]);
        }
        res.json({ message: 'บันทึกการตั้งค่าฟอร์มสำเร็จ' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// === START SERVER ===
async function start() {
    await initDB();
    // Create default admin
    const admin = await queryOne('SELECT id FROM users WHERE username = $1', ['admin']);
    if (!admin) {
        const hashedPw = bcrypt.hashSync('admin123', 10);
        await insert('INSERT INTO users (username, password, "fullName", role) VALUES ($1, $2, $3, $4)', ['admin', hashedPw, 'ผู้ดูแลระบบ', 'admin']);
        console.log('Default admin created: admin / admin123');
    }
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${PORT}`);
        const os = require('os');
        Object.values(os.networkInterfaces()).forEach(interfaces => {
            interfaces.forEach(iface => {
                if (iface.family === 'IPv4' && !iface.internal) console.log(`Network: http://${iface.address}:${PORT}`);
            });
        });
    });
}
start().catch(e => { console.error('Failed to start:', e); process.exit(1); });

