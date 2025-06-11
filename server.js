// 引入必要的模块
const express = require('express');
const path = require('path');
const fs = require('fs').promises; // 使用 promise 版本的 fs
const crypto = require('crypto'); // 用于生成唯一ID

// --- 数据文件路径 ---
const dataFilePath = path.join(__dirname, 'data.csv');
const prizesFilePath = path.join(__dirname, 'prizes.json');
const recordsFilePath = path.join(__dirname, 'lottery_records.json');

// --- 初始化应用和端口 ---
const app = express();
const PORT = 3000;

// --- 全局变量，用于在内存中存储数据 ---
let prizes = [];
let lotteryRecords = new Set(); // 使用 Set 以获得更快的查找性能

// --- 数据文件读写辅助函数 ---

const readJsonFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // 如果文件不存在或为空，则返回一个合理的默认值
        if (error.code === 'ENOENT' || error instanceof SyntaxError) {
            console.log(`Warning: Could not read or parse ${filePath}. Returning empty array.`);
            return [];
        }
        throw error; // 其他错误则抛出
    }
};

const writeJsonFile = async (filePath, data) => {
    // 使用 null, 2 来格式化JSON，使其更易读
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};


// --- 数据加载函数 ---
async function loadData() {
    // 1. 加载奖品信息
    try {
        prizes = await readJsonFile(prizesFilePath);
        // 确保每个奖品都有一个唯一的ID
        prizes.forEach(p => {
            if (!p.id) {
                p.id = crypto.randomBytes(8).toString('hex');
            }
        });
        await writeJsonFile(prizesFilePath, prizes); // 保存可能新增的ID
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
        // 如果加载失败，可以创建一个空文件以避免后续错误
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


// --- 路由定义 (前端用户接口) ---

// 根路由，提供问卷页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 问卷提交接口
app.post('/submit', async (req, res) => {
    const { name, department, position, organization, phone, email } = req.body;
    // 防止CSV注入，并确保所有字段都是字符串
    const sanitize = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
    const newRecord = [sanitize(name), sanitize(department), sanitize(position), sanitize(organization), sanitize(phone), sanitize(email)].join(',') + '\n';

    try {
        await fs.appendFile(dataFilePath, newRecord, 'utf8');
        console.log('成功接收并保存一条新数据:', req.body);
        res.status(200).json({ success: true, message: '信息提交成功！即将进入抽奖环节。' });
    } catch (err) {
        console.error('文件写入失败:', err);
        res.status(500).json({ success: false, message: '数据保存失败，请联系管理员！' });
    }
});

// 抽奖接口
app.post('/draw', async (req, res) => {
    const { phone } = req.body;

    // 1. 检查
    if (!phone) {
        return res.status(400).json({ success: false, message: '抱歉，您似乎未提供手机号码。' });
    }
    if (lotteryRecords.has(phone)) {
        return res.status(403).json({ success: false, message: '啊哦，您似乎已参与过抽奖，感谢您的参与！(如您未参与过抽奖，请检查您填写的数据或联系工作人员)' });
    }

    // 2. 抽奖算法
    const availablePrizes = prizes.filter(p => p.quantity > 0 || p.quantity === -1);
    if (availablePrizes.length === 0) {
        return res.status(500).json({ success: false, message: '抱歉，所有奖品已被抽完！' });
    }

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

    // 3. 更新数据并保存
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
        res.status(500).json({ success: false, message: '服务器内部错误，无法保存抽奖结果。' });
    }
});


// --- 新增：后台管理路由 ---

// 后台管理页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// API: 获取所有奖品
app.get('/api/prizes', (req, res) => {
    res.json({ success: true, prizes });
});

// API: 添加新奖品
app.post('/api/prizes', async (req, res) => {
    const { name, quantity, probability } = req.body;
    if (!name || quantity == null || probability == null) {
        return res.status(400).json({ success: false, message: '缺少必要的奖品信息。' });
    }
    const newPrize = {
        id: crypto.randomBytes(8).toString('hex'), // 生成唯一ID
        name,
        quantity: parseInt(quantity, 10),
        probability: parseFloat(probability)
    };
    prizes.push(newPrize);
    await writeJsonFile(prizesFilePath, prizes);
    res.status(201).json({ success: true, message: '奖品添加成功！', prize: newPrize });
});

// API: 更新奖品
app.put('/api/prizes/:id', async (req, res) => {
    const { id } = req.params;
    const { name, quantity, probability } = req.body;
    const prizeIndex = prizes.findIndex(p => p.id === id);

    if (prizeIndex === -1) {
        return res.status(404).json({ success: false, message: '未找到指定ID的奖品。' });
    }

    prizes[prizeIndex] = { ...prizes[prizeIndex], name, quantity, probability };
    await writeJsonFile(prizesFilePath, prizes);
    res.json({ success: true, message: '奖品更新成功！' });
});

// API: 删除奖品
app.delete('/api/prizes/:id', async (req, res) => {
    const { id } = req.params;
    const initialLength = prizes.length;
    prizes = prizes.filter(p => p.id !== id);

    if (prizes.length === initialLength) {
        return res.status(404).json({ success: false, message: '未找到指定ID的奖品。' });
    }

    await writeJsonFile(prizesFilePath, prizes);
    res.json({ success: true, message: '奖品删除成功！' });
});


// API: 获取中奖记录
app.get('/api/records', (req, res) => {
    res.json({ success: true, records: Array.from(lotteryRecords) });
});

// API: 删除单条中奖记录
app.post('/api/records/delete', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: '未提供手机号。' });
    }
    if (!lotteryRecords.has(phone)) {
        return res.status(404).json({ success: false, message: '未找到该手机号的抽奖记录。' });
    }

    lotteryRecords.delete(phone);
    await writeJsonFile(recordsFilePath, Array.from(lotteryRecords));
    res.json({ success: true, message: `手机号 ${phone} 的记录已删除。` });
});

// API: 获取问卷数据
app.get('/api/questionnaire', async (req, res) => {
    try {
        const fileContent = await fs.readFile(dataFilePath, 'utf8');
        const lines = fileContent.trim().split('\n');
        if (lines.length < 2) {
            return res.json({ success: true, headers: [], data: [] });
        }

        // 解析CSV头部，去除引号
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = lines.slice(1).map(line => {
            // 简单的CSV行解析，不能处理带逗号的字段值
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const rowObject = {};
            headers.forEach((header, index) => {
                rowObject[header] = values[index];
            });
            return rowObject;
        });
        res.json({ success: true, headers, data });

    } catch (error) {
        console.error("读取问卷数据失败:", error);
        res.status(500).json({ success: false, message: "无法读取问卷数据文件。" });
    }
});


// --- 启动服务器 ---
app.listen(PORT, async () => {
    await loadData(); // 服务器启动时加载所有数据
    console.log(`服务器已启动，正在监听 ${PORT} 端口...`);
    console.log(`前端用户访问: http://localhost:${PORT}`);
    console.log(`后台管理访问: http://localhost:${PORT}/admin`);
});
