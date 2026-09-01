-- `probed_at` ne peut pas servir : `probe` et `domains` sont deux étages
-- distincts, et partager l'horodatage ferait passer l'un pour l'autre.
alter table web_presence add column domain_checked_at timestamptz;
