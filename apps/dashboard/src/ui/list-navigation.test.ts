import { describe, expect, it } from 'vitest';
import { navigate, shouldIgnoreKeyboard, type NavigationState } from './list-navigation.js';

const etat = (patch: Partial<NavigationState> = {}): NavigationState => ({
  ids: ['a', 'b', 'c'],
  selectedId: null,
  panelOpen: false,
  ...patch,
});

describe('navigate', () => {
  it('descend et remonte d une ligne', () => {
    const bas = navigate(etat({ selectedId: 'a' }), 'ArrowDown');
    expect(bas.selectedId).toBe('b');
    expect(navigate(bas, 'ArrowUp').selectedId).toBe('a');
  });

  it('ne boucle pas aux extremites, une file d appels ne devant pas ramener a quelqu un de deja traite', () => {
    expect(navigate(etat({ selectedId: 'c' }), 'ArrowDown').selectedId).toBe('c');
    expect(navigate(etat({ selectedId: 'a' }), 'ArrowUp').selectedId).toBe('a');
  });

  it('garde le panneau ouvert pendant le parcours, c est tout l interet du patron', () => {
    // §9.1 : « les flèches parcourent les prospects sans quitter le panneau ».
    const apres = navigate(etat({ selectedId: 'a', panelOpen: true }), 'ArrowDown');
    expect(apres.panelOpen).toBe(true);
    expect(apres.selectedId).toBe('b');
  });

  it('ouvre le panneau des la premiere selection au clavier', () => {
    const apres = navigate(etat(), 'ArrowDown');
    expect(apres.selectedId).toBe('a');
    expect(apres.panelOpen).toBe(true);
  });

  it('remonte sur la derniere ligne quand rien n est selectionne', () => {
    expect(navigate(etat(), 'ArrowUp').selectedId).toBe('c');
  });

  it('ferme le panneau sans perdre la selection, pour que le rouvrir revienne au meme prospect', () => {
    const apres = navigate(etat({ selectedId: 'b', panelOpen: true }), 'Escape');
    expect(apres.panelOpen).toBe(false);
    expect(apres.selectedId).toBe('b');
  });

  it('ne selectionne rien sur une liste vide', () => {
    const apres = navigate(etat({ ids: [] }), 'ArrowDown');
    expect(apres.selectedId).toBeNull();
    expect(apres.panelOpen).toBe(false);
  });

  it('repart du debut quand la ligne selectionnee a disparu de la liste', () => {
    // Les données se rafraîchissent pendant qu'on navigue — l'enrichissement
    // écrit en continu. Une sélection devenue introuvable figerait les flèches
    // sans que rien ne l'explique.
    const apres = navigate(etat({ selectedId: 'disparu', panelOpen: true }), 'ArrowDown');
    expect(apres.selectedId).toBe('a');
  });
});

describe('shouldIgnoreKeyboard', () => {
  it('laisse les champs de saisie tranquilles, sans quoi taper un filtre ferait defiler la liste', () => {
    for (const balise of ['input', 'textarea', 'select']) {
      expect(shouldIgnoreKeyboard(document.createElement(balise))).toBe(true);
    }
  });

  it('laisse passer les touches depuis le corps de la page ou une ligne de liste', () => {
    expect(shouldIgnoreKeyboard(document.body)).toBe(false);
    expect(shouldIgnoreKeyboard(document.createElement('button'))).toBe(false);
    expect(shouldIgnoreKeyboard(null)).toBe(false);
  });

  it('respecte un bloc editable, qui n est pourtant pas un champ de formulaire', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(shouldIgnoreKeyboard(div)).toBe(true);
  });
});
