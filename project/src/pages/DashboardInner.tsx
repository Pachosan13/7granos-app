import React from 'react';
import DashboardExecutive from './DashboardExecutive';

/**
 * Wrapper para mantener compatibilidad con la carga diferida existente.
 */
export default function DashboardInner() {
  return <DashboardExecutive />;
}
