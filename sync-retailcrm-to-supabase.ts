import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import "dotenv/config";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const BASE_URL = process.env.RETAILCRM_BASE_URL!;
const API_KEY = process.env.RETAILCRM_API_KEY!;
const SITE = process.env.RETAILCRM_SITE!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PAGE_LIMIT = parseInt(process.env.RETAILCRM_PAGE_LIMIT ?? "100");

if (!BASE_URL || !API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Проверь .env: RETAILCRM_BASE_URL, RETAILCRM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface CrmOrder {
  id: number;
  externalId?: string;
  number?: string;
  createdAt?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  delivery?: { address?: { city?: string; text?: string } };
  status?: string;
  summ?: number;
  summed?: number;
  totalSumm?: number;
  source?: { source?: string };
}

interface MockOrder {
  externalId: string;
  total: number;
}

function loadMockTotals(): Map<string, number> {
  const map = new Map<string, number>();
  const mockPath = path.resolve(__dirname, "../data/mock_orders.json");

  if (!fs.existsSync(mockPath)) return map;

  try {
    const items: MockOrder[] = JSON.parse(fs.readFileSync(mockPath, "utf-8"));
    for (const item of items) {
      if (item.externalId) map.set(item.externalId, Number(item.total) || 0);
    }
  } catch {
    // If local mock data is not readable, fallback logic is simply skipped.
  }

  return map;
}

const mockTotals = loadMockTotals();

function resolveOrderTotal(order: CrmOrder): number {
  const crmTotal = Number(order.totalSumm ?? order.summed ?? order.summ ?? 0);
  if (crmTotal > 0) return crmTotal;

  if (order.externalId) {
    const mockTotal = mockTotals.get(order.externalId);
    if (typeof mockTotal === "number" && mockTotal > 0) return mockTotal;
  }

  return 0;
}

interface CrmResponse {
  success: boolean;
  orders: CrmOrder[];
  pagination: { totalCount: number; limit: number; totalPageCount: number; currentPage: number };
}

async function fetchOrdersPage(page: number): Promise<CrmResponse> {
  const params = new URLSearchParams({
    limit: PAGE_LIMIT.toString(),
    page: page.toString(),
    ...(SITE ? { site: SITE } : {}),
  });

  const res = await fetch(`${BASE_URL}/api/v5/orders?${params}`, {
    headers: { "X-API-KEY": API_KEY },
  });

  if (!res.ok) throw new Error(`RetailCRM API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<CrmResponse>;
}

async function upsertOrders(orders: CrmOrder[]): Promise<void> {
  const rows = orders.map((o) => ({
    retailcrm_id: o.id,
    external_id: o.externalId ?? null,
    order_number: o.number ?? null,
    created_at: o.createdAt ?? null,
    customer_name: `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() || "Неизвестно",
    phone: o.phone ?? null,
    email: o.email ?? null,
    city: o.delivery?.address?.city ?? null,
    address: o.delivery?.address?.text ?? null,
    status: o.status ?? null,
    source: o.source?.source ?? null,
    total_kzt: resolveOrderTotal(o),
    raw_payload: o,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("orders").upsert(rows, { onConflict: "retailcrm_id" });

  if (error) throw new Error(`Supabase upsert error: ${error.message}`);
}

async function main() {
  console.log("🔄 Синхронизация RetailCRM → Supabase...\n");

  let page = 1;
  let totalSynced = 0;

  const first = await fetchOrdersPage(1);
  if (!first.success) {
    console.error("❌ RetailCRM вернул success=false");
    process.exit(1);
  }

  const totalPages = first.pagination.totalPageCount;
  console.log(`📊 Всего заказов: ${first.pagination.totalCount}, страниц: ${totalPages}\n`);

  await upsertOrders(first.orders);
  totalSynced += first.orders.length;
  console.log(`✅ Страница 1/${totalPages} — ${first.orders.length} заказов`);

  for (page = 2; page <= totalPages; page++) {
    const data = await fetchOrdersPage(page);
    await upsertOrders(data.orders);
    totalSynced += data.orders.length;
    console.log(`✅ Страница ${page}/${totalPages} — ${data.orders.length} заказов`);
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n🎉 Синхронизировано: ${totalSynced} заказов`);
}

main().catch((e) => {
  console.error("❌ Ошибка:", e);
  process.exit(1);
});
