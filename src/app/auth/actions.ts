"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function signOut() {
  const store = await cookies();
  store.delete("gh_id_token");
  redirect("/login");
}
