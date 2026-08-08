import { request, requestJson } from "@/lib/api-client";
import {
  addLocalIncome,
  checkLocalFinanceSession,
  deleteLocalIncome,
  editLocalIncome,
  getLocalFinance,
  saveLocalFinanceGoal,
  unlockLocalFinanceSession,
} from "@/lib/local-store";
import type { FinancePayload } from "@/lib/smart-paper-types";

function isLocalStorageMode(): boolean {
  return process.env.NEXT_PUBLIC_DATA_MODE === "local";
}

export async function getFinance(): Promise<FinancePayload> {
  if (isLocalStorageMode()) {
    return getLocalFinance();
  }
  return requestJson<FinancePayload>("/finance/", {
    credentials: "include",
  });
}

export async function checkFinanceSession(): Promise<Response> {
  if (isLocalStorageMode()) {
    return checkLocalFinanceSession();
  }
  return request("/finance/", {
    credentials: "include",
  });
}

export async function unlockFinanceSession(pin: string): Promise<void> {
  if (isLocalStorageMode()) {
    return unlockLocalFinanceSession(pin);
  }
  const response = await request("/finance/unlock/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ pin }),
  });
  if (!response.ok) {
    throw response;
  }
}

export async function saveFinanceGoal(goalAmount: number): Promise<FinancePayload> {
  if (isLocalStorageMode()) {
    return saveLocalFinanceGoal(goalAmount);
  }
  return requestJson<FinancePayload>("/finance/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ goal_amount: goalAmount }),
  });
}

export async function addIncome(
  amount: number,
  note: string,
): Promise<FinancePayload> {
  if (isLocalStorageMode()) {
    return addLocalIncome(amount, note);
  }
  return requestJson<FinancePayload>("/finance/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      income_amount: amount,
      income_note: note,
    }),
  });
}

export async function deleteIncome(entryId: number): Promise<FinancePayload> {
  if (isLocalStorageMode()) {
    return deleteLocalIncome(entryId);
  }
  return requestJson<FinancePayload>(`/finance/incomes/${entryId}/`, {
    method: "DELETE",
    credentials: "include",
  });
}

export async function editIncome(
  entryId: number,
  amount: number,
  note: string,
  date: string,
): Promise<FinancePayload> {
  if (isLocalStorageMode()) {
    return editLocalIncome(entryId, amount, note, date);
  }
  return requestJson<FinancePayload>(`/finance/incomes/${entryId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      income_amount: amount,
      income_note: note,
      income_date: date,
    }),
  });
}
