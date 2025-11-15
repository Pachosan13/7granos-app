# cont_post_cogs_from_inv rewrite

Se reemplazó la función `public.cont_post_cogs_from_inv` para que postee COGS reales desde `v_cogs_dia_norm` directamente en las tablas del nuevo GL (`contabilidad_journal` y `contabilidad_journal_line`).

- Se eliminó cualquier dependencia con `cont_journal`, `cont_entry` o `cont_post_journal`.
- Se controla la idempotencia revisando `journal_date`, `description` y `source = 'cogs'` antes de insertar.
- Se mantienen los códigos de cuenta: COGS (`5.1.1`) e Inventario (`1.3.1`).

Esto asegura que los reportes del dashboard (P&L, balance, libro mayor) utilicen exclusivamente el nuevo libro mayor.
