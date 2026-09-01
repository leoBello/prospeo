#!/usr/bin/env bash
# Réinitialise le mot de passe du compte du dashboard.
#
# L'application n'a pas d'écran « mot de passe oublié » — compte unique, créé
# côté Supabase, comme le dit l'écran de connexion. Le lien de récupération
# habituel ne mènerait donc nulle part : on passe par l'API d'administration.
#
# Le mot de passe est lu SANS ÉCHO (`read -s`) et n'est jamais passé en
# argument : un argument de ligne de commande atterrit dans l'historique du
# shell et reste lisible dans la liste des processus pendant l'appel.
#
#   bash scripts/reset-password.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Aucun .env à la racine du dépôt." >&2
  exit 1
fi

# `set -a` exporte tout ce que le fichier définit, le temps de le lire.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${SUPABASE_URL:?SUPABASE_URL manquant dans .env}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY manquant dans .env}"

EMAIL="${1:-leobello.wd@gmail.com}"

printf 'Compte : %s\n' "$EMAIL"
printf 'Nouveau mot de passe (invisible, 8 caractères minimum) : '
read -rs MOTDEPASSE
printf '\n'
printf 'Confirmer : '
read -rs CONFIRMATION
printf '\n'

if [ "$MOTDEPASSE" != "$CONFIRMATION" ]; then
  echo "Les deux saisies diffèrent. Rien n'a été modifié." >&2
  exit 1
fi
if [ "${#MOTDEPASSE}" -lt 8 ]; then
  echo "Trop court : 8 caractères minimum. Rien n'a été modifié." >&2
  exit 1
fi

# L'identifiant de l'utilisateur, retrouvé par son adresse.
UID_UTILISATEUR=$(
  curl -sS "$SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" |
    EMAIL="$EMAIL" python -c '
import json, os, sys
cible = os.environ["EMAIL"].lower()
for u in json.load(sys.stdin).get("users", []):
    if (u.get("email") or "").lower() == cible:
        print(u["id"])
        break
'
)

if [ -z "$UID_UTILISATEUR" ]; then
  echo "Aucun compte pour $EMAIL." >&2
  exit 1
fi

# Le corps JSON est fabriqué par Python plutôt que par interpolation : un
# guillemet ou une antislash dans le mot de passe casserait un JSON assemblé à
# la main, et le message d'erreur ne dirait pas pourquoi.
CORPS=$(MOTDEPASSE="$MOTDEPASSE" python -c '
import json, os
print(json.dumps({"password": os.environ["MOTDEPASSE"]}))
')

REPONSE=$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X PUT "$SUPABASE_URL/auth/v1/admin/users/$UID_UTILISATEUR" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    --data-binary "$CORPS"
)

unset MOTDEPASSE CONFIRMATION CORPS

if [ "$REPONSE" = "200" ]; then
  echo "Mot de passe changé. Connexion sur http://localhost:5173"
else
  echo "Échec : l'API a répondu $REPONSE." >&2
  exit 1
fi
