SELECT json_build_object(
  'transactions', (
    SELECT coalesce(json_agg(t ORDER BY t."createdAt", t.id), '[]'::json)
    FROM (
      SELECT
        x.id,
        x."venueId",
        x."eventId",
        x."serviceId",
        s.name AS "serviceName",
        x."staffId",
        x.type,
        x.amount,
        x."customerName",
        x.notes,
        to_char(x."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM transactions x
      LEFT JOIN services s ON s.id = x."serviceId"
    ) t
  ),
  'payroll', (
    SELECT coalesce(json_agg(t ORDER BY t."periodStart", t.id), '[]'::json)
    FROM (
      SELECT
        p.id,
        p."venueId",
        p."membershipId",
        p."isManualEntry",
        p."manualEntryName",
        p."paymentType",
        p."baseRate",
        p."hoursWorked",
        p."bonusAmount",
        p."totalAmount",
        to_char(p."periodStart", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "periodStart",
        to_char(p."periodEnd", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "periodEnd",
        p."isPaid",
        to_char(p."paidAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "paidAt",
        p."paidBy",
        p.notes,
        p."potDistributionId",
        to_char(p."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        to_char(p."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM payroll_entries p
    ) t
  )
);
