// 引入必要的模块
const express = require('express');
const path = require('path');
const fs = require('fs');

// --- 数据文件路径 ---
const dataFilePath = path.join(__dirname, 'data.csv');
const prizesFilePath = path.join(__dirname, 'prizes.json');
const recordsFilePath = path.join(__dirname, 'lottery_records.json');

// --- 初始化应用和端口 ---
const app = express();
const PORT = 3000;

// --- 全局变量，用于在内存中存储数据 ---
let prizes = [];
let lotteryRecords = new Set(); // 使用 Set 结构以获得更快的查找性能

// --- 数据加载函数 ---
function loadData() {
    // 1. 加载奖品信息
    try {
        if (fs.existsSync(prizesFilePath)) {
            const prizesData = fs.readFileSync(prizesFilePath, 'utf8');
            prizes = JSON.parse(prizesData);
            console.log('奖品信息加载成功。');
        } else {
            console.error('错误：prizes.json 文件未找到！请创建该文件。');
            process.exit(1); // 退出程序
        }
    } catch (err) {
        console.error('加载 prizes.json 失败:', err);
        process.exit(1);
    }

    // 2. 加载已抽奖记录
    try {
        if (fs.existsSync(recordsFilePath)) {
            const recordsData = fs.readFileSync(recordsFilePath, 'utf8');
            lotteryRecords = new Set(JSON.parse(recordsData));
            console.log(`已加载 ${lotteryRecords.size} 条抽奖记录。`);
        } else {
            fs.writeFileSync(recordsFilePath, '[]', 'utf8'); // 如果文件不存在，则创建
            console.log('抽奖记录文件已创建。');
        }
    } catch (err) {
        console.error('加载 lottery_records.json 失败:', err);
    }

    // 3. 检查问卷数据文件
    const csvHeader = '"姓名","科室","职务/职位","单位","电话号码","电子邮件"\n';
    if (!fs.existsSync(dataFilePath)) {
        fs.writeFileSync(dataFilePath, csvHeader, 'utf8');
    }
}


// --- 中间件 ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));


// --- 路由定义 ---

// 根路由，提供问卷页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 问卷提交接口
app.post('/submit', (req, res) => {
    const { name, department, position, organization, phone, email } = req.body;
    const sanitize = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
    const newRecord = [sanitize(name), sanitize(department), sanitize(position), sanitize(organization), sanitize(phone), sanitize(email)].join(',') + '\n';

    fs.appendFile(dataFilePath, newRecord, 'utf8', (err) => {
        if (err) {
            console.error('文件写入失败:', err);
            return res.status(500).json({ success: false, message: '数据保存失败，请联系管理员！' });
        }
        console.log('成功接收并保存一条新数据:', req.body);
        res.status(200).json({ success: true, message: '信息提交成功！即将进入抽奖环节。' });
    });
});

// 抽奖接口
app.post('/draw', (req, res) => {
    const { phone } = req.body;

    // 1. 检查手机号是否已抽过奖
    if (!phone) {
        return res.status(400).json({ success: false, message: '未提供手机号码。' });
    }
    if (lotteryRecords.has(phone)) {
        return res.status(403).json({ success: false, message: '此手机号已参与过抽奖，感谢您的参与！' });
    }

    // 2. 执行抽奖算法
    // 过滤掉库存为0的奖品
    const availablePrizes = prizes.filter(p => p.quantity > 0 || p.quantity === -1);
    if (availablePrizes.length === 0) {
        return res.status(500).json({ success: false, message: '抱歉，所有奖品已被抽完！' });
    }

    // 重新计算可用奖品的总概率
    const totalProbability = availablePrizes.reduce((sum, p) => sum + p.probability, 0);
    const random = Math.random() * totalProbability;

    let cumulativeProbability = 0;
    let wonPrize = availablePrizes[availablePrizes.length - 1]; // 默认中最后一个（通常是谢谢参与）

    for (const prize of availablePrizes) {
        cumulativeProbability += prize.probability;
        if (random < cumulativeProbability) {
            wonPrize = prize;
            break;
        }
    }

    // 3. 更新数据并保存
    // 注意：这里的操作不是原子性的，在高并发下可能存在问题，但对于中小规模活动足够。
    if (wonPrize.quantity !== -1) { // 如果不是无限量奖品
        const prizeIndex = prizes.findIndex(p => p.id === wonPrize.id);
        if (prizeIndex !== -1) {
            prizes[prizeIndex].quantity--;
            // 将更新后的奖品库存写回文件
            fs.writeFileSync(prizesFilePath, JSON.stringify(prizes, null, 2), 'utf8');
        }
    }

    // 记录手机号
    lotteryRecords.add(phone);
    fs.writeFileSync(recordsFilePath, JSON.stringify(Array.from(lotteryRecords)), 'utf8');

    console.log(`手机号 ${phone} 抽中了: ${wonPrize.name}`);

    // 4. 返回抽奖结果
    res.json({ success: true, prize: wonPrize.name });
});


// --- 启动服务器 ---
app.listen(PORT, () => {
    loadData(); // 服务器启动时加载所有数据
    console.log(`服务器已启动，正在监听 ${PORT} 端口...`);
    console.log(`请在浏览器中打开 http://localhost:${PORT}`);
});
