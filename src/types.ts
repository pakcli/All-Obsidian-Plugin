export interface ColumnConfig {
  order: number[];
  hidden: number[];
  sizing: Record<string, number>;
  frozenCount: number;
}

export interface TablitePluginData {
  files: Record<string, ColumnConfig>;
}

export const DEFAULT_PLUGIN_DATA: TablitePluginData = {
  files: {},
};

export function createDefaultColumnConfig(columnCount: number): ColumnConfig {
  return {
    order: Array.from({ length: columnCount }, (_, index) => index),
    hidden: [],
    sizing: {},
    frozenCount: 0,
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
  };
}

export function remapColumnConfigForInsert(
  config: ColumnConfig,
  insertIndex: number,
  columnCountAfterInsert: number,
): ColumnConfig {
  const shift = (index: number) => (index >= insertIndex ? index + 1 : index);

  const order = config.order.map(shift);
  order.splice(Math.min(insertIndex, order.length), 0, insertIndex);

  const hidden = config.hidden.map(shift);
  const sizing = Object.fromEntries(
    Object.entries(config.sizing).map(([key, value]) => {
      const index = Number(key);
      return [String(shift(index)), value];
    }),
  );

  return normalizeColumnConfig(
    {
      order,
      hidden,
      sizing,
      frozenCount: config.frozenCount,
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

  return normalizeColumnConfig(
    {
      order,
      hidden,
      sizing,
      frozenCount: config.frozenCount,
    },
    columnCountAfterDelete,
  );
}
