import { InvuBranch } from '../services/invu_marcaciones';

const DEFAULT_BRANCH: InvuBranch = 'sf';

const NAME_TO_BRANCH: Record<string, InvuBranch> = {
  'san francisco': 'sf',
  sf: 'sf',
  // TODO: agregar mapeos para museo, cangrejo, costa y central cuando tengamos tokens activos.
};

export const getDefaultInvuBranch = (): InvuBranch => DEFAULT_BRANCH;

export const mapSucursalToInvuBranch = (name?: string | null): InvuBranch => {
  if (!name) return DEFAULT_BRANCH;
  const key = name.trim().toLowerCase();
  return NAME_TO_BRANCH[key] ?? DEFAULT_BRANCH;
};
