"""Parcours principaux : bibliothèque, lecture, navigation entre sections, référence saisie."""

from conftest import wait_until


def test_bibliotheque_puis_lecture(run_app):
    fake, app = run_app()
    assert app.text_visible('Choisissez un texte')
    # Tanakh → Torah → Genesis : la première section s'ouvre
    app.point(app.find('label', 'Tanakh'))
    app.point(app.find('label', 'Torah'))
    app.point(app.find('label', 'Genesis'))
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
