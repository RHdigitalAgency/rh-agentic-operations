import { ForbiddenError } from "@/lib/errors";
import { ROLE_CAPABILITIES, ROLE_SCOPE, type Capability, type Role } from "./roles";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
}

export function can(user: SessionUser, cap: Capability): boolean {
  return ROLE_CAPABILITIES[user.role]?.has(cap) ?? false;
}

export function requireCap(user: SessionUser, cap: Capability): void {
  if (!can(user, cap)) throw new ForbiddenError();
}

export function scopeOf(user: SessionUser) {
  return ROLE_SCOPE[user.role];
}
