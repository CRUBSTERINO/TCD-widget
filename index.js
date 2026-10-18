window.onerror = (err) => {
  console.trace();
  alert(String(err));
};

grist.ready({
  requiredAccess: 'read table'
});

// Grist ajoute ?readonly=true à l'URL du widget lorsque l'utilisateur ne peut pas modifier le document
// (lecteurs, accès public, instantanés). Ces utilisateurs ne voient que le tableau, en plein écran.
// Les autres arrivent aussi en plein écran et passent explicitement en mode édition via un bouton discret.
const canConfigure = new URLSearchParams(window.location.search).get('readonly') !== 'true';

// Textes affichés à l'utilisateur
const TEXT = {
  loading: 'Завантаження таблиці…',
  noTable: 'Немає таблиці для відображення на весь екран.',
  noData: 'Немає даних для відображення.',
};

// Au-delà de ce nombre de valeurs distinctes, pivottable.js n'affiche pas de cases à cocher pour filtrer
const MENU_LIMIT = 500;

// Mode d'affichage, propre à chaque session (jamais sauvegardé) : 'fullscreen' par défaut, 'pivot' pour éditer
let currentViewMode = 'fullscreen';
let lastPivotData = null;  // Stocke les données brutes du tableau reçues de Grist
let currentPivotConfig = null;  // Configuration du tableau (normalizeSettings), seule source de vérité
let optionsLoaded = false; // Les options sauvegardées dans Grist ont-elles été lues ?
let pivotTableInitialized = false; // suit l'état d'initialisation du widget
// Configurations envoyées à Grist dont on attend encore l'écho via onOptions
const pendingSavedSettings = [];

// Fonction pour mettre à jour le tableau même lorsqu'il est en plein écran
function updateFullscreenTable() {
  const $pivotTableInUI = $('#table').find('table.pvtTable');
  const $fullscreenContainer = $('#fullscreen-table-container');

  // Rendu en cours (ex. changement de sélection liée) : on garde l'ancien tableau jusqu'au prochain onRefresh
  if (!$pivotTableInUI.length && !pivotTableInitialized && lastPivotData && lastPivotData.length
      && $fullscreenContainer.find('table.pvtTable').length) {
    return;
  }
  $fullscreenContainer.empty();

  if ($pivotTableInUI.length) {
    const $clonedTable = $pivotTableInUI.clone(true, true);
    $fullscreenContainer.append($clonedTable);

    // Appliquer les couleurs au tableau cloné
    applyVariableColors();

  } else if (lastPivotData && lastPivotData.length === 0) {
    $fullscreenContainer.html(messageHtml(TEXT.noData));
  } else if (!pivotTableInitialized) {
    // La table n'est pas encore prête : message de chargement au lieu d'un message d'erreur
    $fullscreenContainer.html(messageHtml(TEXT.loading, false));
  } else {
    $fullscreenContainer.html(messageHtml(TEXT.noTable));
  }
}

function messageHtml(text, italic = true) {
  const style = 'text-align:center; padding-top:50px;' + (italic ? ' font-style:italic;' : '');
  return $('<p>').attr('style', style).text(text).prop('outerHTML');
}

function applyViewMode() {
  const $pivotUIContainer = $('#table');
  const $fullscreenContainer = $('#fullscreen-table-container');
  const $body = $('body');
  // Le sélecteur de vue original et le bouton de sortie sont gérés par CSS via la classe .fullscreen-active

  if (!canConfigure) {
    currentViewMode = 'fullscreen';
  }
  $('#view-mode-select').val(currentViewMode);

  if (currentViewMode === 'fullscreen') {
    updateFullscreenTable();
    $pivotUIContainer.hide();
    $fullscreenContainer.show();
    $body.addClass('fullscreen-active');
    $(window).trigger('resize');
  } else { // 'pivot' mode
    $fullscreenContainer.hide().empty();
    $pivotUIContainer.show();
    $body.removeClass('fullscreen-active');
    $(window).trigger('resize');
  }
}

function wavg (n) {
  if (!n) { return; }
  n = n.filter(([note]) => typeof (note) === 'number');
  if (n.length) { return n.map(([note, coef]) => note * coef).reduce((a, b) => a + b) / n.map(([_note, coef]) => coef).reduce((a, b) => a + b); }
}

function weightedAverage ([val, coef]) {
  return (_data, _rowKey, _colKey) => ({
    values: [],
    push: function (rec) { this.values.push([rec[val], rec[coef]]); },
    value: function () { return wavg(this.values); },
    format: $.pivotUtilities.locales.uk.formatters.ukFmt,
    numInputs: 2
  });
}

// Ajout de la moyenne pondérée aux opérations de la locale ukrainienne
$.pivotUtilities.locales.uk.aggregators['Середнє зважене'] = weightedAverage;

// Anciens noms (anglais de la version GristLabs, français des versions précédentes) -> noms ukrainiens,
// pour que les configurations déjà sauvegardées restent valides
const AGGREGATOR_ALIASES = {
  'Count': 'Кількість', 'Nombre': 'Кількість',
  'Count Unique Values': 'Кількість унікальних значень', 'Nombre de valeurs uniques': 'Кількість унікальних значень',
  'List Unique Values': 'Список унікальних значень', 'Liste de valeurs uniques': 'Список унікальних значень',
  'Sum': 'Сума', 'Somme': 'Сума',
  'Integer Sum': 'Сума цілих', 'Somme en entiers': 'Сума цілих',
  'Average': 'Середнє', 'Moyenne': 'Середнє',
  'Minimum': 'Мінімум',
  'Maximum': 'Максимум',
  'First': 'Перше', 'Premier': 'Перше',
  'Last': 'Останнє', 'Dernier': 'Останнє',
  'Sum over Sum': 'Відношення сум', 'Ratio de sommes': 'Відношення сум',
  '80% Upper Bound': 'Верхня межа 80%', 'Borne supérieure 80%': 'Верхня межа 80%',
  '80% Lower Bound': 'Нижня межа 80%', 'Borne inférieure 80%': 'Нижня межа 80%',
  'Sum as Fraction of Total': 'Сума як частка від загального', 'Somme en proportion du totale': 'Сума як частка від загального',
  'Sum as Fraction of Rows': 'Сума як частка від рядка', 'Somme en proportion de la ligne': 'Сума як частка від рядка',
  'Sum as Fraction of Columns': 'Сума як частка від стовпця', 'Somme en proportion de la colonne': 'Сума як частка від стовпця',
  'Count as Fraction of Total': 'Кількість як частка від загального', 'Nombre en proportion du totale': 'Кількість як частка від загального',
  'Count as Fraction of Rows': 'Кількість як частка від рядка', 'Nombre en proportion de la ligne': 'Кількість як частка від рядка',
  'Count as Fraction of Columns': 'Кількість як частка від стовпця', 'Nombre en proportion de la colonne': 'Кількість як частка від стовпця',
  'Weighted Average': 'Середнє зважене', 'Moyenne pondérée': 'Середнє зважене',
};

const RENDERER_ALIASES = {
  'Table': 'Таблиця',
  'Table Barchart': 'Таблиця з гістограмами', 'Table avec barres': 'Таблиця з гістограмами',
  'Heatmap': 'Теплова карта', 'Carte de chaleur': 'Теплова карта',
  'Row Heatmap': 'Теплова карта за рядками', 'Carte de chaleur par ligne': 'Теплова карта за рядками',
  'Col Heatmap': 'Теплова карта за стовпцями', 'Carte de chaleur par colonne': 'Теплова карта за стовпцями',
  'TSV Export': 'Експорт TSV',
};

const SORT_ORDERS = ['key_a_to_z', 'value_a_to_z', 'value_z_to_a'];

// Ramène une configuration (sauvegardée ou issue de pivotUI) à une forme stable et valide.
// Un nom d'opération ou de rendu inconnu ferait planter pivotUI : on le remplace alors par la valeur par défaut.
function normalizeSettings(raw) {
  const s = raw || {};
  const { aggregators, renderers } = $.pivotUtilities.locales.uk;
  const aggregatorName = AGGREGATOR_ALIASES[s.aggregatorName] || s.aggregatorName;
  const rendererName = RENDERER_ALIASES[s.rendererName] || s.rendererName;
  return {
    rows: Array.isArray(s.rows) ? s.rows : [],
    cols: Array.isArray(s.cols) ? s.cols : [],
    vals: Array.isArray(s.vals) ? s.vals : [],
    aggregatorName: aggregatorName in aggregators ? aggregatorName : undefined,
    rendererName: rendererName in renderers ? rendererName : undefined,
    rowOrder: SORT_ORDERS.includes(s.rowOrder) ? s.rowOrder : undefined,
    colOrder: SORT_ORDERS.includes(s.colOrder) ? s.colOrder : undefined,
    exclusions: (s.exclusions && typeof s.exclusions === 'object') ? s.exclusions : {},
  };
}

// pivotUI ne connaît que les valeurs présentes dans les données affichées : ses exclusions oublient
// les valeurs filtrées qui n'apparaissent pas dans la sélection courante (widgets liés).
// On conserve donc les anciennes exclusions pour les valeurs que l'utilisateur n'a pas pu voir.
function mergeExclusions(previous, fromUI) {
  const valuesInData = {};
  for (const record of lastPivotData || []) {
    for (const attr in record) {
      (valuesInData[attr] = valuesInData[attr] || new Set()).add(String(record[attr] ?? 'null'));
    }
  }
  const merged = {};
  for (const [attr, values] of Object.entries(fromUI || {})) {
    merged[attr] = [...values];
  }
  for (const [attr, values] of Object.entries(previous || {})) {
    const shown = valuesInData[attr];
    const shownInUI = shown && shown.size <= MENU_LIMIT;
    const kept = values.filter(v => !shownInUI || !shown.has(v));
    if (kept.length) {
      merged[attr] = [...new Set([...(merged[attr] || []), ...kept])];
    }
  }
  return merged;
}

function saveSettings() {
  pendingSavedSettings.push(JSON.stringify(currentPivotConfig));
  if (pendingSavedSettings.length > 50) { pendingSavedSettings.shift(); }
  grist.setOption('settings', currentPivotConfig).catch(err => {
    console.error("Failed to save settings:", err);
  });
}

// Lit les options de Grist. Renvoie true si la configuration du tableau a changé et qu'il faut le redessiner.
function applyOptions(options) {
  options = options || {};

  const settings = normalizeSettings(options.settings);
  const json = JSON.stringify(settings);
  let settingsChanged = false;
  const echoIndex = pendingSavedSettings.indexOf(json);
  if (echoIndex >= 0) {
    // Écho d'une sauvegarde faite par ce widget (éventuellement ancienne) : la config locale est déjà à jour
    pendingSavedSettings.splice(0, echoIndex + 1);
  } else if (!optionsLoaded || json !== JSON.stringify(currentPivotConfig)) {
    // Premier chargement ou modification extérieure (autre onglet, « Annuler » dans Grist...)
    currentPivotConfig = settings;
    settingsChanged = true;
  }

  const columnSize = options.columnSize || '1.0';
  $('#column-size-select').val(columnSize);
  changeColumnSize(columnSize);

  optionsLoaded = true;
  return settingsChanged;
}

// (Re)dessine le tableau à partir des dernières données et de currentPivotConfig.
// La configuration est toujours imposée (overwrite = true) : on ne réutilise jamais l'état interne de
// pivotUI, qui perd les lignes/colonnes lorsqu'une sélection liée ne contient aucune donnée.
function renderPivot() {
  if (!lastPivotData || !optionsLoaded) { return; }
  pivotTableInitialized = false;
  const $table = $('#table');

  if (lastPivotData.length === 0) {
    // Sans aucune ligne, pivotUI ne connaît aucun attribut : on affiche un message et on garde la config
    $table.html(messageHtml(TEXT.noData));
    applyViewMode();
    return;
  }

  let firstRefresh = true; // Le premier rafraîchissement est le rendu initial, pas une action de l'utilisateur

  $table.pivotUI(
    lastPivotData,
    {
      rows: currentPivotConfig.rows,
      cols: currentPivotConfig.cols,
      vals: currentPivotConfig.vals,
      aggregatorName: currentPivotConfig.aggregatorName,
      rendererName: currentPivotConfig.rendererName,
      rowOrder: currentPivotConfig.rowOrder,
      colOrder: currentPivotConfig.colOrder,
      exclusions: currentPivotConfig.exclusions,
      menuLimit: MENU_LIMIT,
      showUI: canConfigure,

      // Appelé après chaque rendu : le premier, puis à chaque modification par l'utilisateur
      onRefresh(config) {
        pivotTableInitialized = true;

        if (firstRefresh) {
          firstRefresh = false;
        } else if (canConfigure) {
          currentPivotConfig = normalizeSettings({
            ...config,
            exclusions: mergeExclusions(currentPivotConfig.exclusions, config.exclusions),
          });
          // Sauvegarde des options modifiées dans Grist
          saveSettings();
        }

        // Si on est en mode fullscreen, mettre à jour le tableau cloné
        if (currentViewMode === 'fullscreen') {
          updateFullscreenTable();
        }
        // Réappliquer les couleurs après chaque rendu
        applyVariableColors();
      },
    },
    true,  // overwrite = true : la configuration passée remplace celle mémorisée par pivotUI
    'uk'   // locale ukrainienne pour les libellés
  );

  // Créer de manière dynamique les Labels "colonnes" "lignes" "Valeurs"
  PivotLabels.init();

  applyViewMode();
}

grist.onOptions(options => {
  if (applyOptions(options)) {
    renderPivot();
  } else {
    applyViewMode();
  }
});

grist.onRecords(async rec => {
  lastPivotData = rec;  // Sauvegarde globale des données reçues
  if (!optionsLoaded) {
    try {
      applyOptions(await grist.getOptions());
    } catch (e) {
      console.error("Error loading options from Grist:", e);
      applyOptions(null);
    }
  }
  renderPivot();
});

$(document).ready(function() {
  $('body').toggleClass('read-only', !canConfigure);
  applyViewMode();

  // Gestionnaire pour le sélecteur de vue original
  $('#view-mode-select').on('change', function() {
    if (!canConfigure) { return; }
    currentViewMode = $(this).val();
    applyViewMode();
  });

  // Gestionnaire pour le bouton discret "Modifier" affiché en plein écran
  $('#edit-mode-button').on('click', function() {
    if (!canConfigure) { return; }
    currentViewMode = 'pivot';
    applyViewMode();
  });

  // Gestionnaire pour la taille des colonnes
  $('#column-size-select').on('change', function() {
    if (!canConfigure) { return; }
    const selectedSize = $(this).val();

    // Sauvegarder dans Grist
    grist.setOption('columnSize', selectedSize).catch(err => {
      console.error("Failed to save columnSize:", err);
    });

    // Appliquer la nouvelle taille
    changeColumnSize(selectedSize);

    // Si on est en mode plein écran, mettre à jour le contenu
    if (currentViewMode === 'fullscreen') {
      setTimeout(() => {
        updateFullscreenTable();
      }, 100);
    }

    // Réappliquer les couleurs après changement de taille
    setTimeout(() => {
      applyVariableColors();
    }, 150);
  });

  // Observer pour réappliquer les couleurs automatiquement
  // Observer les mutations DOM pour réappliquer les couleurs quand nécessaire
  const observer = new MutationObserver(function(mutations) {
    let shouldReapplyColors = false;

    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Vérifier si des éléments .pvtAttr ont été ajoutés
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) { // Element node
            if ($(node).find('.pvtAttr').length > 0 || $(node).hasClass('pvtAttr')) {
              shouldReapplyColors = true;
            }
          }
        });
      }
    });

    if (shouldReapplyColors) {
      applyVariableColors();
    }
  });

  // Observer les changements dans les containers de pivot
  const targetNode = document.getElementById('table');
  if (targetNode) {
    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  const fullscreenNode = document.getElementById('fullscreen-table-container');
  if (fullscreenNode) {
    observer.observe(fullscreenNode, {
      childList: true,
      subtree: true
    });
  }

});
