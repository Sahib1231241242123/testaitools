"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Order {
  id: number;
  retailcrm_id: number;
  order_number: string | null;
  created_at: string | null;
  customer_name: string;
  city: string | null;
  status: string | null;
  total_kzt: number;
  source: string | null;
}

interface DailyData {
  date: string;
  total: number;
  count: number;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  assembling: "Сборка",
  delivery: "Доставка",
  complete: "Завершён",
  cancel: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  new: "#6366f1",
  assembling: "#f59e0b",
  delivery: "#10b981",
  complete: "#3b82f6",
  cancel: "#ef4444",
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"revenue" | "count">("revenue");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setOrders((data as Order[]) ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_kzt), 0);
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;
  const highValueCount = orders.filter((o) => Number(o.total_kzt) > 50000).length;

  // Группировка по дням
  const dailyMap: Record<string, DailyData> = {};
  orders.forEach((o) => {
    const d = o.created_at ? o.created_at.slice(0, 10) : "unknown";
    if (!dailyMap[d]) dailyMap[d] = { date: d, total: 0, count: 0 };
    dailyMap[d].total += Number(o.total_kzt);
    dailyMap[d].count += 1;
  });
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  // Группировка по статусам
  const statusMap: Record<string, number> = {};
  orders.forEach((o) => {
    const s = o.status ?? "unknown";
    statusMap[s] = (statusMap[s] ?? 0) + 1;
  });

  const lineData = {
    labels: daily.map((d) => {
      const dt = new Date(d.date);
      return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    }),
    datasets: [
      {
        label: activeTab === "revenue" ? "Сумма (₸)" : "Количество",
        data: daily.map((d) => (activeTab === "revenue" ? d.total : d.count)),
        borderColor: "#6366f1",
        backgroundColor: "rgba(99,102,241,0.12)",
        borderWidth: 2.5,
        pointBackgroundColor: "#6366f1",
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const barData = {
    labels: Object.keys(statusMap).map((s) => STATUS_LABELS[s] ?? s),
    datasets: [
      {
        label: "Заказов",
        data: Object.values(statusMap),
        backgroundColor: Object.keys(statusMap).map(
          (s) => STATUS_COLORS[s] ?? "#94a3b8"
        ),
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8", font: { size: 11 } } },
      y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8", font: { size: 11 } } },
    },
  };

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.spinner} />
        <p style={{ color: "#94a3b8", marginTop: 16 }}>Загрузка данных...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.loadingWrap}>
        <p style={{ color: "#ef4444" }}>❌ Ошибка: {error}</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.logo}>
              <span style={styles.logoAccent}>◈</span> OrderFlow
            </h1>
            <p style={styles.subtitle}>RetailCRM Analytics Dashboard</p>
          </div>
          <div style={styles.badge}>
            <span style={styles.dot} />
            Live
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {/* Метрики */}
        <div style={styles.metricsGrid}>
          <MetricCard
            icon="📦"
            label="Всего заказов"
            value={orders.length.toString()}
            accent="#6366f1"
          />
          <MetricCard
            icon="💰"
            label="Общая выручка"
            value={`${(totalRevenue / 1000).toFixed(0)}K ₸`}
            accent="#10b981"
          />
          <MetricCard
            icon="📊"
            label="Средний чек"
            value={`${Math.round(avgOrder).toLocaleString("ru")} ₸`}
            accent="#f59e0b"
          />
          <MetricCard
            icon="🔥"
            label="Крупных (>50K ₸)"
            value={highValueCount.toString()}
            accent="#ef4444"
          />
        </div>

        {/* Графики */}
        <div style={styles.chartsGrid}>
          {/* Line chart */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Динамика заказов</h2>
              <div style={styles.tabs}>
                <button
                  style={{ ...styles.tab, ...(activeTab === "revenue" ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab("revenue")}
                >
                  Выручка
                </button>
                <button
                  style={{ ...styles.tab, ...(activeTab === "count" ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab("count")}
                >
                  Количество
                </button>
              </div>
            </div>
            <div style={{ height: 240 }}>
              <Line data={lineData} options={chartOptions} />
            </div>
          </div>

          {/* Bar chart */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>По статусам</h2>
            </div>
            <div style={{ height: 240 }}>
              <Bar data={barData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Таблица */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Последние заказы</h2>
            <span style={styles.countBadge}>{orders.length}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["#", "Клиент", "Город", "Статус", "Источник", "Сумма"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 20).map((o, i) => (
                  <tr key={o.id} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.td}>
                      <span style={styles.orderId}>{o.order_number ?? o.retailcrm_id}</span>
                    </td>
                    <td style={styles.td}>{o.customer_name}</td>
                    <td style={styles.td}>{o.city ?? "—"}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: `${STATUS_COLORS[o.status ?? ""] ?? "#475569"}22`,
                          color: STATUS_COLORS[o.status ?? ""] ?? "#94a3b8",
                          border: `1px solid ${STATUS_COLORS[o.status ?? ""] ?? "#475569"}44`,
                        }}
                      >
                        {STATUS_LABELS[o.status ?? ""] ?? o.status ?? "—"}
                      </span>
                    </td>
                    <td style={styles.td}>{o.source ?? "—"}</td>
                    <td style={{ ...styles.td, ...styles.amount }}>
                      {Number(o.total_kzt) > 50000 && <span style={styles.fire}>🔥 </span>}
                      {Number(o.total_kzt).toLocaleString("ru-KZ")} ₸
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ icon, label, value, accent }: { icon: string; label: string; value: string; accent: string }) {
  return (
    <div style={{ ...styles.metricCard, borderColor: `${accent}33` }}>
      <div style={{ ...styles.metricIcon, background: `${accent}18`, color: accent }}>{icon}</div>
      <div>
        <p style={styles.metricLabel}>{label}</p>
        <p style={{ ...styles.metricValue, color: accent }}>{value}</p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0f1117",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    color: "#e2e8f0",
  },
  loadingWrap: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f1117",
    fontFamily: "monospace",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "3px solid #1e293b",
    borderTop: "3px solid #6366f1",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  header: {
    borderBottom: "1px solid #1e293b",
    background: "rgba(15,17,23,0.95)",
    backdropFilter: "blur(12px)",
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
  },
  headerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" },
  logoAccent: { color: "#6366f1" },
  subtitle: { fontSize: 12, color: "#475569", margin: "4px 0 0", letterSpacing: "0.5px" },
  badge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#10b98118",
    border: "1px solid #10b98133",
    color: "#10b981",
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#10b981",
    display: "inline-block",
    boxShadow: "0 0 6px #10b981",
  },
  main: { maxWidth: 1200, margin: "0 auto", padding: "32px 24px" },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  metricCard: {
    background: "#141821",
    border: "1px solid",
    borderRadius: 14,
    padding: "20px 22px",
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  metricIcon: { fontSize: 22, width: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  metricLabel: { margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.8px" },
  metricValue: { margin: "4px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: "-1px" },
  chartsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
    gap: 16,
    marginBottom: 24,
  },
  card: {
    background: "#141821",
    border: "1px solid #1e293b",
    borderRadius: 14,
    padding: "22px 24px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  cardTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: "#cbd5e1", letterSpacing: "0.3px" },
  tabs: { display: "flex", gap: 4, background: "#0f1117", borderRadius: 8, padding: 3 },
  tab: {
    background: "transparent",
    border: "none",
    color: "#64748b",
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tabActive: { background: "#6366f1", color: "#fff" },
  countBadge: {
    background: "#6366f118",
    border: "1px solid #6366f133",
    color: "#818cf8",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 12,
  },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: {
    textAlign: "left" as const,
    padding: "10px 14px",
    color: "#475569",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.6px",
    borderBottom: "1px solid #1e293b",
  },
  td: { padding: "12px 14px", color: "#cbd5e1", verticalAlign: "middle" as const },
  trEven: {},
  trOdd: { background: "#0f111720" },
  orderId: { color: "#475569", fontSize: 12 },
  statusBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
  },
  amount: { color: "#e2e8f0", fontWeight: 600, textAlign: "right" as const },
  fire: { fontSize: 13 },
};
