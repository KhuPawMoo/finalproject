import { apiFetch } from "./api";
import { ReportSummary, Session, TimeseriesPoint, User, UserRole } from "../types";

export async function fetchSetupStatus() {
  return apiFetch<{ needsSetup: boolean }>("/auth/setup-status");
}

export async function bootstrapAdmin(input: {
  name: string;
  email: string;
  password: string;
}) {
  return apiFetch<Session>("/auth/bootstrap-admin", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function login(input: { email: string; password: string }) {
  return apiFetch<Session>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchCurrentUser() {
  return apiFetch<User>("/auth/me");
}

export async function fetchUsers() {
  return apiFetch<User[]>("/users");
}

export async function createUser(input: {
  email: string;
  password: string;
  name?: string;
  role: UserRole;
}) {
  return apiFetch<User>("/users", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function resetSystemData() {
  return apiFetch<{
    resetAt: string;
    deleted: {
      sales: number;
      saleItems: number;
      stockMovements: number;
      inventory: number;
      products: number;
      users: number;
    };
  }>("/admin/reset-data", {
    method: "POST"
  });
}

export async function fetchReportSummary(from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  return apiFetch<ReportSummary>("/reports/summary?" + params.toString());
}

export async function fetchTimeseries(from: string, to: string, bucket: "day" | "week" | "month") {
  const params = new URLSearchParams({ from, to, bucket });
  return apiFetch<TimeseriesPoint[]>("/reports/timeseries?" + params.toString());
}
