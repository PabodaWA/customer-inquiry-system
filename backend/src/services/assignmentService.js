/**
 * Assigns a new inquiry to the least-loaded active handler for its category.
 * The caller must pass a client with an open transaction; cursor and handler
 * locks therefore remain held until the inquiry creation transaction commits.
 */
async function assignInquiryAutomatically(client, category) {
  await client.query(
    `INSERT INTO assignment_state (category, last_assigned_handler_id)
     VALUES ($1, NULL)
     ON CONFLICT (category) DO NOTHING`,
    [category]
  );

  const stateResult = await client.query(
    `SELECT last_assigned_handler_id
     FROM assignment_state
     WHERE category = $1
     FOR UPDATE`,
    [category]
  );
  const lastAssignedHandlerId = stateResult.rows[0]?.last_assigned_handler_id ?? null;

  // Lock eligible handler rows in a stable order before measuring workload.
  const handlersResult = await client.query(
    `SELECT id, full_name
     FROM users
     WHERE role = 'HANDLER'
       AND is_active = TRUE
       AND specialization = $1
     ORDER BY id ASC
     FOR UPDATE`,
    [category]
  );
  const handlers = handlersResult.rows;
  if (!handlers.length) return { handler: null, workload: null };

  const handlerIds = handlers.map((handler) => handler.id);
  // This intentionally has no category predicate: active load is across all categories.
  const workloadResult = await client.query(
    `SELECT assigned_to AS handler_id, COUNT(*)::int AS active_workload
     FROM inquiries
     WHERE assigned_to = ANY($1::int[])
       AND status IN ('NEW', 'IN_PROGRESS')
     GROUP BY assigned_to`,
    [handlerIds]
  );
  const workloads = new Map(workloadResult.rows.map((row) => [Number(row.handler_id), Number(row.active_workload)]));
  const lowestWorkload = Math.min(...handlers.map((handler) => workloads.get(Number(handler.id)) ?? 0));
  const tiedHandlers = handlers.filter((handler) => (workloads.get(Number(handler.id)) ?? 0) === lowestWorkload);

  let selected = tiedHandlers[0];
  if (tiedHandlers.length > 1 && lastAssignedHandlerId !== null) {
    selected = tiedHandlers.find((handler) => Number(handler.id) > Number(lastAssignedHandlerId)) ?? tiedHandlers[0];
  }

  await client.query(
    `UPDATE assignment_state
     SET last_assigned_handler_id = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE category = $1`,
    [category, selected.id]
  );

  return { handler: selected, workload: lowestWorkload };
}

module.exports = { assignInquiryAutomatically };
