/** Static learning content. Progress is stored in AppData.learningProgress keyed by lesson id. */
export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface Lesson {
  id: string;
  pathId: string;
  level: Level;
  title: string;
  goal: string;
  recipeId?: string;
  targetMin?: number;
  checklist: string[];
  fixes: { problem: string; fix: string }[];
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
}

export const PATHS: LearningPath[] = [
  { id: 'rice', title: 'Rice', description: 'Fluffy everyday rice, then pulao and biryani.' },
  { id: 'dal', title: 'Dal', description: 'Pressure cooking, tadka and consistency.' },
  { id: 'sabzi', title: 'Sabzi', description: 'Dry vegetables without mush or slime.' },
  { id: 'roti', title: 'Roti', description: 'Dough, rolling and puffing.' },
  { id: 'paratha', title: 'Paratha', description: 'Plain, stuffed and roll parathas.' },
  { id: 'eggs', title: 'Eggs', description: 'Boiled, omelette, curry.' },
  { id: 'gravies', title: 'Gravies & masala', description: 'Bhuno the onion-tomato base properly.' },
  { id: 'chicken', title: 'Chicken', description: 'Safe handling, curry, pulao, biryani.' },
  { id: 'mealprep', title: 'Meal preparation & speed', description: 'Mise en place, parallel cooking, night-before prep.' },
];

const L = (
  id: string, pathId: string, level: Level, title: string, goal: string, checklist: string[],
  fixes: [string, string][] = [], recipeId?: string, targetMin?: number,
): Lesson => ({ id, pathId, level, title, goal, checklist, fixes: fixes.map(([problem, fix]) => ({ problem, fix })), recipeId, targetMin });

export const LESSONS: Lesson[] = [
  // Rice
  L('rice-1', 'rice', 'beginner', 'Perfect plain rice', 'Cook separate, fluffy grains using the 1 : 2 ratio.', ['Rinse 3–4 times', 'Soak 20 minutes', 'Measure water with the same cup', 'Lowest flame with lid on, no peeking', 'Rest 5 minutes before fluffing'], [['Mushy rice', 'Use less water next time and don\'t stir.'], ['Hard centre', 'Add 2–3 tbsp hot water, cover, 3 more minutes on lowest flame.']], 'plain-rice', 45),
  L('rice-2', 'rice', 'intermediate', 'One-pot pulao', 'Cook rice in a flavoured base with correct water ratio.', ['Soak basmati 30 min', 'Fry whole spices without burning', 'Use 1 : 1¾ water for soaked basmati', 'Do not stir after water goes in'], [['Rice broke', 'Stir less; fold gently from sides only.']], 'chicken-pulao', 70),
  L('rice-3', 'rice', 'advanced', 'Layered dum biryani', 'Par-boil rice to 70 % and layer over a thick chicken base.', ['Marinate ahead', 'Fry birista evenly', 'Par-boil rice in salty water', 'Seal pot and use a tawa underneath'], [['Soggy biryani', 'Chicken gravy was too watery — reduce it before layering.']], 'chicken-biryani', 135),
  // Dal
  L('dal-1', 'dal', 'beginner', 'Pressure-cooker basics + moong dal', 'Use the cooker safely and make a simple tadka.', ['Check gasket and whistle are clean', 'Never fill cooker more than half with dal', 'Let pressure drop naturally', 'Tadka on medium flame'], [['Dal too thick', 'Add hot water and simmer 2 min.'], ['Bitter tadka', 'Garlic burnt — lower the flame next time.']], 'moong-dal', 40),
  L('dal-2', 'dal', 'beginner', 'Masoor dal without cooker', 'Cook lentils in an open pot and skim foam.', ['Skim the foam', 'Cook until fully mushy', 'Adjust consistency with hot water'], [], 'masoor-dal', 35),
  L('dal-3', 'dal', 'intermediate', 'Rajma / chole', 'Soak, pressure cook until soft, simmer in masala.', ['Soak the night before', 'Test doneness by squashing a bean', 'Mash a few to thicken'], [['Beans still hard', 'Pressure cook longer; never serve undercooked rajma.']], 'rajma', 75),
  // Sabzi
  L('sabzi-1', 'sabzi', 'beginner', 'Aloo jeera', 'Toss boiled potatoes with spices without breaking them.', ['Boil potatoes just until tender', 'Cool before cubing', 'Fold gently'], [['Potatoes mushy', 'Boil for one less whistle.']], 'aloo-jeera', 35),
  L('sabzi-2', 'sabzi', 'beginner', 'Aloo gobi', 'Steam vegetables on low with a lid, then dry them out.', ['Same-size pieces', 'Only 2–3 tbsp water', 'Low flame + lid', 'Uncover at the end'], [['Burnt bottom', 'Flame too high under the lid.']], 'aloo-gobi', 50),
  L('sabzi-3', 'sabzi', 'intermediate', 'Bhindi without slime', 'Dry-cook okra in a wide pan uncovered.', ['Dry bhindi completely before cutting', 'Use a wide pan', 'Salt at the end', 'Never cover'], [['Slimy bhindi', 'Bhindi was wet or pan too crowded.']], 'bhindi', 40),
  // Roti
  L('roti-1', 'roti', 'beginner', 'Soft roti dough', 'Knead soft dough and rest it.', ['Add water gradually', 'Knead 5–7 minutes', 'Rest 20 minutes covered'], [['Dough sticky', 'Dust a little atta and knead 1 more minute.'], ['Dough stiff', 'Wet your hands and knead again.']], 'roti', 20),
  L('roti-2', 'roti', 'beginner', 'Rolling & puffing', 'Roll evenly and puff on the flame.', ['Even thickness edge to centre', 'Hot tawa', 'Flip at small bubbles', 'Puff with tongs'], [['Roti won\'t puff', 'Roll more evenly and check the tawa is hot.']], 'roti', 35),
  L('roti-3', 'roti', 'intermediate', 'Roll while cooking', 'Roll the next roti while one cooks — 15 rotis in under 25 minutes.', ['All balls ready before starting', 'Roll one, cook one', 'Keep a cloth-lined casserole ready'], [], 'roti', 25),
  // Paratha
  L('paratha-1', 'paratha', 'intermediate', 'Aloo paratha', 'Stuff, seal and roll without tearing.', ['Cool, dry, lump-free filling', 'Seal edges well', 'Roll gently seam-side up'], [['Filling leaks', 'Use less filling and patch with dry flour.']], 'aloo-paratha', 70),
  L('paratha-2', 'paratha', 'intermediate', 'Roll paratha', 'Thin parathas for kathi rolls.', ['Thin, even rolling', 'Half-cook on tawa', 'Optional egg layer'], [], 'chicken-roll', 65),
  // Eggs
  L('eggs-1', 'eggs', 'beginner', 'Omelette', 'Medium-heat omelette that flips cleanly.', ['Medium flame', 'Small amount of vegetables', 'Loosen edges before flipping'], [['Rubbery', 'Lower the flame.']], 'omelette', 25),
  L('eggs-2', 'eggs', 'beginner', 'Boiled eggs & egg curry', 'Hard-boil eggs and make your first onion-tomato gravy.', ['10 minutes after boil', 'Cold water before peeling', 'Brown onions well'], [['Green ring around yolk', 'Boiled too long — 10 minutes is enough.']], 'egg-curry', 55),
  // Gravies
  L('gravy-1', 'gravies', 'beginner', 'Onion browning', 'Brown onions to deep golden without burning.', ['Medium flame', 'Stir every 30–60 seconds', 'Add a pinch of salt to speed up'], [['Onions burning at edges', 'Lower flame, add 1 tbsp water.']], undefined, 12),
  L('gravy-2', 'gravies', 'intermediate', 'Bhuno masala until oil separates', 'Recognise when masala is cooked.', ['Add powders with a splash of water', 'Cook tomatoes until mushy', 'Look for oil at the edges'], [['Curry tastes raw', 'Masala was not cooked long enough.']]),
  // Chicken
  L('chicken-1', 'chicken', 'beginner', 'Safe chicken handling', 'Handle raw chicken without cross-contamination.', ['Separate board & knife', 'Wash hands, sink and tools', 'Raw meat on lowest fridge shelf', 'Check no pink near the bone'], []),
  L('chicken-2', 'chicken', 'intermediate', 'Home-style chicken curry', 'Marinate, brown onions, cook chicken fully.', ['Marinate 20 min+', 'Deep golden onions', 'Seal chicken on high', 'Check doneness'], [['Chicken tough', 'Cooked too long on high; simmer gently.']], 'chicken-curry', 75),
  L('chicken-3', 'chicken', 'advanced', 'Burger patties', 'Shape and cook mince patties evenly and safely.', ['Chill mixture', 'Dimple in centre', 'Don\'t flip early', 'No pink in the centre'], [], 'chicken-burger', 50),
  // Meal prep
  L('prep-1', 'mealprep', 'beginner', 'The 7-step cooking workflow', 'Follow: review → check → prep → longest first → parallel → taste → clean.', ['Read the whole recipe first', 'Check equipment & ingredients', 'Measure and chop everything', 'Start the longest-running item first', 'Cook other dishes in parallel', 'Taste and adjust', 'Store leftovers & clean as you go'], []),
  L('prep-2', 'mealprep', 'intermediate', 'Night-before prep', 'Cut morning time in half.', ['Soak pulses', 'Boil potatoes', 'Chop onions & tomatoes', 'Knead dough and refrigerate', 'Set out lunchboxes'], []),
  L('prep-3', 'mealprep', 'intermediate', 'Dal-chawal-sabzi in 45 minutes', 'Cook three dishes in parallel on two burners.', ['Rice soaks while dal cooks', 'Sabzi on burner 2', 'Tadka while cooker cools'], [], undefined, 45),
  L('prep-4', 'mealprep', 'advanced', 'Weekly batch prep', 'Prep ginger-garlic paste, fried onions and boiled chickpeas for the week.', ['Label & date every box', 'Freeze portions', 'Use oldest first'], []),
];

export interface PlanDay {
  day: number;
  title: string;
  lessonIds: string[];
  focus: string;
}

/** Two-week beginner path. */
export const TWO_WEEK_PLAN: PlanDay[] = [
  { day: 1, title: 'Kitchen setup & workflow', lessonIds: ['prep-1', 'chicken-1'], focus: 'Read the 7-step workflow; organise spices; check equipment list.' },
  { day: 2, title: 'Rice', lessonIds: ['rice-1'], focus: 'Cook plain rice. Time yourself.' },
  { day: 3, title: 'Moong dal', lessonIds: ['dal-1'], focus: 'Pressure cooker + tadka. Serve with yesterday\'s rice skill.' },
  { day: 4, title: 'Roti dough', lessonIds: ['roti-1'], focus: 'Knead and rest dough; make 5 rotis — shape doesn\'t matter.' },
  { day: 5, title: 'Eggs', lessonIds: ['eggs-1'], focus: 'Omelette breakfast for the family.' },
  { day: 6, title: 'Aloo jeera', lessonIds: ['sabzi-1'], focus: 'First dry sabzi — great for tiffin.' },
  { day: 7, title: 'Review day', lessonIds: ['prep-3'], focus: 'Dal + rice + aloo jeera together. Compare to your day-2 time.' },
  { day: 8, title: 'Onion browning', lessonIds: ['gravy-1', 'eggs-2'], focus: 'Egg curry — your first gravy.' },
  { day: 9, title: 'Rolling & puffing', lessonIds: ['roti-2'], focus: 'Full batch of rotis.' },
  { day: 10, title: 'Aloo gobi', lessonIds: ['sabzi-2'], focus: 'Low-flame steaming technique.' },
  { day: 11, title: 'Masoor dal', lessonIds: ['dal-2'], focus: 'No-cooker dal while the cooker makes rice.' },
  { day: 12, title: 'Night-before prep', lessonIds: ['prep-2', 'gravy-2'], focus: 'Prep for tomorrow\'s chicken curry.' },
  { day: 13, title: 'Chicken curry', lessonIds: ['chicken-2'], focus: 'Marinate, brown, cook through, check doneness.' },
  { day: 14, title: 'Bhindi + review', lessonIds: ['sabzi-3', 'roti-3'], focus: 'Full meal: bhindi, dal, rotis. Note what went well.' },
];

export const WORKFLOW_STEPS = [
  'Review the recipe from start to end.',
  'Check equipment and ingredients.',
  'Measure and prepare ingredients (wash, chop, measure).',
  'Start the longest-running component first (soaking, cooker, marination).',
  'Cook compatible dishes in parallel on other burners.',
  'Taste and finish (salt, lemon, garnish).',
  'Serve, store leftovers safely and clean up.',
];
