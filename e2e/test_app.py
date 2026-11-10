"""Parcours principaux : bibliothèque, lecture, navigation entre sections, référence saisie."""

import time

from conftest import ROOT, Atspi, wait_until, xdotool


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
    app.point(app.find(None, 'Aa'))
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
    app.point(app.find(None, 'Aa'))
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
    app.point(app.find(None, 'Aa'))
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
    # ouverture d'une source : nouvel onglet ; le premier garde Genesis 1 et son panneau
    app.click('button', 'Ouvrir Rashi on Genesis 1:1:1')
    wait_until(lambda: app.has(None, 'Rashi on Genesis 1:1:1') and app.has(None, 'Genesis 1'), 10, 'deux onglets')
    wait_until(lambda: not app.has('button', 'Fermer les liens'), 5, 'onglet de la source affiché')
    # Ctrl+W ferme l'onglet de la source : retour à Genesis 1, panneau toujours sur Rashi
    app.key('ctrl+w')
    assert app.text_visible('When God began to create heaven and earth')
    assert app.text_visible('Rabbi Isaac said')


def test_onglets(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    # nouvel onglet vide, puis un passage : le premier onglet n'a pas changé
    app.key('ctrl+t')
    assert app.text_visible('Choisissez un texte')
    app.go_to('Berakhot 2a')
    assert app.text_visible('ברכות')
    app.key('ctrl+Page_Up')
    assert app.text_visible('When God began to create heaven and earth')
    app.key('ctrl+Page_Down')
    assert app.text_visible('ברכות')
    # fermer le dernier onglet restant : un onglet vide le remplace
    app.key('ctrl+w')
    app.key('ctrl+w')
    assert app.text_visible('Choisissez un texte')


def test_reprise_signets_historique(run_app):
    fake, app = run_app(ready='Tanakh')
    app.go_to('Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    app.click('toggle button', 'Ajouter un signet')
    wait_until(lambda: app.has('toggle button', 'Retirer le signet'), 5, 'signet ajouté')
    app.key('ctrl+t')
    app.go_to('Berakhot 2a')
    app.text_visible('ברכות')
    # historique de l'onglet : Alt+Gauche revient au passage précédent (onglet vide : rien)
    app.go_to('Genesis 2')
    app.text_visible('Genesis 2')
    app.key('alt+Left')
    assert app.text_visible('The beginning of tractate')
    app.key('alt+Right')
    assert app.text_visible('The heaven and the earth were finished')
    app.stop()
    # relance : mêmes onglets, onglet Genesis 2 affiché
    from conftest import App
    app2 = App(fake, 'The heaven and the earth were finished')
    try:
        assert app2.has(None, 'Genesis 1')
        app2.point(app2.find('label', 'Signets'))
        assert app2.has('label', 'Genesis 1')
    finally:
        app2.stop()


def test_completion_des_references(run_app):
    fake, app = run_app()
    entry = app.ref_entry()
    app.point(entry)
    # saisie au clavier : une seule requête après la pause de frappe
    app.type('Gen 3')
    assert app.text_visible('Genesis 3')
    names = [r for r in fake.requests() if r.startswith('/api/name/')]
    assert names == ['/api/name/Gen%203?limit=10'], names
    # Entrée : référence reconnue par Sefaria ouverte (« Genesis 3 », pas « Gen 3 »)
    app.key('Return')
    wait_until(lambda: any(r.startswith('/api/v3/texts/Genesis%203') for r in fake.requests()), 5, 'Genesis 3 demandé')
    # suggestion choisie au clavier
    app.point(app.ref_entry())
    app.key('ctrl+a')
    app.type('rashi on gen')
    assert app.text_visible('Rashi on Genesis')
    app.key('Down')
    app.key('Return')
    wait_until(lambda: any(r.startswith('/api/v3/texts/Rashi%20on%20Genesis') for r in fake.requests()), 5, 'Rashi on Genesis demandé')


def test_lectures_du_jour(run_app):
    fake, app = run_app()
    # aucune requête de calendrier avant l'ouverture de la page
    assert not any(r.startswith('/api/calendars') for r in fake.requests())
    app.point(app.find('label', 'Aujourd’hui'))
    assert app.text_visible('Daf yomi · Bekhorot 52')
    assert any(r == '/api/calendars?diaspora=1' for r in fake.requests())
    app.point(app.find('label', 'Daf yomi · Bekhorot 52'))
    wait_until(lambda: any(r.startswith('/api/v3/texts/Bekhorot%2052') for r in fake.requests()), 5, 'daf du jour demandé')
    # paracha : page des montées
    app.point(app.find('label', 'Paracha de la semaine · Toldot'))
    assert app.text_visible('3e montée')
    app.point(app.find('label', '3e montée'))
    wait_until(lambda: any('Genesis%2026%3A13-26%3A22' in r for r in fake.requests()), 5, 'montée demandée')


def ai_prompts(fake) -> list[dict]:
    log = fake.dir / 'ai.log'
    import json
    return [json.loads(l) for l in log.read_text().splitlines()] if log.exists() else []


def test_traduction_par_ia(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    # désactivée par défaut : choisir Claude Code dans les préférences (dans un GSettings privé)
    app.key('ctrl+comma')
    app.point(app.find(None, 'Outil'))
    app.point(app.find(None, 'Claude Code'))
    app.key('Escape')
    app.point(app.find(None, 'Aa'))
    app.click('toggle button', 'Traduire en français')
    assert app.text_visible('Traduction par Claude Code en cours')
    assert app.text_visible('[IA] traduction du segment 3', 15)
    app.text_gone('When God began to create heaven and earth')
    prompt = ai_prompts(fake)[0]['prompt']
    # contexte : référence, hébreu de la section, traduction de Sefaria en appui
    import json, re
    hebrew = json.loads((ROOT / 'e2e' / 'fixtures' / 'texts.json').read_text())['Genesis 1']['versions'][0]['text'][1]
    assert 'Genesis 1' in prompt and re.sub(r'<[^>]+>', '', hebrew) in prompt and 'When God began to create' in prompt
    # retour à Sefaria
    app.click('toggle button', 'Traduire en français')
    assert app.text_visible('When God began to create heaven and earth')
    # cache : réactivation sans nouvel appel
    app.click('toggle button', 'Traduire en français')
    assert app.text_visible('[IA] traduction du segment 1')
    assert len(ai_prompts(fake)) == 1
    app.key('Escape')
    # verset seul, depuis le panneau des liens
    app.point(app.find('label', contains='[IA] traduction du segment 2'))
    app.click('button', 'Traduire ce verset (IA)')
    wait_until(lambda: len(ai_prompts(fake)) == 2, 10, 'verset traduit')
    assert 'uniquement le segment [2]' in ai_prompts(fake)[1]['prompt']
    assert app.text_visible('[IA] traduction du verset seul 2')


def test_traduction_d_un_commentaire(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    app.key('ctrl+comma')
    app.point(app.find(None, 'Outil'))
    app.point(app.find(None, 'Claude Code'))
    app.key('Escape')
    app.point(app.find('label', contains='When God began to create'))
    app.point(app.find('label', 'Rashi'))
    assert app.text_visible('Rabbi Isaac said')
    # « Traduire » sur la première source : les 3 commentaires de Rashi sur le verset, en une invite
    app.click('button', 'Traduire')
    assert app.text_visible('[IA] traduction du segment c1', 15)
    assert app.text_visible('[IA] traduction du segment c3')
    app.text_gone('Rabbi Isaac said')
    prompts = ai_prompts(fake)
    assert len(prompts) == 1
    prompt = prompts[0]['prompt']
    # contexte : la section entière (verset signalé, versets voisins) et tous les commentaires
    assert all(f'Rashi on Genesis 1:1:{i}' in prompt for i in (1, 2, 3))
    assert 'VERSET COMMENTÉ' in prompt and 'God said, “Let there be light”' in prompt


def test_recherche(run_app):
    from conftest import Atspi

    fake, app = run_app()
    app.key('ctrl+f')
    assert app.text_visible('Rechercher dans la bibliothèque')
    # champ de recherche du dialogue : dernier champ éditable affiché
    entries = app.root.findChildren(lambda n: n.roleName in ('text', 'entry') and n.showing and n.getState().contains(Atspi.StateType.EDITABLE))
    entry = entries[-1]
    entry.text = 'בראשית ברא'
    wait_until(lambda: entry.text == 'בראשית ברא', 5, 'recherche saisie')
    # aucune requête pendant la saisie : seulement à la validation
    assert not any(r.startswith('search ') for r in fake.requests())
    app.point(entry)
    app.key('End')
    app.key('Return')
    assert app.text_visible('2386 résultats')
    body = [r for r in fake.requests() if r.startswith('search ')][-1]
    assert '"field":"naive_lemmatizer"' in body
    # une référence trouvée dans plusieurs versions n'apparaît qu'une fois
    assert len(app.all('label', 'Genesis 1:1')) == 1
    # résultat ouvert dans un nouvel onglet : section, verset sélectionné (liens affichés)
    app.point(app.find('label', 'Genesis 1:1'))
    assert app.text_visible('When God began to create heaven and earth')
    wait_until(lambda: app.has('button', 'Fermer les liens'), 10, 'verset sélectionné')
    assert any(r.startswith('/api/v3/texts/Genesis%201?') for r in fake.requests())


def test_traduction_talmud_gras(run_app):
    fake, app = run_app(ref='Berakhot 2a')
    app.text_visible('The beginning of tractate')
    app.key('ctrl+comma')
    app.point(app.find(None, 'Outil'))
    app.point(app.find(None, 'Claude Code'))
    app.key('Escape')
    app.point(app.find(None, 'Aa'))
    app.click('toggle button', 'Traduire en français')
    assert app.text_visible('[IA] traduction du segment 1', 15)
    prompt = ai_prompts(fake)[-1]['prompt']
    # traduction existante transmise avec son gras, consigne de tout traduire en le gardant
    assert '<b>MISHNA:</b> <b>From when,</b> that is, from what time' in prompt and 'EN ENTIER' in prompt
    # la réponse en gras est affichée comme telle (balisage, pas de « <b> » littéral)
    assert not app.has('label', contains='<b>')


def test_barre_laterale_masquable(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    toggle = app.find('toggle button', 'Afficher la bibliothèque (F9)')
    assert app._checked(toggle)
    app.key('F9')
    wait_until(lambda: not app.has('label', 'Tanakh'), 5, 'bibliothèque masquée')
    assert not app._checked(toggle)
    settings = fake.dir / 'config' / 'sefaria-gnome' / 'settings.json'
    wait_until(lambda: '"sidebar": false' in settings.read_text(), 5, 'choix enregistré')
    app.point(toggle)
    assert app.text_visible('Tanakh')


def test_page_imprimee(run_app):
    fake, app = run_app(ref='Genesis 1')
    app.text_visible('When God began to create heaven and earth')
    # pas de bouton hors Talmud
    assert not app.has('toggle button', 'Page imprimée')
    app.go_to('Berakhot 2a')
    app.text_visible('The beginning of tractate')
    app.click('toggle button', 'Page imprimée')
    # volet dans l'onglet, à côté du texte : Vilna nettoyée en tête
    wait_until(lambda: any(r == '/__image/romm.png' for r in fake.requests()), 10, 'page de Vilna chargée')
    assert any(r == '/api/manuscripts/Berakhot%202a' for r in fake.requests())
    assert app.text_visible('Vilna (nettoyée)')
    assert app.text_visible('The beginning of tractate')
    # amud suivant depuis le volet : l'onglet passe aussi à 2b
    app.click('button', 'Amud suivant')
    wait_until(lambda: any(r == '/api/manuscripts/Berakhot%202b' for r in fake.requests()), 10, 'page 2b')
    wait_until(lambda: any(r.startswith('/api/v3/texts/Berakhot%202b') for r in fake.requests()), 10, 'onglet sur 2b')
    # agrandir : page sur tout l'onglet (texte masqué), puis réduire
    app.go_to('Berakhot 2a')
    app.text_visible('The beginning of tractate')
    app.click('toggle button', 'Agrandir la page')
    app.text_gone('The beginning of tractate')
    app.click('toggle button', 'Réduire la page')
    assert app.text_visible('The beginning of tractate')
    # fermer le volet
    app.click('button', 'Fermer la page imprimée')
    wait_until(lambda: not app.has('button', 'Amud suivant'), 5, 'volet fermé')


def test_page_imprimee_zoom_molette_et_glisser(run_app):
    fake, app = run_app(ref='Berakhot 2a')
    app.text_visible('The beginning of tractate')
    app.click('toggle button', 'Page imprimée')
    wait_until(lambda: any(r == '/__image/romm.png' for r in fake.requests()), 10, 'page chargée')
    image = wait_until(lambda: app.root.findChild(lambda n: n.roleName == 'image' and n.showing and 'Berakhot 2a' in ((n.name or '') + (n.description or '')), retry=False, requireResult=False), 10, 'image de la page')
    width = image.get_extents(Atspi.CoordType.WINDOW).width
    # molette vers le haut sur l'image : zoom
    app.point(image)
    for _ in range(4):
        xdotool('click', '4')
        time.sleep(0.1)
    wait_until(lambda: image.get_extents(Atspi.CoordType.WINDOW).width > width * 1.5, 5, 'zoom à la molette')
    # glisser : l'image se déplace
    before = image.get_extents(Atspi.CoordType.WINDOW)
    xdotool('mousedown', '1')
    for _ in range(10):
        xdotool('mousemove_relative', '--', '-15', '-15')
        time.sleep(0.03)
    xdotool('mouseup', '1')
    wait_until(lambda: image.get_extents(Atspi.CoordType.WINDOW).y < before.y - 50, 5, 'image déplacée')
