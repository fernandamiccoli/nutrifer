// Starter food list. Values per 100 g, approximated from USDA FoodData Central
// (packaged gluten-free bread varies by brand; check the label).
// unit = a common household portion, so logging doesn't require a scale.
// tags: veg (verdura), fruit (fruta), gluten (contiene TACC).

const F = (id, name, kcal, p, c, f, unit, tags = []) => ({ id, name, kcal, p, c, f, unit: { label: unit[0], g: unit[1] }, tags });

export const FOODS = [
  // Proteínas
  F('huevo', 'Huevo entero', 143, 12.6, 0.7, 9.5, ['unidad', 50]),
  F('clara', 'Clara de huevo', 52, 10.9, 0.7, 0.2, ['clara', 33]),
  F('pollo', 'Pechuga de pollo a la plancha', 165, 31, 0, 3.6, ['porción', 150]),
  F('carne-magra', 'Carne vacuna magra cocida', 190, 29, 0, 8, ['porción', 150]),
  F('carne-picada', 'Carne picada común cocida', 254, 25.7, 0, 16.2, ['porción', 120]),
  F('merluza', 'Merluza cocida', 90, 19, 0, 1.3, ['filet', 150]),
  F('salmon', 'Salmón cocido', 206, 22, 0, 12.4, ['porción', 150]),
  F('atun', 'Atún al natural escurrido', 116, 25.5, 0, 0.8, ['lata', 120]),
  F('sardinas', 'Sardinas en aceite escurridas', 208, 24.6, 0, 11.5, ['lata', 90]),
  F('tofu', 'Tofu firme', 144, 17.3, 2.8, 8.7, ['porción', 100]),
  F('queso-cabra', 'Queso de cabra', 268, 18.5, 0.9, 21.1, ['feta chica', 22]),
  F('ricota', 'Ricota semidescremada', 138, 11.4, 5.1, 7.9, ['cucharada', 25]),
  F('yogur-desc', 'Yogur natural descremado', 56, 5.7, 7.7, 0.2, ['pote', 190]),

  // Legumbres, granos y panes
  F('lentejas', 'Lentejas cocidas', 116, 9, 20, 0.4, ['taza', 200]),
  F('garbanzos', 'Garbanzos cocidos', 164, 8.9, 27.4, 2.6, ['taza', 165]),
  F('arvejas', 'Arvejas cocidas', 84, 5.4, 15.6, 0.2, ['taza', 160]),
  F('hummus', 'Hummus', 166, 7.9, 14.3, 9.6, ['cucharada', 30]),
  F('quinoa', 'Quinoa cocida', 120, 4.4, 21.3, 1.9, ['taza', 185]),
  F('arroz-yamani', 'Arroz yamaní (integral) cocido', 123, 2.7, 25.6, 1, ['taza', 160]),
  F('arroz', 'Arroz blanco cocido', 130, 2.7, 28, 0.3, ['taza', 160]),
  F('fideos-arroz', 'Fideos de arroz cocidos', 108, 1.8, 24, 0.2, ['plato', 200]),
  F('papa', 'Papa hervida', 87, 1.9, 20, 0.1, ['unidad', 150]),
  F('batata', 'Batata hervida', 76, 1.4, 17.7, 0.1, ['unidad', 150]),
  F('pan-sin-tacc', 'Pan sin TACC', 260, 4, 48, 6, ['feta', 30]),
  F('galleta-arroz', 'Galleta de arroz', 387, 8.2, 81.5, 2.8, ['unidad', 9]),
  F('avena', 'Avena arrollada', 379, 13.2, 67.7, 6.5, ['cucharada', 10], ['gluten']),
  F('pan-integral', 'Pan integral de molde', 252, 12.4, 42.7, 3.5, ['rebanada', 30], ['gluten']),
  F('pan-frances', 'Pan francés', 272, 10.8, 51.9, 2.4, ['unidad', 60], ['gluten']),
  F('fideos', 'Fideos de trigo cocidos', 158, 5.8, 30.9, 0.9, ['plato', 200], ['gluten']),

  // Verduras
  F('lechuga', 'Lechuga', 15, 1.4, 2.9, 0.2, ['plato', 50], ['veg']),
  F('rucula', 'Rúcula', 25, 2.6, 3.7, 0.7, ['puñado', 30], ['veg']),
  F('espinaca-cruda', 'Espinaca cruda', 23, 2.9, 3.6, 0.4, ['puñado', 30], ['veg']),
  F('espinaca', 'Espinaca cocida', 23, 3, 3.8, 0.3, ['taza', 180], ['veg']),
  F('acelga', 'Acelga cocida', 20, 1.9, 4.1, 0.1, ['taza', 175], ['veg']),
  F('kale', 'Kale', 35, 2.9, 4.4, 1.5, ['puñado', 30], ['veg']),
  F('repollo', 'Repollo crudo', 25, 1.3, 5.8, 0.1, ['taza', 90], ['veg']),
  F('tomate', 'Tomate', 18, 0.9, 3.9, 0.2, ['unidad', 120], ['veg']),
  F('pepino', 'Pepino', 15, 0.7, 3.6, 0.1, ['unidad', 200], ['veg']),
  F('zanahoria', 'Zanahoria cruda', 41, 0.9, 9.6, 0.2, ['unidad', 80], ['veg']),
  F('remolacha', 'Remolacha cocida', 44, 1.7, 10, 0.2, ['unidad', 100], ['veg']),
  F('cebolla', 'Cebolla', 40, 1.1, 9.3, 0.1, ['unidad', 110], ['veg']),
  F('puerro', 'Puerro cocido', 31, 0.8, 7.6, 0.2, ['unidad', 90], ['veg']),
  F('morron', 'Morrón rojo', 31, 1, 6, 0.3, ['unidad', 120], ['veg']),
  F('apio', 'Apio', 16, 0.7, 3, 0.2, ['rama', 40], ['veg']),
  F('zapallo', 'Zapallo o calabaza cocida', 20, 0.7, 4.9, 0.1, ['taza', 245], ['veg']),
  F('zapallito', 'Zapallito o zucchini cocido', 15, 1.1, 2.7, 0.4, ['unidad', 120], ['veg']),
  F('berenjena', 'Berenjena cocida', 35, 0.8, 8.7, 0.2, ['unidad', 200], ['veg']),
  F('brocoli', 'Brócoli cocido', 35, 2.4, 7.2, 0.4, ['taza', 155], ['veg']),
  F('coliflor', 'Coliflor cocida', 23, 1.8, 4.1, 0.5, ['taza', 125], ['veg']),
  F('chauchas', 'Chauchas cocidas', 35, 1.9, 7.9, 0.3, ['taza', 125], ['veg']),
  F('esparragos', 'Espárragos cocidos', 22, 2.4, 4.1, 0.2, ['atado chico', 90], ['veg']),
  F('champinones', 'Champiñones', 22, 3.1, 3.3, 0.3, ['taza', 70], ['veg']),

  // Frutas
  F('kiwi', 'Kiwi', 61, 1.1, 14.7, 0.5, ['unidad', 75], ['fruit']),
  F('banana', 'Banana', 89, 1.1, 22.8, 0.3, ['unidad', 120], ['fruit']),
  F('manzana', 'Manzana', 52, 0.3, 13.8, 0.2, ['unidad', 180], ['fruit']),
  F('naranja', 'Naranja', 47, 0.9, 11.8, 0.1, ['unidad', 150], ['fruit']),
  F('mandarina', 'Mandarina', 53, 0.8, 13.3, 0.3, ['unidad', 90], ['fruit']),
  F('frutillas', 'Frutillas', 32, 0.7, 7.7, 0.3, ['taza', 150], ['fruit']),
  F('arandanos', 'Arándanos', 57, 0.7, 14.5, 0.3, ['taza', 150], ['fruit']),
  F('frambuesas', 'Frambuesas', 52, 1.2, 11.9, 0.7, ['taza', 125], ['fruit']),
  F('palta', 'Palta', 160, 2, 8.5, 14.7, ['media', 70], ['fruit']),

  // Grasas, semillas y otros
  F('aceite-oliva', 'Aceite de oliva', 884, 0, 0, 100, ['cucharada', 13]),
  F('aceitunas', 'Aceitunas', 115, 0.8, 6, 10.7, ['unidad', 4]),
  F('almendras', 'Almendras', 579, 21.2, 21.6, 49.9, ['puñado', 25]),
  F('nueces', 'Nueces', 654, 15.2, 13.7, 65.2, ['puñado', 25]),
  F('chia', 'Semillas de chía', 486, 16.5, 42.1, 30.7, ['cucharada', 10]),
  F('lino', 'Semillas de lino', 534, 18.3, 28.9, 42.2, ['cucharada', 10]),
  F('mani-pasta', 'Pasta de maní', 588, 25, 20, 50, ['cucharada', 16]),
  F('limon', 'Jugo de limón', 22, 0.4, 6.9, 0.2, ['cucharada', 15]),
  F('chocolate-amargo', 'Chocolate amargo 70%', 598, 7.8, 45.9, 42.6, ['cuadradito', 10]),
  F('miel', 'Miel', 304, 0.3, 82.4, 0, ['cucharadita', 7]),
  F('te-verde', 'Té verde o infusión sin azúcar', 1, 0, 0.2, 0, ['taza', 200]),
];

// Lunch/dinner combos built around vegetables, legumes, oily fish and olive oil.
// All gluten free. Calories come from the ingredients above.
export const COMBOS = [
  {
    id: 'bowl-quinoa',
    name: 'Bowl de quinoa, garbanzos y calabaza asada',
    items: [['quinoa', 150], ['garbanzos', 80], ['zapallo', 150], ['morron', 60], ['rucula', 30], ['aceite-oliva', 10]],
  },
  {
    id: 'salmon-brocoli',
    name: 'Salmón con brócoli y batata',
    items: [['salmon', 150], ['brocoli', 150], ['batata', 150], ['aceite-oliva', 7], ['limon', 15]],
  },
  {
    id: 'ensalada-lentejas',
    name: 'Ensalada tibia de lentejas y verdes',
    items: [['lentejas', 150], ['tomate', 120], ['pepino', 100], ['cebolla', 30], ['espinaca-cruda', 40], ['aceite-oliva', 10]],
  },
  {
    id: 'merluza-horno',
    name: 'Merluza con verduras al horno',
    items: [['merluza', 150], ['zapallito', 120], ['berenjena', 120], ['cebolla', 60], ['morron', 60], ['aceite-oliva', 10]],
  },
  {
    id: 'pollo-yamani',
    name: 'Pollo con arroz yamaní, chauchas y zanahoria',
    items: [['pollo', 130], ['arroz-yamani', 120], ['chauchas', 100], ['zanahoria', 80], ['aceite-oliva', 7]],
  },
  {
    id: 'revuelto-zapallitos',
    name: 'Revuelto de zapallitos con ensalada verde',
    items: [['huevo', 100], ['zapallito', 150], ['cebolla', 60], ['lechuga', 60], ['tomate', 120], ['aceite-oliva', 7]],
  },
  {
    id: 'atun-palta',
    name: 'Ensalada de atún, palta y hojas verdes',
    items: [['atun', 120], ['palta', 70], ['rucula', 40], ['tomate', 120], ['pepino', 80], ['aceite-oliva', 5]],
  },
  {
    id: 'sardinas-remolacha',
    name: 'Sardinas con ensalada de remolacha y zanahoria',
    items: [['sardinas', 90], ['remolacha', 100], ['zanahoria', 80], ['rucula', 40], ['limon', 15]],
  },
  {
    id: 'tofu-wok',
    name: 'Wok de tofu, brócoli y champiñones con arroz yamaní',
    items: [['tofu', 120], ['brocoli', 120], ['champinones', 70], ['morron', 60], ['arroz-yamani', 120], ['aceite-oliva', 7]],
  },
];

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function baseFood(id) {
  return BY_ID.get(id);
}

export function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function matches(food, query) {
  const q = normalize(query.trim());
  return !q || normalize(food.name).includes(q);
}

// Nutrients for an amount in grams of a per-100 g food.
export function nutrientsFor(food, grams) {
  const k = grams / 100;
  return {
    grams,
    kcal: Math.round(food.kcal * k),
    protein: food.p * k,
    carbs: food.c * k,
    fat: food.f * k,
  };
}

export function comboTotals(combo) {
  return combo.items.reduce((acc, [id, g]) => {
    const n = nutrientsFor(BY_ID.get(id), g);
    return { kcal: acc.kcal + n.kcal, protein: acc.protein + n.protein, carbs: acc.carbs + n.carbs, fat: acc.fat + n.fat };
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
