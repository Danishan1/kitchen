import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './store';
import { ConfirmProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Planner } from './pages/Planner';
import { RecipesPage } from './pages/Recipes';
import { RecipeDetail } from './pages/RecipeDetail';
import { RecipeEditor } from './pages/RecipeEditor';
import { CookMode } from './pages/CookMode';
import { IngredientPrices } from './pages/IngredientPrices';
import { GroceryPage } from './pages/Grocery';
import { BudgetPage } from './pages/Budget';
import { InventoryPage } from './pages/Inventory';
import { LearningPage } from './pages/Learning';
import { SessionPage } from './pages/Session';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { PrintPage } from './print/PrintPage';

/**
 * Hash routing (#/recipes/...) so direct links and refreshes work on GitHub
 * Pages without any server-side rewrite rules.
 */
export function App() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <HashRouter>
          <Routes>
            <Route path="/print/:kind/:id?" element={<PrintPage />} />
            <Route path="/recipes/:id/cook" element={<CookMode />} />
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="planner" element={<Planner />} />
              <Route path="recipes" element={<RecipesPage />} />
              <Route path="recipes/prices" element={<IngredientPrices />} />
              <Route path="recipes/new" element={<RecipeEditor />} />
              <Route path="recipes/:id" element={<RecipeDetail />} />
              <Route path="recipes/:id/edit" element={<RecipeEditor />} />
              <Route path="grocery" element={<GroceryPage />} />
              <Route path="grocery/:listId" element={<GroceryPage />} />
              <Route path="budget" element={<BudgetPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="learning" element={<LearningPage />} />
              <Route path="learning/session/:id" element={<SessionPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </ConfirmProvider>
    </AppProvider>
  );
}
