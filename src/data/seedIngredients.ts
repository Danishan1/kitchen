import type { GroceryCategory, Ingredient, Unit } from '../domain/types';

/**
 * Starter ingredient catalog with APPROXIMATE Delhi retail prices (local market /
 * kirana, 2026). They are placeholders for cost estimates only — update them in
 * Recipes → Ingredient prices after your first few shopping trips.
 */
type Row = [id: string, name: string, cat: GroceryCategory, price: number | null, priceQty: number, priceUnit: Unit, extra?: Partial<Ingredient>];

const rows: Row[] = [
  // Atta & grains
  ['atta', 'Wheat atta', 'atta-grains', 45, 1, 'kg', { buyUnit: 'kg', tspGrams: 3 }],
  ['maida', 'Maida (refined flour)', 'atta-grains', 50, 1, 'kg', { buyUnit: 'kg' }],
  ['poha', 'Poha (flattened rice)', 'atta-grains', 70, 1, 'kg', { buyUnit: 'g' }],
  ['bread', 'Bread loaf (white/brown)', 'atta-grains', 50, 1, 'packet', { pcGrams: 25, aliases: ['bread slices'] }],
  ['besan', 'Besan (gram flour)', 'dal-pulses', 110, 1, 'kg', { buyUnit: 'g', tspGrams: 3 }],
  // Rice
  ['rice', 'Rice (regular / sella)', 'rice', 70, 1, 'kg', { buyUnit: 'kg' }],
  ['basmati', 'Basmati rice', 'rice', 130, 1, 'kg', { buyUnit: 'kg' }],
  // Dal & pulses
  ['moong-dal', 'Yellow moong dal', 'dal-pulses', 140, 1, 'kg', { buyUnit: 'g' }],
  ['masoor-dal', 'Masoor dal (red lentil)', 'dal-pulses', 110, 1, 'kg', { buyUnit: 'g' }],
  ['toor-dal', 'Arhar / toor dal', 'dal-pulses', 160, 1, 'kg', { buyUnit: 'g' }],
  ['rajma', 'Rajma (kidney beans)', 'dal-pulses', 160, 1, 'kg', { buyUnit: 'g' }],
  ['chole', 'Kabuli chana (chickpeas)', 'dal-pulses', 130, 1, 'kg', { buyUnit: 'g' }],
  ['peanuts', 'Peanuts', 'dal-pulses', 160, 1, 'kg', { buyUnit: 'g', tspGrams: 3 }],
  // Vegetables
  ['potato', 'Potato', 'vegetables', 30, 1, 'kg', { buyUnit: 'kg', pcGrams: 150, aliases: ['aloo'] }],
  ['onion', 'Onion', 'vegetables', 40, 1, 'kg', { buyUnit: 'kg', pcGrams: 120, aliases: ['pyaz'] }],
  ['tomato', 'Tomato', 'vegetables', 40, 1, 'kg', { buyUnit: 'kg', pcGrams: 100, aliases: ['tamatar'] }],
  ['cauliflower', 'Cauliflower', 'vegetables', 40, 1, 'pc', { aliases: ['gobi'] }],
  ['bhindi', 'Bhindi (okra)', 'vegetables', 60, 1, 'kg', { buyUnit: 'g' }],
  ['green-chilli', 'Green chilli', 'vegetables', 10, 20, 'pc', { buyUnit: 'pc', pcGrams: 4, aliases: ['hari mirch'] }],
  ['ginger', 'Ginger', 'vegetables', 160, 1, 'kg', { buyUnit: 'g', tspGrams: 5, aliases: ['adrak'] }],
  ['garlic', 'Garlic', 'vegetables', 200, 1, 'kg', { buyUnit: 'g', pcGrams: 3, tspGrams: 5, aliases: ['lehsun'] }],
  ['coriander-leaves', 'Coriander leaves (dhania)', 'vegetables', 10, 1, 'bunch'],
  ['mint', 'Mint leaves (pudina)', 'vegetables', 10, 1, 'bunch'],
  ['curry-leaves', 'Curry leaves', 'vegetables', 5, 1, 'bunch'],
  ['lemon', 'Lemon', 'vegetables', 5, 1, 'pc'],
  ['capsicum', 'Capsicum', 'vegetables', 80, 1, 'kg', { buyUnit: 'g', pcGrams: 150 }],
  ['carrot', 'Carrot', 'vegetables', 50, 1, 'kg', { buyUnit: 'g', pcGrams: 80 }],
  ['peas', 'Green peas (fresh/frozen)', 'vegetables', 120, 1, 'kg', { buyUnit: 'g', tspGrams: 3 }],
  ['cabbage', 'Cabbage', 'vegetables', 30, 1, 'kg', { buyUnit: 'g' }],
  ['cucumber', 'Cucumber', 'vegetables', 40, 1, 'kg', { buyUnit: 'g', pcGrams: 200 }],
  ['spring-onion', 'Spring onion', 'vegetables', 10, 1, 'bunch'],
  // Fruits
  ['banana', 'Banana', 'fruits', 60, 1, 'dozen'],
  ['apple', 'Apple', 'fruits', 180, 1, 'kg', { pcGrams: 180 }],
  // Meat, eggs & fish
  ['chicken', 'Chicken (curry cut, with bone)', 'meat-eggs-fish', 240, 1, 'kg', { buyUnit: 'kg', notes: 'Buy from a trusted halal (zabiha) butcher.' }],
  ['chicken-boneless', 'Chicken boneless', 'meat-eggs-fish', 340, 1, 'kg', { buyUnit: 'g', notes: 'Halal source.' }],
  ['chicken-mince', 'Chicken keema (mince)', 'meat-eggs-fish', 320, 1, 'kg', { buyUnit: 'g', notes: 'Ask the butcher to mince fresh in front of you.' }],
  ['mutton', 'Mutton', 'meat-eggs-fish', 800, 1, 'kg', { buyUnit: 'g', notes: 'Halal source.' }],
  ['beef', 'Buffalo meat (where legally sold)', 'meat-eggs-fish', 400, 1, 'kg', { buyUnit: 'g', notes: 'Check local laws; buy only from licensed halal sellers.' }],
  ['fish', 'Fish (rohu / basa)', 'meat-eggs-fish', 260, 1, 'kg', { buyUnit: 'g' }],
  ['egg', 'Eggs', 'meat-eggs-fish', 84, 12, 'pc', { buyUnit: 'pc', aliases: ['anda'] }],
  // Dairy
  ['milk', 'Milk', 'dairy', 68, 1, 'l', { buyUnit: 'ml' }],
  ['dahi', 'Dahi (curd)', 'dairy', 140, 1, 'kg', { buyUnit: 'g', tspGrams: 5, aliases: ['curd', 'yogurt'] }],
  ['butter', 'Butter', 'dairy', 600, 1, 'kg', { tspGrams: 5 }],
  ['cheese-slice', 'Cheese slices', 'dairy', 12, 1, 'pc'],
  ['paneer', 'Paneer', 'dairy', 420, 1, 'kg', { buyUnit: 'g' }],
  ['ghee', 'Desi ghee', 'oil', 650, 1, 'l'],
  // Spices & condiments
  ['salt', 'Salt', 'spices-condiments', 28, 1, 'kg', { tspGrams: 6 }],
  ['sugar', 'Sugar', 'spices-condiments', 45, 1, 'kg', { tspGrams: 4 }],
  ['turmeric', 'Turmeric powder (haldi)', 'spices-condiments', 300, 1, 'kg', { tspGrams: 3 }],
  ['red-chilli', 'Red chilli powder', 'spices-condiments', 400, 1, 'kg', { tspGrams: 2.7, aliases: ['lal mirch'] }],
  ['kashmiri-chilli', 'Kashmiri red chilli powder', 'spices-condiments', 600, 1, 'kg', { tspGrams: 2.7 }],
  ['coriander-powder', 'Coriander powder (dhania)', 'spices-condiments', 300, 1, 'kg', { tspGrams: 2 }],
  ['cumin', 'Cumin seeds (jeera)', 'spices-condiments', 500, 1, 'kg', { tspGrams: 2 }],
  ['garam-masala', 'Garam masala', 'spices-condiments', 1000, 1, 'kg', { tspGrams: 2 }],
  ['chole-masala', 'Chole masala', 'spices-condiments', 1200, 1, 'kg', { tspGrams: 2 }],
  ['biryani-masala', 'Biryani masala', 'spices-condiments', 1600, 1, 'kg', { tspGrams: 2 }],
  ['amchur', 'Amchur (dry mango powder)', 'spices-condiments', 600, 1, 'kg', { tspGrams: 2 }],
  ['ajwain', 'Ajwain (carom seeds)', 'spices-condiments', 400, 1, 'kg', { tspGrams: 2 }],
  ['mustard-seeds', 'Mustard seeds (rai)', 'spices-condiments', 200, 1, 'kg', { tspGrams: 3 }],
  ['black-pepper', 'Black pepper powder', 'spices-condiments', 1000, 1, 'kg', { tspGrams: 2.5 }],
  ['kasuri-methi', 'Kasuri methi', 'spices-condiments', 1000, 1, 'kg', { tspGrams: 0.6 }],
  ['hing', 'Hing (asafoetida)', 'spices-condiments', null, 1, 'g'],
  ['bay-leaf', 'Tej patta (bay leaf)', 'spices-condiments', 0.5, 1, 'pc'],
  ['cardamom', 'Green cardamom (elaichi)', 'spices-condiments', 60, 100, 'pc'],
  ['cloves', 'Cloves (laung)', 'spices-condiments', 20, 100, 'pc'],
  ['cinnamon', 'Cinnamon stick (dalchini)', 'spices-condiments', 1, 1, 'pc'],
  ['tea-masala', 'Chai masala / elaichi', 'spices-condiments', 1500, 1, 'kg', { tspGrams: 2 }],
  // Oil
  ['oil', 'Cooking oil (refined / mustard)', 'oil', 160, 1, 'l', { buyUnit: 'ml' }],
  // Tea & snacks
  ['tea', 'Tea leaves', 'tea-snacks', 500, 1, 'kg', { tspGrams: 2.5 }],
  ['biscuits', 'Biscuits', 'tea-snacks', 30, 1, 'packet'],
  ['namkeen', 'Namkeen', 'tea-snacks', 50, 1, 'packet'],
  // Homemade fast-food items
  ['burger-bun', 'Burger buns', 'fast-food', 10, 1, 'pc'],
  ['noodles', 'Hakka noodles (dry)', 'fast-food', 200, 1, 'kg', { buyUnit: 'g' }],
  ['mayonnaise', 'Mayonnaise', 'fast-food', 480, 1, 'kg', { tspGrams: 5 }],
  ['ketchup', 'Tomato ketchup', 'fast-food', 150, 1, 'kg', { tspGrams: 6 }],
  ['soy-sauce', 'Soy sauce', 'fast-food', 200, 1, 'l'],
  ['chilli-sauce', 'Green/red chilli sauce', 'fast-food', 200, 1, 'l'],
  ['vinegar', 'Vinegar', 'fast-food', 80, 1, 'l'],
  ['green-chutney', 'Green chutney (homemade/bought)', 'fast-food', null, 1, 'tbsp'],
  ['breadcrumbs', 'Breadcrumbs', 'fast-food', 300, 1, 'kg', { tspGrams: 2 }],
  // Household
  ['dishwash', 'Dishwash liquid / bar', 'household', 100, 1, 'pc'],
  ['foil', 'Aluminium foil / butter paper', 'household', 120, 1, 'pc'],
  ['garbage-bags', 'Garbage bags', 'household', 100, 1, 'packet'],
  ['cling-film', 'Cling film / zip bags', 'household', 120, 1, 'packet'],
];

export const seedIngredients: Ingredient[] = rows.map(([id, name, category, price, priceQty, priceUnit, extra]) => ({
  id,
  name,
  category,
  ...(price != null ? { price, priceQty, priceUnit } : {}),
  // Things measured by spoon in recipes but sold by weight (spices, butter, sauces):
  // shop in grams instead of showing "45 ml red chilli powder".
  ...(extra?.tspGrams && !extra.buyUnit ? { buyUnit: 'g' as Unit } : {}),
  ...extra,
}));
