import { DEFAULT_SETTINGS as DEFAULT_SQLSEAL_SETTINGS, type SQLSealSettings } from "./modules/settings/SQLSealSettingsTab";

export interface ColumnConfig {
  order: number[];
  hidden: number[];
  sizing: Record<string, number>;
  frozenCount: number;
  filters?: any[];
  sorting?: any[];
}

export interface TablitePluginData extends SQLSealSettings {
  files: Record<string, ColumnConfig>;
  debug: boolean;
  scannerApiProvider: "claude" | "gemini" | "openrouter";
  scannerApiKey: string;
  scannerApiModel: string;
  scannerTxnIdPrefix: string;
  scannerItemIdPrefix: string;
  scannerIdUseSeparator: boolean;
  scannerIdSeparator: string;
  scannerIdSuffixType: "4numbers" | "4letters" | "4mixed";
}

export const DEFAULT_PLUGIN_DATA: TablitePluginData = {
  ...DEFAULT_SQLSEAL_SETTINGS,
  files: {},
  debug: false,
  scannerApiProvider: "gemini",
  scannerApiKey: "",
  scannerApiModel: "gemini-2.5-flash",
  scannerTxnIdPrefix: "TXN_BCAZ",
  scannerItemIdPrefix: "ITM",
  scannerIdUseSeparator: true,
  scannerIdSeparator: "_",
  scannerIdSuffixType: "4numbers",
};

export function createDefaultColumnConfig(columnCount: number): ColumnConfig {
  return {
    order: Array.from({ length: columnCount }, (_, index) => index),
    hidden: [],
    sizing: {},
    frozenCount: 0,
    filters: [],
    sorting: [],
  };
}

export function normalizeColumnConfig(
  config: Partial<ColumnConfig> | undefined,
  columnCount: number,
): ColumnConfig {
  const base = createDefaultColumnConfig(columnCount);
  if (!config) return base;

  const validIndex = (value: number) =>
    Number.isInteger(value) && value >= 0 && value < columnCount;

  const order = [
    ...(config.order ?? []).filter(validIndex),
    ...base.order.filter((index) => !(config.order ?? []).includes(index)),
  ];

  const hidden = Array.from(new Set((config.hidden ?? []).filter(validIndex)));

  const sizing = Object.fromEntries(
    Object.entries(config.sizing ?? {}).filter(([key, value]) => {
      const index = Number(key);
      return validIndex(index) && typeof value === "number" && Number.isFinite(value);
    }),
  );

  const visibleCount = Math.max(0, columnCount - hidden.length);
  const requestedFrozen = typeof config.frozenCount === "number" ? config.frozenCount : 0;
  const frozenCount = Math.max(0, Math.min(requestedFrozen, visibleCount));

  return {
    order,
    hidden,
    sizing,
    frozenCount,
    filters: config.filters ?? [],
    sorting: config.sorting ?? [],
  };
}

export function remapColumnConfigForInsert(
  config: ColumnConfig,
  insertIndex: number,
  columnCountAfterInsert: number,
): ColumnConfig {
  const shift = (index: number) => (index >= insertIndex ? index + 1 : index);
  const shiftId = (id: string) => {
    if (id.startsWith('col_')) {
      const idx = Number(id.replace('col_', ''));
      return `col_${idx >= insertIndex ? idx + 1 : idx}`;
    }
    return id;
  };

  const order = config.order.map(shift);
  order.splice(Math.min(insertIndex, order.length), 0, insertIndex);

  const hidden = config.hidden.map(shift);
  const sizing = Object.fromEntries(
    Object.entries(config.sizing).map(([key, value]) => {
      const index = Number(key);
      return [String(shift(index)), value];
    }),
  );

  const filters = (config.filters ?? []).map(f => ({ ...f, id: shiftId(f.id) }));
  const sorting = (config.sorting ?? []).map(s => ({ ...s, id: shiftId(s.id) }));

  return normalizeColumnConfig(
    {
      order,
      hidden,
      sizing,
      frozenCount: config.frozenCount,
      filters,
      sorting,
    },
    columnCountAfterInsert,
  );
}

export function remapColumnConfigForDelete(
  config: ColumnConfig,
  deleteIndex: number,
  columnCountAfterDelete: number,
): ColumnConfig {
  const shift = (index: number) => (index > deleteIndex ? index - 1 : index);
  const shiftId = (id: string) => {
    if (id.startsWith('col_')) {
      const idx = Number(id.replace('col_', ''));
      return `col_${idx > deleteIndex ? idx - 1 : idx}`;
    }
    return id;
  };

  const order = config.order
    .filter((index) => index !== deleteIndex)
    .map(shift);

  const hidden = config.hidden
    .filter((index) => index !== deleteIndex)
    .map(shift);

  const sizing = Object.fromEntries(
    Object.entries(config.sizing)
      .filter(([key]) => Number(key) !== deleteIndex)
      .map(([key, value]) => {
        const index = Number(key);
        return [String(shift(index)), value];
      }),
  );

  const filters = (config.filters ?? [])
    .filter(f => f.id !== `col_${deleteIndex}`)
    .map(f => ({ ...f, id: shiftId(f.id) }));
  const sorting = (config.sorting ?? [])
    .filter(s => s.id !== `col_${deleteIndex}`)
    .map(s => ({ ...s, id: shiftId(s.id) }));

  return normalizeColumnConfig(
    {
      order,
      hidden,
      sizing,
      frozenCount: config.frozenCount,
      filters,
      sorting,
    },
    columnCountAfterDelete,
  );
}
