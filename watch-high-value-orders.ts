import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const THRESHOLD = parseFloat(process.env.HIGH_VALUE_THRESHOLD_KZT ?? "50000");

if (!SUPABASE_URL || !SUPABASE_KEY || !BOT_TOKEN || !CHAT_ID) {
  console.error("❌ Проверь .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sendTelegram(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

async function main() {
  console.log(`🔍 Ищу заказы > ${THRESHOLD.toLocaleString()} ₸...\n`);

  // Получаем заказы выше порога
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("retailcrm_id, customer_name, phone, city, total_kzt, status, created_at")
    .gt("total_kzt", THRESHOLD);

  if (ordersErr) {
    console.error("❌ Ошибка чтения orders:", ordersErr.message);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log("ℹ️ Нет заказов выше порога");
    return;
  }

  // Получаем уже отправленные алерты
  const { data: sent, error: sentErr } = await supabase
    .from("order_alerts")
    .select("retailcrm_id");

  if (sentErr) {
    console.error("❌ Ошибка чтения order_alerts:", sentErr.message);
    process.exit(1);
  }

  const sentIds = new Set((sent ?? []).map((r: { retailcrm_id: number }) => r.retailcrm_id));

  const newOrders = orders.filter((o: { retailcrm_id: number }) => !sentIds.has(o.retailcrm_id));

  if (newOrders.length === 0) {
    console.log("ℹ️ Новых алертов нет (все уже отправлены)");
    return;
  }

  console.log(`📬 Новых алертов: ${newOrders.length}\n`);

  for (const order of newOrders) {
    const date = order.created_at
      ? new Date(order.created_at).toLocaleString("ru-KZ", { timeZone: "Asia/Almaty" })
      : "—";

    const msg =
      `🔔 <b>Крупный заказ!</b>\n\n` +
      `👤 Клиент: ${order.customer_name}\n` +
      `📞 Телефон: ${order.phone ?? "—"}\n` +
      `🏙 Город: ${order.city ?? "—"}\n` +
      `💰 Сумма: <b>${Number(order.total_kzt).toLocaleString("ru-KZ")} ₸</b>\n` +
      `📋 Статус: ${order.status ?? "—"}\n` +
      `🕐 Дата: ${date}\n` +
      `🆔 RetailCRM ID: ${order.retailcrm_id}`;

    try {
      await sendTelegram(msg);

      const { error: insertErr } = await supabase.from("order_alerts").insert({
        retailcrm_id: order.retailcrm_id,
        total_kzt: order.total_kzt,
      });

      if (insertErr) {
        console.error(`⚠️ Не удалось записать алерт для ${order.retailcrm_id}:`, insertErr.message);
      } else {
        console.log(`✅ Уведомление отправлено: ${order.customer_name} — ${Number(order.total_kzt).toLocaleString()} ₸`);
      }
    } catch (e) {
      console.error(`❌ Ошибка отправки для ${order.retailcrm_id}:`, e);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n🎉 Готово!");
}

main().catch((e) => {
  console.error("❌ Ошибка:", e);
  process.exit(1);
});
