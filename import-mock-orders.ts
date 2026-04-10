import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import "dotenv/config";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const BASE_URL = process.env.RETAILCRM_BASE_URL!;
const API_KEY = process.env.RETAILCRM_API_KEY!;
const SITE = process.env.RETAILCRM_SITE!;

if (!BASE_URL || !API_KEY || !SITE) {
  console.error("❌ Заполни RETAILCRM_BASE_URL, RETAILCRM_API_KEY, RETAILCRM_SITE в .env");
  process.exit(1);
}

interface MockOrder {
  externalId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  status: string;
  source: string;
  total: number;
}

async function createOrder(order: MockOrder): Promise<void> {
  const payload = {
    externalId: order.externalId,
    firstName: order.firstName,
    lastName: order.lastName,
    phone: order.phone,
    email: order.email,
    delivery: {
      address: {
        city: order.city,
        text: order.address,
      },
    },
    status: order.status,
    orderType: "eshop-individual",
    summed: order.total,
  };

  const formData = new URLSearchParams();
  formData.append("order", JSON.stringify(payload));
  formData.append("site", SITE);

  const res = await fetch(`${BASE_URL}/api/v5/orders/create`, {
    method: "POST",
    headers: {
      "X-API-KEY": API_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const json = (await res.json()) as { success: boolean; id?: number; errorMsg?: string; errors?: Record<string, string> };

  if (json.success) {
    console.log(`✅ ${order.externalId} — ${order.firstName} ${order.lastName} (${order.total} ₸) → id=${json.id}`);
  } else {
    console.error(`❌ ${order.externalId} — ${json.errorMsg ?? JSON.stringify(json.errors)}`);
  }
}

async function main() {
  const filePath = path.resolve(__dirname, "../data/mock_orders.json");
  const orders: MockOrder[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  console.log(`📦 Загружаю ${orders.length} заказов в RetailCRM...`);
  console.log(`🌐 URL: ${BASE_URL}`);
  console.log(`🏪 Site: ${SITE}\n`);

  let success = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await createOrder(order);
      success++;
    } catch (e) {
      console.error(`❌ ${order.externalId} — network error:`, e);
      failed++;
    }
    // Небольшая задержка чтобы не превысить rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n🎉 Готово! Успешно: ${success}, ошибок: ${failed}`);
}

main();
