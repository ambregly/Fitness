// Données de base : banque d'exercices et table d'aliments.
// Valeurs nutritionnelles pour 100 g (ou 100 ml), arrondies, d'après la table
// Ciqual (ANSES) et l'USDA FoodData Central. Elles restent modifiables dans l'app.

export const CATEGORIES = [
  'Fessiers', 'Quadriceps', 'Ischios', 'Adducteurs / Abducteurs', 'Mollets',
  'Dos', 'Pectoraux', 'Épaules', 'Biceps', 'Triceps', 'Abdos / Gainage',
];

// type : 'lower' (bas du corps polyarticulaire), 'upper' (haut du corps polyarticulaire),
// 'iso' (isolation). Il fixe la fourchette de répétitions et l'incrément par défaut.
const E = (name, category, type) => ({ name, category, type });

export const DEFAULT_EXERCISES = [
  E('Hip thrust barre', 'Fessiers', 'lower'),
  E('Hip thrust machine', 'Fessiers', 'lower'),
  E('Glute bridge', 'Fessiers', 'lower'),
  E('Kickback poulie', 'Fessiers', 'iso'),
  E('Kickback machine', 'Fessiers', 'iso'),
  E('Abduction machine', 'Adducteurs / Abducteurs', 'iso'),
  E('Adduction machine', 'Adducteurs / Abducteurs', 'iso'),
  E('Abduction poulie', 'Adducteurs / Abducteurs', 'iso'),
  E('Fentes bulgares', 'Fessiers', 'lower'),
  E('Fentes marchées', 'Fessiers', 'lower'),
  E('Step-up', 'Fessiers', 'lower'),
  E('Extension de hanche 45°', 'Fessiers', 'iso'),
  E('Squat barre', 'Quadriceps', 'lower'),
  E('Squat Smith machine', 'Quadriceps', 'lower'),
  E('Hack squat', 'Quadriceps', 'lower'),
  E('Presse à cuisses', 'Quadriceps', 'lower'),
  E('Goblet squat', 'Quadriceps', 'lower'),
  E('Leg extension', 'Quadriceps', 'iso'),
  E('Belt squat', 'Quadriceps', 'lower'),
  E('Soulevé de terre roumain', 'Ischios', 'lower'),
  E('Soulevé de terre', 'Ischios', 'lower'),
  E('Soulevé de terre jambes tendues', 'Ischios', 'lower'),
  E('Leg curl assis', 'Ischios', 'iso'),
  E('Leg curl allongé', 'Ischios', 'iso'),
  E('Good morning', 'Ischios', 'lower'),
  E('Mollets debout', 'Mollets', 'iso'),
  E('Mollets assis', 'Mollets', 'iso'),
  E('Mollets à la presse', 'Mollets', 'iso'),
  E('Tractions', 'Dos', 'upper'),
  E('Tirage vertical', 'Dos', 'upper'),
  E('Tirage horizontal', 'Dos', 'upper'),
  E('Rowing barre', 'Dos', 'upper'),
  E('Rowing haltère', 'Dos', 'upper'),
  E('Rowing machine', 'Dos', 'upper'),
  E('Pull-over poulie', 'Dos', 'iso'),
  E('Développé couché', 'Pectoraux', 'upper'),
  E('Développé incliné haltères', 'Pectoraux', 'upper'),
  E('Développé machine', 'Pectoraux', 'upper'),
  E('Écarté poulie', 'Pectoraux', 'iso'),
  E('Pompes', 'Pectoraux', 'upper'),
  E('Développé militaire', 'Épaules', 'upper'),
  E('Développé épaules haltères', 'Épaules', 'upper'),
  E('Élévations latérales', 'Épaules', 'iso'),
  E('Élévations latérales poulie', 'Épaules', 'iso'),
  E('Oiseau / reverse fly', 'Épaules', 'iso'),
  E('Face pull', 'Épaules', 'iso'),
  E('Curl haltères', 'Biceps', 'iso'),
  E('Curl barre', 'Biceps', 'iso'),
  E('Curl marteau', 'Biceps', 'iso'),
  E('Curl poulie', 'Biceps', 'iso'),
  E('Extension triceps poulie', 'Triceps', 'iso'),
  E('Barre au front', 'Triceps', 'iso'),
  E('Extension nuque haltère', 'Triceps', 'iso'),
  E('Dips', 'Triceps', 'upper'),
  E('Crunch poulie', 'Abdos / Gainage', 'iso'),
  E('Relevé de jambes', 'Abdos / Gainage', 'iso'),
  E('Planche', 'Abdos / Gainage', 'iso'),
  E('Pallof press', 'Abdos / Gainage', 'iso'),
];

// Fourchette de répétitions et incrément de charge par défaut (double progression).
// Incréments : ~2,5–5 % pour le haut du corps / l'isolation, ~5–10 % pour le bas du corps
// (ACSM 2009 : +2 à 10 % selon la masse musculaire engagée).
export const TYPE_DEFAULTS = {
  lower: { repMin: 6, repMax: 10, increment: 5 },
  upper: { repMin: 6, repMax: 10, increment: 2.5 },
  iso: { repMin: 10, repMax: 15, increment: 1 },
};

export const CARDIO_TYPES = [
  { id: 'swim', name: 'Natation', met: 7.0 },
  { id: 'bike_indoor', name: "Vélo d'appartement", met: 6.8 },
  { id: 'bike_road', name: 'Vélo de route', met: 7.5 },
  { id: 'run_easy', name: 'Course à pied faible intensité', met: 7.0 },
  { id: 'walk', name: 'Marche', met: 3.5 },
  { id: 'other', name: 'Autre', met: 5.0 },
];

// Planning de musculation : 0 = dimanche … 6 = samedi (convention JavaScript).
// Un jour de repos entre chaque séance jambes : lundi fessiers, mercredi quadri,
// samedi fessiers (vendredi = haut du corps uniquement).
export const PLAN_VERSION = 2;
export const DEFAULT_PLAN = {
  1: { name: 'Lundi — Fessiers', exercises: [
    ['Hip thrust machine', 4], ['Soulevé de terre roumain', 3], ['Fentes bulgares', 3],
    ['Abduction machine', 3], ['Kickback poulie', 3],
  ] },
  3: { name: 'Mercredi — Quadriceps / Pectoraux / Épaules', exercises: [
    ['Squat Smith machine', 4], ['Presse à cuisses', 3], ['Leg extension', 3],
    ['Développé incliné haltères', 3], ['Développé épaules haltères', 3], ['Élévations latérales', 3],
  ] },
  5: { name: 'Vendredi — Dos', exercises: [
    ['Tractions', 3], ['Tirage vertical', 3], ['Rowing haltère', 3],
    ['Tirage horizontal', 3], ['Pull-over poulie', 2], ['Face pull', 3],
  ] },
  6: { name: 'Samedi — Fessiers / Abdos', exercises: [
    ['Hip thrust barre', 4], ['Leg curl assis', 3], ['Extension de hanche 45°', 3],
    ['Abduction machine', 3], ['Crunch poulie', 3], ['Relevé de jambes', 3],
  ] },
};

export const MEAL_SLOTS = ['Petit-déjeuner', 'Déjeuner', 'Collation', 'Dîner'];

// kcal, prot, gluc, sucres, lip, ags (acides gras saturés), fib, sel — pour 100 g
const F = (name, kcal, prot, gluc, sucres, lip, ags, fib, sel, unit) =>
  ({ name, kcal, prot, gluc, sucres, lip, ags, fib, sel, ...(unit ? { unit } : {}) });

export const DEFAULT_FOODS = [
  // Céréales, féculents
  F('Farine de blé T55', 348, 10, 72.5, 1.5, 1.2, 0.2, 3.2, 0),
  F('Farine complète T150', 330, 12, 62, 1.5, 2, 0.3, 10, 0),
  F("Flocons d'avoine", 372, 13.5, 58.7, 1, 7, 1.3, 10, 0),
  F('Riz blanc cru', 355, 7, 79, 0.2, 0.6, 0.2, 1.3, 0),
  F('Riz blanc cuit', 130, 2.7, 28.2, 0.1, 0.3, 0.1, 0.4, 0),
  F('Riz complet cru', 355, 7.5, 74, 0.8, 2.7, 0.6, 3.5, 0),
  F('Riz basmati cru', 350, 8.5, 77, 0.2, 0.8, 0.2, 1.5, 0),
  F('Pâtes crues', 355, 12.5, 70, 3, 1.5, 0.3, 3, 0),
  F('Pâtes cuites', 150, 5, 30, 0.6, 0.8, 0.2, 1.8, 0),
  F('Pâtes complètes crues', 340, 13.5, 63, 3, 2.5, 0.4, 8, 0),
  F('Quinoa cru', 368, 14, 64, 1, 6, 0.7, 7, 0),
  F('Semoule de blé crue', 360, 12, 73, 1, 1.5, 0.3, 3.5, 0),
  F('Boulgour cru', 342, 12, 68, 0.4, 1.3, 0.2, 12, 0),
  F('Pomme de terre crue', 80, 2, 17, 0.8, 0.1, 0, 1.8, 0),
  F('Patate douce crue', 86, 1.6, 20, 4.2, 0.1, 0, 3, 0.1),
  F('Pain de campagne', 260, 8.5, 51, 2, 1.2, 0.3, 4, 1.3),
  F('Pain complet', 245, 9, 42, 3, 3, 0.6, 7, 1.2),
  F('Baguette', 270, 9, 55, 2.5, 1.2, 0.3, 3, 1.3),
  F('Pain de mie complet', 250, 9, 42, 5, 4, 0.7, 6.5, 1.1),
  F('Galette de riz soufflé', 385, 8, 81, 0.5, 2.8, 0.6, 3.5, 0.1),
  F('Wrap / tortilla de blé', 310, 8.5, 50, 3, 7.5, 3, 3, 1.2),
  F('Corn flakes', 378, 7, 84, 8, 0.9, 0.2, 3, 1.6),
  F('Muesli sans sucre ajouté', 360, 10, 60, 15, 6.5, 1.2, 8, 0.1),
  F('Maïzena (fécule de maïs)', 360, 0.3, 88, 0, 0.1, 0, 1, 0),
  // Légumineuses
  F('Lentilles corail crues', 340, 24, 50, 2, 1.5, 0.2, 11, 0),
  F('Lentilles vertes cuites', 116, 9, 16.5, 0.5, 0.4, 0.1, 8, 0),
  F('Pois chiches cuits', 140, 7.5, 18, 0.5, 2.5, 0.3, 7.5, 0.3),
  F('Haricots rouges cuits', 115, 8.5, 14, 0.3, 0.5, 0.1, 7.5, 0.3),
  F('Edamame', 122, 11, 7, 2, 5, 0.6, 5, 0),
  F('Tofu nature', 125, 13, 1.5, 0.5, 7.5, 1.1, 1, 0),
  // Viandes, poissons, œufs
  F('Blanc de poulet cru', 110, 23.5, 0, 0, 1.5, 0.4, 0, 0.2),
  F('Blanc de poulet cuit', 150, 31, 0, 0, 2.5, 0.7, 0, 0.3),
  F('Blanc de dinde cru', 107, 24, 0, 0, 1, 0.3, 0, 0.2),
  F('Steak haché 5 % MG cru', 125, 21, 0, 0, 5, 2.2, 0, 0.2),
  F('Steak haché 15 % MG cru', 210, 19, 0, 0, 15, 6.5, 0, 0.2),
  F('Filet de bœuf cru', 135, 22, 0, 0, 5, 2, 0, 0.1),
  F('Filet mignon de porc cru', 120, 22, 0, 0, 3.5, 1.2, 0, 0.1),
  F('Jambon blanc découenné', 110, 21, 1, 0.8, 3, 1, 0, 1.9),
  F('Saumon cru', 200, 20, 0, 0, 13.5, 2.3, 0, 0.1),
  F('Cabillaud cru', 80, 18, 0, 0, 0.7, 0.1, 0, 0.2),
  F('Thon au naturel (égoutté)', 115, 26, 0, 0, 1, 0.3, 0, 0.9),
  F('Crevettes cuites', 95, 21, 0, 0, 1.2, 0.3, 0, 1.6),
  F('Œuf entier', 140, 12.5, 0.5, 0.3, 10, 2.8, 0, 0.3),
  F('Blanc d’œuf', 48, 10.5, 0.7, 0.7, 0.2, 0, 0, 0.4),
  // Produits laitiers
  F('Lait demi-écrémé', 46, 3.3, 4.8, 4.8, 1.6, 1, 0, 0.1),
  F('Lait écrémé', 34, 3.4, 4.9, 4.9, 0.1, 0.1, 0, 0.1),
  F('Yaourt nature', 58, 4, 5, 5, 2.5, 1.7, 0, 0.1),
  F('Yaourt grec 0 %', 57, 10, 4, 4, 0.2, 0.1, 0, 0.1),
  F('Skyr nature', 62, 11, 4, 4, 0.2, 0.1, 0, 0.1),
  F('Fromage blanc 0 %', 47, 7.5, 4, 4, 0.1, 0.1, 0, 0.1),
  F('Fromage blanc 3 %', 75, 7.5, 3.8, 3.8, 3.2, 2.1, 0, 0.1),
  F('Cottage cheese', 98, 11, 3.4, 2.7, 4.3, 2.8, 0, 0.8),
  F('Emmental râpé', 380, 28, 0, 0, 29.5, 19, 0, 0.5),
  F('Mozzarella', 245, 18, 1, 1, 19, 13, 0, 0.5),
  F('Feta', 265, 14, 1.5, 1, 22.5, 15, 0, 2.7),
  F('Parmesan', 395, 33, 0, 0, 28.5, 18.5, 0, 1.6),
  F('Beurre doux', 745, 0.7, 0.6, 0.6, 82, 55, 0, 0),
  F('Crème fraîche 15 % MG', 165, 2.8, 4, 4, 15, 10, 0, 0.1),
  F('Boisson amande sans sucre', 14, 0.5, 0.1, 0.1, 1.2, 0.1, 0.3, 0.1),
  F('Boisson soja nature', 36, 3.3, 0.8, 0.4, 1.9, 0.3, 0.6, 0.1),
  // Matières grasses, oléagineux
  F("Huile d'olive", 900, 0, 0, 0, 100, 14.5, 0, 0),
  F('Huile de colza', 900, 0, 0, 0, 100, 7.5, 0, 0),
  F('Huile de coco', 900, 0, 0, 0, 100, 87, 0, 0),
  F('Amandes', 620, 21, 8, 4.5, 51, 3.9, 12.5, 0),
  F('Noix', 700, 15, 7, 2.6, 65, 6, 6.5, 0),
  F('Noix de cajou', 590, 18, 27, 6, 46, 9, 3.3, 0),
  F("Beurre de cacahuète 100 %", 620, 25, 13, 5, 50, 9, 7, 0),
  F('Graines de chia', 490, 17, 7.7, 0, 31, 3.3, 34, 0),
  F('Graines de lin', 535, 18, 1.6, 1.6, 42, 3.7, 27, 0.1),
  F('Avocat', 205, 1.6, 1, 0.4, 20.5, 4.2, 4.5, 0),
  // Fruits
  F('Banane', 90, 1.1, 20, 15, 0.3, 0.1, 2.6, 0),
  F('Pomme', 53, 0.3, 11.5, 10, 0.3, 0.1, 1.4, 0),
  F('Poire', 53, 0.4, 11, 10, 0.3, 0, 3.1, 0),
  F('Orange', 45, 0.9, 8.5, 8, 0.2, 0, 2, 0),
  F('Kiwi', 58, 1.1, 10.5, 9.5, 0.5, 0.1, 3, 0),
  F('Fraises', 36, 0.7, 6, 5, 0.3, 0, 2, 0),
  F('Framboises', 50, 1.2, 5, 4.5, 0.7, 0, 6.5, 0),
  F('Myrtilles', 57, 0.7, 12, 10, 0.3, 0, 2.4, 0),
  F('Mangue', 65, 0.6, 14, 13, 0.4, 0.1, 1.6, 0),
  F('Ananas', 53, 0.5, 11.5, 11, 0.2, 0, 1.4, 0),
  F('Raisin', 70, 0.7, 16, 16, 0.2, 0.1, 1.4, 0),
  F('Compote sans sucre ajouté', 60, 0.3, 13, 12, 0.2, 0, 1.5, 0),
  F('Dattes', 290, 2.4, 66, 64, 0.4, 0, 7, 0),
  // Légumes
  F('Brocoli', 34, 2.8, 4, 1.7, 0.4, 0.1, 2.6, 0.1),
  F('Courgette', 17, 1.2, 2, 1.7, 0.3, 0.1, 1, 0),
  F('Haricots verts', 30, 1.8, 4, 1.4, 0.2, 0, 3.2, 0),
  F('Épinards', 25, 2.9, 1.4, 0.4, 0.4, 0.1, 2.2, 0.2),
  F('Carotte', 40, 0.8, 7.6, 5, 0.3, 0, 2.7, 0.1),
  F('Tomate', 20, 0.9, 2.5, 2.5, 0.2, 0, 1.2, 0),
  F('Concombre', 13, 0.6, 1.8, 1.5, 0.1, 0, 0.6, 0),
  F('Poivron rouge', 30, 1, 5, 4.5, 0.3, 0, 2, 0),
  F('Salade verte', 15, 1.3, 1.5, 1, 0.2, 0, 1.3, 0),
  F('Champignons de Paris', 22, 3, 0.5, 0.2, 0.3, 0, 2, 0),
  F('Oignon', 40, 1.2, 7.5, 5, 0.2, 0, 1.7, 0),
  F('Chou-fleur', 25, 2, 3, 2, 0.3, 0.1, 2.2, 0),
  F('Poêlée de légumes surgelés', 45, 2, 5.5, 3, 1.2, 0.2, 3, 0.3),
  // Divers
  F('Whey protéine (moyenne)', 380, 78, 6, 4, 5.5, 3, 0, 0.5),
  F('Protéine végétale (moyenne)', 380, 75, 6, 1, 7, 1.5, 3, 1.5),
  F('Chocolat noir 70 %', 575, 8, 34, 28, 42, 25, 11, 0),
  F('Cacao en poudre non sucré', 380, 20, 13, 1, 22, 13, 32, 0.1),
  F('Miel', 325, 0.4, 81, 81, 0, 0, 0, 0),
  F('Sucre blanc', 400, 0, 100, 100, 0, 0, 0, 0),
  F('Sirop d’érable', 260, 0, 67, 60, 0.1, 0, 0, 0),
  F('Levure chimique', 90, 0, 22, 0, 0, 0, 0, 25),
  F('Confiture', 245, 0.4, 60, 55, 0.1, 0, 1, 0),
  F('Sauce soja', 60, 8, 5.5, 1.5, 0.1, 0, 0.8, 14),
  F('Moutarde', 150, 7, 4, 2, 11, 0.6, 3.5, 5.5),
  F('Ketchup', 110, 1.3, 25, 22, 0.2, 0, 0.6, 2),
  F('Houmous', 300, 7.5, 12, 1, 25, 2.5, 5, 1.2),
  F('Lait de coco', 190, 1.8, 3, 2.5, 19, 17, 0.5, 0),
  F('Sel', 0, 0, 0, 0, 0, 0, 0, 100),
];

export const NUTRIENTS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'prot', label: 'Protéines', unit: 'g' },
  { key: 'gluc', label: 'Glucides', unit: 'g' },
  { key: 'sucres', label: 'dont sucres', unit: 'g' },
  { key: 'lip', label: 'Lipides', unit: 'g' },
  { key: 'ags', label: 'dont saturés', unit: 'g' },
  { key: 'fib', label: 'Fibres', unit: 'g' },
  { key: 'sel', label: 'Sel', unit: 'g' },
];
