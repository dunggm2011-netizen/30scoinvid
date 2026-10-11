// ============================================================================
// COINVID RG30S - HISTORY API
// Poll endpoint /game/info/simple mỗi 5s
// Lưu lịch sử phiên + expose API riêng
// ============================================================================

const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// CẤU HÌNH
// ============================================================================
const COINVID_URL = "https://m.coinvid.com/api/rocket-api/game/info/simple?gameName=RG30S";
const COINVID_TOKEN = process.env.COINVID_TOKEN || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJpc3N1c2VyIiwiYXVkIjoiYXVkaWVuY2UiLCJ0ZW5hbnRfaWQiOiI2NzczNDMiLCJ1c2VyX25hbWUiOiJkdXluZWsxMTkiLCJ0b2tlbl90eXBlIjoiYWNjZXNzX3Rva2VuIiwicm9sZV9uYW1lIjoiIiwidXNlcl90eXBlIjoicm9ja2V0IiwidXNlcl9pZCI6IjE4Nzk3MTU1NjUyMDE0MjQzODYiLCJkZXRhaWwiOnsiYXZhdGFyIjoiMjYiLCJ2aXBMZXZlbCI6Mn0sImFjY291bnQiOiJkdXluZWsxMTkiLCJjbGllbnRfaWQiOiJyb2NrZXRfd2ViIiwiZXhwIjoxNzkyMzA5MTUyLCJuYmYiOjE3OTE3MDQzNTJ9.VyEleyKZ6fq1jqFYkaV7MCmsGTVqL1mMbu0H0SE1M5twhsl8-pnPT1RqPb5dhGhkjzDwXSwdGd-SWGKtW98unw";
const COINVID_BASIC = "cm9ja2V0X3dlYjpyb2NrZXRfd2Vi"; // rocket_web:rocket_web
const FETCH_INTERVAL = 5000;   // 5s
const MAX_HISTORY = 1000;      // Lưu tối đa 1000 phiên
const HISTORY_FILE = path.join(__dirname, "history.json");

// ============================================================================
// STATE
// ============================================================================
let history = [];              // Danh sách phiên (mới nhất ở đầu)
let lastIssueId = null;        // ID phiên cuối cùng đã lưu
let lastUpdate = null;         // Thời gian cập nhật cuối
let fetchCount = 0;            // Số lần fetch
let errorCount = 0;            // Số lỗi

// ============================================================================
// LOAD/SAVE FILE
// ============================================================================
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
            history = data.history || [];
            lastIssueId = data.lastIssueId || null;
            console.log(`[Load] Đã load ${history.length} phiên từ file`);
        }
    } catch (e) {
        console.error("[Load] Lỗi:", e.message);
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify({
            history,
            lastIssueId,
            savedAt: new Date().toISOString()
        }, null, 2));
    } catch (e) {
        console.error("[Save] Lỗi:", e.message);
    }
}

// ============================================================================
// FETCH API
// ============================================================================
async function fetchCoinvid() {
    try {
        const res = await fetch(COINVID_URL, {
            headers: {
                "Blade-Auth": COINVID_TOKEN,
                "Authorization": `Basic ${COINVID_BASIC}`,
                "user_type": "rocket",
                "Accept-Language": "vi",
                "Content-Type": "application/json"
            },
            timeout: 10000
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.msg || "API returned error");
        }

        return data.data;
    } catch (e) {
        errorCount++;
        console.error(`[Fetch] Lỗi: ${e.message}`);
        return null;
    }
}

// ============================================================================
// PARSE RESPONSE
// ============================================================================
function parseResult(data) {
    if (!data || !data.lastIssue || !data.lastIssue.resultVal) return null;

    const last = data.lastIssue;
    const resultVal = last.resultVal;
    const value = resultVal.value;              // "5"
    const formatValue = resultVal.formatValue;  // ",5_1,2_1,,,,,,10_5,,,,,"
    const simpleList = resultVal.simpleResultFormatList || [];

    // Parse kết quả từ simpleResultFormatList
    const options = simpleList.map(item => ({
        val: item.optionVal[0],        // "5_1"
        name: item.optionI18n[0],      // "Tím"
        color: item.color              // "purple"
    }));

    return {
        issue: last.issue,
        issueDate: last.issueDate,
        value: value,
        formatValue: formatValue,
        options: options,
        planDrawTime: resultVal.planDrawTime,
        completeSettleTime: resultVal.completeSettleTime,
        serviceCode: resultVal.serviceCode,
        subServiceCode: resultVal.subServiceCode,
        timestamp: new Date().toISOString()
    };
}

// ============================================================================
// LOOP
// ============================================================================
async function pollLoop() {
    fetchCount++;
    const data = await fetchCoinvid();

    if (!data) return;

    lastUpdate = new Date().toISOString();
    const parsed = parseResult(data);

    if (!parsed) return;

    // Kiểm tra phiên mới
    if (parsed.issue !== lastIssueId) {
        // Thêm vào đầu danh sách
        history.unshift(parsed);

        // Giới hạn
        if (history.length > MAX_HISTORY) {
            history = history.slice(0, MAX_HISTORY);
        }

        lastIssueId = parsed.issue;

        console.log(`[New] Phiên ${parsed.issue} | Số: ${parsed.value} | Màu: ${parsed.options.map(o => o.name).join(", ")} | Tổng: ${history.length}`);

        // Lưu file
        saveHistory();
    }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    next();
});

// Lấy phiên mới nhất
app.get("/api/rg30s/latest", (req, res) => {
    if (!history.length) {
        return res.status(503).json({ success: false, msg: "Chưa có dữ liệu" });
    }
    res.json({
        success: true,
        data: history[0]
    });
});

// Lấy lịch sử
app.get("/api/rg30s/history", (req, res) => {
    const limit = Math.min(500, parseInt(req.query.limit) || 50);
    res.json({
        success: true,
        total: history.length,
        limit: limit,
        data: history.slice(0, limit)
    });
});

// Lấy N phiên gần nhất (chỉ value + màu)
app.get("/api/rg30s/results", (req, res) => {
    const limit = Math.min(500, parseInt(req.query.limit) || 50);
    const results = history.slice(0, limit).map(h => ({
        issue: h.issue,
        value: h.value,
        color: h.options[0] ? h.options[0].color : null,
        name: h.options[0] ? h.options[0].name : null,
        options: h.options.map(o => o.name)
    }));
    res.json({
        success: true,
        total: history.length,
        data: results
    });
});

// Thống kê
app.get("/api/rg30s/stats", (req, res) => {
    const limit = Math.min(1000, parseInt(req.query.limit) || 100);
    const recent = history.slice(0, limit);

    // Đếm số
    const numberCount = {};
    recent.forEach(h => {
        numberCount[h.value] = (numberCount[h.value] || 0) + 1;
    });

    // Đếm màu
    const colorCount = {};
    recent.forEach(h => {
        h.options.forEach(o => {
            colorCount[o.color] = (colorCount[o.color] || 0) + 1;
        });
    });

    // Số nóng / lạnh
    const sorted = Object.entries(numberCount).sort((a, b) => b[1] - a[1]);
    const hot = sorted.slice(0, 3).map(x => ({ value: x[0], count: x[1] }));
    const cold = sorted.slice(-3).reverse().map(x => ({ value: x[0], count: x[1] }));

    res.json({
        success: true,
        total: history.length,
        analyzed: recent.length,
        numberCount,
        colorCount,
        hot,
        cold,
        lastUpdate
    });
});

// Trạng thái
app.get("/api/rg30s/status", (req, res) => {
    res.json({
        success: true,
        total_history: history.length,
        last_issue: lastIssueId,
        last_update: lastUpdate,
        fetch_count: fetchCount,
        error_count: errorCount,
        uptime_seconds: Math.floor(process.uptime())
    });
});

// Root
app.get("/", (req, res) => {
    res.json({
        service: "Coinvid RG30S History API",
        endpoints: {
            "/api/rg30s/latest": "Phiên mới nhất",
            "/api/rg30s/history?limit=50": "Lịch sử đầy đủ",
            "/api/rg30s/results?limit=50": "Lịch sử rút gọn (chỉ số + màu)",
            "/api/rg30s/stats": "Thống kê",
            "/api/rg30s/status": "Trạng thái server"
        },
        total_history: history.length
    });
});

// ============================================================================
// KHỞI ĐỘNG
// ============================================================================
loadHistory();

// Nếu chưa có token → cảnh báo
if (!COINVID_TOKEN) {
    console.error("[!] Chưa có COINVID_TOKEN → API sẽ trả 401");
}

// Chạy fetch đầu tiên ngay
pollLoop();

// Loop mỗi 5s
setInterval(pollLoop, FETCH_INTERVAL);

// Lưu file mỗi 30s (tránh ghi quá nhiều)
setInterval(saveHistory, 30000);

app.listen(PORT, "0.0.0.0", () => {
    console.log("=".repeat(60));
    console.log("🚀 COINVID RG30S HISTORY API");
    console.log("=".repeat(60));
    console.log(`   Port: ${PORT}`);
    console.log(`   Source: ${COINVID_URL}`);
    console.log(`   Interval: ${FETCH_INTERVAL / 1000}s`);
    console.log(`   History: ${history.length} phiên`);
    console.log("=".repeat(60));
});
