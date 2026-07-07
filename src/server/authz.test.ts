import { describe, it, expect } from "vitest";
import {
  isAdmin,
  isManagerOrAdmin,
  isUserRole,
  assertAdmin,
  assertManagerOrAdmin,
  assertCanGrantRole,
  ROLE_VALUES,
} from "./authz";

describe("isUserRole", () => {
  it("accepts the three valid roles", () => {
    expect(isUserRole("ADMIN")).toBe(true);
    expect(isUserRole("MANAGER")).toBe(true);
    expect(isUserRole("USER")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isUserRole("admin")).toBe(false);
    expect(isUserRole("SUPERUSER")).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isUserRole(null)).toBe(false);
    expect(isUserRole(42)).toBe(false);
  });
});

describe("isAdmin / isManagerOrAdmin", () => {
  it("isAdmin only matches ADMIN", () => {
    expect(isAdmin("ADMIN")).toBe(true);
    expect(isAdmin("MANAGER")).toBe(false);
    expect(isAdmin("USER")).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("isManagerOrAdmin matches ADMIN and MANAGER", () => {
    expect(isManagerOrAdmin("ADMIN")).toBe(true);
    expect(isManagerOrAdmin("MANAGER")).toBe(true);
    expect(isManagerOrAdmin("USER")).toBe(false);
  });
});

describe("assertAdmin", () => {
  it("returns silently for ADMIN", () => {
    expect(() => assertAdmin("ADMIN")).not.toThrow();
  });

  it("throws FORBIDDEN otherwise", () => {
    expect(() => assertAdmin("MANAGER")).toThrowError(/Admin privileges/);
    expect(() => assertAdmin("USER")).toThrowError(/Admin privileges/);
  });
});

describe("assertManagerOrAdmin", () => {
  it("returns silently for ADMIN or MANAGER", () => {
    expect(() => assertManagerOrAdmin("ADMIN")).not.toThrow();
    expect(() => assertManagerOrAdmin("MANAGER")).not.toThrow();
  });

  it("throws FORBIDDEN for USER", () => {
    expect(() => assertManagerOrAdmin("USER")).toThrow();
  });
});

describe("assertCanGrantRole", () => {
  it("only ADMIN can grant ADMIN", () => {
    expect(() => assertCanGrantRole("ADMIN", "ADMIN")).not.toThrow();
    expect(() => assertCanGrantRole("MANAGER", "ADMIN")).toThrow();
    expect(() => assertCanGrantRole("USER", "ADMIN")).toThrow();
  });

  it("only ADMIN can grant MANAGER", () => {
    expect(() => assertCanGrantRole("ADMIN", "MANAGER")).not.toThrow();
    expect(() => assertCanGrantRole("MANAGER", "MANAGER")).toThrow();
  });

  it("ADMIN or MANAGER can grant USER", () => {
    expect(() => assertCanGrantRole("ADMIN", "USER")).not.toThrow();
    expect(() => assertCanGrantRole("MANAGER", "USER")).not.toThrow();
    expect(() => assertCanGrantRole("USER", "USER")).toThrow();
  });
});

describe("ROLE_VALUES", () => {
  it("contains all three Prisma UserRole members", () => {
    expect([...ROLE_VALUES]).toEqual(expect.arrayContaining(["ADMIN", "MANAGER", "USER"]));
    expect(ROLE_VALUES).toHaveLength(3);
  });
});
