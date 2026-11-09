# sefaria-gnome

Lecteur [Sefaria](https://www.sefaria.org) pour GNOME : une application GTK 4 / libadwaita (GJS)
qui parcourt la bibliothèque et affiche les textes (hébreu + traduction) via l'API publique de
Sefaria (https://developers.sefaria.org). Même pile technique qu'opencode-gnome et wa-gnome.

## Architecture
- `src/shared/api.ts` : **contrat** avec l'API Sefaria (schémas zod/mini de `/api/index` et
  `/api/v3/texts/{ref}`, conversion en `LibraryNode` / `Passage`) ; sans dépendance à GJS ni à Node
  (importé aussi par le faux serveur).
- `src/shared/` (GJS) : client libsoup 3 (`client.ts`), état partagé (`store.ts` : bibliothèque,
  caches des requêtes), état d'un onglet (`reader.ts` : passage, segment sélectionné), réglages
  (`settings.ts`), onglets à rouvrir, historique et signets (`userdata.ts`, `$XDG_DATA_HOME`), HTML de Sefaria → balisage Pango (`markup.ts` : notes de bas de page retirées).
- `src/app/` : application `Adw.Application` en TSX avec gnim (`gnim/gtk4`) : bibliothèque et tables
  des matières en barre latérale (`LibraryPane.tsx`), onglets de lecture (`Tabs.ts`), barre d'en-tête
  de l'onglet courant et vue d'un onglet (`ReaderPage.tsx`), panneau des liens (`LinksPanel.ts`).
- `data/fonts/` : polices livrées (Taamey Frank CLM pour l'hébreu, GPL + exception de police),
  chargées au démarrage par `src/app/fonts.ts` (Pango) : ni installation ni police système requises.
- `scripts/` : outillage Node 24 (build esbuild, types gnim, tests, captures, faux serveur, installation).
- Variables : `SEFARIA_GNOME_URL` (serveur, défaut https://www.sefaria.org), `SEFARIA_GNOME_REF`
  (passage ouvert au démarrage), `SEFARIA_GNOME_APP_ID` (identifiant D-Bus).

## Commandes (dans le shell devenv)
- `pnpm check` : typecheck + lint (oxlint type-aware) + `pnpm test`. Doit passer avant chaque commit.
- `pnpm test` : specs unitaires jasmine-gjs (`specs/*.spec.ts`, describe / it / expect ; une seule :
  `pnpm test specs/markup.spec.ts`), puis tests GJS sous Xvfb (`tests/*.ts`, bundlés, terminés par
  `print('TEST OK')`) ; échec sur tout `Gtk-WARNING`/`Gtk-CRITICAL` ou délai dépassé. Le serveur y est
  injoignable : aucun test ne dépend du vrai Sefaria.
- `pnpm e2e` : tests de bout en bout (`e2e/test_*.py`, pytest + dogtail, ≈ 15 s) sur le faux Sefaria :
  l'app est pilotée par l'accessibilité (rôle et nom : texte affiché ou infobulle) sur un écran
  virtuel, bus D-Bus, bus d'accessibilité et GSettings privés. Un seul : `pnpm e2e -k lecture`.
  À lancer avant de fusionner un changement d'interface ; ajouter le scénario de chaque fonctionnalité.
  Un bouton à icône sans infobulle est introuvable : toujours lui donner une infobulle.
- `pnpm fake-sefaria [--port 4890] [--delay ms]` : faux serveur (bibliothèque et passages de
  `e2e/fixtures/`, `GET /__test/requests` : requêtes reçues). Lancer l'app avec `SEFARIA_GNOME_URL`.
  Nouveau passage de test : l'ajouter à `e2e/fixtures/texts.json` (réponse réelle de l'API, réduite).
- `pnpm screenshot [sortie.png] [--ref "Genesis 1"] [--real]` : lance l'app sur un écran virtuel
  (Xvfb), branchée sur le faux Sefaria (`--real` : vrai serveur), et en fait une capture.
  **Toujours valider un changement d'interface ainsi**, jamais en ouvrant une fenêtre sur l'écran de
  l'utilisateur. Interactions : `SCREENSHOT_XDOTOOL="mousemove 140 80 click 1; sleep 1; type Genesis 2; key Return; sleep 2"`
  (`sh: commande` pour une commande shell, ex. `xclip` pour remplir le presse-papier).
- `pnpm build` / `pnpm start` : construire / lancer l'application.
- `node scripts/install.ts` : installe le lanceur `sefaria-gnome`, le .desktop, le service D-Bus et
  les icônes.

## Conventions
- TypeScript strict ; données externes (API, fichiers) validées avec zod/mini.
- Interface, commentaires et messages de commit en français.
- Toute évolution de l'usage de l'API passe par `src/shared/api.ts`.
- gnim n'est pas React : un composant s'exécute une fois, seules les valeurs liées se mettent à jour.
  Pour une liste ordonnée réactive, utiliser `keyedBox` / `keyedListBox` (`src/app/KeyedBox.ts`), pas `<For>`.
  Pas de `<With>` directement dans un `<With>` (Fragments imbriqués non gérés) : intercaler un `Gtk.Box`.
  Un `Gtk.Stack` dont `visibleChildName` est lié doit avoir tous ses enfants nommés dès la
  construction (sinon `Gtk-WARNING` : enfant introuvable).
- Hébreu : libellé placé à droite (`xalign: 1`) et `justify: LEFT` : Pango détecte la direction RTL
  du paragraphe et inverse LEFT / RIGHT (`justify: RIGHT` renverrait les lignes suivantes à gauche).
  Pas de `set_direction(RTL)` (qui inverse `xalign`).
- Tout bouton à icône seule a une infobulle.
- Ne jamais bloquer la boucle principale (requêtes et traitements longs en asynchrone).
- Respecter le serveur de Sefaria : pas de requêtes en rafale ni de tests sur le vrai serveur
  (le faux serveur sert aux tests, captures et e2e).

## Flux de travail
- **Aucun commit, rebase, fusion ni push sans l'ordre explicite de l'utilisateur.** Une fois
  l'implémentation prête (`pnpm check` OK, captures faites), installer (`node scripts/install.ts`),
  présenter ce qu'il faut tester et attendre sa validation.
- **Une branche par issue** : `git switch -c issue-<numéro>` depuis `main` à jour
  (`git fetch && git merge --ff-only origin/main`). Jamais de commit direct sur `main`.
- **Fusion**, une fois l'issue validée et sur ordre de l'utilisateur :
  1. `git fetch && git rebase origin/main`, puis `pnpm check` ;
  2. `git push origin issue-<numéro>:main` (refusé si `main` a avancé : refaire l'étape 1) ;
  3. `git switch main && git merge --ff-only origin/main && git branch -D issue-<numéro>`.
- Travail en parallèle : un worktree par agent (`sefaria-gnome-2`, `sefaria-gnome-3`…), jamais deux
  agents dans le même dossier ; chacun lance son faux serveur sur son propre port (`--port`).
- Messages de commit en français, courts, au style des commits existants.

## Suivi des fonctionnalités : issues GitHub
Dépôt : https://github.com/maarekj/sefaria-gnome
- **Chaque fonctionnalité ou correctif a son issue**, créée avant de commencer
  (`gh issue create`), avec le besoin, la solution envisagée et les critères de validation.
- Une issue = un seul agent : avant de commencer, vérifier qu'elle n'est pas déjà prise, puis
  commenter « En cours dans <dossier> » sur l'issue.
- Les commits y font référence (`#12`) ; `Closes #12` dans le commit qui la termine.
- **Quand l'implémentation est finie, commenter l'issue** (`gh issue comment`) avec un
  récapitulatif : ce qui a été fait, comment c'est vérifié (captures, tests), limites connues
  et ce qui n'a pas été testé.
- Les idées non encore planifiées restent dans `TODO.md` jusqu'à leur passage en issue.
