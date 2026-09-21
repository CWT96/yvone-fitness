-- Run after deployment and Resend configuration. Replace the TWO placeholders.
-- Use the same CRON_SECRET in Vercel. Do not put real secrets in GitHub.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select vault.create_secret('https://YOUR-PROJECT.vercel.app', 'yvone_site_url');
select vault.create_secret('REPLACE_WITH_YOUR_CRON_SECRET', 'yvone_cron_secret');
select cron.schedule('yvone-email-delivery', '* * * * *', $$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='yvone_site_url') || '/api/notifications',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
     (select decrypted_secret from vault.decrypted_secrets where name='yvone_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 60000
 );
$$);
-- For a domain change, keep the same job and update its URL secret:
-- select vault.update_secret((select id from vault.secrets where name='yvone_site_url'), 'https://new-domain.com');
-- Inspect delivery calls: select * from net._http_response order by created desc limit 20;
-- Pause: select cron.unschedule('yvone-email-delivery');
