# Grafcet Editor (style Control Expert SFC)

Éditeur graphique de Grafcet pour VS Code. Ouvre un fichier `*.grafcet.json` (ou commande **Grafcet: Nouveau fichier grafcet**).

- Grille : une étape ou une transition par cellule, en alternance verticale. Les liens se déduisent de l’adjacence (cellule du dessous).
- Touches : flèches, `1` étape, `2` étape initiale, `3` transition, `4` renvoi, `5` div. OU, `6` conv. OU, `7` div. ET, `8` conv. ET, `]` `[` largeur d’une barre, `Entrée` modifier (nom / condition / cible), `A` actions (`N Moteur; S Alarme; R Défaut`), `N` renommer, `Suppr` effacer.
- Les erreurs de structure (deux étapes de suite, barre mal placée, renvoi sans cible…) sont signalées par des points rouges.
- **Exporter en ST** génère un programme Structured Text (étapes BOOL, transitions évaluées avant toute évolution).

Limites : qualificatifs d’actions N, S et R seulement, pas de macro-étapes, pas de mode en ligne, un seul diagramme par fichier.
