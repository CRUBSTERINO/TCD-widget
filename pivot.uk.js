/**
 * Locale ukrainienne pour pivottable.js (absente de la distribution officielle 2.23.0)
 * Construite sur le modèle de pivot.fr.js. Doit être chargée après pivot.min.js et export_renderers.min.js.
 */
(function($) {
  const nf = $.pivotUtilities.numberFormat;
  const tpl = $.pivotUtilities.aggregatorTemplates;

  const ukFmt = nf({ thousandsSep: ' ', decimalSep: ',' });
  const ukFmtInt = nf({ digitsAfterDecimal: 0, thousandsSep: ' ', decimalSep: ',' });
  const ukFmtPct = nf({ digitsAfterDecimal: 1, scaler: 100, suffix: '%', thousandsSep: ' ', decimalSep: ',' });

  const renderers = {
    'Таблиця': $.pivotUtilities.renderers['Table'],
    'Таблиця з гістограмами': $.pivotUtilities.renderers['Table Barchart'],
    'Теплова карта': $.pivotUtilities.renderers['Heatmap'],
    'Теплова карта за рядками': $.pivotUtilities.renderers['Row Heatmap'],
    'Теплова карта за стовпцями': $.pivotUtilities.renderers['Col Heatmap']
  };
  if ($.pivotUtilities.export_renderers) {
    renderers['Експорт TSV'] = $.pivotUtilities.export_renderers['TSV Export'];
  }

  $.pivotUtilities.locales.uk = {
    formatters: { ukFmt, ukFmtInt, ukFmtPct },
    localeStrings: {
      renderError: 'Під час відображення зведеної таблиці сталася помилка.',
      computeError: 'Під час обчислення зведеної таблиці сталася помилка.',
      uiRenderError: 'Під час відображення інтерфейсу зведеної таблиці сталася помилка.',
      selectAll: 'Вибрати все',
      selectNone: 'Зняти вибір',
      tooMany: '(забагато значень для відображення)',
      filterResults: 'Фільтрувати значення',
      totals: 'Разом',
      vs: 'відносно',
      by: 'за',
      apply: 'Застосувати',
      cancel: 'Скасувати'
    },
    aggregators: {
      'Кількість': tpl.count(ukFmtInt),
      'Кількість унікальних значень': tpl.countUnique(ukFmtInt),
      'Список унікальних значень': tpl.listUnique(', '),
      'Сума': tpl.sum(ukFmt),
      'Сума цілих': tpl.sum(ukFmtInt),
      'Середнє': tpl.average(ukFmt),
      'Мінімум': tpl.min(ukFmt),
      'Максимум': tpl.max(ukFmt),
      'Перше': tpl.first(ukFmt),
      'Останнє': tpl.last(ukFmt),
      'Відношення сум': tpl.sumOverSum(ukFmt),
      'Верхня межа 80%': tpl.sumOverSumBound80(true, ukFmt),
      'Нижня межа 80%': tpl.sumOverSumBound80(false, ukFmt),
      'Сума як частка від загального': tpl.fractionOf(tpl.sum(), 'total', ukFmtPct),
      'Сума як частка від рядка': tpl.fractionOf(tpl.sum(), 'row', ukFmtPct),
      'Сума як частка від стовпця': tpl.fractionOf(tpl.sum(), 'col', ukFmtPct),
      'Кількість як частка від загального': tpl.fractionOf(tpl.count(), 'total', ukFmtPct),
      'Кількість як частка від рядка': tpl.fractionOf(tpl.count(), 'row', ukFmtPct),
      'Кількість як частка від стовпця': tpl.fractionOf(tpl.count(), 'col', ukFmtPct)
    },
    renderers
  };
})(jQuery);
