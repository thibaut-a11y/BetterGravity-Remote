# BetterGravity Remote

Extension Chrome (Manifest V3) permettant d'appliquer l'interface et les thèmes de **[BetterGravity](https://github.com/YashjitPal/BetterGravity)** directement sur la version web **Google Antigravity Remote** (`https://antigravity.google.com/r/...`), sans installation côté serveur ni dépendance externe.

> **Avertissement :** Projet communautaire indépendant et non officiel. Il n'est ni affilié à, ni approuvé par Google ou l'auteur original de BetterGravity, et ne redistribue aucun fichier propriétaire de Google Antigravity.

---

## Origine et attribution

Ce projet prolonge et adapte les projets open source suivants (licence MIT) :
- **[YashjitPal/BetterGravity](https://github.com/YashjitPal/BetterGravity)** : portage du module `gemini-app`, feuilles de style, utilitaires DOM/React et optimiseur `:has()`. La traçabilité complète (commit source, hash et patchs web appliqués) se trouve dans [extension/PROVENANCE.json](extension/PROVENANCE.json) et la licence d'origine dans [LICENSE-BetterGravity.txt](LICENSE-BetterGravity.txt).
- **[Catppuccin](https://github.com/catppuccin/palette)** : palettes et couleurs d'accentuation (licence dans [LICENSE-Catppuccin.txt](LICENSE-Catppuccin.txt)).

### Ce que cette extension ajoute / adapte
- Portage Manifest V3 du module `gemini-app` pour fonctionner directement dans le navigateur sur `antigravity.google.com` et ses iframes (`*.antigravity.google`, `*.usercontent.goog`).
- Couche de compatibilité web (navigation `Chat` / `Work`, correction des URLs de repli sous `/web/<version>/`, isolation des nœuds React de Remote).
- Popup de configuration permettant de choisir la palette Catppuccin, la couleur d'accentuation et d'accéder aux outils de diagnostic et de repli natif.
- Intégration du **Chat Auxiliaire** (`extension/auxiliary-chat.js`) : panneau latéral avec rendu LaTeX (KaTeX) et bouton de citation rapide lors de la sélection de texte.

---

## Installation sur Chrome / Chromium

1. Clonez ou téléchargez ce dépôt (via **Code > Download ZIP**, puis décompressez-le dans un dossier permanent).
2. Ouvrez `chrome://extensions` dans votre navigateur.
3. Activez le **Mode développeur** (interrupteur en haut à droite).
4. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le dossier `extension/` (celui qui contient `manifest.json`).
5. Ouvrez ou rechargez votre session `https://antigravity.google.com/r/...`.
6. Épinglez l'extension dans la barre d'outils pour changer le thème Catppuccin et la couleur d'accent à tout moment.

Des instructions détaillées et les notes de version sont également disponibles dans `extension/INSTALLATION.txt` et les fichiers `extension/HOTFIX-*.txt`.

---

## Structure du dépôt

```text
.
├── extension/                   # Extension Chrome MV3 à charger dans chrome://extensions
│   ├── manifest.json
│   ├── remote.js                # Portage du module gemini-app de BetterGravity
│   ├── auxiliary-chat.js        # Chat auxiliaire latéral + citation sur sélection
│   ├── popup.html / .css / .js  # Interface de choix de palette et diagnostic
│   ├── palette-data.js
│   ├── icon.png
│   ├── PROVENANCE.json          # Commit d'origine et liste des patchs
│   ├── INSTALLATION.txt
│   └── HOTFIX-*.txt
├── LICENSE
├── LICENSE-BetterGravity.txt
├── LICENSE-Catppuccin.txt
└── NOTICE.txt
```
