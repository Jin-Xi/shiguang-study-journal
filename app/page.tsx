"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "journal" | "review" | "blog";
type EntryType = "tech" | "algorithm" | "reading" | "note";

type Entry = {
  id: string;
  type: EntryType;
  title: string;
  eyebrow: string;
  summary: string;
  tags: string[];
  publish: boolean;
  minutes?: number;
};

const initialEntries: Entry[] = [
  {
    id: "react-state-machine",
    type: "tech",
    title: "用状态机梳理异步请求",
    eyebrow: "技术学习  ·  React",
    summary:
      "把 loading / success / error 当成互斥状态后，界面分支会比多个 boolean 更易推理。关键是让每次事件只产生一个合法转移。",
    tags: ["React", "状态机"],
    publish: true,
    minutes: 45,
  },
  {
    id: "leetcode-146",
    type: "algorithm",
    title: "146. LRU 缓存",
    eyebrow: "刷题  ·  用了提示",
    summary:
      "已经知道需要哈希表 + 双向链表，但是第一次写时漏了更新已存在 key 的顺序。下次需要隐藏答案独立重写。",
    tags: ["链表", "LeetCode"],
    publish: false,
    minutes: 38,
  },
  {
    id: "designing-data-intensive-apps",
    type: "reading",
    title: "《数据密集型应用系统设计》· 第 3 章",
    eyebrow: "阅读  ·  存储与检索",
    summary:
      "LSM-Tree 用顺序写换取写入性能，再通过后台合并承担读放大和空间放大。选型时要看读写比，不只是看单次延迟。",
    tags: ["分布式系统"],
    publish: true,
    minutes: 30,
  },
];

const historicalDays = [
  { date: "09月26日", weekday: "星期六", title: "Vite 构建链与浏览器模块", meta: "2 条记录  ·  3 个标签" },
  { date: "09月25日", weekday: "星期五", title: "二分答案与边界检查", meta: "3 条记录  ·  42 分钟" },
  { date: "09月23日", weekday: "星期三", title: "数据库索引、缓存和一次散步", meta: "4 条记录  ·  已公开 1 条" },
];

const typeLabels: Record<EntryType, string> = {
  tech: "技术",
  algorithm: "刷题",
  reading: "阅读",
  note: "随手记",
};

function Mark({ children }: { children: React.ReactNode }) {
  return <span className="mark" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const currentDate = "2026-09-27";
  const [view, setView] = useState<View>("journal");
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [dailySummary, setDailySummary] = useState("把异步状态这件事真正讲明白。");
  const [serverMode, setServerMode] = useState<"connecting" | "local" | "offline">("connecting");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState("");
  const [quickAdd, setQuickAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<EntryType>("tech");
  const [reviewStep, setReviewStep] = useState(0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [publishStatus, setPublishStatus] = useState("有 2 条更新待发布");
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/config").then((response) => {
        if (!response.ok) throw new Error("local service unavailable");
        return response.json();
      }),
      fetch(`/api/days/${currentDate}`).then((response) => {
        if (!response.ok) throw new Error("day unavailable");
        return response.json();
      }),
    ]).then(([, result]) => {
      if (!active) return;
      setServerMode("local");
      if (result.exists && result.day) {
        setEntries(result.day.entries || []);
        setDailySummary(result.day.summary || "");
        setSaved(true);
      } else {
        fetch(`/api/days/${currentDate}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ summary: dailySummary, entries: initialEntries }),
        }).then(() => setSaved(true));
      }
    }).catch(() => {
      if (!active) return;
      setServerMode("offline");
      setSaved(false);
    });
    return () => { active = false; };
  }, []);

  const queueSave = (nextEntries: Entry[], nextSummary: string) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (serverMode !== "local") return;
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/days/${currentDate}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ summary: nextSummary, entries: nextEntries }),
        });
        if (!response.ok) throw new Error("保存失败");
        setSaved(true);
      } catch {
        setSaved(false);
        setNotice("本地保存失败，请检查启动窗口");
        setTimeout(() => setNotice(""), 2800);
      }
    }, 650);
  };

  const updateEntry = (id: string, change: Partial<Entry>) => {
    const next = entries.map((entry) => entry.id === id ? { ...entry, ...change } : entry);
    setEntries(next);
    queueSave(next, dailySummary);
  };

  const filteredEntries = useMemo(() => entries.filter((entry) => {
    const matchesType = filter === "all" || entry.type === filter;
    const search = query.trim().toLowerCase();
    const matchesQuery = !search || `${entry.title} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase().includes(search);
    return matchesType && matchesQuery;
  }), [entries, filter, query]);

  const addEntry = () => {
    if (!newTitle.trim()) return;
    const entry: Entry = {
      id: `entry-${Date.now()}`,
      type: newType,
      title: newTitle.trim(),
      eyebrow: `${typeLabels[newType]}  ·  新记录`,
      summary: "点击这里写下你理解的内容、例子，以及还没搞懂的地方。",
      tags: ["未分类"],
      publish: false,
    };
    const next = [entry, ...entries];
    setEntries(next);
    queueSave(next, dailySummary);
    setNewTitle("");
    setQuickAdd(false);
    setNotice("已添加一条记录");
    setTimeout(() => setNotice(""), 2200);
  };

  const runPublish = async () => {
    if (publishStatus.includes("正在")) return;
    if (serverMode !== "local") {
      setNotice("发布只能从本地启动的工作台执行");
      setTimeout(() => setNotice(""), 2800);
      return;
    }
    try {
      setPublishStatus("正在保存当前内容…");
      const saveResponse = await fetch(`/api/days/${currentDate}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary: dailySummary, entries }),
      });
      if (!saveResponse.ok) throw new Error("当前内容保存失败");
      setSaved(true);
      setPublishStatus("正在生成 Markdown 并推送…");
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: currentDate }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "发布失败");
      setPublishStatus(result.message || "已推送到 GitHub");
      setNotice("已推送到 GitHub，博客正在构建");
    } catch (error) {
      const message = error instanceof Error ? error.message : "发布失败";
      setPublishStatus(`发布失败：${message}`);
      setNotice(message);
    }
    setTimeout(() => setNotice(""), 3200);
  };

  const navItems: { id: View; icon: string; label: string; meta?: string }[] = [
    { id: "journal", icon: "日", label: "学习日志" },
    { id: "review", icon: "复", label: "今日复习", meta: "3" },
    { id: "blog", icon: "博", label: "博客预览" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("journal")} aria-label="回到今日日志">
          <span className="brand-glyph">拾</span>
          <span><b>拾光</b><small>学习日志</small></span>
        </button>

        <nav className="primary-nav" aria-label="主导航">
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}>
              <Mark>{item.icon}</Mark><span>{item.label}</span>{item.meta && <em>{item.meta}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <p>时间线</p>
          <button className="side-link is-current"><span>今天</span><small>3</small></button>
          <button className="side-link"><span>本周</span><small>9</small></button>
          <button className="side-link"><span>2026 年 9 月</span><small>24</small></button>
        </div>

        <div className="sidebar-section tags">
          <p>常用标签</p>
          <button><i className="dot mint" />React</button>
          <button><i className="dot clay" />算法</button>
          <button><i className="dot gold" />分布式系统</button>
        </div>

        <div className="sidebar-footer">
          <button><Mark>设</Mark><span>设置</span></button>
          <div className="storage"><span><i className={serverMode === "local" ? "" : "offline"} />{serverMode === "local" ? "本地文件已连接" : serverMode === "connecting" ? "正在连接本地文件" : "本地服务未连接"}</span><small>{serverMode === "local" ? "JSON" : "--"}</small></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-glyph">拾</span><b>拾光</b></div>
          <label className="search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记录、标签…" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="save-state"><i className={saved ? "" : "saving"} />{serverMode === "offline" ? "未连接本地文件" : saved ? "已写入本地文件" : "保存中…"}</div>
          <button className="avatar" aria-label="个人设置">JX</button>
        </header>

        {view === "journal" && (
          <div className="journal-layout">
            <section className="journal-main">
              <div className="date-heading">
                <div>
                  <span className="today-pill">今天</span>
                  <h1>9月27日 <small>星期日</small></h1>
                  <p><span className="weather">◒</span> 上海 · 23°C · 秋分后第 5 天</p>
                </div>
                <div className="date-actions">
                  <button aria-label="上一天">←</button><button>今天</button><button aria-label="下一天">→</button>
                </div>
              </div>

              <div className="daily-intent">
                <span>今日一句话</span>
                <input value={dailySummary} onChange={(event) => { const next = event.target.value; setDailySummary(next); queueSave(entries, next); }} aria-label="今日一句话" />
              </div>

              <div className="entry-controls">
                <div className="filter-tabs" role="group" aria-label="记录类型">
                  {[["all", "全部"], ["tech", "技术"], ["algorithm", "刷题"], ["reading", "阅读"]].map(([id, label]) => (
                    <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>
                  ))}
                </div>
                <button className="add-button" onClick={() => setQuickAdd(true)}><span>+</span> 添加记录</button>
              </div>

              <div className="entry-list">
                {filteredEntries.map((entry) => (
                  <article className={`entry-card ${entry.type}`} key={entry.id}>
                    <div className="entry-line"><span className="entry-node" /><span className="entry-type">{typeLabels[entry.type]}</span></div>
                    <div className="entry-content">
                      <div className="entry-topline">
                        <p>{entry.eyebrow}</p>
                        <button className="more" aria-label={`${entry.title}更多操作`}>···</button>
                      </div>
                      <h2>{entry.title}</h2>
                      <p className="entry-summary">{entry.summary}</p>
                      {entry.type === "tech" && (
                        <pre className="code-block"><code><span>type</span> RequestState = {"\n"}  | {`{ status: \"idle\" }`}{"\n"}  | {`{ status: \"loading\" }`}{"\n"}  | {`{ status: \"success\"; data: Data }`}</code></pre>
                      )}
                      {entry.type === "algorithm" && (
                        <div className="callout"><b>错误点</b><span>更新已存在节点时，忘记先从原位置断开。</span></div>
                      )}
                      <div className="entry-footer">
                        <div className="tag-row">{entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
                        <div className="entry-meta">
                          {entry.minutes && <span>{entry.minutes} 分钟</span>}
                          <label className="publish-switch" title="发布到博客">
                            <input type="checkbox" checked={entry.publish} onChange={(event) => updateEntry(entry.id, { publish: event.target.checked })} />
                            <i /> <span>{entry.publish ? "已选公开" : "仅自己"}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                {filteredEntries.length === 0 && <div className="empty-state"><span>⌕</span><h3>没找到匹配的记录</h3><p>试试其他关键词或切换类型。</p></div>}
              </div>

              <div className="history-block">
                <div className="history-title"><h3>近日日志</h3><span>按日期倒序</span></div>
                {historicalDays.map((day) => (
                  <button className="history-row" key={day.date} onClick={() => setExpandedHistory(expandedHistory === day.date ? null : day.date)}>
                    <strong>{day.date}<small>{day.weekday}</small></strong>
                    <span><b>{day.title}</b><small>{day.meta}</small></span>
                    <i>{expandedHistory === day.date ? "−" : "+"}</i>
                    {expandedHistory === day.date && <em>当日笔记已展开，点击日期可进入完整编辑。</em>}
                  </button>
                ))}
              </div>
            </section>

            <aside className="context-rail">
              <section className="rail-card focus-card">
                <p className="rail-eyebrow">今日节奏 <span>3 / 4</span></p>
                <div className="progress"><i style={{ width: "75%" }} /></div>
                <ul>
                  <li className="done"><button>✓</button><span>阅读 30 分钟</span></li>
                  <li className="done"><button>✓</button><span>复习到期卡片</span></li>
                  <li className="done"><button>✓</button><span>完成一道链表题</span></li>
                  <li><button /> <span>整理今日回顾</span></li>
                </ul>
              </section>
              <section className="rail-card review-peek">
                <div className="peek-heading"><span className="mini-orbit">↻</span><div><b>今日待复习</b><small>3 张卡片 · 约 8 分钟</small></div></div>
                <p>useEffect 的 cleanup 会在什么时候执行？</p>
                <button onClick={() => setView("review")}>开始复习 <span>→</span></button>
              </section>
              <section className="rail-card publish-peek">
                <p><i /> 博客预览</p>
                <strong>{entries.filter((entry) => entry.publish).length} 条记录已选中</strong>
                <span>上次发布：9月23日 21:18</span>
                <button onClick={() => setView("blog")}>查看本次内容</button>
              </section>
              <blockquote>“学习是给未来的自己留下路标。”<span>—— 今日记</span></blockquote>
            </aside>
          </div>
        )}

        {view === "review" && (
          <section className="review-view">
            <div className="section-heading">
              <div><span className="today-pill">今日计划</span><h1>复习，不是重读</h1><p>先回想，再揭示答案。今天有 3 项到期。</p></div>
              <div className="review-count"><strong>{reviewStep}<small>/ 3</small></strong><span>已完成</span></div>
            </div>
            <div className="review-stage">
              <div className="review-queue"><span className="current" /><span className={reviewStep > 0 ? "complete" : ""} /><span className={reviewStep > 1 ? "complete" : ""} /></div>
              <article className="review-card">
                <div className="review-card-head"><span>技术学习 · React</span><button onClick={() => setView("journal")}>查看原笔记 ↗</button></div>
                <div className="question-mark">Q</div>
                <p className="question-label">请在心里或草稿纸上回答</p>
                <h2>{reviewStep === 0 ? "useEffect 的 cleanup 会在什么时候执行？" : reviewStep === 1 ? "LRU 缓存为什么要用双向链表？" : "LSM-Tree 用什么换取了更高的写入性能？"}</h2>
                {!answerVisible ? (
                  <button className="reveal-button" onClick={() => setAnswerVisible(true)}><span>◉</span> 显示答案</button>
                ) : (
                  <div className="answer-box">
                    <span>参考答案</span>
                    <p>{reviewStep === 0 ? "cleanup 会在组件卸载时执行；如果依赖发生变化，也会在下一次 effect 执行之前先运行上一次的 cleanup。" : reviewStep === 1 ? "因为节点需要 O(1) 地从任意位置移除，并移到链表头部；单向链表无法在 O(1) 时间找到前驱。" : "它用更多的读放大、空间放大和后台合并开销，换取顺序写带来的写入吞吐。"}</p>
                  </div>
                )}
              </article>
              {answerVisible && (
                <div className="review-actions">
                  <p>这次想起来了吗？</p>
                  <div>
                    {[["不会", "明天"], ["需要提示", "3 天后"], ["独立完成", "7 天后"]].map(([result, next]) => (
                      <button key={result} onClick={() => { setReviewStep((step) => Math.min(step + 1, 3)); setAnswerVisible(false); setNotice(`已记录：${result}，${next}再复习`); setTimeout(() => setNotice(""), 2200); }}><b>{result}</b><span>{next}</span></button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {view === "blog" && (
          <section className="blog-view">
            <div className="section-heading blog-heading">
              <div><span className="today-pill">发布前预览</span><h1>你的公开学习日志</h1><p>只有下方带“已选公开”的内容会进入公开快照。</p></div>
              <div className="publish-actions"><span><i />{publishStatus}</span><button onClick={runPublish} disabled={serverMode !== "local"}>发布到 GitHub <b>↗</b></button><a href="https://jin-xi.github.io/" target="_blank" rel="noreferrer">查看博客</a></div>
            </div>
            <div className="preview-browser">
              <div className="browser-bar"><i className="red" /><i className="yellow" /><i className="green" /><span>jin-xi.github.io / 2026 / 09 / 27</span><button>↺</button></div>
              <div className="public-blog">
                <header><button>拾光笔记</button><nav><span>时间线</span><span>专题</span><span>关于</span></nav><button className="theme-button">◐</button></header>
                <article>
                  <p className="blog-date">2026 年 9 月 27 日 · 星期日</p>
                  <h2>今天学到了什么</h2>
                  <p className="blog-lead">一些关于状态、缓存和存储的学习记录。</p>
                  {entries.filter((entry) => entry.publish).map((entry, index) => (
                    <section className="public-entry" key={entry.id}>
                      <div className="public-index">0{index + 1}</div>
                      <div><span>{typeLabels[entry.type]}</span><h3>{entry.title}</h3><p>{entry.summary}</p><div>{entry.tags.map((tag) => <em key={tag}>#{tag}</em>)}</div></div>
                    </section>
                  ))}
                </article>
              </div>
            </div>
            <div className="privacy-note"><span>◈</span><div><b>隐私检查已通过</b><p>{entries.length - entries.filter((entry) => entry.publish).length} 条私人记录、复习进度和今日一句话不会被导出。</p></div><button>查看清单</button></div>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Mark>{item.icon}</Mark><span>{item.label.replace("今日", "")}</span></button>)}
      </nav>

      {quickAdd && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setQuickAdd(false); }}>
          <div className="quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-title">
            <button className="modal-close" onClick={() => setQuickAdd(false)} aria-label="关闭">×</button>
            <span className="today-pill">今日 · 9月27日</span>
            <h2 id="quick-title">添加一条记录</h2>
            <p>先留下主题，再慢慢写完。</p>
            <label>记录类型<select value={newType} onChange={(event) => setNewType(event.target.value as EntryType)}><option value="tech">技术学习</option><option value="algorithm">刷题</option><option value="reading">阅读</option><option value="note">随手记</option></select></label>
            <label>主题<input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addEntry(); }} placeholder="例如：弄懂 React 状态批处理" /></label>
            <div className="modal-actions"><button onClick={() => setQuickAdd(false)}>取消</button><button className="add-button" onClick={addEntry} disabled={!newTitle.trim()}>创建记录</button></div>
          </div>
        </div>
      )}

      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </div>
  );
}
