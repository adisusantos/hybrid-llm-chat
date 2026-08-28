"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createChat as dbCreateChat,
  deleteChat as dbDeleteChat,
  listChats,
} from "@/lib/db/queries";

export async function listChatsAction() {
  return listChats();
}

export async function createChatAction(formData: FormData) {
  const title = (formData.get("title") as string | null)?.trim() || undefined;
  const id = await dbCreateChat({ title });
  revalidatePath("/chat");
  redirect(`/chat/${id}`);
}

export async function deleteChatAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  await dbDeleteChat(id);
  revalidatePath("/chat");
  redirect("/chat");
}
