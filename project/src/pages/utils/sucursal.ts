export const normalizeSucursalId = (id?: string | null) => {
  if (!id) return null;
  const normalized = `${id}`.trim();
  return normalized.length > 0 ? normalized : null;
};

export type NormalizedSucursalId = ReturnType<typeof normalizeSucursalId>;
