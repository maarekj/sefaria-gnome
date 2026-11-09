"""Parcours principaux : bibliothèque, lecture, navigation entre sections, référence saisie."""

from conftest import wait_until


def test_bibliotheque_puis_lecture(run_app):
    fake, app = run_app()
    assert app.text_visible('Choisissez un texte')
    # Tanakh → Torah → Genesis → chapitre 1
    app.point(app.find('label', 'Tanakh'))
    app.point(app.find('label', 'Torah'))
    app.point(app.find('label', 'Genesis'))
    assert app.text_visible('Chapitres')
    assert app.has('button', '50')
    app.click('button', '1')
    assert app.text_visible('When God began to create heaven and earth')
    assert app.text_visible('בראשית א׳')
    assert any(r.startswith('/api/v3/texts/Genesis%201') for r in fake.requests())


def test_section_suivante_et_precedente(run_app):
    _, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    app.click('button', 'Section suivante')
    assert app.text_visible('Genesis 2')
    app.text_gone('When God began to create heaven and earth')
    # dernière section du faux serveur : bouton désactivé
    wait_until(lambda: not app.find('button', 'Section suivante').sensitive, 5, 'section suivante désactivée')
    app.click('button', 'Section précédente')
    assert app.text_visible('When God began to create heaven and earth')


def test_reference_saisie(run_app):
    fake, app = run_app()
    app.go_to('Berakhot 2a')
    assert app.text_visible('ברכות')
    assert any('Berakhot%202a' in r for r in fake.requests())


def test_reference_inconnue(run_app):
    _, app = run_app()
    app.go_to('Livre inexistant 1')
    assert app.text_visible('Texte introuvable')


def test_deux_colonnes(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    toggle = app.find('toggle button', 'Deux colonnes')
    assert not app._checked(toggle)
    app.point(toggle)
    wait_until(lambda: app._checked(toggle), 5, 'mode deux colonnes activé')
    # texte toujours affiché, réglage enregistré
    assert app.text_visible('When God began to create heaven and earth')
    settings = fake.dir / 'config' / 'sefaria-gnome' / 'settings.json'
    wait_until(lambda: settings.exists() and '"twoColumns": true' in settings.read_text(), 5, 'réglage enregistré')


def test_taille_du_texte(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    settings = fake.dir / 'config' / 'sefaria-gnome' / 'settings.json'
    # raccourcis : Ctrl+plus agrandit, Ctrl+0 rétablit
    app.key('ctrl+plus')
    wait_until(lambda: settings.exists() and '"textScale": 1.1' in settings.read_text(), 5, 'texte agrandi')
    app.key('ctrl+0')
    wait_until(lambda: '"textScale": 1' in settings.read_text() and '1.1' not in settings.read_text(), 5, 'taille par défaut')
    # boutons du menu « Taille du texte »
    app.point(app.find(None, 'Aa'))
    app.click('button', 'A−')
    assert app.text_visible('90 %')
    for _ in range(3):
        app.click('button', 'A−')
    assert app.text_visible('80 %')
    wait_until(lambda: not app.find('button', 'A−').sensitive, 5, 'A− désactivé au minimum')
    app.click('button', 'A+')
    assert app.text_visible('90 %')


def test_versions_et_affichage(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    app.point(app.find(None, 'Versions'))
    # langue : français → traduction par défaut, puis une autre traduction française
    app.point(app.find('label', 'Français'))
    assert app.text_visible('Au commencement, Dieu créa le ciel et la terre.')
    assert any('version=french' in r for r in fake.requests())
    app.point(app.find('label', "La bible d'André Chouraqui [fr]"))
    assert app.text_visible('Entête Elohîms créait les ciels et la terre')
    settings = fake.dir / 'config' / 'sefaria-gnome' / 'settings.json'
    wait_until(lambda: 'Chouraqui' in settings.read_text() and '"language": "french"' in settings.read_text(), 5, 'choix enregistré')
    # texte sans traduction française : repli anglais signalé
    app.key('Escape')
    app.go_to('Berakhot 2a')
    assert app.text_visible('The beginning of tractate')
    app.point(app.find(None, 'Versions'))
    assert app.text_visible('Pas de traduction en français')
    # hébreu seul : traduction masquée
    app.click('toggle button', 'Hébreu')
    app.text_gone('The beginning of tractate')
    assert app.text_visible('ברכות')


def test_table_des_matieres(run_app):
    fake, app = run_app()
    # Talmud : dapim à partir de 2a
    app.point(app.find('label', 'Talmud'))
    app.point(app.find('label', 'Bavli'))
    app.point(app.find('label', 'Seder Zeraim'))
    app.point(app.find('label', 'Berakhot'))
    assert app.text_visible('Dapim')
    assert app.has('button', '64a') and not app.has('button', '1a')
    app.click('button', '2a')
    assert app.text_visible('ברכות')
    assert any(r.startswith('/api/shape/Berakhot') for r in fake.requests())
    # livre complexe : parties, puis ouverture d'une partie sans section
    app.key('alt+Left')
    app.key('alt+Left')
    app.key('alt+Left')
    app.key('alt+Left')
    app.point(app.find('label', 'Liturgy'))
    app.point(app.find('label', 'Haggadah'))
    app.point(app.find('label', 'Pesach Haggadah'))
    app.point(app.find('label', 'Magid, Ha Lachma Anya'))
    wait_until(lambda: any('Pesach%20Haggadah%2C%20Magid%2C%20Ha%20Lachma%20Anya' in r for r in fake.requests()), 5, 'partie ouverte')


def test_paracha_et_montee(run_app):
    fake, app = run_app()
    app.point(app.find('label', 'Tanakh'))
    app.point(app.find('label', 'Torah'))
    app.point(app.find('label', 'Genesis'))
    app.click('toggle button', 'Parachiot')
    app.point(app.find('label', 'Noach'))
    assert app.text_visible('Paracha entière')
    app.point(app.find('label', '3e montée'))
    # passage sur deux chapitres : numéros chapitre:verset
    assert app.text_visible('The Flood continued forty days')
    assert app.text_visible('Chapitre 7') and app.text_visible('Chapitre 8')
    assert app.has('label', 'פרק ח׳') and app.has('label', '17') and not app.has('label', '7:17')
    assert any('Genesis%207%3A17-8%3A14' in r for r in fake.requests())


def test_commentaires_d_un_verset(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    # aucune requête de liens avant la sélection d'un verset
    assert not any(r.startswith('/api/links/') for r in fake.requests())
    app.point(app.find('label', contains='When God began to create'))
    assert app.text_visible('Commentaires')
    assert any(r.startswith('/api/links/Genesis%201%3A1') for r in fake.requests())
    assert app.has('label', 'Rashi') and app.has('label', 'Midrach')
    app.point(app.find('label', 'Rashi'))
    assert app.text_visible('Rabbi Isaac said')
    # ouverture d'une source dans le lecteur : panneau refermé
    app.click('button', 'Ouvrir Rashi on Genesis 1:1:1')
    assert app.text_visible('Rashi on Genesis 1:1:1')
    wait_until(lambda: not app.has('button', 'Fermer les liens'), 5, 'panneau refermé')
