"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function setKillSwitch(fd: FormData) {
  const on = String(fd.get("on")) === "true";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  await admin
    .from("app_settings")
    .upsert({ key: "kill_switch", value: on, updated_at: new Date().toISOString() }, { onConflict: "key" });
  revalidatePath("/settings");
}
