import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const THRESHOLD = parseFloat(process.env.HIGH_VALUE_THRESHOLD_KZT ?? "50000");
const CRON_SECRET = process.env.CRON_SECRET!;

async function sendTelegram(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
  if (!res.ok) throw new Error(`Telegram error: ${await res.text()}`);
}

export async function GET(req: NextRequest) {
  // Проверяем Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("retailcrm_id, customer_name, phone, city, total_kzt, status, created_at")
      .gt("total_kzt", THRESHOLD);

    if (ordersErr) throw new Error(ordersErr.message);

    const { data: sent } = await supabase.from("order_alerts").select("retailcrm_id");
    const sentIds = new Set((sent ?? []).map((r: { retailcrm_id: number }) => r.retailcrm_id));

    const newOrders = (orders ?? []).filter((o: { retailcrm_id: number }) => !sentIds.has(o.retailcrm_id));

    let sent_count = 0;

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
        `🕐 Дата: ${date}`;

      await sendTelegram(msg);
      await supabase.from("order_alerts").insert({
        retailcrm_id: order.retailcrm_id,
        total_kzt: order.total_kzt,
      });
      sent_count++;
    }

    return NextResponse.json({ ok: true, sent: sent_count });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
