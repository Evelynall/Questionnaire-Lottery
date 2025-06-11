// 引入必要的模块
const express = require('express');
const path = require('path');
const fs = require('fs').promises; // 使用 promise 版本的 fs
const crypto = require('crypto'); // 用于生成唯一ID
const session = require('express-session'); // 引入 session 中间件

// --- 配置 ---
const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = 'jn123'; // 设置后台访问密码

// --- 数据文件路径 ---
const dataFilePath = path.join(__dirname, 'data.csv');
const prizesFilePath = path.join(__dirname, 'prizes.json');
const recordsFilePath = path.join(__dirname, 'lottery_records.json');

// --- 全局变量，用于在内存中存储数据 ---
let prizes = [];
let lotteryRecords = new Set(); // 使用 Set 以获得更快的查找性能

// --- 数据文件读写辅助函数 ---
const readJsonFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) {
            console.log(`Warning: Could not read or parse ${filePath}. Returning empty array.`);
            return [];
        }
        throw error;
    }
};

const writeJsonFile = async (filePath, data) => {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// --- 数据加载函数 ---
async function loadData() {
    // 1. 加载奖品信息
    try {
        prizes = await readJsonFile(prizesFilePath);
        prizes.forEach(p => {
            if (!p.id) p.id = crypto.randomBytes(8).toString('hex');
        });
        await writeJsonFile(prizesFilePath, prizes);
        console.log('奖品信息加载成功。');
    } catch (err) {
        console.error('加载 prizes.json 失败:', err);
        process.exit(1);
    }

    // 2. 加载已抽奖记录
    try {
        const recordsArray = await readJsonFile(recordsFilePath);
        lotteryRecords = new Set(recordsArray);
        console.log(`已加载 ${lotteryRecords.size} 条抽奖记录。`);
    } catch (err) {
        console.error('加载 lottery_records.json 失败:', err);
        await writeJsonFile(recordsFilePath, []);
    }

    // 3. 检查问卷数据文件
    const csvHeader = '"姓名","科室","职务/职位","单位","电话号码","电子邮件"\n';
    try {
        await fs.access(dataFilePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(dataFilePath, csvHeader, 'utf8');
            console.log('问卷数据文件 data.csv 已创建。');
        }
    }
}

// --- 中间件 ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Session 中间件配置
app.use(session({
    secret: crypto.randomBytes(16).toString('hex'), // 随机生成密钥
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // 如果使用 HTTPS, 设置为 true
}));

// --- 认证中间件 ---
const authMiddleware = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    res.status(401).json({ success: false, message: 'Unauthorized: Access is denied.' });
};


// --- 路由定义 (公共接口) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/submit', async (req, res) => {
    const { name, department, position, organization, phone, email } = req.body;
    const sanitize = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
    const newRecord = [sanitize(name), sanitize(department), sanitize(position), sanitize(organization), sanitize(phone), sanitize(email)].join(',') + '\n';
    try {
        await fs.appendFile(dataFilePath, newRecord, 'utf8');
        console.log('成功接收并保存一条新数据:', req.body);
        res.status(200).json({ success: true, message: '信息提交成功！' });
    } catch (err) {
        console.error('文件写入失败:', err);
        res.status(500).json({ success: false, message: '数据保存失败，请联系管理员！' });
    }
});

app.post('/draw', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: '抱歉，您似乎未提供手机号码。' });
    }
    if (lotteryRecords.has(phone)) {
        return res.status(403).json({ success: false, message: '啊哦，您似乎已参与过抽奖，感谢您的参与！' });
    }

    const availablePrizes = prizes.filter(p => p.quantity > 0 || p.quantity === -1);
    if (availablePrizes.length === 0) {
        return res.status(500).json({ success: false, message: '抱歉，所有奖品已被抽完！' });
    }
    
    // ... (抽奖逻辑保持不变)
    const totalProbability = availablePrizes.reduce((sum, p) => sum + p.probability, 0);
    const random = Math.random() * totalProbability;
    let cumulativeProbability = 0;
    let wonPrize = availablePrizes[availablePrizes.length - 1];
    for (const prize of availablePrizes) {
        cumulativeProbability += prize.probability;
        if (random < cumulativeProbability) {
            wonPrize = prize;
            break;
        }
    }

    try {
        if (wonPrize.quantity !== -1) {
            const prizeIndex = prizes.findIndex(p => p.id === wonPrize.id);
            if (prizeIndex !== -1) {
                prizes[prizeIndex].quantity--;
                await writeJsonFile(prizesFilePath, prizes);
            }
        }
        lotteryRecords.add(phone);
        await writeJsonFile(recordsFilePath, Array.from(lotteryRecords));
        console.log(`手机号 ${phone} 抽中了: ${wonPrize.name}`);
        res.json({ success: true, prize: wonPrize.name });
    } catch (error) {
        console.error('更新抽奖数据时出错:', error);
        res.status(500).json({ success: false, message: '服务器内部错误。' });
    }
});


// --- 后台管理路由 ---

// 1. 提供后台管理页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 2. 登录接口
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        res.json({ success: true });
    } else {
        req.session.isAuthenticated = false;
        res.status(401).json({ success: false, message: '密码错误' });
    }
});

// 3. 登出接口
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: '登出失败' });
        }
        res.clearCookie('connect.sid'); // 清除 session cookie
        res.json({ success: true, message: '已成功登出' });
    });
});


// 4. 检查认证状态接口
app.get('/api/auth/check', (req, res) => {
    res.json({ isAuthenticated: !!req.session.isAuthenticated });
});


// --- 受保护的后台 API ---
// 所有 /api/ 路由都需要通过认证中间件
app.get('/api/prizes', authMiddleware, (req, res) => res.json({ success: true, prizes }));
app.get('/api/records', authMiddleware, (req, res) => res.json({ success: true, records: Array.from(lotteryRecords) }));

app.post('/api/prizes', authMiddleware, async (req, res) => {
    const { name, quantity, probability } = req.body;
    if (!name || quantity == null || probability == null) {
        return res.status(400).json({ success: false, message: '缺少必要的奖品信息。' });
    }
    const newPrize = {
        id: crypto.randomBytes(8).toString('hex'),
        name,
        quantity: parseInt(quantity, 10),
        probability: parseFloat(probability)
    };
    prizes.push(newPrize);
    await writeJsonFile(prizesFilePath, prizes);
    res.status(201).json({ success: true, message: '奖品添加成功！', prize: newPrize });
});

app.put('/api/prizes/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { name, quantity, probability } = req.body;
    const prizeIndex = prizes.findIndex(p => p.id === id);
    if (prizeIndex === -1) {
        return res.status(404).json({ success: false, message: '未找到奖品。' });
    }
    prizes[prizeIndex] = { ...prizes[prizeIndex], name, quantity: parseInt(quantity, 10), probability: parseFloat(probability) };
    await writeJsonFile(prizesFilePath, prizes);
    res.json({ success: true, message: '奖品更新成功！' });
});

app.delete('/api/prizes/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const initialLength = prizes.length;
    prizes = prizes.filter(p => p.id !== id);
    if (prizes.length === initialLength) {
        return res.status(404).json({ success: false, message: '未找到奖品。' });
    }
    await writeJsonFile(prizesFilePath, prizes);
    res.json({ success: true, message: '奖品删除成功！' });
});

app.post('/api/records/delete', authMiddleware, async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: '未提供手机号。' });
    }
    if (!lotteryRecords.has(phone)) {
        return res.status(404).json({ success: false, message: '未找到该记录。' });
    }
    lotteryRecords.delete(phone);
    await writeJsonFile(recordsFilePath, Array.from(lotteryRecords));
    res.json({ success: true, message: `记录 ${phone} 已删除。` });
});

app.get('/api/questionnaire', authMiddleware, async (req, res) => {
    try {
        const fileContent = await fs.readFile(dataFilePath, 'utf8');
        const lines = fileContent.trim().split('\n');
        if (lines.length < 2) {
            return res.json({ success: true, headers: [], data: [] });
        }
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = lines.slice(1).map(line => {
            // 注意: 这个简单的解析器可能无法处理字段值中包含逗号的情况
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index];
                return obj;
            }, {});
        });
        res.json({ success: true, headers, data });
    } catch (error) {
        console.error("读取问卷数据失败:", error);
        res.status(500).json({ success: false, message: "无法读取问卷数据文件。" });
    }
});


// --- 启动服务器 ---
app.listen(PORT, async () => {
    await loadData();
    console.log(`服务器已启动，正在监听 ${PORT} 端口...`);
    console.log(`前端用户访问: http://localhost:${PORT}`);
    console.log(`后台管理访问: http://localhost:${PORT}/admin`);
});
