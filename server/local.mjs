import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = path.join(root, "local-dist");
const dataDir = path.resolve(process.env.SHIGUANG_DATA_DIR || path.join(root, "..", "shiguang-data"));
const blogDir = path.resolve(process.env.SHIGUANG_BLOG_DIR || path.join(root, "..", "public-blog"));
const port = Number(process.env.SHIGUANG_PORT || 4317);
const host = "127.0.0.1";
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
let publishState = { status: "idle", message: "", url: "https://jin-xi.github.io/" };

await fs.mkdir(path.join(dataDir, "days"), { recursive: true });

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function atomicJson(file, payload) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error("请求内容过大");
  }
  return body ? JSON.parse(body) : {};
}

function dayFile(date) {
  if (!dayPattern.test(date)) throw new Error("日期格式无效");
  return path.join(dataDir, "days", `${date}.json`);
}

function safeEntry(entry) {
  const allowedTypes = new Set(["tech", "algorithm", "reading", "note"]);
  return {
    id: String(entry.id || `entry-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100),
    type: allowedTypes.has(entry.type) ? entry.type : "note",
    title: String(entry.title || "未命名记录").slice(0, 200),
    eyebrow: String(entry.eyebrow || "").slice(0, 200),
    summary: String(entry.summary || "").slice(0, 30_000),
    tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).slice(0, 50)).slice(0, 20) : [],
    publish: Boolean(entry.publish),
    ...(Number.isFinite(entry.minutes) ? { minutes: Number(entry.minutes) } : {}),
  };
}

async function saveDay(date, body) {
  const current = await readJson(dayFile(date), { revision: 0 });
  const payload = {
    date,
    summary: String(body.summary || "").slice(0, 1000),
    entries: Array.isArray(body.entries) ? body.entries.map(safeEntry) : [],
    revision: Number(current.revision || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  await atomicJson(dayFile(date), payload);
  return payload;
}

function frontmatterString(value) {
  return JSON.stringify(String(value));
}

function toMarkdown(date, entry) {
  const description = entry.summary.replace(/\s+/g, " ").trim().slice(0, 160);
  const postPath = `${date.replaceAll("-", "/")}/${entry.id}`;
  return `---\ntitle: ${frontmatterString(entry.title)}\ndescription: ${frontmatterString(description || entry.title)}\ndate: ${date}T12:00:00+08:00\ntags: ${JSON.stringify(entry.tags)}\ntype: ${entry.type}\ndraft: false\npath: ${frontmatterString(postPath)}\n---\n\n${entry.summary.trim()}\n`;
}

async function run(command, args, options = {}) {
  return exec(command, args, { cwd: options.cwd, timeout: options.timeout || 120_000, maxBuffer: 2_000_000 });
}

async function publish(date) {
  if (publishState.status === "running") throw new Error("已有一个发布任务在进行");
  publishState = { ...publishState, status: "running", message: "正在检查公开快照…" };
  try {
    const day = await readJson(dayFile(date), null);
    if (!day) throw new Error("请先保存当天日志");
    const publicEntries = day.entries.filter((entry) => entry.publish);
    if (!publicEntries.length) throw new Error("当天没有勾选公开的记录");

    const gitDir = path.join(blogDir, ".git");
    await fs.access(gitDir);
    const { stdout: dirty } = await run("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: blogDir });
    if (dirty.trim()) throw new Error("公开博客目录存在未提交更改，请先处理");

    publishState.message = "正在同步 GitHub…";
    await run("git", ["pull", "--ff-only", "origin", "main"], { cwd: blogDir });

    const manifestFile = path.join(dataDir, "publish-manifest.json");
    const manifest = await readJson(manifestFile, { days: {} });
    const previous = manifest.days[date] || {};
    const next = {};
    const postsDir = path.join(blogDir, "src", "content", "posts");
    await fs.mkdir(postsDir, { recursive: true });

    for (const entry of publicEntries) {
      const filename = `${date}-${entry.id}.md`;
      await fs.writeFile(path.join(postsDir, filename), toMarkdown(date, entry), "utf8");
      next[entry.id] = filename;
    }
    for (const [entryId, filename] of Object.entries(previous)) {
      if (!next[entryId] && /^[a-zA-Z0-9._-]+\.md$/.test(filename)) {
        await fs.rm(path.join(postsDir, filename), { force: true });
      }
    }

    manifest.days[date] = next;
    await atomicJson(manifestFile, manifest);
    publishState.message = "正在验证博客…";
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    await run(npmCommand, ["run", "build"], { cwd: blogDir, timeout: 180_000 });

    await run("git", ["add", "--", "src/content/posts"], { cwd: blogDir });
    try {
      await run("git", ["diff", "--cached", "--quiet"], { cwd: blogDir });
      publishState = { status: "success", message: "公开内容没有变化", url: "https://jin-xi.github.io/" };
      return publishState;
    } catch {
      // Exit code 1 means the public snapshot changed and should be committed.
    }

    publishState.message = "正在提交并推送…";
    await run("git", ["commit", "-m", `Publish learning notes for ${date}`], { cwd: blogDir });
    await run("git", ["push", "origin", "main"], { cwd: blogDir, timeout: 180_000 });
    publishState = { status: "success", message: "已推送，GitHub Pages 正在构建", url: "https://jin-xi.github.io/" };
    return publishState;
  } catch (error) {
    publishState = { ...publishState, status: "error", message: error.message || "发布失败" };
    throw error;
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  let file = path.resolve(staticDir, requested);
  if (!file.startsWith(staticDir)) return json(res, 403, { error: "Forbidden" });
  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, "index.html");
    const content = await fs.readFile(file);
    res.writeHead(200, { "content-type": mimeTypes[path.extname(file)] || "application/octet-stream" });
    res.end(content);
  } catch {
    try {
      const content = await fs.readFile(path.join(staticDir, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(content);
    } catch { json(res, 404, { error: "Not found" }); }
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (req.method === "GET" && url.pathname === "/api/config") {
      return json(res, 200, { mode: "local", dataDir, blogDir, publish: publishState });
    }
    if (req.method === "GET" && url.pathname === "/api/publish/status") return json(res, 200, publishState);
    const dayMatch = url.pathname.match(/^\/api\/days\/(\d{4}-\d{2}-\d{2})$/);
    if (dayMatch && req.method === "GET") {
      const day = await readJson(dayFile(dayMatch[1]), null);
      return json(res, 200, { exists: Boolean(day), day });
    }
    if (dayMatch && req.method === "PUT") {
      const day = await saveDay(dayMatch[1], await readBody(req));
      return json(res, 200, { saved: true, day });
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      const body = await readBody(req);
      const state = await publish(String(body.date || ""));
      return json(res, 200, state);
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "API not found" });
    return serveStatic(req, res);
  } catch (error) {
    return json(res, 500, { error: error.message || "本地服务错误" });
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`\n拾光工作台已启动：${url}`);
  console.log(`私人数据：${dataDir}`);
  console.log(`公开博客：${blogDir}\n`);
  if (process.env.SHIGUANG_NO_OPEN === "1") return;
  const opener = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  const child = spawn(opener[0], opener[1], { detached: true, stdio: "ignore" });
  child.unref();
});
