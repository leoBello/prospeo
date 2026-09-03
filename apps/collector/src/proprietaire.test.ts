import { describe, expect, it } from 'vitest';
import { proprietaire } from './proprietaire.js';

describe('proprietaire', () => {
  it('accepte un uuid', () => {
    const id = '131ab48e-055a-4a15-af4b-79ed7a2e4465';
    expect(proprietaire(id)).toBe(id);
  });

  it('refuse une valeur absente, plutot que de traiter toute la base', () => {
    // Sans cette garde, une commande lancee sans --owner lirait les donnees
    // de TOUS les utilisateurs et les traiterait comme celles d un seul.
    // L echec doit etre bruyant : un filtre absent ne leve rien, il rend
    // simplement plus de lignes.
    //
    // Le MESSAGE est assiste, et pas seulement le fait de lever. Sans lui,
    // l assertion serait morte : `UUID.test(undefined)` convertit en la
    // chaine « undefined », qui echoue le motif — retirer la garde
    // ci-dessous laisserait la seconde lever a sa place, et le test vert.
    // Or les deux absences sont de natures differentes : « pas de --owner »
    // n est pas « --owner mal ecrit », et c est ce que le message distingue.
    expect(() => proprietaire(undefined)).toThrow('--owner <uuid> est obligatoire');
  });

  it('refuse une chaine qui n est pas un uuid', () => {
    // `--owner leo` passerait un filtre `.eq('owner_id', 'leo')` qui ne
    // rendrait aucune ligne : un run silencieusement vide, qu on prendrait
    // pour « rien a faire ». Le message cite la valeur recue, faute de quoi
    // l operateur relit sa ligne de commande sans voir sa faute de frappe.
    expect(() => proprietaire('leo')).toThrow('--owner attend un uuid, reçu « leo »');
  });
});
