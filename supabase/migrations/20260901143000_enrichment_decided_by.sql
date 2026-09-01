-- Qui a tranché : l'appariement, ou un humain en revue ?
--
-- Rien ne distinguait les deux. `enrich` écrit `status = 'ok'` avec une fiche
-- retenue ; `review` écrit exactement la même forme quand un opérateur choisit
-- un candidat. Or ce sont deux choses très différentes dès qu'on veut rejouer
-- l'appariement sur les candidats déjà enregistrés — ce que permet désormais
-- `calibrate --apply`, sans repasser par Google.
--
-- Sans cette colonne, une réécriture des verdicts écraserait silencieusement
-- le travail de revue : l'opérateur a regardé cinq fiches, tranché, et le
-- calcul suivant le contredirait sans que personne ne le sache. C'est la
-- donnée la plus chère de la base, la seule qu'on ne puisse pas recalculer.
--
-- Le piège existait déjà avant `calibrate` : `enrich --retry-not-found`
-- rejoue les lignes `not_found`, et un rejet humain en revue produit
-- précisément un `not_found`. Le scraping suivant l'aurait donc réexaminé et
-- réécrit, en consommant du quota Google pour défaire une décision humaine.
--
-- Défaut à 'matcher' : les lignes existantes viennent toutes de `enrich`, la
-- revue n'ayant encore jamais été jouée sur cette base.
alter table prospect_enrichment
  add column decided_by text not null default 'matcher'
    check (decided_by in ('matcher', 'human'));
