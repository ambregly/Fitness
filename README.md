# Suivi de sèche — app iPad

Web‑app installable sur iPad (PWA) : elle s’ouvre en plein écran depuis l’écran d’accueil, fonctionne hors ligne et garde toutes les données **sur l’iPad** (aucun compte, aucun serveur).

## Onglets

**Sport**
- *Séance* : la séance du jour est choisie automatiquement selon le jour de la semaine (lundi, mercredi, vendredi, dimanche par défaut). Pour chaque exercice : objectif calculé (charge × répétitions), rappel de la dernière séance, saisie poids / reps par série, validation ✓.
- Alertes à l’ouverture : séances manquées depuis 14 jours (avec « faire aujourd’hui » ou « saisir après coup »), pesée trop ancienne, repas de la veille non saisis.
- *Cardio* : natation, vélo d’appartement, vélo de route, course lente… durée, distance, FC, calories (estimées automatiquement si vides).
- *Programme* : les exercices et le nombre de séries de chaque jour.
- *Exercices* : banque d’environ 60 exercices classés par catégorie (Fessiers, Quadriceps, Ischios, Dos…), avec fourchette de répétitions et incrément de charge réglables ; ajout d’exercices perso.

**Repas**
- *Journée* : petit‑déjeuner, déjeuner, collation, dîner (+ repas ajoutables), totaux kcal / protéines / glucides / lipides / fibres comparés aux objectifs, copie de la veille.
- *Recettes* : calculateur de macros ; ex. 50 g de farine → kcal, protéines, glucides, sucres, lipides, AGS, fibres, sel, calculés automatiquement. Totaux, par portion et pour 100 g (cuit si le poids cuit est indiqué).
- *Aliments* : ~110 aliments de base (valeurs Ciqual / USDA pour 100 g), ajout manuel, recherche en ligne dans Open Food Facts (nom ou code‑barres).

**Suivi**
- *Poids* : pesée du jour, courbe (date × poids) avec moyenne sur 7 jours, évolution hebdomadaire en kg et en % comparée à la cible 0,5–1 %/semaine.
- *Progression* : pour chaque exercice, prochain objectif, courbe du 1RM estimé et de la charge, historique des séries.
- *Calendrier* : muscu faite / manquée, cardio, pesées, repas saisis.
- *Réglages* : objectifs nutritionnels, calculateur de sèche (Mifflin‑St Jeor), règle de progression, export / import de sauvegarde.

## Surcharge progressive

Double progression : on garde la charge et on ajoute des répétitions jusqu’au haut de la fourchette, puis on augmente la charge. Exemple hip thrust (6–10 reps, +5 kg) : 120×8 → 120×9 → 120×10 → 125×8 (ou 130×6 avec un incrément de 10 kg). Méthode et sources (ACSM 2009, NSCA, Plotkin 2022, Schoenfeld 2021, Helms 2014) : [`docs/surcharge-progressive.html`](docs/surcharge-progressive.html).

## Installer sur l’iPad

1. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie l’app à chaque push, à l’adresse `https://ambregly.github.io/Fitness/`.
2. Sur l’iPad, ouvre cette adresse dans **Safari**, touche **Partager → Sur l’écran d’accueil**.
3. Lance l’app depuis l’icône « Sèche ». Elle marche ensuite hors ligne.

⚠️ Les données sont stockées dans l’app sur l’iPad. Utilise **Suivi › Réglages › Exporter** régulièrement (enregistre le fichier dans iCloud Drive) ; l’import restaure tout.

## Développement

Aucune dépendance ni étape de build : HTML, CSS et JavaScript (modules ES).

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

Après une modification, incrémente `VERSION` dans `sw.js` pour que l’iPad récupère la nouvelle version.
