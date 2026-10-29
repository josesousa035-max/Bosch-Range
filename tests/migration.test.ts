import "fake-indexeddb/auto";
import { openDB } from "idb";
import { it, expect } from "vitest";
import {
  openDatabase,
  getSettings,
  listSimulations,
  listRoutes,
} from "../src/core/storage";
import { defaults } from "../src/core/model";
it("migra IndexedDB v1 para v3 sem perder preferências, previsões e registos existentes", async () => {
  const old = await openDB("bosch-range-lab", 1, {
    upgrade(d) {
      d.createObjectStore("settings");
      d.createObjectStore("activities", { keyPath: "id" });
      d.createObjectStore("adjustments", { keyPath: "at" });
    },
  });
  await old.put("settings", { ...defaults, riderKg: 87 }, "current");
  await old.put(
    "settings",
    [
      {
        at: "2026-10-26",
        name: "Antes da migração",
        distanceKm: 10,
        wh: 100,
        arrivalSoc: 50,
      },
    ],
    "simulations",
  );
  await old.put("activities", {
    id: "legacy",
    notes: "Preservar sem reescrever durante migração",
  });
  old.close();
  const upgraded = await openDatabase();
  expect(upgraded.version).toBe(3);
  expect((await getSettings()).riderKg).toBe(87);
  expect((await listSimulations())[0].name).toBe("Antes da migração");
  expect((await upgraded.get("activities", "legacy")).notes).toContain(
    "Preservar",
  );
  expect(await listRoutes()).toEqual([]);
});
