# sefaria-gnome

Lecteur non officiel de la bibliothèque [Sefaria](https://www.sefaria.org) pour GNOME
(GTK 4, libadwaita, GJS + gnim).

- Parcours de la bibliothèque par catégories (Tanakh, Talmud…).
- Lecture d'un passage en hébreu et en traduction, section par section.
- Saisie directe d'une référence (`Ctrl+L`) : « Genesis 1 », « Berakhot 2a », « Genesis 1:3-5 »…

## Développement

Prérequis : [devenv](https://devenv.sh) (Nix) et direnv.

```sh
direnv allow          # ou : devenv shell
pnpm start            # construire et lancer
pnpm check            # typecheck + lint + tests
pnpm e2e              # tests de bout en bout (faux serveur Sefaria)
node scripts/install.ts   # lanceur, .desktop et icônes dans ~/.local
```

Voir `AGENTS.md` pour l'architecture, les conventions et le flux de travail.
