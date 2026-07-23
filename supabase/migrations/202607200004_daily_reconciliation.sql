create extension if not exists pg_cron;

select cron.schedule(
  'jejak-daily-reconciliation',
  '15 0 * * *',
  $job$select private.run_reconciliation();$job$
);
