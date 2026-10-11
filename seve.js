// ============================================================================
// COINVID RG30S HISTORY API - TOKEN HARDCODED
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

// ⚠️ TOKEN HARDCODED - CHỈ DÙNG LOCAL, KHÔNG PUSH GITHUB PUBLIC
const COINVID_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJpc3N1c2VyIiwiYXVkIjoiYXVkaWVuY2UiLCJ0ZW5hbnRfaWQiOiI2NzczNDMiLCJ1c2VyX25hbWUiOiJkdXluZWsxMTkiLCJ0b2tlbl90eXBlIjoiYWNjZXNzX3Rva2VuIiwicm9sZV9uYW1lIjoiIiwidXNlcl90eXBlIjoicm9ja2V0IiwidXNlcl9pZCI6IjE4Nzk3MTU1NjUyMDE0MjQzODYiLCJkZXRhaWwiOnsiYXZhdGFyIjoiMjYiLCJ2aXBMZXZlbCI6Mn0sImFjY291bnQiOiJkdXluZWsxMTkiLCJjbGllbnRfaWQiOiJyb2NrZXRfd2ViIiwiZXhwIjoxNzkyMzA5MTUyLCJuYmYiOjE3OTE3MDQzNTJ9.VyEleyKZ6fq1jqFYkaV7MCmsGTVqL1mMbu0H0SE1M5twhsl8-pnPT1RqPb5dhGhkjzDwXSwdGd-SWGKtW98unw";

const COINVID_BASIC = "cm9ja2V0X3dlYjpyb2NrZXRfd2Vi";

const FETCH_INTERVAL = 5000;
const MAX_HISTORY = 1000;
const HISTORY_FILE = path.join(__dirname, "history.json");

// User-Agent mobile xoay vòng
const MOBILE_UAS = [
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 12; Redmi Note 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; OPPO Reno8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
];

function randomUA() {
    return MOBILE_UAS[Math.floor(Math.random() * MOBILE_UAS.length)];
}

// ============================================================================
// STATE
// ============================================================================
let history = [];
let lastIssueId = null;
let lastUpdate = null;
let fetchCount = 0;
let errorCount = 0;
let rateLimitCount = 0;
let currentBackoff = 0;

// ============================================================================
// LOAD/SAVE
// ============================================================================
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
            history = data.history || [];
            lastIssueId = data.lastIssueId || null;
            console.log(`[Load] ${history.length} phiên`);
        }
    } catch (e) {
        console.error("[Load]", e.message);
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
        console.error("[Save]", e.message);
    }
}

// ============================================================================
// FETCH
// ============================================================================
async function fetchCoinvid() {
    const ua = randomUA();

    try {
        const res = await fetch(COINVID_URL, {
            method: "GET",
            headers: {
                "Blade-Auth": COINVID_TOKEN,
                "Authorization": `Basic ${COINVID_BASIC}`,
                "user_type": "rocket",
                "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
                "Accept": "application/json, text/plain, */*",
                "User-Agent": ua,
                "Origin": "https://m.coinvid.com",
                "Referer": "https://m.coinvid.com/",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Dest": "empty",
                "Connection": "keep-alive"
            },
            timeout: 15000
        });

        if (res.status === 429 || res.status === 403) {
            rateLimitCount++;
            currentBackoff = Math.min(currentBackoff + 60000, 300000);
            console.log(`[!] Rate limit (${res.status}). Backoff: ${currentBackoff/1000}s`);
            return null;
        }

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.msg || "API error");
        }

        currentBackoff = 0;
        return data.data;
    } catch (e) {
        errorCount++;
        console.error(`[Fetch] ${e.message}`);
        return null;
    }
}

// ============================================================================
// PARSE
// ============================================================================
function parseResult(data) {
    if (!data || !data.lastIssue || !data.lastIssue.resultVal) return null;

    const last = data.lastIssue;
    const rv = last.resultVal;
    const simpleList = rv.simpleResultFormatList || [];

    const options = simpleList.map(item => ({
        val: item.optionVal[0],
        name: item.optionI18n[0],
        color: item.color
    }));

    return {
        issue: last.issue,
        issueDate: last.issueDate,
        value: rv.value,
        formatValue: rv.formatValue,
        options: options,
        planDrawTime: rv.planDrawTime,
        completeSettleTime: rv.completeSettleTime,
        serviceCode: rv.serviceCode,
        subServiceCode: rv.subServiceCode,
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

    if (parsed.issue !== lastIssueId) {
        history.unshift(parsed);
        if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
        lastIssueId = parsed.issue;
        saveHistory();
        console.log(`[New] #${parsed.issue} | Số: ${parsed.value} | Màu: ${parsed.options.map(o => o.name).join(",")} | Tổng: ${history.length}`);
    }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
});

app.get("/api/rg30s/latest", (req, res) => {
    if (!history.length) return res.status(503).json({ success: false, msg: "Chưa có dữ liệu" });
    res.json({ success: true, data: history[0] });
});

app.get("/api/rg30s/history", (req, res) => {
    const limit = Math.min(500, parseInt(req.query.limit) || 50);
    res.json({
        success: true,
        total: history.length,
        data: history.slice(0, limit)
    });
});

app.get("/api/rg30s/results", (req, res) => {
    const limit = Math.min(500, parseInt(req.query.limit) || 50);
    const results = history.slice(0, limit).map(h => ({
        issue: h.issue,
        value: h.value,
        color: h.options[0] ? h.options[0].color : null,
        name: h.options[0] ? h.options[0].name : null
    }));
    res.json({ success: true, total: history.length, data: results });
});

app.get("/api/rg30s/stats", (req, res) => {
    const limit = Math.min(1000, parseInt(req.query.limit) || 100);
    const recent = history.slice(0, limit);

    const numberCount = {};
    recent.forEach(h => { numberCount[h.value] = (numberCount[h.value] || 0) + 1; });

    const colorCount = {};
    recent.forEach(h => { h.options.forEach(o => { colorCount[o.color] = (colorCount[o.color] || 0) + 1; }); });

    const sorted = Object.entries(numberCount).sort((a, b) => b[1] - a[1]);

    res.json({
        success: true,
        total: history.length,
        analyzed: recent.length,
        numberCount,
        colorCount,
        hot: sorted.slice(0, 3).map(x => ({ value: x[0], count: x[1] })),
        cold: sorted.slice(-3).reverse().map(x => ({ value: x[0], count: x[1] })),
        lastUpdate
    });
});

app.get("/api/rg30s/status", (req, res) => {
    res.json({
        success: true,
        total_history: history.length,
        last_issue: lastIssueId,
        last_update: lastUpdate,
        fetch_count: fetchCount,
        error_count: errorCount,
        rate_limit_count: rateLimitCount,
        current_backoff: currentBackoff,
        uptime: Math.floor(process.uptime())
    });
});

app.get("/", (req, res) => {
    res.json({
        service: "Coinvid RG30S History API",
        total_history: history.length,
        last_issue: lastIssueId,
        endpoints: {
            "/api/rg30s/latest": "Phiên mới nhất",
            "/api/rg30s/history?limit=50": "Lịch sử đầy đủ",
            "/api/rg30s/results?limit=50": "Lịch sử rút gọn",
            "/api/rg30s/stats": "Thống kê",
            "/api/rg30s/status": "Trạng thái"
        }
    });
});

// ============================================================================
// KHỞI ĐỘNG
// ============================================================================
loadHistory();

if (!COINVID_TOKEN || COINVID_TOKEN.length < 50) {
    console.error("[!] Token không hợp lệ hoặc rỗng");
}

(async () => {
    while (true) {
        await pollLoop();
        const wait = FETCH_INTERVAL + Math.random() * 10000 + currentBackoff;
        await new Promise(r => setTimeout(r, wait));
    }
})();

setInterval(saveHistory, 60000);

app.listen(PORT, "0.0.0.0", () => {
    console.log("=".repeat(60));
    console.log("🚀 COINVID RG30S HISTORY API");
    console.log("=".repeat(60));
    console.log(`   Port: ${PORT}`);
    console.log(`   Interval: ${FETCH_INTERVAL / 1000}s`);
    console.log(`   History: ${history.length} phiên`);
    console.log(`   Token: ${COINVID_TOKEN.substring(0, 30)}...`);
    console.log("=".repeat(60));
});
